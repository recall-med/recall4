// Shared GitHub Contents API helpers for the admin tools (question editor and config editor).
// The token exists ONLY as the encrypted Cloudflare variable GITHUB_TOKEN (never in code, never sent to the browser).
import { HttpError } from './http.js';
import { isLocalHost } from './auth.js';

export function gh(request, env) {
  if (!env.GITHUB_TOKEN) throw new HttpError(501, 'github_not_configured', 'GITHUB_TOKEN is not set in Cloudflare yet');
  // GITHUB_API is honoured only on localhost (tests), so it can never redirect the token elsewhere.
  const base = env.GITHUB_API && isLocalHost(request) ? env.GITHUB_API : 'https://api.github.com';
  const repo = /^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPO || '') ? env.GITHUB_REPO : 'recall-med/recall4';
  return {
    url: (p) => `${base}/repos/${repo}/contents/${p}`,
    headers: { Authorization: 'Bearer ' + env.GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'recall-admin', 'X-GitHub-Api-Version': '2022-11-28' },
  };
}
export const b64d = (s) => new TextDecoder().decode(Uint8Array.from(atob(String(s).replace(/\s/g, '')), (c) => c.charCodeAt(0)));
export function b64e(s) {
  const bytes = new TextEncoder().encode(s); let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(bin);
}
// Reads one file from main. Returns { text, sha }; a missing file is a 404 HttpError (or null when orNull is true).
export async function readFile(g, path, orNull) {
  const r = await fetch(g.url(path) + '?ref=main', { headers: g.headers });
  if (r.status === 404) { if (orNull) return null; throw new HttpError(404, 'not_found', 'That file is not in the repository'); }
  if (!r.ok) throw new HttpError(502, 'github_error', 'GitHub answered ' + r.status);
  const j = await r.json();
  return { text: b64d(j.content || ''), sha: j.sha };
}
// Creates (no sha) or updates (sha) one file on main as one commit. Returns the new blob sha.
export async function writeFile(g, path, text, sha, message) {
  const body = { message, content: b64e(text), branch: 'main' };
  if (sha) body.sha = sha;
  const r = await fetch(g.url(path), { method: 'PUT', headers: { ...g.headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.status === 409 || r.status === 422) throw new HttpError(409, 'file_changed', 'The file changed on GitHub after you opened it. Reload and try again.');
  if (!r.ok) throw new HttpError(502, 'github_error', 'GitHub refused the change (' + r.status + '). Check that the token may write to this repository.');
  const res = await r.json();
  return res.content && res.content.sha ? res.content.sha : null;
}
