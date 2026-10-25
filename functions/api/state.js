// GET /api/state -> the signed-in user's full cloud state.

import { json, errorResponse, HttpError } from '../_lib/http.js';
import { touchUser, buildState } from '../_lib/db.js';

export async function onRequest({ request, env, data }) {
  try {
    if (request.method !== 'GET') throw new HttpError(405, 'method_not_allowed', 'Use GET');
    const user = await touchUser(env.DB, data.uid, Date.now());
    return json({ ok: true, ...(await buildState(env.DB, user)) });
  } catch (err) {
    return errorResponse(err);
  }
}
