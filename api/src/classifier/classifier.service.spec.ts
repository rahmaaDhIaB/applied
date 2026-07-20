import { ClassifierService, ClassifiableEmail } from './classifier.service';

/**
 * Every fixture below is a real email observed in a live inbox (subjects/senders
 * kept, snippets trimmed). Testing against real data is the point: it's the only
 * way to know the classifier survives messy, bilingual, softly-worded mail.
 */
const email = (over: Partial<ClassifiableEmail>): ClassifiableEmail => ({
  fromEmail: 'x@example.com',
  fromName: null,
  subject: '',
  snippet: '',
  ...over,
});

describe('ClassifierService', () => {
  const svc = new ClassifierService();

  describe('stage 1 — job-related vs noise', () => {
    it('treats a known ATS sender as job-related', () => {
      const r = svc.classify(
        email({ fromEmail: 'no-reply@ashbyhq.com', subject: "n8n | We've received your application" }),
      );
      expect(r.isJobRelated).toBe(true);
    });

    it('handles ATS subdomains like hire.eu.lever.co', () => {
      const r = svc.classify(
        email({ fromEmail: 'no-reply@hire.eu.lever.co', subject: 'Thank you for applying to TomTom' }),
      );
      expect(r.isJobRelated).toBe(true);
    });

    it('rejects LinkedIn newsletters even when the subject mentions applications', () => {
      const r = svc.classify(
        email({
          fromEmail: 'newsletters-noreply@linkedin.com',
          subject: 'What Happens to Your Application After You Submit It',
        }),
      );
      expect(r.isJobRelated).toBe(false);
    });

    it('rejects job-board alerts (meteojob) that are listings, not applications', () => {
      const r = svc.classify(
        email({ fromEmail: 'ne-pas-repondre@meteojob.com', subject: 'Leihia recrute un Développeur web' }),
      );
      expect(r.isJobRelated).toBe(false);
    });

    it('treats a human Re: on a candidature thread as job-related', () => {
      const r = svc.classify(
        email({ fromEmail: 'marion@vigie.co', subject: 'Re: Votre candidature chez Vigie' }),
      );
      expect(r.isJobRelated).toBe(true);
    });
  });

  describe('stage 2 — status', () => {
    it('detects a softened rejection ("not the end of the road")', () => {
      const r = svc.classify(
        email({
          fromEmail: 'no-reply@hire.eu.lever.co',
          subject: "VW Group Digital Solutions | Rahma, it's not the end of the road",
        }),
      );
      expect(r.status).toBe('REJECTED');
    });

    it('detects a French acknowledgement', () => {
      const r = svc.classify(
        email({ fromEmail: 'notification@smartrecruiters.com', subject: 'Merci pour votre candidature !' }),
      );
      expect(r.status).toBe('ACKNOWLEDGED');
    });

    it('detects an English acknowledgement', () => {
      const r = svc.classify(
        email({ fromEmail: 'no-reply@hire.lever.co', subject: 'Thank you for applying to Theodo!' }),
      );
      expect(r.status).toBe('ACKNOWLEDGED');
    });

    it('detects an interview invite', () => {
      const r = svc.classify(
        email({
          fromEmail: 'no-reply@ashbyhq.com',
          subject: 'Next steps for your application',
          snippet: "We'd love to schedule a call to discuss the role.",
        }),
      );
      expect(r.status).toBe('INTERVIEW');
    });

    it('prefers REJECTED over ACKNOWLEDGED when both signals are present', () => {
      // A rejection that also politely thanks you for applying.
      const r = svc.classify(
        email({
          fromEmail: 'no-reply@hire.lever.co',
          subject: 'Your application to Theodo',
          snippet:
            'Thank you for applying. Unfortunately we have decided not to move forward.',
        }),
      );
      expect(r.status).toBe('REJECTED');
    });

    it('falls back to APPLIED (low confidence) for an ATS email with no keyword', () => {
      const r = svc.classify(
        email({ fromEmail: 'no-reply@ashbyhq.com', subject: 'Ruby Labs' }),
      );
      expect(r.status).toBe('APPLIED');
      expect(r.confidence).toBeLessThan(0.5);
    });
  });

  describe('company extraction', () => {
    it('pulls the company from "applying to X"', () => {
      const r = svc.classify(
        email({ fromEmail: 'no-reply@hire.lever.co', subject: 'Thank you for applying to Theodo!' }),
      );
      expect(r.company).toBe('Theodo');
    });

    it('pulls the company from "candidature chez X"', () => {
      const r = svc.classify(
        email({ fromEmail: 'marion@vigie.co', subject: 'Re: Votre candidature chez Vigie' }),
      );
      expect(r.company).toBe('Vigie');
    });

    it('pulls the company before a pipe', () => {
      const r = svc.classify(
        email({ fromEmail: 'no-reply@ashbyhq.com', subject: "n8n | We've received your application" }),
      );
      expect(r.company).toBe('n8n');
    });

    it('cuts the role off after a slash when anchored by a pipe', () => {
      const r = svc.classify(
        email({
          fromEmail: 'notification@smartrecruiters.com',
          subject: 'WEBQAM Groupe/Développeur(euse) | Votre candidature',
        }),
      );
      expect(r.company).toBe('WEBQAM Groupe');
    });

    it('returns null for a bare subject with no company anchor', () => {
      // No "applying to", no "candidature chez", no pipe -> we do NOT guess,
      // because guessing turns "Thank you for applying" into a fake company.
      const r = svc.classify(
        email({ fromEmail: 'notification@smartrecruiters.com', subject: 'Quelques questions' }),
      );
      expect(r.company).toBeNull();
    });

    it('drops recruiting-team boilerplate', () => {
      const r = svc.classify(
        email({ fromEmail: 'no-reply@join.com', subject: 'Your application at Local Brand X Recruiting Team' }),
      );
      expect(r.company).toBe('Local Brand X');
    });

    it('never returns the ATS platform name as the company', () => {
      const r = svc.classify(
        email({ fromEmail: 'notification@smartrecruiters.com', subject: 'SmartRecruiters | Your one-time-passcode' }),
      );
      expect(r.company).toBeNull();
    });
  });
});
