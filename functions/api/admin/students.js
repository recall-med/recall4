// GET /api/admin/students  (admin only) -> one row per account: name, email, activity, status.
// Emails are stored from the verified sign-in token, so accounts that have not signed in since that began show none.
import { json, errorResponse, HttpError } from '../../_lib/http.js';
import { requireAdmin, isOwner } from '../../_lib/admin.js';

export async function onRequest({ request, env, data }) {
  try {
    if (request.method !== 'GET') throw new HttpError(405, 'method_not_allowed', 'Use GET');
    await requireAdmin(env, data);
    const rows = await env.DB.prepare(
      'SELECT u.uid, u.email, u.first_name, u.last_name, u.created_at, u.last_seen, u.blocked, u.is_admin, ' +
      '(SELECT COUNT(*) FROM attempts a WHERE a.uid = u.uid) AS exams, ' +
      '(SELECT COALESCE(SUM(attempted), 0) FROM attempts a WHERE a.uid = u.uid) AS attempted, ' +
      '(SELECT COALESCE(SUM(correct), 0) FROM attempts a WHERE a.uid = u.uid) AS correct, ' +
      '(SELECT MAX(created_at) FROM attempts a WHERE a.uid = u.uid) AS last_exam ' +
      'FROM users u ORDER BY u.created_at DESC LIMIT 1000'
    ).all();
    return json({ ok: true, me: { owner: isOwner(env, data.uid) }, students: rows.results.map((r) => ({ ...r, owner: isOwner(env, r.uid) })) });
  } catch (err) {
    return errorResponse(err);
  }
}
