import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Order, PaymentMethod, PaymentStatus } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { getCorrelationId } from '../../common/correlation/correlation-storage';
import { PrismaService } from '../../prisma/prisma.service';
import { ShipmentGateway, ShipmentRequest } from './gateway.interface';
import { PathaoGateway } from './pathao.gateway';
import { RedxGateway } from './redx.gateway';

const DEFAULT_ITEM_WEIGHT_GRAMS = 500;

/**
 * 3PL orchestration: creates parcels with the configured courier, stores the
 * returned tracking code on the order, and proxies tracking/cancellation.
 * One courier is active at a time (`THREEPL_DEFAULT_COURIER`).
 */
@Injectable()
export class ShippingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly pathao: PathaoGateway,
    private readonly redx: RedxGateway,
  ) {}

  private gatewayFor(courier: string): ShipmentGateway | null {
    if (courier === this.pathao.courier) return this.pathao;
    if (courier === this.redx.courier) return this.redx;
    return null;
  }

  private defaultGateway(): ShipmentGateway | null {
    const courier = this.config.get<{ defaultCourier: string }>('shipping3pl')!.defaultCourier;
    return this.gatewayFor(courier);
  }

  async createShipment(orderId: string, actorId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw AppException.notFound('Order');
    if (order.trackingNumber) {
      throw AppException.conflict('SHIPMENT.ALREADY_SHIPPED', 'This order already has a tracking number.');
    }

    const gateway = this.defaultGateway();
    if (!gateway) throw AppException.badRequest('SHIPMENT.UNKNOWN_COURIER', 'No courier is configured.');
    if (!gateway.isConfigured()) {
      throw AppException.badRequest('SHIPMENT.NOT_CONFIGURED', 'The courier is not configured yet.');
    }

    const result = await gateway.create(this.toRequest(order));
    await this.prisma.order.update({
      where: { id: order.id },
      data: { trackingNumber: result.trackingCode, courierName: result.courier },
    });
    await this.recordHistory(order, actorId, `Shipment created via ${result.courier} (${result.trackingCode})`);

    return { orderNumber: order.orderNumber, trackingNumber: result.trackingCode, courier: result.courier };
  }

  async track(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw AppException.notFound('Order');
    if (!order.trackingNumber || !order.courierName) {
      throw AppException.badRequest('SHIPMENT.NOT_SHIPPED', 'This order has not been shipped yet.');
    }
    const gateway = this.gatewayFor(order.courierName);
    if (!gateway || !gateway.isConfigured()) {
      throw AppException.badRequest('SHIPMENT.NOT_CONFIGURED', 'The courier is not configured yet.');
    }
    const tracking = await gateway.track(order.trackingNumber);
    return { orderNumber: order.orderNumber, trackingNumber: order.trackingNumber, courier: order.courierName, ...tracking };
  }

  async cancelShipment(orderId: string, actorId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw AppException.notFound('Order');
    if (!order.trackingNumber || !order.courierName) {
      throw AppException.badRequest('SHIPMENT.NOT_SHIPPED', 'This order has not been shipped yet.');
    }
    const gateway = this.gatewayFor(order.courierName);
    if (!gateway || !gateway.isConfigured()) {
      throw AppException.badRequest('SHIPMENT.NOT_CONFIGURED', 'The courier is not configured yet.');
    }
    await gateway.cancel(order.trackingNumber);
    await this.recordHistory(order, actorId, `Shipment cancelled via ${order.courierName}`);
    return { orderNumber: order.orderNumber, cancelled: true };
  }

  // -------------------------------------------------------------------------

  private toRequest(order: Order & { items: { quantity: number }[] }): ShipmentRequest {
    const address = (order.shippingAddress ?? {}) as Record<string, unknown>;
    const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

    const name = order.guestName ?? str(address.fullName) ?? 'Rangoli Customer';
    const phone = order.guestPhone ?? str(address.phone) ?? '';
    const city = str(address.district) ?? str(address.city) ?? 'Dhaka';
    const addressLine =
      [str(address.addressLine), str(address.area), str(address.upazila)].filter(Boolean).join(', ') ||
      str(address.address) ||
      'N/A';

    const codDue =
      order.paymentMethod === PaymentMethod.COD && order.paymentStatus !== PaymentStatus.PAID
        ? order.totalAmount
        : 0;

    return {
      orderNumber: order.orderNumber,
      recipientName: name,
      recipientPhone: phone,
      recipientAddress: addressLine,
      city,
      amountToCollect: codDue,
      itemQuantity: order.items.reduce((sum, item) => sum + item.quantity, 0) || 1,
      weightGrams: DEFAULT_ITEM_WEIGHT_GRAMS,
    };
  }

  private recordHistory(order: Order, actorId: string, note: string) {
    return this.prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        status: order.status,
        note,
        createdBy: actorId,
        correlationId: getCorrelationId(),
      },
    });
  }
}
