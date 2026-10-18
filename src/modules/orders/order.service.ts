import { Injectable } from '@nestjs/common';
import { Order, OrderStatus, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { BaseService } from '../../common/base/base.service';
import { PaginatedResult, buildMeta } from '../../common/base/paginated-result';
import { AppException } from '../../common/exceptions/app.exception';
import { getCorrelationId } from '../../common/correlation/correlation-storage';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedActor } from '../../types/express';
import { CartService } from '../cart/cart.service';
import { DiscountService } from '../discounts/discount.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { VoucherService } from '../loyalty/voucher.service';
import { NotificationService } from '../notifications/notification.service';
import { CheckoutDto, QueryOrderDto } from './dto/order.dto';
import { OrderRepository } from './order.repository';

/** Allowed forward moves. Anything else is rejected with ORDER.BAD_TRANSITION. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  PROCESSING: [OrderStatus.PACKED, OrderStatus.CANCELLED],
  PACKED: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  SHIPPED: [OrderStatus.OUT_FOR_DELIVERY],
  OUT_FOR_DELIVERY: [OrderStatus.DELIVERED],
  DELIVERED: [OrderStatus.RETURN_REQUESTED],
  RETURN_REQUESTED: [OrderStatus.RETURNED, OrderStatus.REFUNDED],
  RETURNED: [OrderStatus.REFUNDED],
  CANCELLED: [],
  REFUNDED: [],
};

/** Cancelling from these states returns stock to the shelves. */
const RESTOCK_ON_CANCEL_FROM: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.PACKED,
];

