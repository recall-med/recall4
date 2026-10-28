// Runs before every /api route. Everything except /api/health needs a
// valid Firebase token; the user id is taken from the token only.

import { verifyClaims } from '../_lib/auth.js';
import { HttpError, errorResponse } from '../_lib/http.js';

export async function onRequest(context) {
  const { request, env, next, data } = context;
  try {
    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    if (path === '/api/health') return await next();
    if (!env.DB) throw new HttpError(500, 'server_misconfigured', 'Database is not bound');
    const claims = await verifyClaims(request, env);
    data.uid = claims.sub;
    data.authTime = typeof claims.auth_time === 'number' ? claims.auth_time : 0;   // seconds; when the person last signed in
    return await next();
  } catch (err) {
    return errorResponse(err);
  }
}
