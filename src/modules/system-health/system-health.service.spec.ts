import { SystemHealthService } from './system-health.service';

type PrismaLike = Record<string, Record<string, jest.Mock>>;

describe('SystemHealthService', () => {
  let prisma: PrismaLike;
  let service: SystemHealthService;

  beforeEach(() => {
    prisma = {
      errorLog: { groupBy: jest.fn(), count: jest.fn() },
      dataMismatch: { groupBy: jest.fn(), count: jest.fn() },
    };
    service = new SystemHealthService(prisma as any);
  });

  it('aggregates open errors by level and mismatches by severity', async () => {
    prisma.errorLog.groupBy.mockResolvedValue([
      { level: 'CRITICAL', _count: 2 },
      { level: 'ERROR', _count: 5 },
    ]);
    prisma.dataMismatch.groupBy.mockResolvedValue([{ severity: 'HIGH', _count: 3 }]);
    prisma.errorLog.count.mockResolvedValue(24);
    prisma.dataMismatch.count.mockResolvedValue(7);

    const summary = await service.getSummary();

    expect(summary).toEqual({
      errors: { CRITICAL: 2, ERROR: 5 },
      mismatches: { HIGH: 3 },
      resolvedLast24h: { errors: 24, mismatches: 7 },
    });
    expect(prisma.errorLog.groupBy.mock.calls[0][0]).toMatchObject({
      by: ['level'],
      where: { isResolved: false },
    });
    expect(prisma.dataMismatch.count.mock.calls[0][0].where.resolvedAt.gte).toBeInstanceOf(Date);
  });
});