const ORDER_DETAIL_INCLUDE = {
  items: true,
  payments: true,
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.OrderInclude;

/**
 * Checkout snapshots cart lines into an immutable order (prices, names, SKUs),
 * decrements stock, opens a payment row, clears the cart — all in one
 * transaction. Money math must satisfy the reconciliation check:
 * total = items − discount + shipping + VAT.
 */
@Injectable()
export class OrderService extends BaseService<Order> {
  protected readonly resourceName = 'Order';
  protected readonly sortableFields = ['createdAt', 'totalAmount', 'status'];
  protected readonly searchFields = ['orderNumber', 'guestPhone', 'guestEmail', 'guestName', 'trackingNumber'];
  protected override readonly defaultSort: Prisma.OrderOrderByWithRelationInput = {
    createdAt: 'desc',
  };

  constructor(
    repository: OrderRepository,
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly discounts: DiscountService,
    private readonly vouchers: VoucherService,
    private readonly loyalty: LoyaltyService,
    private readonly notifications: NotificationService,
  ) {
    super(repository);
  }

  protected override async buildWhere(query: QueryOrderDto): Promise<Prisma.OrderWhereInput> {
    const where = (await super.buildWhere(query)) as Prisma.OrderWhereInput;
    if (query.status) {
      if (!Object.values(OrderStatus).includes(query.status as OrderStatus)) {
        throw AppException.badRequest('ORDER.UNKNOWN_STATUS', `Unknown order status "${query.status}".`);
      }
      where.status = query.status as OrderStatus;
    }
    if (query.paymentStatus) {
      if (!Object.values(PaymentStatus).includes(query.paymentStatus as PaymentStatus)) {
        throw AppException.badRequest('ORDER.UNKNOWN_PAYMENT_STATUS', `Unknown payment status "${query.paymentStatus}".`);
      }
      where.paymentStatus = query.paymentStatus as PaymentStatus;
    }
    return where;
  }

  // -------------------------------------------------------------------------
  // Checkout
  // -------------------------------------------------------------------------

  async checkout(actor: AuthenticatedActor | undefined, dto: CheckoutDto) {
    const identity = this.cart.resolveIdentity(actor, dto.sessionId);
    const userId = identity.userId;

    if (!userId && !dto.guestPhone?.trim()) {
      throw AppException.badRequest('ORDER.GUEST_PHONE_REQUIRED', 'Enter a phone number to check out as a guest.', {
        field: 'guestPhone',
        action: 'focus',
      });
    }

    if (dto.idempotencyKey) {
      const replay = await this.prisma.order.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: ORDER_DETAIL_INCLUDE,
      });
      if (replay) return replay;
    }

    const cart = await this.cart.getCart(identity);
    if (cart.items.length === 0) {
      throw AppException.badRequest('ORDER.CART_EMPTY', 'Your cart is empty.', { action: 'redirect' });
    }

    const lines = await this.reserveLines(cart.items);
    const shippingCost = await this.resolveShipping(dto);

    const subtotal = lines.reduce((sum, line) => sum + line.total, 0);

    // Phase 4 discount engine — resolves a coupon code against the priced cart.
    const outcome = dto.couponCode
      ? await this.discounts.validate(dto.couponCode, {
          userId,
          lines: lines.map((line) => ({
            productId: line.productId,
            price: line.price,
            quantity: line.quantity,
            total: line.total,
          })),
          subtotal,
          shippingAmount: shippingCost,
        })
      : null;

    const productDiscount = outcome?.productDiscount ?? 0;
    const shippingAmount = Math.max(shippingCost - (outcome?.shippingDiscount ?? 0), 0);
    const vatAmount = 0; // VAT stays off until NBR registration (settings-driven, Phase 4 optional)
    const couponDiscount = outcome ? outcome.productDiscount + outcome.shippingDiscount : null;

    // Gift voucher applies to what is left after coupon + shipping.
    const beforeVoucher = subtotal - productDiscount + shippingAmount + vatAmount;
    const voucherPreview = dto.voucherCode
      ? await this.vouchers.preview(dto.voucherCode, beforeVoucher)
      : null;
    const voucherAmount = voucherPreview?.applicable ?? 0;

    // The voucher folds into discountAmount so reconciliation (items − discount + shipping + VAT) holds.
    const discountAmount = productDiscount + voucherAmount;
    const totalAmount = subtotal - discountAmount + shippingAmount + vatAmount;

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber: await this.nextOrderNumber(tx),
          userId: userId ?? null,
          guestEmail: dto.guestEmail ?? null,
          guestPhone: dto.guestPhone?.trim() ?? null,
          guestName: dto.guestName?.trim() ?? null,
          shippingAddress: dto.shippingAddress as Prisma.InputJsonValue,
          billingAddress: dto.billingAddress ? (dto.billingAddress as Prisma.InputJsonValue) : Prisma.JsonNull,
          shippingMethod: dto.shippingMethod ?? null,
          shippingZone: dto.shippingZone,
          shippingCost,
          subtotal,
          vatAmount,
          discountAmount,
          shippingAmount,
          totalAmount,
          couponCode: outcome?.couponCode ?? null,
          couponDiscount,
          voucherCode: voucherPreview?.code ?? null,
          voucherAmount,
          status: OrderStatus.PENDING,
          paymentStatus: PaymentStatus.UNPAID,
          paymentMethod: dto.paymentMethod,
          customerNote: dto.customerNote ?? null,
          idempotencyKey: dto.idempotencyKey ?? null,
          items: {
            create: lines.map((line) => ({
              productId: line.productId,
              variantId: line.variantId,
              productName: line.productName,
              variantInfo: line.variantInfo,
              sku: line.sku,
              price: line.price,
              quantity: line.quantity,
              total: line.total,
            })),
          },
          payments: {
            create: {
              method: dto.paymentMethod,
              amount: totalAmount,
              status: dto.paymentMethod === PaymentMethod.COD ? PaymentStatus.UNPAID : PaymentStatus.PENDING,
            },
          },
          statusHistory: {
            create: {
              status: OrderStatus.PENDING,
              note: 'Order placed',
              createdBy: userId ?? 'guest',
              correlationId: getCorrelationId() ?? null,
            },
          },
        },
        include: ORDER_DETAIL_INCLUDE,
      });

      for (const line of lines) {
        if (line.variantId) {
          await tx.productVariant.update({
            where: { id: line.variantId },
            data: { stock: { decrement: line.quantity } },
          });
        }
        await tx.product.update({
          where: { id: line.productId },
          data: { totalStock: { decrement: line.quantity }, totalSold: { increment: line.quantity } },
        });
      }

      if (outcome) {
        await this.discounts.redeem(tx, outcome, userId);
      }
      if (voucherPreview) {
        await this.vouchers.redeemInTx(tx, voucherPreview.code, voucherAmount);
      }
      return created;
    });

    await this.cart.clear(identity);

    // Loyalty: registered customers earn points on the paid order value.
    if (userId) {
      void this.loyalty.awardForOrder(userId, order.totalAmount, order.id).catch(() => undefined);
    }

    // Fire-and-forget — a notification outage must never fail a checkout.
    void this.notifications.notifyOrderPlaced({
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
      email: order.guestEmail,
      phone: order.guestPhone,
      customerName: order.guestName,
    });

    return order;
  }

  // -------------------------------------------------------------------------
  // Customer reads
  // -------------------------------------------------------------------------

  async myOrders(userId: string, query: QueryOrderDto) {
    const where = (await this.buildWhere(query)) as Prisma.OrderWhereInput;
    const { rows, total } = await this.repository.findAndCount({
      where: { ...where, userId },
      orderBy: this.buildOrderBy(query),
      skip: query.skip,
      take: query.limit,
      include: { items: true },
    });
    return new PaginatedResult(rows, buildMeta(total, query.page, query.limit));
  }

  async myOrderDetail(userId: string, id: string) {
    const order = await this.repository.findOne({ id, userId }, ORDER_DETAIL_INCLUDE);
    if (!order) throw AppException.notFound(this.resourceName);
    return this.transform(order);
  }

  /** Public track-and-trace: order number + (for guests) the phone from checkout. */
  async track(orderNumber: string, phone: string | undefined, actor: AuthenticatedActor | undefined) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: ORDER_DETAIL_INCLUDE,
    });
    if (!order) throw AppException.notFound(this.resourceName);

    if (order.userId) {
      if (!actor || actor.userId !== order.userId) throw AppException.notFound(this.resourceName);
    } else if (!phone || phone.trim() !== order.guestPhone) {
      throw AppException.notFound(this.resourceName);
    }
    return order;
  }

  async cancelMine(userId: string, id: string) {
    const order = await this.repository.findOne({ id, userId });
    if (!order) throw AppException.notFound(this.resourceName);
    if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.CONFIRMED) {
      throw AppException.badRequest(
        'ORDER.CANCEL_TOO_LATE',
        'This order is already being prepared and cannot be cancelled online.',
      );
    }
    return this.transition(order.id, OrderStatus.CANCELLED, userId, 'Cancelled by customer');
  }

  // -------------------------------------------------------------------------
  // Admin
  // -------------------------------------------------------------------------

  async adminDetail(id: string) {
    const order = await this.repository.findOne({ id }, ORDER_DETAIL_INCLUDE);
    if (!order) throw AppException.notFound(this.resourceName);
    return this.transform(order);
  }

  async updateStatus(id: string, status: OrderStatus, actorId: string, note?: string) {
    if (!Object.values(OrderStatus).includes(status)) {
      throw AppException.badRequest('ORDER.UNKNOWN_STATUS', `Unknown order status "${status}".`);
    }
    const order = await this.repository.findById(id);
    if (!order) throw AppException.notFound(this.resourceName);
    return this.transition(id, status, actorId, note, order.status);
  }

  async updatePayment(id: string, paymentStatus: PaymentStatus | undefined, codCollected: boolean | undefined, actorId: string) {
    if (paymentStatus && !Object.values(PaymentStatus).includes(paymentStatus)) {
      throw AppException.badRequest('ORDER.UNKNOWN_PAYMENT_STATUS', `Unknown payment status "${paymentStatus}".`);
    }
    const order = await this.repository.findById(id);
    if (!order) throw AppException.notFound(this.resourceName);

    const payment = await this.prisma.payment.findFirst({
      where: { orderId: id },
      orderBy: { createdAt: 'desc' },
    });
    if (!payment) throw AppException.notFound('Payment');

    const data: Prisma.PaymentUpdateInput = {};
    if (codCollected) {
      data.codCollected = true;
      data.codCollectedAt = new Date();
      data.status = PaymentStatus.PAID;
    } else if (paymentStatus) {
      data.status = paymentStatus;
    }
    if (Object.keys(data).length === 0) {
      throw AppException.badRequest('ORDER.PAYMENT_NOOP', 'Nothing to update.', { action: 'toast' });
    }

    const updated = await this.prisma.payment.update({ where: { id: payment.id }, data });

    // Keep the reconciliation check quiet: order mirrors its latest payment.
    if (data.status === PaymentStatus.PAID && order.paymentStatus !== PaymentStatus.PAID) {
      await this.prisma.order.update({ where: { id }, data: { paymentStatus: PaymentStatus.PAID } });
    }
    await this.recordHistory(id, order.status, actorId, `Payment → ${updated.status}`);
    return updated;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** Revalidates every cart line against live stock and snapshots prices. */
  private async reserveLines(items: { productId: string; variantId: string | null; quantity: number }[]) {
    const lines: {
      productId: string;
      variantId: string | null;
      productName: string;
      variantInfo: string | null;
      sku: string;
      price: number;
      quantity: number;
      total: number;
    }[] = [];

    for (const item of items) {
      const product = await this.prisma.product.findFirst({
        where: { id: item.productId, deletedAt: null },
        select: { id: true, name: true, sku: true, isActive: true, basePrice: true, totalStock: true },
      });
      if (!product || !product.isActive) {
        throw AppException.badRequest('ORDER.ITEM_UNAVAILABLE', 'An item in your cart is no longer available.');
      }

      let variant: { id: string; sku: string; size: string | null; color: string | null; price: number | null; stock: number } | null = null;
      if (item.variantId) {
        variant = await this.prisma.productVariant.findFirst({
          where: { id: item.variantId, productId: product.id },
        });
        if (!variant) {
          throw AppException.badRequest('ORDER.ITEM_UNAVAILABLE', 'An item in your cart is no longer available.');
        }
      }

      const available = variant ? variant.stock : product.totalStock;
      if (item.quantity > available) {
        throw AppException.badRequest(
          'ORDER.INSUFFICIENT_STOCK',
          `Only ${Math.max(available, 0)} left of ${product.name}.`,
        );
      }

      const price = variant?.price ?? product.basePrice;
      lines.push({
        productId: product.id,
        variantId: variant?.id ?? null,
        productName: product.name,
        variantInfo: variant ? [variant.size, variant.color].filter(Boolean).join(' / ') || null : null,
        sku: variant?.sku ?? product.sku,
        price,
        quantity: item.quantity,
        total: price * item.quantity,
      });
    }
    return lines;
  }

  private async resolveShipping(dto: CheckoutDto): Promise<number> {
    if (!dto.shippingMethod) return 0;
    const rate = await this.prisma.shippingRate.findFirst({
      where: { name: dto.shippingMethod, zone: dto.shippingZone, isActive: true },
    });
    if (!rate) {
      throw AppException.badRequest('ORDER.SHIPPING_UNAVAILABLE', 'That delivery option is not available for your zone.', {
        field: 'shippingMethod',
      });
    }
    return rate.cost;
  }

  private async nextOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
      const orderNumber = `ORD-${day}-${suffix}`;
      const existing = await tx.order.findUnique({ where: { orderNumber } });
      if (!existing) return orderNumber;
    }
    throw AppException.internal('Could not generate an order number. Please try again.');
  }

  private async transition(
    id: string,
    to: OrderStatus,
    actorId: string,
    note?: string,
    from?: OrderStatus,
  ) {
    const current = from ?? (await this.repository.findById(id))?.status;
    if (!current) throw AppException.notFound(this.resourceName);
    if (current === to) {
      return this.repository.findById(id);
    }
    if (!TRANSITIONS[current].includes(to)) {
      throw AppException.badRequest(
        'ORDER.BAD_TRANSITION',
        `An order cannot move from ${current} to ${to}.`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.order.update({ where: { id }, data: { status: to } });

      if (to === OrderStatus.CANCELLED && RESTOCK_ON_CANCEL_FROM.includes(current)) {
        const items = await tx.orderItem.findMany({ where: { orderId: id } });
        for (const item of items) {
          if (item.variantId) {
            await tx.productVariant.update({
              where: { id: item.variantId },
              data: { stock: { increment: item.quantity } },
            });
          }
          await tx.product.update({
            where: { id: item.productId },
            data: { totalStock: { increment: item.quantity }, totalSold: { decrement: item.quantity } },
          });
        }
      }

      await tx.orderStatusHistory.create({
        data: { orderId: id, status: to, note: note ?? null, createdBy: actorId, correlationId: getCorrelationId() ?? null },
      });
      return row;
    });

    void this.notifications.notifyOrderStatus({
      orderNumber: updated.orderNumber,
      status: to,
      email: updated.guestEmail,
      phone: updated.guestPhone,
      trackingNumber: updated.trackingNumber,
    });

    return this.transform(updated);
  }

  private async recordHistory(id: string, status: OrderStatus, actorId: string, note: string) {
    await this.prisma.orderStatusHistory.create({
      data: { orderId: id, status, note, createdBy: actorId, correlationId: getCorrelationId() ?? null },
    });
  }
}
