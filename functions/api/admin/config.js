// Admin only. Reads and changes the site structure in config/modules.json through the GitHub API (one commit on main per change).
//   GET  /api/admin/config                      -> { ok, config, sha }   (fresh from GitHub, never a stale deployed copy)
//   POST /api/admin/config  { action, ... }     -> { ok, config, sha, topicId? }
//     set_module  { moduleId, ongoing?, hidden? }                       ongoing is exclusive: switching one module on switches the others off
//     set_topic   { moduleId, exam, subject, topicId, label?, professor?, hidden? }
//     add_topic   { moduleId, exam, subject, label, professor? }        creates an EMPTY data file and registers the topic as hidden
// "hidden: true" means students do not see it; admins still do (with a Hidden badge). A missing field means visible.
// The change is read-modify-write on the latest file (retried once if someone else committed in between), so two admins do not overwrite each other.
import { json, readJson, errorResponse, HttpError } from '../../_lib/http.js';
import { requireAdmin } from '../../_lib/admin.js';
import { gh, readFile, writeFile } from '../../_lib/github.js';

const CFG = 'config/modules.json';
const SAFE = /^[\w-]{1,40}$/;
const BAD = /[<>"`\\\u0000-\u001f]/;   // the app places names inside HTML attributes, so these are refused; a straight apostrophe becomes a typographic one
const bad = (m) => new HttpError(400, 'bad_request', m);

function clean(v, max, name, required) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') throw bad(name + ' is invalid');
  const t = v.replace(/\s+/g, ' ').trim().replace(/'/g, '\u2019');
  if (required && !t) throw bad(name + ' is required');
  if (t.length > max) throw bad(name + ' is too long (' + max + ' characters at most)');
  if (BAD.test(t)) throw bad(name + ' cannot contain < > " ` or \\');
  return t;
}
const flag = (v, name) => { if (typeof v !== 'boolean') throw bad(name + ' must be true or false'); return v; };
function moduleOf(cfg, id) {
  const m = (cfg.modules || []).find((x) => x.id === id);
  if (!m) throw new HttpError(404, 'not_found', 'Unknown module');
  return m;
}
function listOf(cfg, m, exam, subject) {
  const list = m.subSubjects && m.subSubjects[exam] && m.subSubjects[exam][subject];
  if (!(cfg.examTypes || []).some((e) => e.id === exam) || !(cfg.subjects || []).some((s) => s.id === subject) || !Array.isArray(list)) throw new HttpError(404, 'not_found', 'Unknown exam type or subject');
  return list;
}
function slug(label) {
  const s = label.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 34);
  return s || 'topic';
}

// Applies one action to the parsed config. Returns { msg, topicId?, file? } (file = a data file to create first).
function apply(cfg, b) {
  const m = moduleOf(cfg, b.moduleId);
  if (b.action === 'set_module') {
    if (b.ongoing === undefined && b.hidden === undefined) throw bad('Nothing to change');
    const bits = [];
    if (b.ongoing !== undefined) {
      if (flag(b.ongoing, 'ongoing')) { cfg.modules.forEach((x) => { if (x !== m) delete x.ongoing; }); m.ongoing = true; } else delete m.ongoing;
      bits.push(b.ongoing ? 'make ongoing' : 'not ongoing');
    }
    if (b.hidden !== undefined) { if (flag(b.hidden, 'hidden')) m.hidden = true; else delete m.hidden; bits.push(b.hidden ? 'hide' : 'show'); }
    return { msg: 'Admin: ' + bits.join(', ') + ' module ' + m.id };
  }
  const list = listOf(cfg, m, b.exam, b.subject);
  if (b.action === 'set_topic') {
    if (!SAFE.test(String(b.topicId))) throw bad('topicId is invalid');
    const t = list.find((x) => x.id === b.topicId);
    if (!t) throw new HttpError(404, 'not_found', 'Unknown topic');
    if (b.label === undefined && b.professor === undefined && b.hidden === undefined) throw bad('Nothing to change');
    if (b.label !== undefined) t.label = clean(b.label, 80, 'The name', true);
    if (b.professor !== undefined) { const p = clean(b.professor, 60, 'The professor'); if (p) t.professor = p; else delete t.professor; }
    if (b.hidden !== undefined) { if (flag(b.hidden, 'hidden')) t.hidden = true; else delete t.hidden; }
    return { msg: `Admin: edit topic ${t.id} (${m.id}/${b.exam}/${b.subject})` };
  }
  if (b.action === 'add_topic') {
    const label = clean(b.label, 80, 'The name', true), professor = clean(b.professor, 60, 'The professor');
    const dir = String(m.dataPath || m.id);
    if (!SAFE.test(dir)) throw new HttpError(422, 'bad_config', 'This module has an unusable dataPath');
    let id = slug(label), n = 1;
    while (list.some((x) => x.id === id)) id = slug(label).slice(0, 36) + '_' + (++n);
    const entry = { id, label }; if (professor) entry.professor = professor; entry.hidden = true;   // new decks start hidden: an admin reviews them, then switches them on
    list.push(entry);
    return {
      msg: `Admin: add topic ${id} (${m.id}/${b.exam}/${b.subject}), hidden`, topicId: id,
      file: { path: `data/${dir}/${b.exam}/${b.subject}/${id}.json`, text: JSON.stringify({ meta: { module: m.id, examType: b.exam, subject: b.subject, subSubject: id, totalQuestions: 0 }, questions: [], nextId: 1 }, null, 2) + '\n' },
    };
  }
  throw bad('unknown action');
}

async function load(g) {
  const f = await readFile(g, CFG);
  let cfg; try { cfg = JSON.parse(f.text); } catch (e) { throw new HttpError(422, 'bad_file', 'config/modules.json is not valid JSON'); }
  if (!cfg || !Array.isArray(cfg.modules)) throw new HttpError(422, 'bad_file', 'config/modules.json has no modules');
  return { cfg, sha: f.sha, nl: f.text.endsWith('\n') };
}

export async function onRequest({ request, env, data }) {
  try {
    await requireAdmin(env, data);
    const g = gh(request, env);
    if (request.method === 'GET') { const c = await load(g); return json({ ok: true, config: c.cfg, sha: c.sha }); }
    if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Use GET or POST');
    const b = await readJson(request);
    if (!['set_module', 'set_topic', 'add_topic'].includes(b.action)) throw bad('unknown action');
    let fileMade = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      const c = await load(g);
      const r = apply(c.cfg, b);
      if (r.file && !fileMade) {   // the data file goes in first; until the config names it, nobody can see it
        if (await readFile(g, r.file.path, true)) throw new HttpError(409, 'exists', 'A data file with that name already exists in the repository');
        await writeFile(g, r.file.path, r.file.text, null, 'Admin: create ' + r.file.path);
        fileMade = true;
      }
      try {
        const sha = await writeFile(g, CFG, JSON.stringify(c.cfg, null, 2) + (c.nl ? '\n' : ''), c.sha, r.msg);
        return json({ ok: true, config: c.cfg, sha, topicId: r.topicId || null });
      } catch (e) {
        if (!(e instanceof HttpError) || e.code !== 'file_changed' || attempt === 1) throw e;
      }
    }
  } catch (err) {
    return errorResponse(err);
  }
}
