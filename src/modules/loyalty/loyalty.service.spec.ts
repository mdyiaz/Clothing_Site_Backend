import 'reflect-metadata';
import { LoyaltyTier, LoyaltyTxnType } from '@prisma/client';
import { LoyaltyService } from './loyalty.service';

describe('LoyaltyService', () => {
  let prisma: Record<string, any>;
  let service: LoyaltyService;
  let tx: Record<string, any>;

  async function expectRejection(promise: Promise<unknown>): Promise<any> {
    return promise.then(
      () => {
        throw new Error('expected promise to reject');
      },
      (error) => error,
    );
  }

  beforeEach(() => {
    tx = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      loyaltyTransaction: { create: jest.fn().mockImplementation((args) => Promise.resolve({ id: 't1', ...args.data })) },
    };
    prisma = {
      user: { findUnique: jest.fn() },
      loyaltyTransaction: { findMany: jest.fn() },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    service = new LoyaltyService(prisma as any);
  });

  it('maps points to tiers by threshold', () => {
    expect(LoyaltyService.tierFor(0)).toBe(LoyaltyTier.BRONZE);
    expect(LoyaltyService.tierFor(499)).toBe(LoyaltyTier.BRONZE);
    expect(LoyaltyService.tierFor(500)).toBe(LoyaltyTier.SILVER);
    expect(LoyaltyService.tierFor(2000)).toBe(LoyaltyTier.GOLD);
    expect(LoyaltyService.tierFor(5000)).toBe(LoyaltyTier.PLATINUM);
  });

  it('earns 1 point per ৳100', () => {
    expect(LoyaltyService.pointsForOrder(186000)).toBe(1860);
    expect(LoyaltyService.pointsForOrder(99)).toBe(0);
  });

  it('reports the next tier with points remaining', async () => {
    prisma.user.findUnique.mockResolvedValue({ loyaltyPoints: 1200, loyaltyTier: LoyaltyTier.SILVER });
    const summary = await service.getSummary('u1');
    expect(summary).toMatchObject({ points: 1200, tier: LoyaltyTier.SILVER, nextTier: LoyaltyTier.GOLD, pointsToNext: 800 });
  });

  it('rejects redeeming more points than the balance', async () => {
    tx.user.findUnique.mockResolvedValue({ loyaltyPoints: 50 });
    const error = await expectRejection(service.redeem('u1', 100));
    expect(error.code).toBe('LOYALTY.INSUFFICIENT');
  });

  it('updates the balance, tier and writes a ledger row', async () => {
    tx.user.findUnique.mockResolvedValue({ loyaltyPoints: 400 });
    const txn = await service.applyInTx(tx as any, 'u1', 200, { type: LoyaltyTxnType.EARN, reason: 'test' });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { loyaltyPoints: 600, loyaltyTier: LoyaltyTier.SILVER },
    });
    expect(txn).toMatchObject({ userId: 'u1', points: 200, balanceAfter: 600 });
  });

  it('awards nothing for an order below the earn threshold', async () => {
    expect(await service.awardForOrder('u1', 50, 'o1')).toBeNull();
  });
});
