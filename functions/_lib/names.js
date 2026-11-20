// Name rules for the account profile (first name required, last name optional).
// The SAME rules live in assets/js/names.js for instant feedback in the browser;
// backend-tests/run.mjs fails if the two ever disagree.

export const NAME_MAX = 30;

const ALLOWED = /^[\p{L}\p{M}][\p{L}\p{M} '\u2019.\-]*$/u;

// Matched anywhere inside the letters of a name (spaces and punctuation removed).
const STRONG = [
  'fuck', 'shit', 'cunt', 'bitch', 'nigger', 'nigga', 'faggot', 'whore', 'slut', 'asshole',
  'motherfucker', 'sharmoot', 'sharmouta', 'sharmuta', 'manyak', 'khawal', 'kosomak',
  '\u0634\u0631\u0645\u0648\u0637', '\u0645\u0646\u064a\u0643', '\u0645\u062a\u0646\u0627\u0643',
  '\u0643\u0633\u0645\u0643', '\u0643\u0633\u0627\u0645\u0643'
];
// Matched only as a whole word.
const WORDS = [
  'ass', 'arse', 'cock', 'dick', 'pussy', 'penis', 'twat', 'wank', 'bastard', 'retard', 'nazi', 'hitler',
  'rape', 'porn', 'sex', 'anus', 'kike', 'chink', 'spic', 'tranny', 'dyke', 'fag',
  'kos', 'zebi', 'zeby', 'ayri', 'ars', 'khawal',
  '\u062e\u0648\u0644', '\u0639\u0631\u0635', '\u0643\u0633', '\u0642\u062d\u0628\u0629', '\u0642\u062d\u0628\u0647'
];

function fold(s) {
  return String(s).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}
function squash(s) { return s.replace(/(.)\1+/gu, '$1'); } // "fuuuck" -> "fuck"

export function isBlocked(text) {
  const f = fold(text);
  const tokens = f.split(/[^\p{L}]+/u).filter(Boolean);
  const joined = tokens.join('');
  const forms = [joined, squash(joined)];
  for (const w of STRONG) {
    const sw = squash(w);
    if (forms.some((x) => x.includes(w) || x.includes(sw))) return true;
  }
  for (const t of tokens) {
    const st = squash(t);
    if (WORDS.includes(t) || WORDS.includes(st)) return true;
  }
  return false;
}

const tidy = (s) => String(s == null ? '' : s).normalize('NFC').replace(/\s+/gu, ' ').trim();

// -> { ok: true, firstName, lastName } or { ok: false, error }
export function cleanName(first, last) {
  const f = tidy(first), l = tidy(last);
  if (!f) return { ok: false, error: 'Enter your first name.' };
  if ([...f].length > NAME_MAX || [...l].length > NAME_MAX) {
    return { ok: false, error: 'Names can be up to ' + NAME_MAX + ' characters.' };
  }
  if (!ALLOWED.test(f) || (l && !ALLOWED.test(l))) {
    return { ok: false, error: 'Use letters, spaces, hyphens and apostrophes only.' };
  }
  if (isBlocked(f) || (l && isBlocked(l)) || isBlocked(f + ' ' + l)) {
    return { ok: false, error: 'Please choose a different name.' };
  }
  return { ok: true, firstName: f, lastName: l };
}
