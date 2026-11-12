// Admin roles. Owners are listed in the ADMIN_UIDS variable (set only in Cloudflare) and cannot be changed from the app.
// Owners can make other people admins (stored as users.is_admin = 1); admins can use every admin tool except managing admins.
import { HttpError } from './http.js';

export function adminList(env) { return String(env.ADMIN_UIDS || '').split(',').map((s) => s.trim()).filter(Boolean); }
export const isOwner = (env, uid) => adminList(env).includes(uid);
export async function isAdmin(env, uid) {
  if (isOwner(env, uid)) return true;
  const r = await env.DB.prepare('SELECT is_admin FROM users WHERE uid = ?').bind(uid).first();
  return !!(r && r.is_admin);
}
export async function requireAdmin(env, data) {
  if (!(await isAdmin(env, data.uid))) throw new HttpError(403, 'forbidden', 'Not an administrator');
}
