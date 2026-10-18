import 'reflect-metadata';
import { OrderStatus } from '@prisma/client';
import { CartService } from '../cart/cart.service';
import { QueryOrderDto } from './dto/order.dto';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';

type PrismaLike = Record<string, any>;

interface MockRepository {
  findById: jest.Mock;
  findOne: jest.Mock;
  findMany: jest.Mock;
  findAndCount: jest.Mock;
  findCursor: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  softDelete: jest.Mock;
  count: jest.Mock;
  supportsSoftDelete: boolean;
}

function txStub() {
  return {
    order: { create: jest.fn(), findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
    orderItem: { findMany: jest.fn().mockResolvedValue([]) },
    productVariant: { update: jest.fn() },
    product: { update: jest.fn() },
    orderStatusHistory: { create: jest.fn() },
  };
}

describe('OrderService', () => {
  let repository: MockRepository;
  let prisma: PrismaLike;
  let cart: { resolveIdentity: jest.Mock; getCart: jest.Mock; clear: jest.Mock };
  let discounts: { validate: jest.Mock; redeem: jest.Mock };
  let vouchers: { preview: jest.Mock; redeemInTx: jest.Mock };
  let loyalty: { awardForOrder: jest.Mock };
  let notifications: { notifyOrderPlaced: jest.Mock; notifyOrderStatus: jest.Mock };
  let service: OrderService;
  let tx: ReturnType<typeof txStub>;

  const baseDto = {
    shippingAddress: { city: 'Dhaka' },
    shippingZone: 'INSIDE_DHAKA',
    paymentMethod: 'COD',
  };

  beforeEach(() => {
    repository = {
      supportsSoftDelete: false,
      findById: jest.fn(),
      findOne: jest.fn(),
      findMany: jest.fn(),
      findAndCount: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
      findCursor: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      count: jest.fn(),
    };
    tx = txStub();
    prisma = {
      order: { findUnique: jest.fn(), update: jest.fn() },
      orderItem: { findMany: jest.fn() },
      product: { findFirst: jest.fn() },
      productVariant: { findFirst: jest.fn(), update: jest.fn() },
      payment: { findFirst: jest.fn(), update: jest.fn() },
      shippingRate: { findFirst: jest.fn() },
      orderStatusHistory: { create: jest.fn() },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    cart = {
      resolveIdentity: jest.fn((actor: any, sessionId?: string) =>
        actor ? { userId: actor.userId } : { sessionId },
      ),
      getCart: jest.fn(),
      clear: jest.fn().mockResolvedValue({}),
    };
    discounts = { validate: jest.fn().mockResolvedValue(null), redeem: jest.fn() };
    vouchers = { preview: jest.fn().mockResolvedValue(null), redeemInTx: jest.fn() };
    loyalty = { awardForOrder: jest.fn().mockResolvedValue(null) };
    notifications = {
      notifyOrderPlaced: jest.fn().mockResolvedValue(undefined),
      notifyOrderStatus: jest.fn().mockResolvedValue(undefined),
    };
    service = new OrderService(
      repository as unknown as OrderRepository,
      prisma as any,
      cart as unknown as CartService,
      discounts as any,
      vouchers as any,
      loyalty as any,
      notifications as any,
    );
  });

  async function expectRejection(promise: Promise<unknown>): Promise<any> {
    return promise.then(
      () => {
        throw new Error('expected promise to reject');
      },
      (error) => error,
    );
  }

  describe('checkout', () => {
    const liveProduct = {
      id: 'p1',
      name: 'Cotton Panjabi',
      sku: 'RP-001',
      isActive: true,
      basePrice: 90000,
      totalStock: 10,
    };

    beforeEach(() => {
      cart.getCart.mockResolvedValue({
        id: 'cart-1',
        items: [{ productId: 'p1', variantId: null, quantity: 2, price: 90000 }],
      });
      prisma.product.findFirst.mockResolvedValue({ ...liveProduct });
      tx.order.create.mockImplementation((args: any) =>
        Promise.resolve({ id: 'ord-1', orderNumber: 'ORD-001', ...args.data }),
      );
    });

    it('creates an order with snapshots, payment, history, stock moves and a cleared cart', async () => {
      const order = await service.checkout({ userId: 'u1' } as any, {
        ...baseDto,
        guestPhone: '01711',
      } as any);

      expect(tx.order.create.mock.calls[0][0].data).toMatchObject({
        userId: 'u1',
        subtotal: 180000,
        shippingAmount: 0,
        totalAmount: 180000,
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        paymentMethod: 'COD',
        items: {
          create: [
            {
              productId: 'p1',
              variantId: null,
              productName: 'Cotton Panjabi',
              sku: 'RP-001',
              price: 90000,
              quantity: 2,
              total: 180000,
            },
          ],
        },
        payments: { create: { method: 'COD', amount: 180000, status: 'UNPAID' } },
      });
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { totalStock: { decrement: 2 }, totalSold: { increment: 2 } },
      });
      expect(cart.clear).toHaveBeenCalledWith({ userId: 'u1' });
      expect(order.orderNumber).toMatch(/^ORD-\d{8}-[A-Z0-9]{6}$/);
    });

    it('uses variant prices and decrements variant stock', async () => {
      cart.getCart.mockResolvedValue({
        id: 'cart-1',
        items: [{ productId: 'p1', variantId: 'v1', quantity: 1, price: 95000 }],
      });
      prisma.productVariant.findFirst.mockResolvedValue({
        id: 'v1',
        sku: 'RP-001-M',
        size: 'M',
        color: null,
        price: 95000,
        stock: 4,
      });

      await service.checkout({ userId: 'u1' } as any, { ...baseDto } as any);

      expect(tx.productVariant.update).toHaveBeenCalledWith({
        where: { id: 'v1' },
        data: { stock: { decrement: 1 } },
      });
      expect(tx.order.create.mock.calls[0][0].data.items.create[0]).toMatchObject({
        variantInfo: 'M',
        sku: 'RP-001-M',
        price: 95000,
      });
    });

    it('adds the matched shipping rate to the total', async () => {
      prisma.shippingRate.findFirst.mockResolvedValue({ cost: 6000 });

      await service.checkout({ userId: 'u1' } as any, {
        ...baseDto,
        shippingMethod: 'Standard',
      } as any);

      expect(prisma.shippingRate.findFirst).toHaveBeenCalledWith({
        where: { name: 'Standard', zone: 'INSIDE_DHAKA', isActive: true },
      });
      expect(tx.order.create.mock.calls[0][0].data).toMatchObject({
        shippingAmount: 6000,
        totalAmount: 186000,
        payments: { create: expect.objectContaining({ amount: 186000 }) },
      });
    });

    it('applies a coupon through the discount engine and redeems it', async () => {
      discounts.validate.mockResolvedValue({
        couponCode: 'EID20',
        couponId: 'c1',
        discountId: 'd1',
        name: 'Eid 20%',
        description: 'Eid 20% off',
        productDiscount: 36000,
        shippingDiscount: 0,
        freeShipping: false,
      });

      await service.checkout({ userId: 'u1' } as any, {
        ...baseDto,
        couponCode: 'EID20',
      } as any);

      expect(discounts.validate).toHaveBeenCalledWith(
        'EID20',
        expect.objectContaining({ userId: 'u1', subtotal: 180000 }),
      );
      expect(discounts.redeem).toHaveBeenCalledWith(tx, expect.objectContaining({ couponCode: 'EID20' }), 'u1');
      expect(tx.order.create.mock.calls[0][0].data).toMatchObject({
        subtotal: 180000,
        discountAmount: 36000,
        totalAmount: 144000,
        couponCode: 'EID20',
        couponDiscount: 36000,
      });
    });

    it('applies a gift voucher and redeems the balance', async () => {
      vouchers.preview.mockResolvedValue({ code: 'RGL-ABCD-EFGH', balance: 50000, applicable: 50000 });

      await service.checkout({ userId: 'u1' } as any, {
        ...baseDto,
        voucherCode: 'RGL-ABCD-EFGH',
      } as any);

      expect(vouchers.preview).toHaveBeenCalledWith('RGL-ABCD-EFGH', 180000);
      expect(vouchers.redeemInTx).toHaveBeenCalledWith(tx, 'RGL-ABCD-EFGH', 50000);
      expect(tx.order.create.mock.calls[0][0].data).toMatchObject({
        subtotal: 180000,
        voucherCode: 'RGL-ABCD-EFGH',
        voucherAmount: 50000,
        discountAmount: 50000,
        totalAmount: 130000,
      });
    });

    it('awards loyalty points for a registered customer after checkout', async () => {
      await service.checkout({ userId: 'u1' } as any, { ...baseDto } as any);
      expect(loyalty.awardForOrder).toHaveBeenCalledWith('u1', expect.any(Number), expect.any(String));
    });

    it('fires a fire-and-forget order-placed notification', async () => {
      await service.checkout({ userId: 'u1' } as any, {
        ...baseDto,
        guestEmail: 'buyer@rangoli.com.bd',
        guestPhone: '01711',
      } as any);

      expect(notifications.notifyOrderPlaced).toHaveBeenCalledWith(
        expect.objectContaining({ orderNumber: expect.any(String), email: 'buyer@rangoli.com.bd' }),
      );
    });

    it('requires a guest phone for anonymous checkout', async () => {
      cart.resolveIdentity.mockReturnValue({ sessionId: 's1' });

      const error = await expectRejection(
        service.checkout(undefined, { ...baseDto } as any),
      );
      expect(error.code).toBe('ORDER.GUEST_PHONE_REQUIRED');
      expect(tx.order.create).not.toHaveBeenCalled();
    });

    it('replays the same order for a repeated idempotency key', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 'ord-1', orderNumber: 'ORD-OLD' });

      const order = await service.checkout({ userId: 'u1' } as any, {
        ...baseDto,
        idempotencyKey: 'key-123',
      } as any);

      expect(order).toMatchObject({ id: 'ord-1' });
      expect(tx.order.create).not.toHaveBeenCalled();
      expect(cart.clear).not.toHaveBeenCalled();
    });

    it('rejects an empty cart', async () => {
      cart.getCart.mockResolvedValue({ id: 'cart-1', items: [] });

      const error = await expectRejection(
        service.checkout({ userId: 'u1' } as any, { ...baseDto } as any),
      );
      expect(error.code).toBe('ORDER.CART_EMPTY');
    });

    it('rejects lines that went out of stock after being added', async () => {
      prisma.product.findFirst.mockResolvedValue({ ...liveProduct, totalStock: 1 });

      const error = await expectRejection(
        service.checkout({ userId: 'u1' } as any, { ...baseDto } as any),
      );
      expect(error.code).toBe('ORDER.INSUFFICIENT_STOCK');
      expect(tx.order.create).not.toHaveBeenCalled();
    });

    it('rejects deactivated products and unknown shipping methods', async () => {
      prisma.product.findFirst.mockResolvedValue({ ...liveProduct, isActive: false });
      const gone = await expectRejection(
        service.checkout({ userId: 'u1' } as any, { ...baseDto } as any),
      );
      expect(gone.code).toBe('ORDER.ITEM_UNAVAILABLE');

      prisma.product.findFirst.mockResolvedValue({ ...liveProduct });
      prisma.shippingRate.findFirst.mockResolvedValue(null);
      const noShip = await expectRejection(
        service.checkout({ userId: 'u1' } as any, { ...baseDto, shippingMethod: 'Drone' } as any),
      );
      expect(noShip.code).toBe('ORDER.SHIPPING_UNAVAILABLE');
    });
  });

  describe('customer reads', () => {
    it('myOrders scopes to the caller', async () => {
      const query = Object.assign(new QueryOrderDto(), { page: 1, limit: 20 });

      await service.myOrders('u1', query);

      expect(repository.findAndCount.mock.calls[0][0].where).toMatchObject({ userId: 'u1' });
    });

    it('myOrderDetail hides other users orders as 404', async () => {
      repository.findOne.mockResolvedValue(null);
      await expect(service.myOrderDetail('u1', 'foreign')).rejects.toMatchObject({
        code: 'RESOURCE.NOT_FOUND',
      });
      expect(repository.findOne.mock.calls[0][0]).toEqual({ id: 'foreign', userId: 'u1' });
    });

    it('track verifies guest phone numbers', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', userId: null, guestPhone: '01711' });

      await expect(service.track('ORD-1', '01999', undefined)).rejects.toMatchObject({
        code: 'RESOURCE.NOT_FOUND',
      });
      await expect(service.track('ORD-1', '01711', undefined)).resolves.toMatchObject({ id: 'o1' });
    });

    it('track requires ownership for registered orders', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', userId: 'u1', guestPhone: null });

      await expect(
        service.track('ORD-1', undefined, { userId: 'u2' } as any),
      ).rejects.toMatchObject({ code: 'RESOURCE.NOT_FOUND' });
      await expect(
        service.track('ORD-1', undefined, { userId: 'u1' } as any),
      ).resolves.toMatchObject({ id: 'o1' });
    });

    it('customers can only cancel PENDING/CONFIRMED orders', async () => {
      repository.findOne.mockResolvedValue({ id: 'o1', status: 'SHIPPED' });
      const late = await expectRejection(service.cancelMine('u1', 'o1'));
      expect(late.code).toBe('ORDER.CANCEL_TOO_LATE');

      repository.findOne.mockResolvedValue({ id: 'o1', status: 'PENDING' });
      repository.findById.mockResolvedValue({ id: 'o1', status: 'PENDING' });
      tx.order.update.mockResolvedValue({ id: 'o1', status: 'CANCELLED' });

      await service.cancelMine('u1', 'o1');

      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { status: 'CANCELLED' },
      });
      expect(tx.orderStatusHistory.create).toHaveBeenCalled();
    });
  });

  describe('admin status flow', () => {
    it('moves along the pipeline and rejects jumps', async () => {
      repository.findById.mockResolvedValue({ id: 'o1', status: 'PENDING' });
      tx.order.update.mockResolvedValue({ id: 'o1', status: 'CONFIRMED' });

      await service.updateStatus('o1', OrderStatus.CONFIRMED, 'admin-1', 'ok');

      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { status: 'CONFIRMED' },
      });
      expect(notifications.notifyOrderStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'CONFIRMED' }),
      );

      repository.findById.mockResolvedValue({ id: 'o1', status: 'PENDING' });
      const jump = await expectRejection(
        service.updateStatus('o1', OrderStatus.SHIPPED, 'admin-1'),
      );
      expect(jump.code).toBe('ORDER.BAD_TRANSITION');
    });

    it('rejects unknown statuses', async () => {
      const error = await expectRejection(
        service.updateStatus('o1', 'FLYING' as OrderStatus, 'admin-1'),
      );
      expect(error.code).toBe('ORDER.UNKNOWN_STATUS');
    });

    it('restocks inventory when an early order is cancelled', async () => {
      repository.findById.mockResolvedValue({ id: 'o1', status: 'CONFIRMED' });
      tx.order.update.mockResolvedValue({ id: 'o1', status: 'CANCELLED' });
      tx.orderItem.findMany.mockResolvedValue([
        { productId: 'p1', variantId: 'v1', quantity: 2 },
        { productId: 'p2', variantId: null, quantity: 1 },
      ]);

      await service.updateStatus('o1', OrderStatus.CANCELLED, 'admin-1');

      expect(tx.productVariant.update).toHaveBeenCalledWith({
        where: { id: 'v1' },
        data: { stock: { increment: 2 } },
      });
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { totalStock: { increment: 2 }, totalSold: { decrement: 2 } },
      });
    });

    it('does not restock late cancellations', async () => {
      repository.findById.mockResolvedValue({ id: 'o1', status: 'SHIPPED' });

      const error = await expectRejection(
        service.updateStatus('o1', OrderStatus.CANCELLED, 'admin-1'),
      );
      expect(error.code).toBe('ORDER.BAD_TRANSITION');
      expect(tx.order.update).not.toHaveBeenCalled();
    });
  });

  describe('admin payment updates', () => {
    beforeEach(() => {
      repository.findById.mockResolvedValue({ id: 'o1', paymentStatus: 'UNPAID' });
      prisma.payment.findFirst.mockResolvedValue({ id: 'pay-1' });
      prisma.payment.update.mockResolvedValue({ id: 'pay-1', status: 'PAID' });
    });

    it('marks COD collected (implies PAID) and mirrors it onto the order', async () => {
      await service.updatePayment('o1', undefined, true, 'admin-1');

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: expect.objectContaining({
          codCollected: true,
          status: 'PAID',
          codCollectedAt: expect.any(Date),
        }),
      });
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { paymentStatus: 'PAID' },
      });
    });

    it('sets an explicit payment status', async () => {
      await service.updatePayment('o1', 'FAILED' as any, false, 'admin-1');

      expect(prisma.payment.update.mock.calls[0][0].data.status).toBe('FAILED');
    });

    it('rejects empty and unknown updates', async () => {
      const noop = await expectRejection(service.updatePayment('o1', undefined, false, 'admin-1'));
      expect(noop.code).toBe('ORDER.PAYMENT_NOOP');

      const unknown = await expectRejection(
        service.updatePayment('o1', 'RICH' as any, false, 'admin-1'),
      );
      expect(unknown.code).toBe('ORDER.UNKNOWN_PAYMENT_STATUS');
    });
  });
});
