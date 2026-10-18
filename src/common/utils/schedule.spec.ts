import { isLive, liveNow } from './schedule';

describe('schedule helpers', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');

  describe('liveNow', () => {
    it('builds an AND of open-ended OR windows', () => {
      const where = liveNow(now);
      expect(where).toEqual({
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      });
    });
  });

  describe('isLive', () => {
    it('is live when there is no window at all', () => {
      expect(isLive({}, now)).toBe(true);
    });

    it('is not live before startsAt', () => {
      expect(isLive({ startsAt: new Date('2026-06-20T00:00:00.000Z') }, now)).toBe(false);
    });

    it('is not live after endsAt', () => {
      expect(isLive({ endsAt: new Date('2026-06-01T00:00:00.000Z') }, now)).toBe(false);
    });

    it('is live inside the window (boundaries inclusive)', () => {
      expect(
        isLive(
          { startsAt: new Date('2026-06-15T12:00:00.000Z'), endsAt: new Date('2026-06-15T12:00:00.000Z') },
          now,
        ),
      ).toBe(true);
    });
  });
});
