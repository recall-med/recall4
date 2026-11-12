// Shared admin guard: the signed-in id must be listed in the ADMIN_UIDS variable (comma-separated).
import { HttpError } from './http.js';

export function adminList(env) { return String(env.ADMIN_UIDS || '').split(',').map((s) => s.trim()).filter(Boolean); }
export function requireAdmin(env, data) {
  if (!adminList(env).includes(data.uid)) throw new HttpError(403, 'forbidden', 'Not an administrator');
}
