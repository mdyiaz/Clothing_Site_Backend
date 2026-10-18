import { Logger } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';

type PrismaLike = Record<string, Record<string, jest.Mock>>;

function makePrisma(): PrismaLike {
  return {
    order: { findMany: jest.fn().mockResolvedValue([]) },
    payment: { findMany: jest.fn().mockResolvedValue([]) },
    productVariant: { findMany: jest.fn().mockResolvedValue([]) },
    orderItem: { findMany: jest.fn().mockResolvedValue([]) },
    dataMismatch: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 'new', ...args.data })),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

describe('ReconciliationService', () => {
  let prisma: PrismaLike;
  let service: ReconciliationService;
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ReconciliationService(prisma as any);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('reports a clean sweep with no rows written', async () => {
    const report = await service.runAllChecks();

    expect(report.created).toBe(0);
    expect(report.refreshed).toBe(0);
    expect(prisma.dataMismatch.create).not.toHaveBeenCalled();
    expect(Object.keys(report.checks)).toHaveLength(8);
  });

  it('flags an order whose total disagrees with its items', async () => {
    prisma.order.findMany.mockImplementation((args: any) => {
      // order-total check selects item totals; the other order checks use select
      if (args.include?.items) {
        return Promise.resolve([
          {
            id: 'o1',
            orderNumber: 'ORD-001',
            discountAmount: 0,
            shippingAmount: 6000,
            vatAmount: 0,
            totalAmount: 480000, // items say 500000 + 6000 shipping
            items: [{ total: 500000 }],
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const report = await service.runAllChecks();

    expect(prisma.dataMismatch.create).toHaveBeenCalledTimes(1);
    const data = prisma.dataMismatch.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      type: 'ORDER_TOTAL_MISMATCH',
      severity: 'HIGH',
      referenceType: 'order',
      referenceId: 'o1',
      referenceCode: 'ORD-001',
    });
    expect(data.variance).toEqual({ amount: -26000 });
    expect(report.checks.order_total).toBe(1);
  });

  it('tolerates rounding-level variance (≤ ৳1)', async () => {
    prisma.order.findMany.mockImplementation((args: any) => {
      if (args.include?.items) {
        return Promise.resolve([
          {
            id: 'o1',
            orderNumber: 'ORD-001',
            discountAmount: 0,
            shippingAmount: 0,
            vatAmount: 0,
            totalAmount: 500050, // 50 poisha off
            items: [{ total: 500000 }],
          },
        ]);
      }
      return Promise.resolve([]);
    });

    await service.runAllChecks();

    expect(prisma.dataMismatch.create).not.toHaveBeenCalled();
  });

  it('flags a PAID payment on an UNPAID order as CRITICAL', async () => {
    prisma.payment.findMany.mockResolvedValue([
      {
        id: 'pay1',
        order: { orderNumber: 'ORD-002', paymentStatus: 'UNPAID' },
      },
    ]);

    await service.runAllChecks();

    expect(prisma.dataMismatch.create.mock.calls[0][0].data).toMatchObject({
      type: 'PAYMENT_ORDER_MISMATCH',
      severity: 'CRITICAL',
      referenceType: 'payment',
      referenceId: 'pay1',
    });
  });

  it('flags negative stock as CRITICAL', async () => {
    prisma.productVariant.findMany.mockResolvedValue([
      { id: 'v1', productId: 'p1', sku: 'SKU-RED-34', stock: -3, product: { name: 'Red Saree' } },
    ]);

    await service.runAllChecks();

    expect(prisma.dataMismatch.create.mock.calls[0][0].data).toMatchObject({
      type: 'NEGATIVE_STOCK',
      severity: 'CRITICAL',
      referenceCode: 'SKU-RED-34',
    });
  });

  it('flags an over-discount that exceeds the subtotal', async () => {
    prisma.order.findMany.mockImplementation((args: any) => {
      if (args.select?.discountAmount) {
        return Promise.resolve([
          { id: 'o1', orderNumber: 'ORD-003', subtotal: 100000, discountAmount: 150000 },
        ]);
      }
      return Promise.resolve([]);
    });

    await service.runAllChecks();

    expect(prisma.dataMismatch.create.mock.calls[0][0].data).toMatchObject({
      type: 'OVER_DISCOUNT',
      severity: 'HIGH',
    });
  });

  it('flags ghost orders with no payment rows', async () => {
    prisma.order.findMany.mockImplementation((args: any) => {
      if (args.where?.payments) {
        return Promise.resolve([{ id: 'o9', orderNumber: 'ORD-009', createdAt: new Date() }]);
      }
      return Promise.resolve([]);
    });

    await service.runAllChecks();

    expect(prisma.dataMismatch.create.mock.calls[0][0].data).toMatchObject({
      type: 'GHOST_ORDER',
      severity: 'MEDIUM',
    });
  });

  it('flags two orders from the same identity in the same minute', async () => {
    const minute = new Date('2026-01-01T10:00:10.000Z');
    const sameMinute = new Date('2026-01-01T10:00:45.000Z');
    prisma.order.findMany.mockImplementation((args: any) => {
      // only the duplicate check queries createdAt >= (last 24h window)
      if (args.where?.createdAt?.gte) {
        return Promise.resolve([
          { id: 'a', orderNumber: 'ORD-A', userId: null, guestPhone: '01711', guestEmail: null, createdAt: minute },
          { id: 'b', orderNumber: 'ORD-B', userId: null, guestPhone: '01711', guestEmail: null, createdAt: sameMinute },
        ]);
      }
      return Promise.resolve([]);
    });

    await service.runAllChecks();

    const calls = prisma.dataMismatch.create.mock.calls.filter(
      (call: any) => call[0].data.type === 'DUPLICATE_ORDER',
    );
    expect(calls).toHaveLength(2);
    expect(calls[0][0].data.metadata.siblings).toEqual(['ORD-A', 'ORD-B']);
  });

  it('flags >50% price drift as LOW', async () => {
    prisma.orderItem.findMany.mockResolvedValue([
      {
        orderId: 'o1',
        productName: 'Silk Panjabi',
        price: 100000,
        product: { basePrice: 200000, name: 'Silk Panjabi' },
        order: { orderNumber: 'ORD-004' },
      },
    ]);

    await service.runAllChecks();

    expect(prisma.dataMismatch.create.mock.calls[0][0].data).toMatchObject({
      type: 'PRICE_MISMATCH',
      severity: 'LOW',
    });
  });

  it('flags delivered COD orders still unpaid after 7 days', async () => {
    prisma.order.findMany.mockImplementation((args: any) => {
      if (args.where?.paymentMethod === 'COD') {
        return Promise.resolve([
          {
            id: 'o5',
            orderNumber: 'ORD-005',
            paymentStatus: 'UNPAID',
            totalAmount: 250000,
          },
        ]);
      }
      return Promise.resolve([]);
    });

    await service.runAllChecks();

    expect(prisma.dataMismatch.create.mock.calls[0][0].data).toMatchObject({
      type: 'COD_NOT_COLLECTED',
      severity: 'HIGH',
    });
  });

  it('deduplicates: repeat detections refresh instead of duplicating', async () => {
    prisma.dataMismatch.findFirst.mockResolvedValue({ id: 'existing' });
    prisma.productVariant.findMany.mockResolvedValue([
      { id: 'v1', productId: 'p1', sku: 'SKU-X', stock: -1, product: { name: 'X' } },
    ]);

    const report = await service.runAllChecks();

    expect(prisma.dataMismatch.create).not.toHaveBeenCalled();
    expect(prisma.dataMismatch.update).toHaveBeenCalledWith({
      where: { id: 'existing' },
      data: expect.objectContaining({ lastCheckedAt: expect.any(Date) }),
    });
    expect(report.created).toBe(0);
    expect(report.refreshed).toBe(1);
  });
});
