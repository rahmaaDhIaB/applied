import type { ApplicationStatus } from '../../generated/prisma/enums';

/**
 * The application status state machine.
 *
 * Applications move forward through stages. The problem this solves: emails
 * arrive out of order. An "application received" auto-ack can land in the inbox
 * a minute AFTER the interview invite (different systems, different delays). If
 * we blindly wrote whatever the latest email said, one late auto-ack would drag
 * an INTERVIEW back down to ACKNOWLEDGED. So we rank the stages and only ever
 * move forward.
 *
 * GHOSTED and REJECTED are special — see canTransition.
 */

// Higher rank = further along. Used to decide "is this a step forward?".
const RANK: Record<ApplicationStatus, number> = {
  APPLIED: 0,
  ACKNOWLEDGED: 1,
  SCREENING: 2,
  INTERVIEW: 3,
  OFFER: 4,
  REJECTED: 5, // terminal
  GHOSTED: 1, // derived; a weak state we can leave for any real signal
};

/**
 * Decide whether an incoming status should replace the current one.
 *
 * Rules, in order:
 *  - REJECTED is terminal: once rejected, nothing an email says moves it. (A
 *    real "actually, we'd like to talk" is rare enough to handle by hand.)
 *  - Any real inbound status can rescue a GHOSTED application — the company did
 *    reply after all.
 *  - Otherwise only move forward: never lower the rank.
 */
export function canTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
): boolean {
  if (from === to) return false; // no-op, don't record a non-event
  if (from === 'REJECTED') return false; // terminal
  if (from === 'GHOSTED') return true; // any reply un-ghosts it
  return RANK[to] > RANK[from];
}

/**
 * Given the current status and what an email signalled, return the status the
 * application should end up in (may be unchanged).
 */
export function nextStatus(
  current: ApplicationStatus,
  signalled: ApplicationStatus,
): ApplicationStatus {
  return canTransition(current, signalled) ? signalled : current;
}

/**
 * Derived status: an application is GHOSTED if it has been sitting in an early,
 * non-terminal state with no new activity for `days` days. We never receive this
 * from an email — we compute it from the passage of time.
 *
 * 21 days chosen deliberately: short enough to be useful for "who should I chase",
 * long enough to avoid flagging companies that simply reply slowly.
 */
export const GHOST_AFTER_DAYS = 21;

const GHOSTABLE: ApplicationStatus[] = ['APPLIED', 'ACKNOWLEDGED', 'SCREENING'];

export function isGhosted(
  status: ApplicationStatus,
  lastEventAt: Date,
  now: Date,
): boolean {
  if (!GHOSTABLE.includes(status)) return false;
  const days = (now.getTime() - lastEventAt.getTime()) / (1000 * 60 * 60 * 24);
  return days >= GHOST_AFTER_DAYS;
}
