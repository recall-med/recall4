// Pure helpers shared by the admin endpoints (config.js, question.js and commit.js): validating and applying one change to the
// parsed config/modules.json or to one question file. Nothing here talks to GitHub.
import { HttpError } from './http.js';

export const SAFE = /^[\w-]{1,40}$/;
const BAD = /[<>"`\\\u0000-\u001f]/;   // the app places names inside HTML attributes, so these are refused; a straight apostrophe becomes a typographic one
export const bad = (m) => new HttpError(400, 'bad_request', m);

export function clean(v, max, name, required) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') throw bad(name + ' is invalid');
  const t = v.replace(/\s+/g, ' ').trim().replace(/'/g, '\u2019');
  if (required && !t) throw bad(name + ' is required');
  if (t.length > max) throw bad(name + ' is too long (' + max + ' characters at most)');
  if (BAD.test(t)) throw bad(name + ' cannot contain < > " ` or \\');
  return t;
}
export const flag = (v, name) => { if (typeof v !== 'boolean') throw bad(name + ' must be true or false'); return v; };
export function moduleOf(cfg, id) {
  const m = (cfg.modules || []).find((x) => x.id === id);
  if (!m) throw new HttpError(404, 'not_found', 'Unknown module');
  return m;
}
export function listOf(cfg, m, exam, subject) {
  const list = m.subSubjects && m.subSubjects[exam] && m.subSubjects[exam][subject];
  if (!(cfg.examTypes || []).some((e) => e.id === exam) || !(cfg.subjects || []).some((s) => s.id === subject) || !Array.isArray(list)) throw new HttpError(404, 'not_found', 'Unknown exam type or subject');
  return list;
}
export function slug(label) {
  const s = label.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 34);
  return s || 'topic';
}

// Applies one action to the parsed config. Returns { msg, topicId?, file? } (file = a data file to create first).
export function applyConfigOp(cfg, b) {
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
    let id, n = 1;
    if (b.topicId !== undefined) {   // the staged-edits bundle (commit.js) names the topic itself, so its later changes can point at it; a clash means someone else added it first
      if (!SAFE.test(String(b.topicId))) throw bad('topicId is invalid');
      if (list.some((x) => x.id === b.topicId)) throw new HttpError(409, 'conflict', 'A topic with this id already exists in ' + m.id + '/' + b.exam + '/' + b.subject + '. Discard that new topic and add it again.');
      id = b.topicId;
    } else {
      id = slug(label);
      while (list.some((x) => x.id === id)) id = slug(label).slice(0, 36) + '_' + (++n);
    }
    const entry = { id, label }; if (professor) entry.professor = professor; entry.hidden = true;   // new decks start hidden: an admin reviews them, then switches them on
    list.push(entry);
    return {
      msg: `Admin: add topic ${id} (${m.id}/${b.exam}/${b.subject}), hidden`, topicId: id,
      file: { path: `data/${dir}/${b.exam}/${b.subject}/${id}.json`, text: JSON.stringify({ meta: { module: m.id, examType: b.exam, subject: b.subject, subSubject: id, totalQuestions: 0 }, questions: [], nextId: 1 }, null, 2) + '\n' },
    };
  }
  throw bad('unknown action');
}


export const qListOf = (doc) => (Array.isArray(doc) ? doc : doc && Array.isArray(doc.questions) ? doc.questions : null);
export function target(text, id) {
  let doc; try { doc = JSON.parse(text); } catch (e) { throw new HttpError(422, 'bad_file', 'The file is not valid JSON'); }
  const list = qListOf(doc); const q = list && list.find((x) => String(x.id) === String(id));
  if (!q) throw new HttpError(404, 'not_found', 'No question with that id in the file');
  return { doc, q };
}
export function checkPatch(b, q) {
  const patch = {};
  const str = (v, max, name, allowEmpty) => { if (typeof v !== 'string' || v.length > max || (!allowEmpty && !v.trim())) throw new HttpError(400, 'bad_request', name + ' is invalid'); return v; };
  if (b.question !== undefined) patch.question = str(b.question, 3000, 'question');
  if (b.explanation !== undefined) patch.explanation = str(b.explanation, 6000, 'explanation', true);
  if (b.options !== undefined) {
    if (!Array.isArray(b.options) || b.options.length < 2 || b.options.length > 8) throw new HttpError(400, 'bad_request', 'options needs 2 to 8 entries');
    if (!Array.isArray(q.options) || !q.options.every((o) => typeof o === 'string')) throw new HttpError(400, 'unsupported_options', 'This question stores its options in a format the editor does not change');
    patch.options = b.options.map((o) => str(o, 1000, 'an option'));
  }
  if (b.answer !== undefined) {
    const n = (patch.options || q.options || []).length;
    if (!Number.isInteger(b.answer) || b.answer < 0 || b.answer >= n) throw new HttpError(400, 'bad_request', 'answer must point at one of the options');
    patch.answer = b.answer;
  } else if (patch.options && Number.isInteger(q.answer) && q.answer >= patch.options.length) {
    throw new HttpError(400, 'bad_request', 'answer must point at one of the options');
  }
  if (!Object.keys(patch).length) throw new HttpError(400, 'bad_request', 'Nothing to change');
  return patch;
}

