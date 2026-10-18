import 'reflect-metadata';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { PaymentService } from './payment.service';

function gatewayStub(method: PaymentMethod) {
  return {
    method,
    isConfigured: jest.fn().mockReturnValue(true),
    createSession: jest.fn(),
    verifyCallback: jest.fn(),
  };
}

describe('PaymentService', () => {
  let prisma: Record<string, any>;
  let bkash: ReturnType<typeof gatewayStub>;
  let sslcommerz: ReturnType<typeof gatewayStub>;
  let service: PaymentService;

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
      payment: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
      orderStatusHistory: { create: jest.fn() },
    };
    bkash = gatewayStub(PaymentMethod.BKASH);
    sslcommerz = gatewayStub(PaymentMethod.SSLCOMMERZ);
    service = new PaymentService(
      prisma as any,
      { get: jest.fn().mockReturnValue({ callbackBaseUrl: 'http://localhost/payments' }) } as any,
      bkash as any,
      sslcommerz as any,
    );
  });

  it('starts a bKash session and stores a pending payment', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'o1',
      orderNumber: 'ORD-1',
      userId: 'u1',
      paymentMethod: PaymentMethod.BKASH,
      paymentStatus: PaymentStatus.UNPAID,
      totalAmount: 1500,
    });
    prisma.payment.findFirst.mockResolvedValue(null);
    bkash.createSession.mockResolvedValue({ redirectUrl: 'https://bkash/pay', gatewayRef: 'pay1' });

    const result = await service.initiate('ORD-1', undefined, { userId: 'u1' } as any);

    expect(result).toMatchObject({ redirectUrl: 'https://bkash/pay', method: PaymentMethod.BKASH });
    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orderId: 'o1', gatewayTxnId: 'pay1', status: PaymentStatus.PENDING }),
      }),
    );
  });

  it('rejects an unsupported (COD) payment method', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'o1',
      userId: 'u1',
      paymentMethod: PaymentMethod.COD,
      paymentStatus: PaymentStatus.UNPAID,
    });
    const error = await expectRejection(service.initiate('ORD-1', undefined, { userId: 'u1' } as any));
    expect(error.code).toBe('PAYMENT.METHOD_UNSUPPORTED');
  });

  it('rejects an already-paid order', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'o1',
      userId: 'u1',
      paymentMethod: PaymentMethod.BKASH,
      paymentStatus: PaymentStatus.PAID,
    });
    const error = await expectRejection(service.initiate('ORD-1', undefined, { userId: 'u1' } as any));
    expect(error.code).toBe('PAYMENT.ALREADY_PAID');
  });

  it('blocks a guest with the wrong phone', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'o1',
      orderNumber: 'ORD-1',
      userId: null,
      guestPhone: '01711111111',
      paymentMethod: PaymentMethod.BKASH,
      paymentStatus: PaymentStatus.UNPAID,
    });
    const error = await expectRejection(service.initiate('ORD-1', '01999999999', undefined));
    expect(error.getStatus()).toBe(403);
  });

  it('does not let a different customer pay someone else order', async () => {
    prisma.order.findUnique.mockResolvedValue({ id: 'o1', userId: 'owner', paymentMethod: PaymentMethod.BKASH });
    const error = await expectRejection(service.initiate('ORD-1', undefined, { userId: 'intruder' } as any));
    expect(error.getStatus()).toBe(404);
  });

  it('settles a successful bKash callback', async () => {
    prisma.payment.findFirst.mockResolvedValue({
      id: 'p1',
      gatewayTxnId: 'pay1',
      order: { id: 'o1', orderNumber: 'ORD-1', status: 'PENDING', paymentStatus: PaymentStatus.PENDING },
    });
    bkash.verifyCallback.mockResolvedValue({ success: true, gatewayTxnId: 'TRX99', amount: 1500, raw: {} });

    const result = await service.handleBkashCallback({ paymentID: 'pay1' });

    expect(result).toMatchObject({ status: PaymentStatus.PAID, alreadyProcessed: false });
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: PaymentStatus.PAID, gatewayTxnId: 'TRX99' }) }),
    );
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paymentStatus: PaymentStatus.PAID } }),
    );
    expect(prisma.orderStatusHistory.create).toHaveBeenCalled();
  });

  it('is idempotent for repeated callbacks', async () => {
    prisma.payment.findFirst.mockResolvedValue({
      id: 'p1',
      gatewayTxnId: 'pay1',
      order: { id: 'o1', orderNumber: 'ORD-1', status: 'PENDING', paymentStatus: PaymentStatus.PAID },
    });
    const result = await service.handleBkashCallback({ paymentID: 'pay1' });
    expect(result).toMatchObject({ status: PaymentStatus.PAID, alreadyProcessed: true });
    expect(bkash.verifyCallback).not.toHaveBeenCalled();
  });

  it('marks a failed SSLCommerz callback', async () => {
    prisma.order.findUnique.mockResolvedValue({ id: 'o1', orderNumber: 'ORD-1', status: 'PENDING', paymentStatus: PaymentStatus.PENDING });
    prisma.payment.findFirst.mockResolvedValue({ id: 'p1', gatewayTxnId: null });
    sslcommerz.verifyCallback.mockResolvedValue({ success: false, gatewayTxnId: null, amount: null, raw: {} });

    const result = await service.handleSslcommerzCallback({ tran_id: 'ORD-1', val_id: 'v1' });

    expect(result).toMatchObject({ status: PaymentStatus.FAILED });
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: PaymentStatus.FAILED }) }),
    );
  });

  it('reports outstanding amount for an unpaid order', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'o1',
      orderNumber: 'ORD-1',
      userId: 'u1',
      paymentStatus: PaymentStatus.PENDING,
      paymentMethod: PaymentMethod.BKASH,
      totalAmount: 999,
      status: 'PENDING',
    });
    prisma.payment.findFirst.mockResolvedValue({ gatewayTxnId: 'pay1' });

    const status = await service.status('ORD-1', undefined, { userId: 'u1' } as any);
    expect(status).toMatchObject({ amountDue: 999, gatewayTxnId: 'pay1' });
  });
});
