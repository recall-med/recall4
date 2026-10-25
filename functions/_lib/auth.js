// Firebase ID-token verification using only WebCrypto (no npm dependency,
// so the Pages deploy needs no build step).
//
// The user id comes ONLY from the verified token's `sub` claim.

import { HttpError } from './http.js';

const GOOGLE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let jwksCache = { keys: null, expires: 0 };
const keyCache = new Map(); // kid -> CryptoKey

function b64urlToBytes(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function parseJsonPart(part) {
  try { return JSON.parse(new TextDecoder().decode(b64urlToBytes(part))); }
  catch (e) { return null; }
}

function isLocalHost(request) {
  const h = new URL(request.url).hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

// Test-only key set: honoured ONLY when the request host is localhost, so a
// stray variable on the live site can never switch verification to test keys.
function testJwks(env, request) {
  if (!env.TEST_JWKS || !isLocalHost(request)) return null;
  try { return JSON.parse(env.TEST_JWKS).keys || null; } catch (e) { return null; }
}

async function getKeys(env, request) {
  const local = testJwks(env, request);
  if (local) return local;
  const now = Date.now();
  if (jwksCache.keys && jwksCache.expires > now) return jwksCache.keys;
  const res = await fetch(GOOGLE_JWKS_URL, { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!res.ok) throw new HttpError(503, 'auth_unavailable', 'Could not load signing keys');
  const body = await res.json();
  const m = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
  const ttl = Math.min(m ? Number(m[1]) : 3600, 6 * 3600) * 1000;
  jwksCache = { keys: body.keys || [], expires: now + ttl };
  keyCache.clear();
  return jwksCache.keys;
}

async function importKey(jwk, cacheable) {
  if (cacheable && keyCache.has(jwk.kid)) return keyCache.get(jwk.kid);
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  if (cacheable) keyCache.set(jwk.kid, key);
  return key;
}

const unauthorized = (why) => new HttpError(401, 'unauthorized', why);

// Returns the verified user id, or throws a 401.
export async function verifyRequest(request, env) {
  const projectId = env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new HttpError(500, 'server_misconfigured', 'Auth is not configured');

  const header = request.headers.get('authorization') || '';
  const m = /^Bearer ([A-Za-z0-9._-]+)$/.exec(header);
  if (!m) throw unauthorized('Missing or malformed token');
  const parts = m[1].split('.');
  if (parts.length !== 3) throw unauthorized('Malformed token');

  const head = parseJsonPart(parts[0]);
  const claims = parseJsonPart(parts[1]);
  if (!head || !claims) throw unauthorized('Malformed token');
  if (head.alg !== 'RS256' || typeof head.kid !== 'string') throw unauthorized('Bad algorithm');

  const usingTestKeys = !!testJwks(env, request);
  let keys = await getKeys(env, request);
  let jwk = keys.find((k) => k.kid === head.kid);
  if (!jwk && !usingTestKeys) {
    // Keys may have rotated: refresh once.
    jwksCache = { keys: null, expires: 0 };
    keys = await getKeys(env, request);
    jwk = keys.find((k) => k.kid === head.kid);
  }
  if (!jwk) throw unauthorized('Unknown signing key');

  const key = await importKey(jwk, !usingTestKeys);
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(parts[2]),
    new TextEncoder().encode(parts[0] + '.' + parts[1])
  );
  if (!ok) throw unauthorized('Bad signature');

  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== 'https://securetoken.google.com/' + projectId) throw unauthorized('Wrong issuer');
  if (claims.aud !== projectId) throw unauthorized('Wrong audience');
  if (typeof claims.exp !== 'number' || claims.exp <= now) throw unauthorized('Token expired');
  if (typeof claims.iat !== 'number' || claims.iat > now + 60) throw unauthorized('Token issued in the future');
  if (typeof claims.auth_time === 'number' && claims.auth_time > now + 60) throw unauthorized('Bad auth time');
  if (typeof claims.sub !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(claims.sub)) {
    throw unauthorized('Bad subject');
  }
  return claims.sub;
}
