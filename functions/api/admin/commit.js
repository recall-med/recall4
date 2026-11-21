// POST /api/admin/commit  { ops: [ ... ] }  -> { ok, commit, changed, files, config, idMap }
// Admin only. Applies a whole bundle of staged edits and records them as ONE commit on main (Git Data API), so Cloudflare Pages
// redeploys once however many things were edited. All-or-nothing: if any op fails, nothing is committed.
//
// Ops (the server applies them in this fixed order: add_topic, set_module / set_topic, q_add, q_edit, q_del):
//   add_topic  { moduleId, exam, subject, topicId, label, professor? }       empty data file + a hidden topic (the client names the id)
//   set_module { moduleId, ongoing?, hidden? }
//   set_topic  { moduleId, exam, subject, topicId, label?, professor?, hidden? }
//   set_redline { moduleId, exam, url }                                     the "Redline Data" link of one exam type in a module; url "" removes it
//   remove_topic { moduleId, exam, subject, topicId }                      removes the config entry AND deletes its data file; a topic that is already gone is ignored
//   (a Last year exam type holds ONE exam per module: subject `exam`, topic `exam`; add_topic creates it, remove_topic removes it)
//   q_add      { path, temp, question, options, answer, explanation? }       gets the next free id; the answer maps temp -> id in idMap
//   q_edit     { path, id, patch: { question?, options?, answer?, explanation? }, base: { <the same fields as the admin first saw them> } }
//   q_del      { path, id, base?: { question } }                             never renumbers; an id that is already gone is ignored
// Conflicts: q_edit / q_del carry `base`. If the question on GitHub no longer matches it (another admin changed it), the whole save
// is refused with 409 `conflict` and the message names the question. The branch only moves forward from the commit that was read,
// so a push that raced with this one fails and is retried once on the newer head.
import { json, readJson, errorResponse, HttpError } from '../../_lib/http.js';
import { requireAdmin } from '../../_lib/admin.js';
import { gh, getHead, readAt, commitFiles } from '../../_lib/github.js';
import { applyConfigOp, qListOf, checkPatch, bad } from '../../_lib/adminops.js';

