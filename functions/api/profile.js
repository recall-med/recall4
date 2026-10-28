// POST /api/profile  body: { firstName, lastName? }
// Saves the signed-in person's display name. Names are not unique and can be changed any time.
// Only the id inside the verified token is used. Writing the same name again changes nothing.

import { json, readJson, errorResponse, HttpError } from '../_lib/http.js';
import { touchUser } from '../_lib/db.js';
import { cleanName } from '../_lib/names.js';

export async function onRequest({ request, env, data }) {
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Use POST');
    const body = await readJson(request);
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'bad_request', 'Body must be an object');
    if (typeof body.firstName !== 'string' || (body.lastName != null && typeof body.lastName !== 'string')) {
      throw new HttpError(400, 'bad_request', 'firstName and lastName must be text');
    }
    const n = cleanName(body.firstName, body.lastName);
    if (!n.ok) throw new HttpError(400, 'bad_name', n.error);
    const user = await touchUser(env.DB, data.uid, Date.now());
    const same = (user.first_name || '') === n.firstName && (user.last_name || '') === n.lastName;
    if (!same) {
      await env.DB.prepare('UPDATE users SET first_name = ?, last_name = ? WHERE uid = ?')
        .bind(n.firstName, n.lastName || null, data.uid).run();
    }
    return json({ ok: true, profile: { firstName: n.firstName, lastName: n.lastName } });
  } catch (err) {
    return errorResponse(err);
  }
}
