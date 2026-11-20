// Shared HTTP helpers for all /api routes.

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export const MAX_BODY_BYTES = 256 * 1024;

// Reads and parses a JSON body, refusing anything over MAX_BODY_BYTES.
export async function readJson(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, 'too_large', 'Body too large');
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'too_large', 'Body too large');
  let data;
  try { data = JSON.parse(text); }
  catch (e) { throw new HttpError(400, 'bad_json', 'Body is not valid JSON'); }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpError(400, 'bad_json', 'Body must be a JSON object');
  }
  return data;
}

// Turns any thrown error into a JSON response. D1 quota errors become 503.
export function errorResponse(err) {
  if (err instanceof HttpError) {
    return json({ ok: false, error: err.code, message: err.message }, err.status);
  }
  const msg = String((err && err.message) || err || '');
  if (/limit|quota|exceed|too many|overloaded/i.test(msg)) {
    return json({ ok: false, error: 'resource_exhausted', message: 'Cloud sync is paused' }, 503);
  }
  console.error('Unhandled error:', msg);
  return json({ ok: false, error: 'server_error', message: 'Server error' }, 500);
}
