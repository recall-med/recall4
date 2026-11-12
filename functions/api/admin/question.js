// GET  /api/admin/question?path=data/<module>/<exam>/<subject>/<file>.json&id=<n>  -> { question, sha }
// POST /api/admin/question  body: { path, id, sha, question?, options?, answer?, explanation? }
// Admin only. Edits one question in the repository through the GitHub API; Cloudflare Pages then redeploys.
// The GitHub token exists ONLY as the encrypted Cloudflare variable GITHUB_TOKEN (never in code, never sent to the browser).
import { json, readJson, errorResponse, HttpError } from '../../_lib/http.js';
import { requireAdmin } from '../../_lib/admin.js';
import { isLocalHost } from '../../_lib/auth.js';

const PATH_RE = /^data\/[\w-]+\/[\w-]+\/[\w-]+\/[\w-]+\.json$/;
const ID_RE = /^\d{1,6}$/;

function gh(request, env) {
  if (!env.GITHUB_TOKEN) throw new HttpError(501, 'github_not_configured', 'GITHUB_TOKEN is not set in Cloudflare yet');
  // GITHUB_API is honoured only on localhost (tests), so it can never redirect the token elsewhere.
  const base = env.GITHUB_API && isLocalHost(request) ? env.GITHUB_API : 'https://api.github.com';
  const repo = /^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPO || '') ? env.GITHUB_REPO : 'recall-med/recall4';
  return {
    url: (p) => `${base}/repos/${repo}/contents/${p}`,
    headers: { Authorization: 'Bearer ' + env.GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'recall-admin', 'X-GitHub-Api-Version': '2022-11-28' },
  };
}
const b64d = (s) => new TextDecoder().decode(Uint8Array.from(atob(String(s).replace(/\s/g, '')), (c) => c.charCodeAt(0)));
function b64e(s) {
  const bytes = new TextEncoder().encode(s); let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(bin);
}
async function readFile(g, path) {
  const r = await fetch(g.url(path) + '?ref=main', { headers: g.headers });
  if (r.status === 404) throw new HttpError(404, 'not_found', 'That file is not in the repository');
  if (!r.ok) throw new HttpError(502, 'github_error', 'GitHub answered ' + r.status);
  const j = await r.json();
  return { text: b64d(j.content || ''), sha: j.sha };
}
const listOf = (doc) => (Array.isArray(doc) ? doc : doc && Array.isArray(doc.questions) ? doc.questions : null);
function target(text, id) {
  let doc; try { doc = JSON.parse(text); } catch (e) { throw new HttpError(422, 'bad_file', 'The file is not valid JSON'); }
  const list = listOf(doc); const q = list && list.find((x) => String(x.id) === String(id));
  if (!q) throw new HttpError(404, 'not_found', 'No question with that id in the file');
  return { doc, q };
}
function checkPatch(b, q) {
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

export async function onRequest({ request, env, data }) {
  try {
    requireAdmin(env, data);
    if (request.method === 'GET') {
      const u = new URL(request.url); const path = u.searchParams.get('path') || '', id = u.searchParams.get('id') || '';
      if (!PATH_RE.test(path) || !ID_RE.test(id)) throw new HttpError(400, 'bad_request', 'path or id is invalid');
      const f = await readFile(gh(request, env), path);
      return json({ ok: true, question: target(f.text, id).q, sha: f.sha });
    }
    if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Use GET or POST');
    const b = await readJson(request);
    if (typeof b.path !== 'string' || !PATH_RE.test(b.path) || !ID_RE.test(String(b.id)) || typeof b.sha !== 'string') throw new HttpError(400, 'bad_request', 'path, id and sha are required');
    const g = gh(request, env);
    const f = await readFile(g, b.path);
    if (f.sha !== b.sha) throw new HttpError(409, 'file_changed', 'The file changed on GitHub after you opened it. Reopen the question and try again.');
    const { doc, q } = target(f.text, b.id);
    Object.assign(q, checkPatch(b, q));
    const indent = f.text.trim().includes('\n') ? ((/\n([ \t]+)"/.exec(f.text) || [])[1] || 2) : 0;
    const out = JSON.stringify(doc, null, indent) + (f.text.endsWith('\n') ? '\n' : '');
    const r = await fetch(g.url(b.path), {
      method: 'PUT', headers: { ...g.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Admin edit: ${b.path} #${b.id}`, content: b64e(out), sha: f.sha, branch: 'main' }),
    });
    if (r.status === 409 || r.status === 422) throw new HttpError(409, 'file_changed', 'The file changed on GitHub after you opened it. Reopen the question and try again.');
    if (!r.ok) throw new HttpError(502, 'github_error', 'GitHub refused the change (' + r.status + '). Check that the token may write to this repository.');
    const res = await r.json();
    return json({ ok: true, sha: res.content && res.content.sha ? res.content.sha : null });
  } catch (err) {
    return errorResponse(err);
  }
}
