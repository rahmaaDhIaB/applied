import { companyKeyFromName, companyKeyFromEmail } from './company-key';

describe('company-key', () => {
  describe('companyKeyFromName', () => {
    it('reduces variants of the same company to one key', () => {
      const key = companyKeyFromName('Acme');
      expect(companyKeyFromName('ACME')).toBe(key);
      expect(companyKeyFromName('Acme Inc.')).toBe(key);
      expect(companyKeyFromName('Acme Inc')).toBe(key);
    });

    it('strips accents', () => {
      expect(companyKeyFromName('Théodo')).toBe('theodo');
    });

    it('drops trailing generic suffixes but keeps the distinctive part', () => {
      expect(companyKeyFromName('VW Group Digital Solutions')).toBe('vw');
    });

    it('keeps single-word names that happen to be a suffix', () => {
      // "Group" alone shouldn't reduce to empty string.
      expect(companyKeyFromName('Group')).toBe('group');
    });
  });

  describe('companyKeyFromEmail', () => {
    it('keys on the domain label for a company address', () => {
      expect(companyKeyFromEmail('careers@acme.com')).toBe('acme');
    });

    it('returns null for an ATS host (not the employer)', () => {
      expect(companyKeyFromEmail('no-reply@ashbyhq.com')).toBeNull();
      expect(companyKeyFromEmail('x@hire.eu.lever.co')).toBeNull();
    });

    it('returns null for free mail', () => {
      expect(companyKeyFromEmail('someone@gmail.com')).toBeNull();
    });
  });
});
