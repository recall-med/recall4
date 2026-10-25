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
    const cacheKey = new Request(url.origin + '/api/admin/summary?v=1');
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
    const day = 86400000;
    const since = now - 30 * day;
    const [accounts, active, perDay, perModule, accuracy, avg] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS n FROM users').first(),
      db.prepare('SELECT SUM(last_seen > ?) AS d1, SUM(last_seen > ?) AS d7 FROM users').bind(now - day, now - 7 * day).first(),
      db.prepare(
        "SELECT date(created_at / 1000, 'unixepoch') AS day, COUNT(*) AS exams FROM attempts " +
        'WHERE created_at > ? GROUP BY day ORDER BY day'
      ).bind(since).all(),
      db.prepare('SELECT module, COUNT(*) AS exams FROM attempts WHERE created_at > ? GROUP BY module ORDER BY exams DESC').bind(since).all(),
      db.prepare(
        'SELECT module, subject, COUNT(*) AS exams, SUM(attempted) AS attempted, SUM(correct) AS correct ' +
        'FROM attempts WHERE created_at > ? GROUP BY module, subject ORDER BY module, subject'
      ).bind(since).all(),
      db.prepare('SELECT AVG(time_sec) AS avg_sec, COUNT(*) AS exams FROM attempts WHERE created_at > ?').bind(since).first(),
    ]);
    const body = {
      ok: true,
      generatedAt: now,
      rangeDays: 30,
      accounts: accounts.n,
      activeToday: active.d1 || 0,
      activeWeek: active.d7 || 0,
      examsTotal: avg.exams,
      avgTimeSec: avg.avg_sec === null ? 0 : Math.round(avg.avg_sec),
      examsPerDay: perDay.results,
      examsPerModule: perModule.results,
      accuracy: accuracy.results.map((r) => ({
        module: r.module, subject: r.subject, exams: r.exams, attempted: r.attempted, correct: r.correct,
        accuracyPct: r.attempted ? Math.round((r.correct / r.attempted) * 100) : null,
      })),
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
