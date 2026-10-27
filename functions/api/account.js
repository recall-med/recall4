// POST /api/account  body: { confirm: "delete" }
// Permanently deletes everything stored for the signed-in person: attempts,
// topic rows and the user row. One atomic batch, so it either all happens or
// none of it does. Safe to repeat. Only the id inside the verified token is used.

import { json, readJson, errorResponse, HttpError } from '../_lib/http.js';

export async function onRequest({ request, env, data }) {
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Use POST');
    const body = await readJson(request);
    if (!body || body.confirm !== 'delete') throw new HttpError(400, 'bad_request', 'confirm must be "delete"');
    const uid = data.uid;
    await env.DB.batch([
      env.DB.prepare('DELETE FROM attempts WHERE uid = ?').bind(uid),
      env.DB.prepare('DELETE FROM scopes WHERE uid = ?').bind(uid),
      env.DB.prepare('DELETE FROM users WHERE uid = ?').bind(uid),
    ]);
    return json({ ok: true, deleted: true });
  } catch (err) {
    return errorResponse(err);
  }
}
