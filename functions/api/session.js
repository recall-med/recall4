// GET /api/session            -> { session, sessionVersion }
// PUT /api/session            -> save or clear the in-progress exam
//   body: { deviceId, label?, baseEpoch, sessionVersion, session|null, takeover? }
// A device never takes over silently: without takeover:true a save is only
// accepted when there is no session or this device owns it.

import { json, readJson, errorResponse, HttpError } from '../_lib/http.js';
import { touchUser, parseJson } from '../_lib/db.js';
import { LIMITS, reqInt, reqId } from '../_lib/validate.js';

export async function onRequest({ request, env, data }) {
  try {
    const now = Date.now();
    const user = await touchUser(env.DB, data.uid, now);
    if (request.method === 'GET') {
      return json({ ok: true, session: parseJson(user.session, null), sessionVersion: user.session_version });
    }
    if (request.method !== 'PUT') throw new HttpError(405, 'method_not_allowed', 'Use GET or PUT');

    const body = await readJson(request);
    const deviceId = reqId(body.deviceId, 'deviceId');
    const baseEpoch = reqInt(body.baseEpoch, 'baseEpoch', 0, 1e6);
    const clientVersion = reqInt(body.sessionVersion, 'sessionVersion', 0, 1e9);
    const label = typeof body.label === 'string' ? body.label.slice(0, 40) : '';
    const takeover = body.takeover === true;
    if (baseEpoch !== user.reset_epoch) {
      return json({ ok: false, error: 'stale_epoch', epoch: user.reset_epoch }, 409);
    }
    const current = parseJson(user.session, null);
    const ownedByOther = current && current.deviceId !== deviceId;

    if (ownedByOther && !takeover) {
      return json({ ok: false, error: 'session_owned', session: current, sessionVersion: user.session_version }, 409);
    }
    if (!ownedByOther && clientVersion !== user.session_version && current) {
      // This device lost the session to a takeover since it last synced.
      return json({ ok: false, error: 'session_taken', session: current, sessionVersion: user.session_version }, 409);
    }

    let stored = null;
    if (body.session !== null && body.session !== undefined) {
      const text = JSON.stringify(body.session);
      if (typeof body.session !== 'object' || Array.isArray(body.session)) throw new HttpError(400, 'bad_request', 'session must be an object');
      if (text.length > LIMITS.maxSessionBytes) throw new HttpError(413, 'too_large', 'Session too large');
      stored = { deviceId, label, updatedAt: now, epoch: baseEpoch, data: body.session };
    }
    const newVersion = user.session_version + (ownedByOther ? 1 : 0);
    const r = await env.DB.prepare(
      'UPDATE users SET session = ?, session_version = ? WHERE uid = ? AND session_version = ? AND reset_epoch = ?'
    ).bind(stored ? JSON.stringify(stored) : null, newVersion, data.uid, user.session_version, baseEpoch).run();
    if (r.meta.changes === 0) {
      return json({ ok: false, error: 'conflict', message: 'Changed by another device, retry' }, 409);
    }
    return json({ ok: true, sessionVersion: newVersion });
  } catch (err) {
    return errorResponse(err);
  }
}
