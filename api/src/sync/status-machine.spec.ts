import { canTransition, nextStatus, isGhosted } from './status-machine';

describe('status-machine', () => {
  describe('canTransition', () => {
    it('moves forward', () => {
      expect(canTransition('APPLIED', 'INTERVIEW')).toBe(true);
      expect(canTransition('ACKNOWLEDGED', 'OFFER')).toBe(true);
    });

    it('never moves backward (a late auto-ack cannot undo an interview)', () => {
      expect(canTransition('INTERVIEW', 'ACKNOWLEDGED')).toBe(false);
    });

    it('treats REJECTED as terminal', () => {
      expect(canTransition('REJECTED', 'INTERVIEW')).toBe(false);
      expect(canTransition('REJECTED', 'OFFER')).toBe(false);
    });

    it('lets any real reply rescue a GHOSTED application', () => {
      expect(canTransition('GHOSTED', 'INTERVIEW')).toBe(true);
      expect(canTransition('GHOSTED', 'REJECTED')).toBe(true);
    });

    it('is a no-op when nothing changes', () => {
      expect(canTransition('INTERVIEW', 'INTERVIEW')).toBe(false);
    });
  });

  describe('nextStatus', () => {
    it('returns the forward status', () => {
      expect(nextStatus('APPLIED', 'INTERVIEW')).toBe('INTERVIEW');
    });
    it('keeps the current status on a backward signal', () => {
      expect(nextStatus('INTERVIEW', 'ACKNOWLEDGED')).toBe('INTERVIEW');
    });
  });

  describe('isGhosted', () => {
    const now = new Date('2026-02-01T00:00:00Z');

    it('flags an old, still-early application', () => {
      const old = new Date('2026-01-01T00:00:00Z'); // 31 days
      expect(isGhosted('APPLIED', old, now)).toBe(true);
    });

    it('does not flag a recent one', () => {
      const recent = new Date('2026-01-20T00:00:00Z'); // 12 days
      expect(isGhosted('APPLIED', recent, now)).toBe(false);
    });

    it('never ghosts a terminal/advanced state', () => {
      const old = new Date('2026-01-01T00:00:00Z');
      expect(isGhosted('REJECTED', old, now)).toBe(false);
      expect(isGhosted('OFFER', old, now)).toBe(false);
      expect(isGhosted('INTERVIEW', old, now)).toBe(false);
    });
  });
});