const CFG = 'config/modules.json';
const PATH_RE = /^data\/[\w-]+\/[\w-]+\/[\w-]+\/[\w-]+\.json$/;
const MAX_OPS = 300;
const RANK = { add_topic: 0, set_module: 1, set_topic: 1, set_redline: 1, q_add: 2, q_edit: 3, q_del: 4, remove_topic: 5 };
const conflict = (m) => new HttpError(409, 'conflict', m);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function run(g, ops) {
  const head = await getHead(g);
  const cf = await readAt(g, CFG, head.commit);
  let cfg; try { cfg = JSON.parse(cf.text); } catch (e) { throw new HttpError(422, 'bad_file', 'config/modules.json is not valid JSON'); }
  if (!cfg || !Array.isArray(cfg.modules)) throw new HttpError(422, 'bad_file', 'config/modules.json has no modules');
  let cfgTouched = false; const files = new Map(), idMap = [], notes = [], removals = [];

  async function file(path) {
    if (files.has(path)) return files.get(path);
    if (!PATH_RE.test(path)) throw bad('path is invalid');
    const f = await readAt(g, path, head.commit, true);
    if (!f) throw conflict('The topic file ' + path + ' is no longer on GitHub. Discard your edits to it.');
    let doc; try { doc = JSON.parse(f.text); } catch (e) { throw new HttpError(422, 'bad_file', path + ' is not valid JSON'); }
    const list = qListOf(doc); if (!list) throw new HttpError(422, 'bad_file', path + ' has no question list');
    const e = { path, doc, list, text: f.text, touched: false };
    files.set(path, e); return e;
  }

  const sorted = ops.map((o, i) => [o, i]).sort((a, b) => (RANK[a[0].op] - RANK[b[0].op]) || (a[1] - b[1])).map((x) => x[0]);
  for (const op of sorted) {
    if (op.op === 'add_topic' || op.op === 'set_module' || op.op === 'set_topic' || op.op === 'remove_topic' || op.op === 'set_redline') {
      const r = applyConfigOp(cfg, { ...op, action: op.op }); cfgTouched = true; notes.push(r.msg.replace(/^Admin: /, ''));
      if (r.removeFile) removals.push(r.removeFile);
      if (r.file) {
        if (await readAt(g, r.file.path, head.commit, true)) throw new HttpError(409, 'exists', 'A data file named ' + r.file.path + ' already exists in the repository');
        const doc = JSON.parse(r.file.text);
        files.set(r.file.path, { path: r.file.path, doc, list: doc.questions, text: '', touched: true });
      }
      continue;
    }
    if (typeof op.path !== 'string') throw bad('path is required');
    const f = await file(op.path);
    if (op.op === 'q_add') {
      if (typeof op.question !== 'string' || !Array.isArray(op.options) || !Number.isInteger(op.answer)) throw bad('question, options and answer are required');
      const p = checkPatch({ question: op.question, options: op.options, answer: op.answer, explanation: op.explanation === undefined ? '' : op.explanation }, { options: ['x', 'x'], answer: 0 });
      const doc = f.doc, list = f.list;
      const newId = Math.max(Array.isArray(doc) ? 0 : Number(doc.nextId) || 0, list.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1);
      if (!Array.isArray(doc)) doc.nextId = newId + 1;
      list.push({ id: newId, question: p.question, options: p.options, explanation: p.explanation, answer: p.answer });
      idMap.push({ path: op.path, temp: op.temp === undefined ? null : op.temp, id: newId }); notes.push('add question #' + newId + ' (' + op.path + ')');
    } else if (op.op === 'q_edit' || op.op === 'q_del') {
      if (!/^\d{1,6}$/.test(String(op.id))) throw bad('id is required');
      const i = f.list.findIndex((x) => String(x.id) === String(op.id));
      if (i < 0) {
        if (op.op === 'q_del') continue;   // already gone: nothing to do
        throw conflict('Question #' + op.id + ' in ' + op.path + ' was removed by someone else after you opened it. Discard your edit to it.');
      }
      const cur = f.list[i];
      for (const k of Object.keys(op.base && typeof op.base === 'object' ? op.base : {})) {
        if (!same(cur[k], op.base[k])) throw conflict('Question #' + op.id + ' in ' + op.path + ' was changed by someone else after you opened it. Discard your edit to it, reload, and make it again.');
      }
      if (op.op === 'q_edit') {
        if (!op.patch || typeof op.patch !== 'object') throw bad('patch is required');
        Object.assign(cur, checkPatch(op.patch, cur)); notes.push('edit question #' + op.id + ' (' + op.path + ')');
      } else {
        if (!Array.isArray(f.doc)) f.doc.nextId = Math.max(Number(f.doc.nextId) || 0, f.list.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1);
        f.list.splice(i, 1); notes.push('remove question #' + op.id + ' (' + op.path + ')');
      }
    } else throw bad('unknown op');
    f.touched = true;
  }

  const out = [];
  if (cfgTouched) out.push({ path: CFG, text: JSON.stringify(cfg, null, 2) + (cf.text.endsWith('\n') ? '\n' : '') });
  const gone = new Set(removals);
  for (const f of files.values()) {
    if (!f.touched || gone.has(f.path)) continue;
    if (!Array.isArray(f.doc) && f.doc.meta && typeof f.doc.meta === 'object') f.doc.meta.totalQuestions = f.list.length;   // keep the meta count true
    const indent = f.text ? (f.text.trim().includes('\n') ? ((/\n([ \t]+)"/.exec(f.text) || [])[1] || 2) : 0) : 2;
    out.push({ path: f.path, text: JSON.stringify(f.doc, null, indent) + (!f.text || f.text.endsWith('\n') ? '\n' : '') });
  }
  for (const path of gone) if (await readAt(g, path, head.commit, true)) out.push({ path, del: true });   // a file that is already gone needs no deletion
  const changed = out.filter((o) => { const old = files.get(o.path); return o.del ? true : o.path === CFG ? o.text !== cf.text : old ? o.text !== old.text : true; });
  if (!changed.length) return { ok: true, commit: null, changed: 0, files: [], config: cfg, idMap };
  const lines = notes.slice(0, 25).map((n) => '- ' + n); if (notes.length > 25) lines.push('- and ' + (notes.length - 25) + ' more');
  const msg = 'Admin: save ' + notes.length + ' change' + (notes.length === 1 ? '' : 's') + ' in ' + changed.length + ' file' + (changed.length === 1 ? '' : 's') + '\n\n' + lines.join('\n');
  const commit = await commitFiles(g, head, changed, msg);
  return { ok: true, commit, changed: changed.length, files: changed.map((c) => c.path), config: cfg, idMap };
}

export async function onRequest({ request, env, data }) {
  try {
    await requireAdmin(env, data);
    if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Use POST');
    const b = await readJson(request);
    if (!Array.isArray(b.ops) || !b.ops.length) throw bad('ops must be a list with at least one change');
    if (b.ops.length > MAX_OPS) throw bad('Too many changes in one save (' + MAX_OPS + ' at most). Save, then continue.');
    for (const o of b.ops) if (!o || typeof o !== 'object' || !Object.prototype.hasOwnProperty.call(RANK, o.op)) throw bad('unknown op');
    const g = gh(request, env);
    for (let attempt = 0; ; attempt++) {
      try { return json(await run(g, b.ops)); }
      catch (e) { if (!(e instanceof HttpError) || e.code !== 'file_changed' || attempt === 1) throw e; }
    }
  } catch (err) {
    return errorResponse(err);
  }
}
