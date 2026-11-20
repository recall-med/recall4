// Pure merge rules. No I/O, so they can be unit-tested exhaustively.
//
// An "entry" is { epoch, rev, updatedAt, ...data }.
// Winner: higher epoch, then higher rev, then later updatedAt,
// then a canonical string compare so ties are always deterministic.
// Incoming updatedAt is clamped to server time BEFORE merging (clampEntry),
// so the comparison itself never depends on the clock.

export function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}

export function clampEntry(entry, now) {
  return { ...entry, updatedAt: Math.min(Math.max(entry.updatedAt, 0), now) };
}

// Returns a positive number if a beats b, negative if b beats a, 0 if identical.
export function compareEntries(a, b) {
  if (a.epoch !== b.epoch) return a.epoch - b.epoch;
  if (a.rev !== b.rev) return a.rev - b.rev;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt;
  const sa = canonical(a), sb = canonical(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

export function mergeEntry(a, b) {
  if (!a) return b;
  if (!b) return a;
  return compareEntries(a, b) >= 0 ? a : b;
}

// Merges two maps of entries keyed by question id.
export function mergeMaps(stored, incoming) {
  const out = { ...stored };
  for (const k of Object.keys(incoming)) out[k] = mergeEntry(out[k], incoming[k]);
  return out;
}

// Drops entries from before the current reset epoch.
export function dropOlderEpoch(map, epoch) {
  const out = {};
  for (const k of Object.keys(map || {})) if (map[k].epoch >= epoch) out[k] = map[k];
  return out;
}
