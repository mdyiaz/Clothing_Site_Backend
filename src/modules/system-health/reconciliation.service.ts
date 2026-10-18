import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MismatchSeverity, MismatchType, OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Amounts are poisha integers — a ৳1 variance is 100. */
const ORDER_TOTAL_TOLERANCE = 100;

export interface ReconciliationReport {
  checkedAt: Date;
  created: number;
  refreshed: number;
  checks: Record<string, number>;
}

interface MismatchInput {
  type: MismatchType;
  severity: MismatchSeverity;
  referenceType: string;
  referenceId: string;
  referenceCode?: string | null;
  expected: Prisma.InputJsonValue;
  actual: Prisma.InputJsonValue;
  variance?: Prisma.InputJsonValue;
  description: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Hourly data-integrity sweep. Flags money/stock inconsistencies as
 * `DataMismatch` rows for the admin panel and bumps `lastCheckedAt` on
 * repeat detections instead of creating duplicates.
 *
 * Checks that need tables which do not exist yet stay out — each check is
 * self-contained so new ones slot in without touching the runner.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runAllChecks(): Promise<ReconciliationReport> {
    this.logger.log('Starting reconciliation checks');
    const checks: Record<string, number> = {};
    let created = 0;
    let refreshed = 0;

    const tally = (out: { created: number; refreshed: number }, name: string): void => {
      created += out.created;
      refreshed += out.refreshed;
      checks[name] = out.created + out.refreshed;
    };

    tally(await this.checkOrderTotalMismatch(), 'order_total');
    tally(await this.checkPaymentOrderMismatch(), 'payment_order');
    tally(await this.checkNegativeStock(), 'negative_stock');
    tally(await this.checkOverDiscount(), 'over_discount');
    tally(await this.checkGhostOrders(), 'ghost_orders');
    tally(await this.checkDuplicateOrders(), 'duplicate_orders');
    tally(await this.checkPriceMismatch(), 'price_mismatch');
    tally(await this.checkCodNotCollected(), 'cod_not_collected');

    this.logger.log(`Reconciliation complete: ${created} new, ${refreshed} refreshed`);
    return { checkedAt: new Date(), created, refreshed, checks };
  }

  // -------------------------------------------------------------------------
  // 1. Order total ≠ items − discount + shipping + VAT
  // -------------------------------------------------------------------------

