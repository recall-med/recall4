// POST /api/admin/student  body: { uid, action: "remove" | "unblock" }  (admin only)
// remove: deletes the person's cloud data and blocks the account, so signing in again cannot resume it.
//   The row stays (marked blocked) so the block cannot be dodged by creating a fresh row.
//   The Firebase login itself is not touched; delete it by hand in Firebase Console if you want it gone.
// unblock: lets the account sync again (its data stays deleted).
import { json, readJson, errorResponse, HttpError } from '../../_lib/http.js';
import { requireAdmin, adminList } from '../../_lib/admin.js';

export async function onRequest({ request, env, data }) {
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Use POST');
    requireAdmin(env, data);
    const body = await readJson(request);
    const uid = body.uid;
    if (typeof uid !== 'string' || !/^[\w.-]{1,128}$/.test(uid)) throw new HttpError(400, 'bad_request', 'uid is required');
    if (body.action !== 'remove' && body.action !== 'unblock') throw new HttpError(400, 'bad_request', 'action must be remove or unblock');
    if (adminList(env).includes(uid)) throw new HttpError(400, 'cannot_remove_admin', 'An administrator cannot be removed here');
    const row = await env.DB.prepare('SELECT uid FROM users WHERE uid = ?').bind(uid).first();
    if (!row) throw new HttpError(404, 'not_found', 'No such account');
    if (body.action === 'remove') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM attempts WHERE uid = ?').bind(uid),
        env.DB.prepare('DELETE FROM scopes WHERE uid = ?').bind(uid),
        env.DB.prepare("UPDATE users SET blocked = 1, settings = '{}', session = NULL, reset_epoch = reset_epoch + 1, session_version = session_version + 1 WHERE uid = ?").bind(uid),
      ]);
    } else {
      await env.DB.prepare('UPDATE users SET blocked = 0 WHERE uid = ?').bind(uid).run();
    }
    return json({ ok: true, action: body.action });
  } catch (err) {
    return errorResponse(err);
  }
}
