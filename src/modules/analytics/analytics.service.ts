import { Injectable } from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;

interface Range {
  from: Date;
  to: Date;
}

export interface SalesPoint {
  bucket: string;
  orders: number;
  revenue: number;
}

/**
 * Read-only aggregation over orders/payments/products/customers. Powers the
 * super-admin, marketing and accounting dashboards. All money is integer ৳
 * (the project's stored convention).
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveRange(from?: string, to?: string): Range {
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 30 * DAY_MS);
    return { from: start, to: end };
  }

  /** Headline KPIs for every dashboard. */
  async summary() {
    const [revenue, orders, cancelled, pending, customers] = await Promise.all([
      this.prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { status: { not: OrderStatus.CANCELLED } },
      }),
      this.prisma.order.count({ where: { status: { not: OrderStatus.CANCELLED } } }),
      this.prisma.order.count({ where: { status: OrderStatus.CANCELLED } }),
      this.prisma.order.count({ where: { status: OrderStatus.PENDING } }),
      this.prisma.user.count({ where: { isGuest: false, deletedAt: null } }),
    ]);

    const totalRevenue = revenue._sum.totalAmount ?? 0;
    return {
      totalRevenue,
      totalOrders: orders,
      cancelledOrders: cancelled,
      pendingOrders: pending,
      customers,
      averageOrderValue: orders > 0 ? Math.round(totalRevenue / orders) : 0,
    };
  }

  /** Revenue/orders time series bucketed by day or month. */
  async sales(from?: string, to?: string, groupBy: 'day' | 'month' = 'day'): Promise<SalesPoint[]> {
    const range = this.resolveRange(from, to);
    const orders = await this.prisma.order.findMany({
      where: {
        status: { not: OrderStatus.CANCELLED },
        createdAt: { gte: range.from, lte: range.to },
      },
      select: { totalAmount: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const buckets = new Map<string, SalesPoint>();
    for (const order of orders) {
      const key = this.bucketKey(order.createdAt, groupBy);
      const point = buckets.get(key) ?? { bucket: key, orders: 0, revenue: 0 };
      point.orders += 1;
      point.revenue += order.totalAmount;
      buckets.set(key, point);
    }
    return [...buckets.values()];
  }

  topProducts(limit = 10) {
    return this.prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: { totalSold: 'desc' },
      take: limit,
      select: { id: true, name: true, slug: true, totalSold: true, basePrice: true },
    });
  }

  async paymentBreakdown(from?: string, to?: string) {
    const range = this.resolveRange(from, to);
    const rows = await this.prisma.payment.groupBy({
      by: ['method'],
      _count: { _all: true },
      _sum: { amount: true },
      where: { createdAt: { gte: range.from, lte: range.to } },
    });
    return rows.map((row) => ({
      method: row.method,
      count: row._count._all,
      amount: row._sum.amount ?? 0,
    }));
  }

  async lowStock(threshold = 5) {
    const [variants, outOfStock] = await Promise.all([
      this.prisma.productVariant.findMany({
        where: { stock: { gt: 0, lte: threshold } },
        orderBy: { stock: 'asc' },
        select: { id: true, sku: true, stock: true, product: { select: { id: true, name: true } } },
      }),
      this.prisma.productVariant.count({ where: { stock: { lte: 0 } } }),
    ]);
    return { threshold, outOfStock, lowStock: variants };
  }

  async customerStats() {
    const since = new Date(Date.now() - 30 * DAY_MS);
    const [total, guests, newLast30] = await Promise.all([
      this.prisma.user.count({ where: { isGuest: false, deletedAt: null } }),
      this.prisma.user.count({ where: { isGuest: true } }),
      this.prisma.user.count({ where: { isGuest: false, deletedAt: null, createdAt: { gte: since } } }),
    ]);
    return { total, guests, newLast30 };
  }

  /** Marketing dashboard: coupon/discount uptake + conversion. */
  async marketing() {
    const [ordersWithCoupon, couponRedeemed, discountAgg, revenueAgg] = await Promise.all([
      this.prisma.order.count({ where: { couponCode: { not: null } } }),
      this.prisma.userCoupon.count({ where: { usedCount: { gt: 0 } } }),
      this.prisma.order.aggregate({ _sum: { discountAmount: true }, where: { status: { not: OrderStatus.CANCELLED } } }),
      this.prisma.order.aggregate({ _sum: { totalAmount: true }, where: { status: { not: OrderStatus.CANCELLED } } }),
    ]);
    const totalDiscount = discountAgg._sum.discountAmount ?? 0;
    const revenue = revenueAgg._sum.totalAmount ?? 0;
    return {
      ordersWithCoupon,
      couponRedemptions: couponRedeemed,
      totalDiscount,
      revenue,
      discountRate: revenue + totalDiscount > 0 ? totalDiscount / (revenue + totalDiscount) : 0,
    };
  }

  /** Accounting dashboard: COD, refunds, VAT, discounts. */
  async accounting() {
    const [revenueAgg, codAgg, refundCount, discountAgg, vatAgg] = await Promise.all([
      this.prisma.order.aggregate({ _sum: { totalAmount: true }, where: { paymentStatus: PaymentStatus.PAID } }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { method: 'COD', status: PaymentStatus.PAID },
      }),
      this.prisma.order.count({ where: { paymentStatus: PaymentStatus.REFUNDED } }),
      this.prisma.order.aggregate({ _sum: { discountAmount: true } }),
      this.prisma.order.aggregate({ _sum: { vatAmount: true } }),
    ]);

    const paidRevenue = revenueAgg._sum.totalAmount ?? 0;
    const discounts = discountAgg._sum.discountAmount ?? 0;
    const vat = vatAgg._sum.vatAmount ?? 0;
    return {
      collectedRevenue: paidRevenue,
      codCollected: codAgg._sum.amount ?? 0,
      refundedOrders: refundCount,
      totalDiscounts: discounts,
      totalVat: vat,
      netRevenue: paidRevenue - discounts,
    };
  }

  private bucketKey(date: Date, groupBy: 'day' | 'month'): string {
    const iso = date.toISOString();
    return groupBy === 'month' ? iso.slice(0, 7) : iso.slice(0, 10);
  }
}
