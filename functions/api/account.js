// POST /api/account  body: { confirm: "delete" }
// Permanently deletes everything stored for the signed-in person: attempts,
// topic rows and the user row. One atomic batch, so it either all happens or
// none of it does. Safe to repeat. Only the id inside the verified token is used,
// and the sign-in must be recent (within 10 minutes).

import { json, readJson, errorResponse, HttpError } from '../_lib/http.js';

export async function onRequest({ request, env, data }) {
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Use POST');
    const body = await readJson(request);
    if (!body || body.confirm !== 'delete') throw new HttpError(400, 'bad_request', 'confirm must be "delete"');
    // Deleting everything needs a recent sign-in (the app asks for the password or Google again first),
    // so a token that was merely lying around cannot be used to wipe an account.
    const ageSec = Math.floor(Date.now() / 1000) - (data.authTime || 0);
    if (!(ageSec >= -60 && ageSec <= 600)) {
      throw new HttpError(403, 'recent_login_required', 'Sign in again before deleting your account');
    }
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
