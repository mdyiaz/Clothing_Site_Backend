import 'reflect-metadata';
import { PaymentMethod } from '@prisma/client';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let prisma: Record<string, any>;
  let service: AnalyticsService;

  beforeEach(() => {
    prisma = {
      order: { aggregate: jest.fn(), count: jest.fn(), findMany: jest.fn() },
      user: { count: jest.fn() },
      product: { findMany: jest.fn() },
      productVariant: { findMany: jest.fn(), count: jest.fn() },
      payment: { aggregate: jest.fn(), groupBy: jest.fn() },
      userCoupon: { count: jest.fn() },
    };
    service = new AnalyticsService(prisma as any);
  });

  it('computes headline KPIs with a safe average', async () => {
    prisma.order.aggregate.mockResolvedValue({ _sum: { totalAmount: 500000 } });
    prisma.order.count
      .mockResolvedValueOnce(10) // orders
      .mockResolvedValueOnce(2) // cancelled
      .mockResolvedValueOnce(3); // pending
    prisma.user.count.mockResolvedValue(40);

    const summary = await service.summary();
    expect(summary).toMatchObject({
      totalRevenue: 500000,
      totalOrders: 10,
      cancelledOrders: 2,
      pendingOrders: 3,
      customers: 40,
      averageOrderValue: 50000,
    });
  });

  it('returns zero average order value when there are no orders', async () => {
    prisma.order.aggregate.mockResolvedValue({ _sum: { totalAmount: null } });
    prisma.order.count.mockResolvedValue(0);
    prisma.user.count.mockResolvedValue(0);
    const summary = await service.summary();
    expect(summary.averageOrderValue).toBe(0);
  });

  it('buckets sales by day', async () => {
    prisma.order.findMany.mockResolvedValue([
      { totalAmount: 1000, createdAt: new Date('2026-10-01T10:00:00Z') },
      { totalAmount: 2000, createdAt: new Date('2026-10-01T15:00:00Z') },
      { totalAmount: 500, createdAt: new Date('2026-10-02T08:00:00Z') },
    ]);

    const points = await service.sales(undefined, undefined, 'day');
    expect(points).toEqual([
      { bucket: '2026-10-01', orders: 2, revenue: 3000 },
      { bucket: '2026-10-02', orders: 1, revenue: 500 },
    ]);
  });

  it('buckets sales by month', async () => {
    prisma.order.findMany.mockResolvedValue([
      { totalAmount: 1000, createdAt: new Date('2026-09-30T10:00:00Z') },
      { totalAmount: 2000, createdAt: new Date('2026-10-01T10:00:00Z') },
    ]);
    const points = await service.sales(undefined, undefined, 'month');
    expect(points.map((p) => p.bucket)).toEqual(['2026-09', '2026-10']);
  });

  it('summarises payment volume by method', async () => {
    prisma.payment.groupBy.mockResolvedValue([
      { method: PaymentMethod.COD, _count: { _all: 5 }, _sum: { amount: 2500 } },
      { method: PaymentMethod.BKASH, _count: { _all: 2 }, _sum: { amount: 900 } },
    ]);
    const rows = await service.paymentBreakdown();
    expect(rows).toEqual([
      { method: PaymentMethod.COD, count: 5, amount: 2500 },
      { method: PaymentMethod.BKASH, count: 2, amount: 900 },
    ]);
  });

  it('reports low-stock and out-of-stock variants', async () => {
    prisma.productVariant.findMany.mockResolvedValue([{ id: 'v1', sku: 'S1', stock: 2 }]);
    prisma.productVariant.count.mockResolvedValue(4);
    const result = await service.lowStock(5);
    expect(result).toEqual({ threshold: 5, outOfStock: 4, lowStock: [{ id: 'v1', sku: 'S1', stock: 2 }] });
  });

  it('computes the marketing discount rate', async () => {
    prisma.order.count.mockResolvedValue(8);
    prisma.userCoupon.count.mockResolvedValue(12);
    prisma.order.aggregate
      .mockResolvedValueOnce({ _sum: { discountAmount: 1000 } })
      .mockResolvedValueOnce({ _sum: { totalAmount: 9000 } });

    const marketing = await service.marketing();
    expect(marketing).toMatchObject({ ordersWithCoupon: 8, couponRedemptions: 12, totalDiscount: 1000, revenue: 9000 });
    expect(marketing.discountRate).toBeCloseTo(0.1, 5);
  });

  it('computes accounting totals', async () => {
    prisma.order.aggregate
      .mockResolvedValueOnce({ _sum: { totalAmount: 10000 } }) // collected revenue
      .mockResolvedValueOnce({ _sum: { discountAmount: 500 } })
      .mockResolvedValueOnce({ _sum: { vatAmount: 300 } });
    prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 4000 } });
    prisma.order.count.mockResolvedValue(1);

    const accounting = await service.accounting();
    expect(accounting).toMatchObject({
      collectedRevenue: 10000,
      codCollected: 4000,
      refundedOrders: 1,
      totalDiscounts: 500,
      totalVat: 300,
      netRevenue: 9500,
    });
  });
});
