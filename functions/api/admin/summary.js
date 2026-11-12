// GET /api/admin/summary[?refresh=1]
// Admin only: the user id must be listed in the ADMIN_UIDS environment variable
// (comma-separated). Aggregates only; no emails, no per-user data. Cached 10 min.

import { json, errorResponse, HttpError } from '../../_lib/http.js';

const TTL_SEC = 600;

export async function onRequest({ request, env, data }) {
  try {
    if (request.method !== 'GET') throw new HttpError(405, 'method_not_allowed', 'Use GET');
    const admins = String(env.ADMIN_UIDS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!admins.includes(data.uid)) throw new HttpError(403, 'forbidden', 'Not an administrator');

    const url = new URL(request.url);
    const cacheKey = new Request(url.origin + '/api/admin/summary?v=2');
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    if (cache && url.searchParams.get('refresh') !== '1') {
      const hit = await cache.match(cacheKey);
      if (hit) {
        const body = await hit.json();
        return json({ ...body, cached: true });
      }
    }

    const db = env.DB;
    const now = Date.now();
    const day = 86400000, W = 7 * day;
    const since = now - 30 * day;
    const q = (sql, ...args) => db.prepare(sql).bind(...args);
    const [accounts, active, studying, perDay, perModule, accuracy, avg, perHour, totals, flagged, answers, signups, weekly, firsts] = await Promise.all([
      q('SELECT COUNT(*) AS n FROM users').first(),
      q('SELECT SUM(last_seen > ?) AS d1, SUM(last_seen > ?) AS d7, SUM(created_at > ?) AS new1, SUM(created_at > ?) AS new7 FROM users', now - day, now - 7 * day, now - day, now - 7 * day).first(),
      q('SELECT COUNT(DISTINCT CASE WHEN created_at > ? THEN uid END) AS d1, COUNT(DISTINCT CASE WHEN created_at > ? THEN uid END) AS d7, COUNT(DISTINCT CASE WHEN created_at > ? THEN uid END) AS d30 FROM attempts', now - day, now - 7 * day, since).first(),
      q("SELECT date(created_at / 1000, 'unixepoch') AS day, COUNT(*) AS exams FROM attempts WHERE created_at > ? GROUP BY day ORDER BY day", since).all(),
      q('SELECT module, COUNT(*) AS exams FROM attempts WHERE created_at > ? GROUP BY module ORDER BY exams DESC', since).all(),
      q('SELECT module, subject, COUNT(*) AS exams, SUM(attempted) AS attempted, SUM(correct) AS correct FROM attempts WHERE created_at > ? GROUP BY module, subject ORDER BY module, subject', since).all(),
      q('SELECT AVG(time_sec) AS avg_sec, COUNT(*) AS exams FROM attempts WHERE created_at > ?', since).first(),
      q("SELECT CAST(strftime('%H', created_at / 1000, 'unixepoch') AS INTEGER) AS h, COUNT(*) AS n FROM attempts WHERE created_at > ? GROUP BY h", since).all(),
      q('SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM attempts) AS attempts, (SELECT COUNT(*) FROM scopes) AS scopes').first(),
      // questions flagged by the most distinct students (removed flags are tombstones)
      q("SELECT s.scope_key || '|' || j.key AS qk, COUNT(*) AS students FROM scopes s, json_each(s.flags) j WHERE COALESCE(json_extract(j.value, '$.removed'), 0) != 1 GROUP BY qk ORDER BY students DESC LIMIT 25").all(),
      // how often each answer option was chosen per question (review is stored only for exams of up to 300 questions)
      q("SELECT k.value AS qk, a.value AS ans, COUNT(*) AS n FROM attempts t, json_each(t.review, '$.keys') k, json_each(t.review, '$.answers') a WHERE t.review IS NOT NULL AND t.created_at > ? AND k.key = a.key GROUP BY qk, ans", now - 90 * day).all(),
      q('SELECT uid, created_at FROM users WHERE created_at > ?', now - 8 * W).all(),
      q('SELECT uid, CAST(created_at / 604800000 AS INTEGER) AS w FROM attempts WHERE created_at > ? GROUP BY uid, w', now - 9 * W).all(),
      q('SELECT uid, MIN(created_at) AS f FROM attempts WHERE uid IN (SELECT uid FROM users WHERE created_at > ?) GROUP BY uid', now - 8 * W).all(),
    ]);

    // per-question answer histograms: only questions with at least 10 responses, busiest 600
    const items = {};
    for (const r of answers.results) {
      const it = items[r.qk] || (items[r.qk] = { key: r.qk, n: 0, counts: {} });
      it.n += r.n; it.counts[r.ans] = r.n;
    }
    const itemList = Object.values(items).filter((x) => x.n >= 10).sort((x, y) => y.n - x.n).slice(0, 600);

    // weekly signup cohorts: how many came back to study in week 0..3 after signing up
    const curW = Math.floor(now / W);
    const studiedWeeks = new Map();
    for (const r of weekly.results) { if (!studiedWeeks.has(r.uid)) studiedWeeks.set(r.uid, new Set()); studiedWeeks.get(r.uid).add(r.w); }
    const cohorts = new Map();
    for (const u of signups.results) {
      const w = Math.floor(u.created_at / W);
      const c = cohorts.get(w) || { weekStart: w * W, size: 0, retained: [0, 0, 0, 0] };
      c.size++;
      for (let o = 0; o < 4; o++) if (studiedWeeks.has(u.uid) && studiedWeeks.get(u.uid).has(w + o)) c.retained[o]++;
      cohorts.set(w, c);
    }
    const cohortRows = [...cohorts.entries()].sort((x, y) => x[0] - y[0]).map(([w, c]) => ({
      weekStart: c.weekStart, size: c.size, retained: c.retained.map((n, o) => (w + o <= curW ? n : null)),
    }));
    // activation: signed up -> first exam (only people old enough for the window being measured)
    const first = new Map(firsts.results.map((r) => [r.uid, r.f]));
    const act = { signups: signups.results.length, ever: 0, within24h: 0, within7d: 0, eligible24h: 0, eligible7d: 0, medianHours: null };
    const gaps = [];
    for (const u of signups.results) {
      const f = first.get(u.uid);
      if (now - u.created_at > day) act.eligible24h++;
      if (now - u.created_at > 7 * day) act.eligible7d++;
      if (f === undefined) continue;
      act.ever++; gaps.push((f - u.created_at) / 3600000);
      if (f - u.created_at <= day && now - u.created_at > day) act.within24h++;
      if (f - u.created_at <= 7 * day && now - u.created_at > 7 * day) act.within7d++;
    }
    gaps.sort((x, y) => x - y);
    if (gaps.length) act.medianHours = Math.round(gaps[Math.floor(gaps.length / 2)] * 10) / 10;

    const body = {
      ok: true,
      generatedAt: now,
      rangeDays: 30,
      accounts: accounts.n,
      newToday: active.new1 || 0,
      newWeek: active.new7 || 0,
      activeToday: active.d1 || 0,
      activeWeek: active.d7 || 0,
      studyingToday: studying.d1 || 0,
      studyingWeek: studying.d7 || 0,
      studyingMonth: studying.d30 || 0,
      examsTotal: avg.exams,
      avgTimeSec: avg.avg_sec === null ? 0 : Math.round(avg.avg_sec),
      examsPerDay: perDay.results,
      examsPerModule: perModule.results,
      examsPerHourUtc: perHour.results,
      accuracy: accuracy.results.map((r) => ({
        module: r.module, subject: r.subject, exams: r.exams, attempted: r.attempted, correct: r.correct,
        accuracyPct: r.attempted ? Math.round((r.correct / r.attempted) * 100) : null,
      })),
      totals,
      flagged: flagged.results,
      items: itemList,
      cohorts: cohortRows,
      activation: act,
      note: 'Approximate: counters come from client-submitted attempts.',
    };
    if (cache) {
      await cache.put(cacheKey, new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=' + TTL_SEC },
      }));
    }
    return json({ ...body, cached: false });
  } catch (err) {
    return errorResponse(err);
  }
}
