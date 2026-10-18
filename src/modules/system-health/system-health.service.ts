import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface SystemHealthSummary {
  errors: Record<string, number>;
  mismatches: Record<string, number>;
  resolvedLast24h: { errors: number; mismatches: number };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Aggregated counts for the System Health dashboard cards. */
@Injectable()
export class SystemHealthService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(): Promise<SystemHealthSummary> {
    const since = new Date(Date.now() - DAY_MS);

    const [errorGroups, mismatchGroups, resolvedErrors, resolvedMismatches] = await Promise.all([
      this.prisma.errorLog.groupBy({
        by: ['level'],
        where: { isResolved: false },
        _count: true,
      }),
      this.prisma.dataMismatch.groupBy({
        by: ['severity'],
        where: { isResolved: false },
        _count: true,
      }),
      this.prisma.errorLog.count({
        where: { isResolved: true, resolvedAt: { gte: since } },
      }),
      this.prisma.dataMismatch.count({
        where: { isResolved: true, resolvedAt: { gte: since } },
      }),
    ]);

    return {
      errors: Object.fromEntries(errorGroups.map((row) => [row.level, row._count])),
      mismatches: Object.fromEntries(mismatchGroups.map((row) => [row.severity, row._count])),
      resolvedLast24h: { errors: resolvedErrors, mismatches: resolvedMismatches },
    };
  }
}
