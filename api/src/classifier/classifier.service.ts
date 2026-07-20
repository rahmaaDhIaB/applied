import { Injectable } from '@nestjs/common';
import { ATS_DOMAINS, NON_APPLICATION_DOMAINS, domainMatches } from './ats-domains';

/**
 * The inbound status an email can signal. Note this is a subset of the full
 * ApplicationStatus enum: an email can never tell us GHOSTED — that is derived
 * by us from the passage of time, never received.
 */
export type EmailStatus =
  | 'REJECTED'
  | 'INTERVIEW'
  | 'ACKNOWLEDGED'
  | 'APPLIED';

export interface Classification {
  isJobRelated: boolean;
  status: EmailStatus;
  confidence: number; // 0..1 — how sure we are of `status`
  company: string | null; // best-effort company name pulled from the subject
  reason: string; // human-readable why, useful for debugging & the UI
}

/** The minimal shape the classifier needs. Matches ParsedEmail from GmailService. */
export interface ClassifiableEmail {
  fromEmail: string;
  fromName: string | null;
  subject: string;
  snippet: string;
}

// Keyword sets, bilingual (FR + EN), lower-cased. Ordered by how strong a signal
// they are — see classifyStatus for why order matters.
const REJECTION_PATTERNS = [
  'unfortunately',
  'not moving forward',
  'other candidates',
  'not be moving',
  'decided not to',
  'will not be proceeding',
  'not the end of the road', // softened rejection seen in the real inbox
  'we regret',
  'regret to inform',
  'not selected',
  'malheureusement',
  'ne donnerons pas suite',
  "n'avons pas retenu",
  'pas retenu',
  'candidature n’a pas',
  'candidature na pas',
];

const INTERVIEW_PATTERNS = [
  'interview',
  'schedule a call',
  'schedule a time',
  'your availability',
  'book a slot',
  'entretien',
  'disponibilités',
  'disponibilite',
  'rendez-vous',
  'meet with',
  'next steps', // usually means they want to talk
];

const ACK_PATTERNS = [
  'received your application',
  "we've received",
  'thank you for applying',
  'thank you for your application',
  'application received',
  'merci pour votre candidature',
  'merci de votre candidature',
  'bien reçu votre candidature',
  'avons bien reçu',
  'votre candidature',
];

@Injectable()
export class ClassifierService {
  /**
   * The full two-stage classification for one email.
   *
   * Stage 1 decides job-related vs noise (mostly by sender domain).
   * Stage 2 decides the status, only if it's job-related.
   *
   * Pure and side-effect-free on purpose: same input always gives the same
   * output, which is what makes it testable against saved real emails.
   */
  classify(email: ClassifiableEmail): Classification {
    const jobRelated = this.isJobRelated(email);
    if (!jobRelated.ok) {
      return {
        isJobRelated: false,
        status: 'APPLIED',
        confidence: 0,
        company: null,
        reason: jobRelated.reason,
      };
    }

    const { status, confidence, reason } = this.classifyStatus(email);
    return {
      isJobRelated: true,
      status,
      confidence,
      company: this.extractCompany(email),
      reason: `${jobRelated.reason}; ${reason}`,
    };
  }

  /**
   * Stage 1: is this about one of the user's applications at all?
   *
   * Priority:
   *  1. Explicit noise domains (LinkedIn, job boards) -> not job-related, even if
   *     the subject contains "application". These are alerts, not applications.
   *  2. Known ATS domain -> yes, high confidence.
   *  3. A human `Re:` on a "candidature/application" subject -> yes; this is how
   *     a real recruiter replies to move you forward.
   *  4. Otherwise -> no.
   */
  private isJobRelated(email: ClassifiableEmail): { ok: boolean; reason: string } {
    if (domainMatches(email.fromEmail, NON_APPLICATION_DOMAINS)) {
      return { ok: false, reason: 'sender is a job board / newsletter, not an application' };
    }

    if (domainMatches(email.fromEmail, ATS_DOMAINS)) {
      return { ok: true, reason: 'sender is a known ATS' };
    }

    const subject = email.subject.toLowerCase();
    const looksLikeReply = subject.startsWith('re:');
    const mentionsApplication =
      subject.includes('application') || subject.includes('candidature');
    if (looksLikeReply && mentionsApplication) {
      return { ok: true, reason: 'human reply to an application thread' };
    }

    return { ok: false, reason: 'no ATS sender and no application reply signal' };
  }

  /**
   * Stage 2: which status does the text signal?
   *
   * Order is deliberate and is the crux of the logic:
   *  REJECTED first, then INTERVIEW, then ACKNOWLEDGED, else APPLIED.
   *
   * Why: an interview email often also says "thank you for your application",
   * and a rejection can too. If we checked ACKNOWLEDGED first we'd stop early and
   * mislabel. So we test the strongest, most decisive signal first and only fall
   * through to weaker ones.
   */
  private classifyStatus(email: ClassifiableEmail): {
    status: EmailStatus;
    confidence: number;
    reason: string;
  } {
    const text = `${email.subject}\n${email.snippet}`.toLowerCase();

    if (this.matchesAny(text, REJECTION_PATTERNS)) {
      return { status: 'REJECTED', confidence: 0.9, reason: 'matched a rejection phrase' };
    }
    if (this.matchesAny(text, INTERVIEW_PATTERNS)) {
      return { status: 'INTERVIEW', confidence: 0.8, reason: 'matched an interview phrase' };
    }
    if (this.matchesAny(text, ACK_PATTERNS)) {
      return { status: 'ACKNOWLEDGED', confidence: 0.7, reason: 'matched an acknowledgement phrase' };
    }
    // Job-related (ATS sender) but no status keyword: safest assumption is that
    // an application exists. Low confidence flags it for review.
    return { status: 'APPLIED', confidence: 0.4, reason: 'job-related but no status keyword' };
  }

  private matchesAny(text: string, patterns: string[]): boolean {
    return patterns.some((p) => text.includes(p));
  }

  /**
   * Best-effort company name from the subject.
   * Handles the shapes seen in the real inbox:
   *   "Thank you for applying to TomTom"
   *   "Thank you for your application to Theodo!"
   *   "Votre candidature chez Vigie"
   *   "n8n | We've received your application"   (company before a pipe)
   */
  private extractCompany(email: ClassifiableEmail): string | null {
    const subject = email.subject.trim();

    const patterns = [
      /applying to\s+(.+?)[!.\n]*$/i,
      /application to\s+(.+?)[!.\n]*$/i,
      /candidature (?:chez|au sein de|pour)\s+(.+?)[!.\n]*$/i,
    ];
    for (const re of patterns) {
      const m = subject.match(re);
      if (m) return this.cleanCompany(m[1]);
    }

    // "Company | subject line" — the ATS puts the company before a pipe.
    if (subject.includes('|')) {
      const before = subject.split('|')[0].trim();
      if (before && before.length <= 40) return this.cleanCompany(before);
    }

    return null;
  }

  private cleanCompany(raw: string): string {
    return raw.replace(/[!.,]+$/, '').trim();
  }
}
