/**
 * Known Applicant Tracking System (ATS) sender domains.
 *
 * These came from inspecting a real job-seeker inbox: application confirmations,
 * rejections and interview invites overwhelmingly arrive from an ATS rather than
 * from the company's own domain. Matching the sender against this list is the
 * single most reliable way to decide "is this email about a job application?".
 *
 * Kept as a plain list (not hard-coded in the service) so adding a newly spotted
 * ATS is a one-line change with an obvious place to put it.
 */
export const ATS_DOMAINS: readonly string[] = [
  'ashbyhq.com',
  'lever.co', // covers hire.lever.co, hire.eu.lever.co
  'greenhouse.io',
  'smartrecruiters.com',
  'workable.com',
  'myworkday.com',
  'bamboohr.com',
  'teamtailor.com',
  'join.com',
  'emply.com',
  'recruitee.com',
  'personio.de',
  'jobvite.com',
  'icims.com',
];

/**
 * Job-adjacent senders that are NOT the user's own applications — job-board
 * alerts, networking noise. A `newer_than` search or a naive keyword match
 * happily includes these, so we exclude them explicitly.
 */
export const NON_APPLICATION_DOMAINS: readonly string[] = [
  'meteojob.com',
  'linkedin.com', // newsletters, alerts, "you appeared in searches"
  'indeed.com', // alerts, not the applications themselves
  'welcometothejungle.com',
];

/**
 * Build a Gmail search query that surfaces likely job mail and nothing else.
 *
 * Why: fetching the 50 most recent emails is mostly newsletters — the real
 * application mail is buried. Instead we let Gmail do the coarse filter
 * server-side (cheap, one query) by OR-ing every known ATS sender with the
 * application keywords. The local classifier still runs afterwards as a second,
 * finer pass, so anything that slips through is still rejected.
 */
export function buildJobSearchQuery(windowDays = 365): string {
  const fromClauses = ATS_DOMAINS.map((d) => `from:${d}`);
  const keywordClauses = [
    'subject:application',
    'subject:candidature',
    '"thank you for applying"',
    '"votre candidature"',
  ];
  const ors = [...fromClauses, ...keywordClauses].join(' OR ');
  return `newer_than:${windowDays}d (${ors})`;
}

/**
 * True if `email`'s domain is (or ends with) one of `domains`.
 * Using endsWith handles ATS subdomains like `hire.eu.lever.co`.
 */
export function domainMatches(
  email: string,
  domains: readonly string[],
): boolean {
  const at = email.lastIndexOf('@');
  if (at === -1) return false;
  const host = email.slice(at + 1).toLowerCase();
  return domains.some((d) => host === d || host.endsWith('.' + d) || host.endsWith(d));
}
