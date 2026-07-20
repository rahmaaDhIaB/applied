/**
 * Turn a messy company name (or an email address) into a stable key we can match
 * on. The whole point: "Acme Inc.", "ACME", and "careers@acme.com" must all
 * reduce to the same `acme`, so three emails about one job land on one
 * Application instead of creating three.
 *
 * Pure and deterministic so it can be unit-tested and reasoned about.
 */

// Suffixes that add no identity — "Acme" and "Acme GmbH" are the same employer.
const COMPANY_SUFFIXES = [
  'inc',
  'llc',
  'ltd',
  'limited',
  'gmbh',
  'sarl',
  'sas',
  'sa',
  'corp',
  'co',
  'company',
  'group',
  'groupe',
  'technologies',
  'technology',
  'tech',
  'labs',
  'software',
  'solutions',
  'digital',
];

// ATS/mail hostnames that are never the employer — if we derive a key from an
// email address, we must not key on the ATS itself.
const NON_COMPANY_HOSTS = [
  'ashbyhq',
  'lever',
  'greenhouse',
  'smartrecruiters',
  'workable',
  'myworkday',
  'workday',
  'bamboohr',
  'teamtailor',
  'join',
  'emply',
  'recruitee',
  'gmail',
  'googlemail',
  'outlook',
  'hotmail',
  'yahoo',
];

/**
 * Normalize a free-text company name to a key.
 * "Théodo!" -> "theodo", "VW Group Digital Solutions" -> "vw".
 */
export function companyKeyFromName(name: string): string {
  const cleaned = stripAccents(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // drop punctuation/emoji
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleaned.split(' ').filter(Boolean);

  // Drop trailing generic suffixes ("group", "gmbh", "solutions", ...) so the
  // key is the distinctive part of the name.
  while (words.length > 1 && COMPANY_SUFFIXES.includes(words[words.length - 1])) {
    words.pop();
  }

  return words.join('');
}

/**
 * Derive a key from a sender address' domain, e.g. `jobs@acme.com` -> `acme`.
 * Returns null for ATS/free-mail hosts, which don't identify an employer.
 */
export function companyKeyFromEmail(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at === -1) return null;

  const host = email.slice(at + 1).toLowerCase();
  // The registrable label is usually the second-to-last part: acme.com -> acme,
  // careers.acme.co.uk -> acme (good enough for our matching needs).
  const parts = host.split('.').filter(Boolean);
  if (parts.length < 2) return null;
  const label = parts[parts.length - 2];

  if (NON_COMPANY_HOSTS.includes(label)) return null;
  return companyKeyFromName(label) || null;
}

function stripAccents(s: string): string {
  // NFD splits accented letters into base + combining mark; then we drop the
  // combining marks (U+0300–U+036F). "Théodo" -> "Theodo".
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
