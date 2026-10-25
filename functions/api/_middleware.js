// Runs before every /api route. Everything except /api/health needs a
// valid Firebase token; the user id is taken from the token only.

import { verifyRequest } from '../_lib/auth.js';
import { HttpError, errorResponse } from '../_lib/http.js';

export async function onRequest(context) {
  const { request, env, next, data } = context;
  try {
    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    if (path === '/api/health') return await next();
    if (!env.DB) throw new HttpError(500, 'server_misconfigured', 'Database is not bound');
    data.uid = await verifyRequest(request, env);
    return await next();
  } catch (err) {
    return errorResponse(err);
  }
}
