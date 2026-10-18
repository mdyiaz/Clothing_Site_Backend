import { Injectable } from '@nestjs/common';
import { LoyaltyTier, LoyaltyTxnType, Prisma } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { getCorrelationId } from '../../common/correlation/correlation-storage';
import { PrismaService } from '../../prisma/prisma.service';

/** Earn rate: 1 point per ৳100 of paid order value. */
export const POINTS_PER_TAKA = 100;

/** Ascending tier thresholds. */
export const TIER_THRESHOLDS: { tier: LoyaltyTier; min: number }[] = [
  { tier: LoyaltyTier.BRONZE, min: 0 },
  { tier: LoyaltyTier.SILVER, min: 500 },
  { tier: LoyaltyTier.GOLD, min: 2000 },
  { tier: LoyaltyTier.PLATINUM, min: 5000 },
];

interface ApplyOptions {
  type: LoyaltyTxnType;
  reason?: string;
  orderId?: string;
  createdBy?: string;
}

/**
 * Append-only points ledger. Every mutation writes a `LoyaltyTransaction` and
 * mirrors the running balance onto `User.loyaltyPoints` (+ recomputed tier), so
 * the column is a cache and the ledger is the source of truth.
 */
@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  static tierFor(points: number): LoyaltyTier {
    let tier: LoyaltyTier = LoyaltyTier.BRONZE;
    for (const step of TIER_THRESHOLDS) if (points >= step.min) tier = step.tier;
    return tier;
  }

  static pointsForOrder(totalAmount: number): number {
    return Math.max(0, Math.floor(totalAmount / POINTS_PER_TAKA));
  }

  async getSummary(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { loyaltyPoints: true, loyaltyTier: true },
    });
    if (!user) throw AppException.notFound('User');

    const next = TIER_THRESHOLDS.find((step) => step.min > user.loyaltyPoints);
    return {
      points: user.loyaltyPoints,
      tier: user.loyaltyTier,
      nextTier: next?.tier ?? null,
      pointsToNext: next ? next.min - user.loyaltyPoints : 0,
    };
  }

  history(userId: string, take = 20, skip = 0) {
    return this.prisma.loyaltyTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });
  }

  /** Award points earned by a paid order. Fire-and-forget friendly. */
  awardForOrder(userId: string, totalAmount: number, orderId: string) {
    const points = LoyaltyService.pointsForOrder(totalAmount);
    if (points <= 0) return Promise.resolve(null);
    return this.apply(userId, points, { type: LoyaltyTxnType.EARN, reason: 'Order reward', orderId });
  }

  async redeem(userId: string, points: number) {
    if (points <= 0) throw AppException.badRequest('LOYALTY.INVALID_POINTS', 'Points must be positive.');
    return this.apply(userId, -points, { type: LoyaltyTxnType.REDEEM, reason: 'Redeemed at checkout' });
  }

  async adjust(userId: string, delta: number, reason: string | undefined, actorId: string) {
    if (delta === 0) throw AppException.badRequest('LOYALTY.INVALID_POINTS', 'Adjustment cannot be zero.');
    return this.apply(userId, delta, { type: LoyaltyTxnType.ADJUST, reason, createdBy: actorId });
  }

  /** Run the ledger mutation inside an existing Prisma transaction. */
  async applyInTx(
    tx: Prisma.TransactionClient,
    userId: string,
    delta: number,
    options: ApplyOptions,
  ) {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { loyaltyPoints: true },
    });
    if (!user) throw AppException.notFound('User');

    const balanceAfter = user.loyaltyPoints + delta;
    if (balanceAfter < 0) {
      throw AppException.badRequest('LOYALTY.INSUFFICIENT', 'Not enough loyalty points.');
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        loyaltyPoints: balanceAfter,
        loyaltyTier: LoyaltyService.tierFor(balanceAfter),
      },
    });

    return tx.loyaltyTransaction.create({
      data: {
        userId,
        points: delta,
        type: options.type,
        reason: options.reason ?? null,
        orderId: options.orderId ?? null,
        balanceAfter,
        createdBy: options.createdBy ?? null,
        correlationId: getCorrelationId(),
      },
    });
  }

  private apply(userId: string, delta: number, options: ApplyOptions) {
    return this.prisma.$transaction((tx) => this.applyInTx(tx, userId, delta, options));
  }
}
