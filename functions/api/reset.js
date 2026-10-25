// POST /api/reset  body: { fromEpoch }
// Bumps the reset epoch. Old-epoch progress, incorrect entries and attempts
// are then ignored everywhere. Flags are kept. Idempotent: a retry with the
// same fromEpoch does nothing the second time.

import { json, readJson, errorResponse, HttpError } from '../_lib/http.js';
import { touchUser } from '../_lib/db.js';
import { reqInt } from '../_lib/validate.js';

export async function onRequest({ request, env, data }) {
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Use POST');
    const body = await readJson(request);
    const fromEpoch = reqInt(body.fromEpoch, 'fromEpoch', 0, 1e6);
    const user = await touchUser(env.DB, data.uid, Date.now());
    if (user.reset_epoch !== fromEpoch) {
      return json({ ok: true, epoch: user.reset_epoch, already: true });
    }
    const r = await env.DB.prepare(
      "UPDATE users SET reset_epoch = reset_epoch + 1, session = NULL, settings = '{}', " +
      'session_version = session_version + 1 WHERE uid = ? AND reset_epoch = ?'
    ).bind(data.uid, fromEpoch).run();
    const fresh = await env.DB.prepare('SELECT reset_epoch FROM users WHERE uid = ?').bind(data.uid).first();
    return json({ ok: true, epoch: fresh.reset_epoch, already: r.meta.changes === 0 });
  } catch (err) {
    return errorResponse(err);
  }
}
