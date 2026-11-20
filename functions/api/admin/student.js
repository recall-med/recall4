// POST /api/admin/student  body: { uid, action: "remove" | "unblock" | "make_admin" | "remove_admin" }  (admin only;
//   make_admin / remove_admin are for owners only, and an owner's own rights cannot be changed here)
// remove: deletes the person's cloud data and blocks the account, so signing in again cannot resume it.
//   The row stays (marked blocked) so the block cannot be dodged by creating a fresh row.
//   The Firebase login itself is not touched; delete it by hand in Firebase Console if you want it gone.
// unblock: lets the account sync again (its data stays deleted).
import { json, readJson, errorResponse, HttpError } from '../../_lib/http.js';
import { requireAdmin, isOwner } from '../../_lib/admin.js';

export async function onRequest({ request, env, data }) {
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Use POST');
    await requireAdmin(env, data);
    const body = await readJson(request);
    const uid = body.uid;
    if (typeof uid !== 'string' || !/^[\w.-]{1,128}$/.test(uid)) throw new HttpError(400, 'bad_request', 'uid is required');
    if (!['remove', 'unblock', 'make_admin', 'remove_admin'].includes(body.action)) throw new HttpError(400, 'bad_request', 'unknown action');
    if (body.action === 'remove' && isOwner(env, uid)) throw new HttpError(400, 'cannot_remove_admin', 'Remove admin rights first, then remove the account');
    const row = await env.DB.prepare('SELECT uid, is_admin, blocked FROM users WHERE uid = ?').bind(uid).first();
    if (!row) throw new HttpError(404, 'not_found', 'No such account');
    if (body.action === 'make_admin' || body.action === 'remove_admin') {
      if (!isOwner(env, data.uid)) throw new HttpError(403, 'owner_only', 'Only an owner can change who is an admin');
      if (isOwner(env, uid)) throw new HttpError(400, 'owner_fixed', 'An owner stays an admin');
      if (body.action === 'make_admin' && row.blocked) throw new HttpError(400, 'blocked', 'Unblock this account first');
      await env.DB.prepare('UPDATE users SET is_admin = ? WHERE uid = ?').bind(body.action === 'make_admin' ? 1 : 0, uid).run();
      return json({ ok: true, action: body.action });
    }
    if (body.action === 'remove' && (isOwner(env, uid) || row.is_admin)) throw new HttpError(400, 'cannot_remove_admin', 'Remove admin rights first, then remove the account');
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
