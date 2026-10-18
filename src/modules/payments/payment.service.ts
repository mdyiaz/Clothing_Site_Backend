import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Order, Payment, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { getCorrelationId } from '../../common/correlation/correlation-storage';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedActor } from '../../types/express';
import { BkashGateway } from './bkash.gateway';
import { PaymentGateway } from './gateway.interface';
import { SslcommerzGateway } from './sslcommerz.gateway';

export interface InitiateResult {
  orderNumber: string;
  method: PaymentMethod;
  redirectUrl: string;
}

export interface SettleResult {
  orderNumber: string;
  status: PaymentStatus;
  alreadyProcessed: boolean;
}

/**
 * Orchestrates redirect-based (bKash / SSLCommerz) payments. The gateway is
 * never trusted from the browser callback alone: the final state is confirmed
 * server-to-server, and settlement is idempotent so duplicate IPNs are safe.
 */
@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly bkash: BkashGateway,
    private readonly sslcommerz: SslcommerzGateway,
  ) {}

  private gatewayFor(method: PaymentMethod | null): PaymentGateway | null {
    if (method === PaymentMethod.BKASH) return this.bkash;
    if (method === PaymentMethod.SSLCOMMERZ) return this.sslcommerz;
    return null;
  }

  async initiate(
    orderNumber: string,
    phone: string | undefined,
    actor: AuthenticatedActor | undefined,
  ): Promise<InitiateResult> {
    const order = await this.prisma.order.findUnique({ where: { orderNumber } });
    if (!order) throw AppException.notFound('Order');
    this.assertAccess(order, phone, actor);

    if (order.paymentStatus === PaymentStatus.PAID) {
      throw AppException.badRequest('PAYMENT.ALREADY_PAID', 'This order is already paid.');
    }

    const gateway = this.gatewayFor(order.paymentMethod);
    if (!gateway) {
      throw AppException.badRequest(
        'PAYMENT.METHOD_UNSUPPORTED',
        'The selected payment method does not use an online gateway.',
      );
    }
    if (!gateway.isConfigured()) {
      throw AppException.badRequest(
        'PAYMENT.NOT_CONFIGURED',
        'This payment gateway is not configured yet.',
      );
    }

    const callbackBaseUrl = this.config.get<{ callbackBaseUrl: string }>('payments')!.callbackBaseUrl;
    const session = await gateway.createSession({
      orderNumber: order.orderNumber,
      amount: order.totalAmount,
      callbackUrl: callbackBaseUrl,
    });

    await this.upsertPendingPayment(order, gateway.method, session.gatewayRef);

    return { orderNumber: order.orderNumber, method: gateway.method, redirectUrl: session.redirectUrl };
  }

  async handleBkashCallback(payload: Record<string, unknown>): Promise<SettleResult> {
    const paymentID = payload.paymentID as string | undefined;
    const payment = paymentID
      ? await this.prisma.payment.findFirst({
          where: { gatewayTxnId: paymentID },
          include: { order: true },
        })
      : null;
    if (!payment) throw AppException.notFound('Payment');
    return this.settle(this.bkash, payment, payment.order, payload);
  }

  async handleSslcommerzCallback(payload: Record<string, unknown>): Promise<SettleResult> {
    const orderNumber = payload.tran_id as string | undefined;
    const order = orderNumber
      ? await this.prisma.order.findUnique({ where: { orderNumber } })
      : null;
    if (!order) throw AppException.notFound('Order');

    const payment = await this.prisma.payment.findFirst({
      where: { orderId: order.id, method: PaymentMethod.SSLCOMMERZ },
      orderBy: { createdAt: 'desc' },
    });
    if (!payment) throw AppException.notFound('Payment');

    return this.settle(this.sslcommerz, payment, order, payload);
  }

  async status(orderNumber: string, phone: string | undefined, actor: AuthenticatedActor | undefined) {
    const order = await this.prisma.order.findUnique({ where: { orderNumber } });
    if (!order) throw AppException.notFound('Order');
    this.assertAccess(order, phone, actor);

    const payment = await this.prisma.payment.findFirst({
      where: { orderId: order.id },
      orderBy: { createdAt: 'desc' },
    });
    return {
      orderNumber: order.orderNumber,
      orderStatus: order.status,
      paymentStatus: order.paymentStatus,
      method: order.paymentMethod,
      amountDue: order.paymentStatus === PaymentStatus.PAID ? 0 : order.totalAmount,
      gatewayTxnId: payment?.gatewayTxnId ?? null,
    };
  }

  // -------------------------------------------------------------------------

  private async settle(
    gateway: PaymentGateway,
    payment: Payment,
    order: Order,
    payload: Record<string, unknown>,
  ): Promise<SettleResult> {
    if (order.paymentStatus === PaymentStatus.PAID) {
      return { orderNumber: order.orderNumber, status: PaymentStatus.PAID, alreadyProcessed: true };
    }

    const result = await gateway.verifyCallback(payload);

    if (!result.success) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED, gatewayResponse: result.raw as Prisma.InputJsonValue },
      });
      await this.prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: PaymentStatus.FAILED },
      });
      return { orderNumber: order.orderNumber, status: PaymentStatus.FAILED, alreadyProcessed: false };
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.PAID,
        gatewayTxnId: result.gatewayTxnId ?? payment.gatewayTxnId,
        gatewayResponse: result.raw as Prisma.InputJsonValue,
      },
    });
    await this.prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: PaymentStatus.PAID },
    });
    await this.prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        status: order.status,
        note: `Payment → PAID via ${gateway.method}`,
        correlationId: getCorrelationId(),
      },
    });

    return { orderNumber: order.orderNumber, status: PaymentStatus.PAID, alreadyProcessed: false };
  }

  private async upsertPendingPayment(
    order: Order,
    method: PaymentMethod,
    gatewayRef: string,
  ): Promise<void> {
    const existing = await this.prisma.payment.findFirst({
      where: { orderId: order.id, method, status: PaymentStatus.PENDING },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      await this.prisma.payment.update({
        where: { id: existing.id },
        data: { gatewayName: method, gatewayTxnId: gatewayRef },
      });
      return;
    }

    await this.prisma.payment.create({
      data: {
        orderId: order.id,
        method,
        amount: order.totalAmount,
        status: PaymentStatus.PENDING,
        gatewayName: method,
        gatewayTxnId: gatewayRef,
        correlationId: getCorrelationId(),
      },
    });
  }

  private assertAccess(
    order: Order,
    phone: string | undefined,
    actor: AuthenticatedActor | undefined,
  ): void {
    if (order.userId) {
      if (actor?.userId !== order.userId) throw AppException.notFound('Order');
      return;
    }
    if (!phone || phone.trim() !== order.guestPhone) {
      throw AppException.forbidden('Verify the phone number used at checkout.');
    }
  }
}
