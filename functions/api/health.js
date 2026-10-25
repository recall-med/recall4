// Public. GET /api/health -> {ok:true}. Add ?db=1 to also test the database binding.

import { json, errorResponse } from '../_lib/http.js';

export async function onRequest({ request, env }) {
  try {
    if (request.method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405);
    const out = { ok: true };
    if (new URL(request.url).searchParams.get('db') === '1') {
      if (!env.DB) { out.db = false; }
      else { const r = await env.DB.prepare('SELECT 1 AS one').first(); out.db = r && r.one === 1; }
    }
    return json(out);
  } catch (err) {
    return errorResponse(err);
  }
}