  private async checkOrderTotalMismatch(): Promise<{ created: number; refreshed: number }> {
    const orders = await this.prisma.order.findMany({
      where: { status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] } },
      include: { items: { select: { total: true } } },
      take: 500,
    });

    let created = 0;
    let refreshed = 0;
    for (const order of orders) {
      const itemsTotal = order.items.reduce((sum, item) => sum + item.total, 0);
      const expected = itemsTotal - order.discountAmount + order.shippingAmount + order.vatAmount;

      if (Math.abs(expected - order.totalAmount) <= ORDER_TOTAL_TOLERANCE) continue;

      const out = await this.logMismatch({
        type: MismatchType.ORDER_TOTAL_MISMATCH,
        severity: MismatchSeverity.HIGH,
        referenceType: 'order',
        referenceId: order.id,
        referenceCode: order.orderNumber,
        expected: {
          total: expected,
          itemsTotal,
          discountAmount: order.discountAmount,
          shippingAmount: order.shippingAmount,
          vatAmount: order.vatAmount,
        },
        actual: { total: order.totalAmount },
        variance: { amount: order.totalAmount - expected },
        description: `Order ${order.orderNumber}: total ৳${(order.totalAmount / 100).toFixed(0)} but items math says ৳${(expected / 100).toFixed(0)}`,
      });
      created += out.created ? 1 : 0;
      refreshed += out.created ? 0 : 1;
    }
    return { created, refreshed };
  }

  // -------------------------------------------------------------------------
  // 2. Payment PAID but order not confirmed
  // -------------------------------------------------------------------------

  private async checkPaymentOrderMismatch(): Promise<{ created: number; refreshed: number }> {
    const payments = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.PAID,
        order: { paymentStatus: { not: PaymentStatus.PAID } },
      },
      include: { order: { select: { orderNumber: true, paymentStatus: true } } },
    });

    let created = 0;
    let refreshed = 0;
    for (const payment of payments) {
      const out = await this.logMismatch({
        type: MismatchType.PAYMENT_ORDER_MISMATCH,
        severity: MismatchSeverity.CRITICAL,
        referenceType: 'payment',
        referenceId: payment.id,
        referenceCode: payment.order.orderNumber,
        expected: { orderPaymentStatus: PaymentStatus.PAID },
        actual: { orderPaymentStatus: payment.order.paymentStatus },
        description: `Payment for ${payment.order.orderNumber} is PAID but the order says ${payment.order.paymentStatus}`,
      });
      created += out.created ? 1 : 0;
      refreshed += out.created ? 0 : 1;
    }
    return { created, refreshed };
  }

  // -------------------------------------------------------------------------
  // 3. Negative variant stock
  // -------------------------------------------------------------------------

  private async checkNegativeStock(): Promise<{ created: number; refreshed: number }> {
    const variants = await this.prisma.productVariant.findMany({
      where: { stock: { lt: 0 } },
      include: { product: { select: { name: true } } },
    });

    let created = 0;
    let refreshed = 0;
    for (const variant of variants) {
      const out = await this.logMismatch({
        type: MismatchType.NEGATIVE_STOCK,
        severity: MismatchSeverity.CRITICAL,
        referenceType: 'product',
        referenceId: variant.productId,
        referenceCode: variant.sku,
        expected: { stock: '>= 0' },
        actual: { stock: variant.stock },
        description: `Negative stock: ${variant.product.name} (${variant.sku ?? variant.id}) has ${variant.stock} units`,
      });
      created += out.created ? 1 : 0;
      refreshed += out.created ? 0 : 1;
    }
    return { created, refreshed };
  }

  // -------------------------------------------------------------------------
  // 4. Discount bigger than the subtotal
  // -------------------------------------------------------------------------

  private async checkOverDiscount(): Promise<{ created: number; refreshed: number }> {
    const orders = await this.prisma.order.findMany({
      where: {
        status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] },
        discountAmount: { gt: 0 },
      },
      select: { id: true, orderNumber: true, subtotal: true, discountAmount: true },
      take: 500,
    });

    let created = 0;
    let refreshed = 0;
    for (const order of orders) {
      if (order.discountAmount <= order.subtotal) continue;
      const out = await this.logMismatch({
        type: MismatchType.OVER_DISCOUNT,
        severity: MismatchSeverity.HIGH,
        referenceType: 'order',
        referenceId: order.id,
        referenceCode: order.orderNumber,
        expected: { maxDiscount: order.subtotal },
        actual: { discountAmount: order.discountAmount },
        variance: { amount: order.discountAmount - order.subtotal },
        description: `Order ${order.orderNumber}: discount ৳${(order.discountAmount / 100).toFixed(0)} exceeds subtotal ৳${(order.subtotal / 100).toFixed(0)}`,
      });
      created += out.created ? 1 : 0;
      refreshed += out.created ? 0 : 1;
    }
    return { created, refreshed };
  }

  // -------------------------------------------------------------------------
  // 5. Ghost orders — PENDING + UNPAID + no payment rows for > 24h
  // -------------------------------------------------------------------------

  private async checkGhostOrders(): Promise<{ created: number; refreshed: number }> {
    const cutoff = new Date(Date.now() - DAY_MS);
    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { lt: cutoff },
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.UNPAID,
        payments: { none: {} },
      },
      select: { id: true, orderNumber: true, createdAt: true },
    });

    let created = 0;
    let refreshed = 0;
    for (const order of orders) {
      const out = await this.logMismatch({
        type: MismatchType.GHOST_ORDER,
        severity: MismatchSeverity.MEDIUM,
        referenceType: 'order',
        referenceId: order.id,
        referenceCode: order.orderNumber,
        expected: { hasPayment: true },
        actual: { hasPayment: false },
        description: `Order ${order.orderNumber} is PENDING with no payment record since ${order.createdAt.toISOString()}`,
      });
      created += out.created ? 1 : 0;
      refreshed += out.created ? 0 : 1;
    }
    return { created, refreshed };
  }

  // -------------------------------------------------------------------------
  // 6. Duplicate orders — same identity key within the same minute
  // -------------------------------------------------------------------------

  private async checkDuplicateOrders(): Promise<{ created: number; refreshed: number }> {
    const since = new Date(Date.now() - DAY_MS);
    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: since },
        status: { notIn: [OrderStatus.CANCELLED] },
      },
      select: { id: true, orderNumber: true, userId: true, guestPhone: true, guestEmail: true, createdAt: true },
      take: 1000,
    });

    const buckets = new Map<string, typeof orders>();
    for (const order of orders) {
      const identity = order.userId ?? order.guestPhone ?? order.guestEmail ?? 'anonymous';
      const minute = Math.floor(order.createdAt.getTime() / 60_000);
      const key = `${identity}|${minute}`;
      const bucket = buckets.get(key) ?? [];
      bucket.push(order);
      buckets.set(key, bucket);
    }

    let created = 0;
    let refreshed = 0;
    for (const bucket of buckets.values()) {
      if (bucket.length < 2) continue;
      for (const order of bucket) {
        const out = await this.logMismatch({
          type: MismatchType.DUPLICATE_ORDER,
          severity: MismatchSeverity.MEDIUM,
          referenceType: 'order',
          referenceId: order.id,
          referenceCode: order.orderNumber,
          expected: { ordersInWindow: 1 },
          actual: { ordersInWindow: bucket.length },
          variance: { extra: bucket.length - 1 },
          metadata: { siblings: bucket.map((sibling) => sibling.orderNumber) },
          description: `Possible duplicate: ${order.orderNumber} shares an identity + minute with ${bucket.length - 1} other order(s)`,
        });
        created += out.created ? 1 : 0;
        refreshed += out.created ? 0 : 1;
      }
    }
    return { created, refreshed };
  }

  // -------------------------------------------------------------------------
  // 7. Price drift — order item price vs current product price (> 50%)
  // -------------------------------------------------------------------------

  private async checkPriceMismatch(): Promise<{ created: number; refreshed: number }> {
    const since = new Date(Date.now() - 7 * DAY_MS);
    const items = await this.prisma.orderItem.findMany({
      where: { order: { createdAt: { gte: since } } },
      include: {
        product: { select: { basePrice: true, name: true } },
        order: { select: { orderNumber: true } },
      },
      take: 500,
    });

    let created = 0;
    let refreshed = 0;
    for (const item of items) {
      if (item.price === 0) continue;
      const drift = Math.abs(item.price - item.product.basePrice);
      if (drift <= item.price * 0.5) continue;

      const out = await this.logMismatch({
        type: MismatchType.PRICE_MISMATCH,
        severity: MismatchSeverity.LOW,
        referenceType: 'order',
        referenceId: item.orderId,
        referenceCode: item.order.orderNumber,
        expected: { currentPrice: item.product.basePrice },
        actual: { orderPrice: item.price },
        variance: { amount: item.product.basePrice - item.price },
        metadata: { productName: item.productName },
        description: `Price drift on ${item.productName} (${item.order.orderNumber}): ordered at ৳${(item.price / 100).toFixed(0)}, now ৳${(item.product.basePrice / 100).toFixed(0)}`,
      });
      created += out.created ? 1 : 0;
      refreshed += out.created ? 0 : 1;
    }
    return { created, refreshed };
  }

  // -------------------------------------------------------------------------
  // 8. COD delivered but never collected (> 7 days)
  // -------------------------------------------------------------------------

  private async checkCodNotCollected(): Promise<{ created: number; refreshed: number }> {
    const cutoff = new Date(Date.now() - 7 * DAY_MS);
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.DELIVERED,
        paymentMethod: 'COD',
        paymentStatus: { not: PaymentStatus.PAID },
        updatedAt: { lt: cutoff },
      },
      select: { id: true, orderNumber: true, paymentStatus: true, totalAmount: true },
    });

    let created = 0;
    let refreshed = 0;
    for (const order of orders) {
      const out = await this.logMismatch({
        type: MismatchType.COD_NOT_COLLECTED,
        severity: MismatchSeverity.HIGH,
        referenceType: 'order',
        referenceId: order.id,
        referenceCode: order.orderNumber,
        expected: { paymentStatus: PaymentStatus.PAID },
        actual: { paymentStatus: order.paymentStatus },
        variance: { amount: order.totalAmount },
        description: `Order ${order.orderNumber} delivered 7+ days ago but COD ৳${(order.totalAmount / 100).toFixed(0)} is still ${order.paymentStatus}`,
      });
      created += out.created ? 1 : 0;
      refreshed += out.created ? 0 : 1;
    }
    return { created, refreshed };
  }

  // -------------------------------------------------------------------------
  // Deduplication: same (type, referenceId) while unresolved → touch timestamp
  // -------------------------------------------------------------------------

  private async logMismatch(data: MismatchInput): Promise<{ created: boolean }> {
    const existing = await this.prisma.dataMismatch.findFirst({
      where: { type: data.type, referenceId: data.referenceId, isResolved: false },
    });

    if (existing) {
      await this.prisma.dataMismatch.update({
        where: { id: existing.id },
        data: {
          lastCheckedAt: new Date(),
          actual: data.actual,
          variance: data.variance ?? Prisma.JsonNull,
        },
      });
      return { created: false };
    }

    await this.prisma.dataMismatch.create({
      data: {
        ...data,
        referenceCode: data.referenceCode ?? null,
        variance: data.variance ?? Prisma.JsonNull,
        metadata: data.metadata ?? Prisma.JsonNull,
      },
    });
    this.logger.warn(`${data.type}: ${data.description}`);
    return { created: true };
  }
}
