import 'reflect-metadata';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { ShippingService } from './shipping.service';

function gatewayStub(courier: string) {
  return {
    courier,
    isConfigured: jest.fn().mockReturnValue(true),
    create: jest.fn(),
    track: jest.fn(),
    cancel: jest.fn(),
  };
}

describe('ShippingService', () => {
  let prisma: Record<string, any>;
  let pathao: ReturnType<typeof gatewayStub>;
  let redx: ReturnType<typeof gatewayStub>;
  let service: ShippingService;

  const order = {
    id: 'o1',
    orderNumber: 'ORD-1',
    status: 'CONFIRMED',
    trackingNumber: null,
    courierName: null,
    paymentMethod: PaymentMethod.COD,
    paymentStatus: PaymentStatus.UNPAID,
    totalAmount: 1500,
    guestName: 'Riaz',
    guestPhone: '01711',
    shippingAddress: { addressLine: '12 Road', district: 'Dhaka' },
    items: [{ quantity: 2 }],
  };

  async function expectRejection(promise: Promise<unknown>): Promise<any> {
    return promise.then(
      () => {
        throw new Error('expected promise to reject');
      },
      (error) => error,
    );
  }

  beforeEach(() => {
    prisma = {
      order: { findUnique: jest.fn(), update: jest.fn() },
      orderStatusHistory: { create: jest.fn() },
    };
    pathao = gatewayStub('PATHAO');
    redx = gatewayStub('REDX');
    service = new ShippingService(
      prisma as any,
      { get: jest.fn().mockReturnValue({ defaultCourier: 'PATHAO' }) } as any,
      pathao as any,
      redx as any,
    );
  });

  it('creates a parcel and stores the tracking code', async () => {
    prisma.order.findUnique.mockResolvedValue(order);
    pathao.create.mockResolvedValue({ trackingCode: 'PC-123', courier: 'PATHAO', raw: {} });

    const result = await service.createShipment('o1', 'admin');
    expect(result).toMatchObject({ orderNumber: 'ORD-1', trackingNumber: 'PC-123', courier: 'PATHAO' });
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { trackingNumber: 'PC-123', courierName: 'PATHAO' },
    });
    expect(prisma.orderStatusHistory.create).toHaveBeenCalled();
  });

  it('builds a COD collection amount from the order total', async () => {
    prisma.order.findUnique.mockResolvedValue(order);
    pathao.create.mockResolvedValue({ trackingCode: 'PC-123', courier: 'PATHAO', raw: {} });

    await service.createShipment('o1', 'admin');
    expect(pathao.create).toHaveBeenCalledWith(
      expect.objectContaining({ amountToCollect: 1500, itemQuantity: 2, city: 'Dhaka' }),
    );
  });

  it('does not collect COD when the order is already paid', async () => {
    prisma.order.findUnique.mockResolvedValue({ ...order, paymentStatus: PaymentStatus.PAID });
    pathao.create.mockResolvedValue({ trackingCode: 'PC-1', courier: 'PATHAO', raw: {} });
    await service.createShipment('o1', 'admin');
    expect(pathao.create).toHaveBeenCalledWith(expect.objectContaining({ amountToCollect: 0 }));
  });

  it('rejects a second shipment for the same order', async () => {
    prisma.order.findUnique.mockResolvedValue({ ...order, trackingNumber: 'PC-OLD', courierName: 'PATHAO' });
    const error = await expectRejection(service.createShipment('o1', 'admin'));
    expect(error.code).toBe('SHIPMENT.ALREADY_SHIPPED');
  });

  it('rejects when the courier is not configured', async () => {
    prisma.order.findUnique.mockResolvedValue(order);
    pathao.isConfigured.mockReturnValue(false);
    const error = await expectRejection(service.createShipment('o1', 'admin'));
    expect(error.code).toBe('SHIPMENT.NOT_CONFIGURED');
  });

  it('refuses to track an order without a tracking number', async () => {
    prisma.order.findUnique.mockResolvedValue(order);
    const error = await expectRejection(service.track('o1'));
    expect(error.code).toBe('SHIPMENT.NOT_SHIPPED');
  });

  it('proxies tracking through the order courier', async () => {
    prisma.order.findUnique.mockResolvedValue({ ...order, trackingNumber: 'PC-123', courierName: 'PATHAO' });
    pathao.track.mockResolvedValue({ status: 'DELIVERED', raw: {} });
    const result = await service.track('o1');
    expect(result).toMatchObject({ status: 'DELIVERED', trackingNumber: 'PC-123' });
  });
});
