/**
 * Scheduling window helpers — banners, collections and homepage sections all
 * carry an optional `startsAt` / `endsAt` pair. These build the Prisma
 * where-fragment that means "live right now".
 */
export function liveNow(now: Date = new Date()): Record<string, unknown> {
  return {
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
    ],
  };
}

/** True when `now` falls inside the optional window of a record. */
export function isLive(
  record: { startsAt?: Date | null; endsAt?: Date | null },
  now: Date = new Date(),
): boolean {
  if (record.startsAt && record.startsAt > now) return false;
  if (record.endsAt && record.endsAt < now) return false;
  return true;
}
