import 'reflect-metadata';
import { DiscountScope, DiscountType } from '@prisma/client';
import { DiscountRepository } from './discount.repository';
import { DiscountService } from './discount.service';

type PrismaLike = Record<string, any>;

interface MockRepository {
  supportsSoftDelete: boolean;
  findById: jest.Mock;
  findOne: jest.Mock;
  findMany: jest.Mock;
  findAndCount: jest.Mock;
  findCursor: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  softDelete: jest.Mock;
  count: jest.Mock;
}

function makeDiscount(overrides: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    name: 'Eid Sale',
    description: 'Eid discount',
    scope: DiscountScope.CART,
    type: DiscountType.PERCENTAGE,
    value: 20,
    productId: null,
    categoryId: null,
    collectionId: null,
    minPurchaseAmount: null,
    minQuantity: null,
    maxDiscountAmount: null,
    startsAt: null,
    endsAt: null,
    isActive: true,
    totalUsageLimit: null,
    perUserLimit: null,
    currentUsage: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const LINES = [
  { productId: 'p1', price: 1000, quantity: 2, total: 2000 },
  { productId: 'p2', price: 500, quantity: 1, total: 500 },
];
const CTX = { lines: LINES, subtotal: 2500, shippingAmount: 60 };

describe('DiscountService', () => {
  let repository: MockRepository;
  let prisma: PrismaLike;
  let service: DiscountService;

  async function expectRejection(promise: Promise<unknown>): Promise<any> {
    return promise.then(
      () => {
        throw new Error('expected promise to reject');
      },
      (error) => error,
    );
  }

  function mockCoupon(discount = makeDiscount(), couponOverrides: Record<string, unknown> = {}) {
    prisma.coupon.findUnique.mockResolvedValue({
      id: 'c1',
      code: 'EID20',
      discountId: discount.id,
      isActive: true,
      usageCount: 0,
      discount,
      ...couponOverrides,
    });
  }

  beforeEach(() => {
    repository = {
      supportsSoftDelete: false,
      findById: jest.fn(),
      findOne: jest.fn(),
      findMany: jest.fn(),
      findAndCount: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
      findCursor: jest.fn(),
      create: jest.fn().mockImplementation((data) => Promise.resolve({ id: 'd1', ...data })),
      update: jest.fn(),
      softDelete: jest.fn(),
      count: jest.fn(),
    };
    prisma = {
      coupon: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      userCoupon: { findUnique: jest.fn(), upsert: jest.fn() },
      collectionProduct: { findMany: jest.fn() },
      productCategory: { findMany: jest.fn() },
      category: { findMany: jest.fn() },
    };
    service = new DiscountService(repository as unknown as DiscountRepository, prisma as any);
  });

  describe('validate', () => {
    it('computes a percentage discount, capped by maxDiscountAmount', async () => {
      mockCoupon(makeDiscount({ value: 20, maxDiscountAmount: 300 }));
      const outcome = await service.validate('eid20', CTX);
      expect(outcome.productDiscount).toBe(300);
      expect(outcome.couponCode).toBe('EID20');
    });

    it('applies a fixed amount without exceeding the subtotal', async () => {
      mockCoupon(makeDiscount({ type: DiscountType.FIXED_AMOUNT, value: 99999 }));
      const outcome = await service.validate('EID20', CTX);
      expect(outcome.productDiscount).toBe(2500);
    });

    it('zeroes shipping for FREE_SHIPPING', async () => {
      mockCoupon(makeDiscount({ type: DiscountType.FREE_SHIPPING, value: 0 }));
      const outcome = await service.validate('EID20', CTX);
      expect(outcome.shippingDiscount).toBe(60);
      expect(outcome.freeShipping).toBe(true);
      expect(outcome.productDiscount).toBe(0);
    });

    it('buy X get Y takes the cheapest units', async () => {
      mockCoupon(makeDiscount({ type: DiscountType.BUY_X_GET_Y, value: 2, minQuantity: 3 }));
      const outcome = await service.validate('EID20', CTX);
      // cheapest 2 units among [500, 1000, 1000] = 500 + 1000 = 1500
      expect(outcome.productDiscount).toBe(1500);
    });

    it('restricts a product-scoped discount to matching lines only', async () => {
      mockCoupon(makeDiscount({ scope: DiscountScope.PRODUCT, productId: 'p1', value: 50 }));
      const outcome = await service.validate('EID20', CTX);
      expect(outcome.productDiscount).toBe(1000); // 50% of p1 (2000)
    });

    it('resolves collection scope through collectionProduct', async () => {
      prisma.collectionProduct.findMany.mockResolvedValue([{ productId: 'p2' }]);
      mockCoupon(makeDiscount({ scope: DiscountScope.COLLECTION, collectionId: 'col1', value: 100 }));
      const outcome = await service.validate('EID20', { ...CTX, shippingAmount: 0 });
      expect(outcome.productDiscount).toBe(500);
    });

    it('resolves category scope including descendants', async () => {
      prisma.category.findMany.mockResolvedValue([{ id: 'child' }]);
      prisma.productCategory.findMany.mockResolvedValue([{ productId: 'p1' }]);
      mockCoupon(makeDiscount({ scope: DiscountScope.CATEGORY, categoryId: 'cat1', value: 10 }));
      const outcome = await service.validate('EID20', CTX);
      expect(prisma.category.findMany).toHaveBeenCalledWith({
        where: { parentId: 'cat1' },
        select: { id: true },
      });
      expect(outcome.productDiscount).toBe(200); // 10% of p1 (2000)
    });

    it('rejects unknown, inactive and non-live coupons', async () => {
      prisma.coupon.findUnique.mockResolvedValue(null);
      expect((await expectRejection(service.validate('NOPE', CTX))).code).toBe('DISCOUNT.COUPON_INVALID');

      mockCoupon(makeDiscount(), { isActive: false });
      expect((await expectRejection(service.validate('EID20', CTX))).code).toBe('DISCOUNT.COUPON_INVALID');

      mockCoupon(makeDiscount({ isActive: false }));
      expect((await expectRejection(service.validate('EID20', CTX))).code).toBe('DISCOUNT.COUPON_INVALID');

      mockCoupon(makeDiscount({ endsAt: new Date(Date.now() - 1000) }));
      expect((await expectRejection(service.validate('EID20', CTX))).code).toBe('DISCOUNT.NOT_ACTIVE');
    });

    it('enforces global and per-user usage limits', async () => {
      mockCoupon(makeDiscount({ totalUsageLimit: 5, currentUsage: 5 }));
      expect((await expectRejection(service.validate('EID20', CTX))).code).toBe('DISCOUNT.USAGE_EXHAUSTED');

      mockCoupon(makeDiscount({ perUserLimit: 1 }));
      prisma.userCoupon.findUnique.mockResolvedValue({ usedCount: 1 });
      const error = await expectRejection(service.validate('EID20', { ...CTX, userId: 'u1' }));
      expect(error.code).toBe('DISCOUNT.USER_LIMIT_REACHED');
    });

    it('enforces minimum purchase and quantity', async () => {
      mockCoupon(makeDiscount({ minPurchaseAmount: 5000 }));
      expect((await expectRejection(service.validate('EID20', CTX))).code).toBe('DISCOUNT.MIN_PURCHASE');

      mockCoupon(makeDiscount({ minQuantity: 10 }));
      expect((await expectRejection(service.validate('EID20', CTX))).code).toBe('DISCOUNT.MIN_QUANTITY');
    });

    it('rejects when nothing in the cart is eligible', async () => {
      mockCoupon(makeDiscount({ scope: DiscountScope.PRODUCT, productId: 'other' }));
      const error = await expectRejection(service.validate('EID20', CTX));
      expect(error.code).toBe('DISCOUNT.NO_ELIGIBLE_ITEMS');
    });

    it('requires a code', async () => {
      const error = await expectRejection(service.validate('   ', CTX));
      expect(error.code).toBe('DISCOUNT.CODE_REQUIRED');
    });
  });

  describe('redeem', () => {
    it('bumps every usage counter inside the transaction', async () => {
      const tx = {
        discount: { update: jest.fn() },
        coupon: { update: jest.fn() },
        userCoupon: { upsert: jest.fn() },
      };
      await service.redeem(
        tx as any,
        {
          couponCode: 'EID20',
          couponId: 'c1',
          discountId: 'd1',
          name: 'x',
          description: 'x',
          productDiscount: 100,
          shippingDiscount: 0,
          freeShipping: false,
        },
        'u1',
      );

      expect(tx.discount.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: { currentUsage: { increment: 1 } },
      });
      expect(tx.coupon.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { usageCount: { increment: 1 } },
      });
      expect(tx.userCoupon.upsert).toHaveBeenCalled();
    });

    it('skips the per-user row for guests', async () => {
      const tx = {
        discount: { update: jest.fn() },
        coupon: { update: jest.fn() },
        userCoupon: { upsert: jest.fn() },
      };
      await service.redeem(
        tx as any,
        {
          couponCode: 'EID20',
          couponId: 'c1',
          discountId: 'd1',
          name: 'x',
          description: 'x',
          productDiscount: 0,
          shippingDiscount: 0,
          freeShipping: true,
        },
        undefined,
      );
      expect(tx.userCoupon.upsert).not.toHaveBeenCalled();
    });
  });

  describe('admin validation', () => {
    it('rejects an out-of-range percentage', async () => {
      const error = await expectRejection(
        service.create({ name: 'Bad', scope: DiscountScope.CART, type: DiscountType.PERCENTAGE, value: 150 }),
      );
      expect(error.code).toBe('DISCOUNT.BAD_VALUE');
    });

    it('requires a target for scoped discounts', async () => {
      const error = await expectRejection(
        service.create({ name: 'Bad', scope: DiscountScope.PRODUCT, type: DiscountType.FIXED_AMOUNT, value: 100 }),
      );
      expect(error.code).toBe('DISCOUNT.TARGET_REQUIRED');
    });

    it('requires both X and Y for buy-X-get-Y', async () => {
      const error = await expectRejection(
        service.create({ name: 'Bogo', scope: DiscountScope.CART, type: DiscountType.BUY_X_GET_Y, value: 0 }),
      );
      expect(error.code).toBe('DISCOUNT.BAD_BOGO');
    });

    it('rejects an inverted window', async () => {
      const error = await expectRejection(
        service.create({
          name: 'Window',
          scope: DiscountScope.CART,
          type: DiscountType.FIXED_AMOUNT,
          value: 100,
          startsAt: new Date('2026-05-01'),
          endsAt: new Date('2026-04-01'),
        }),
      );
      expect(error.code).toBe('DISCOUNT.BAD_WINDOW');
    });
  });

  describe('coupons', () => {
    it('uppercases and de-duplicates codes', async () => {
      repository.findById.mockResolvedValue(makeDiscount());
      prisma.coupon.findUnique.mockResolvedValue({ id: 'c1' });
      const error = await expectRejection(service.createCoupon('d1', { code: 'eid20' }));
      expect(error.code).toBe('DISCOUNT.CODE_TAKEN');
    });

    it('creates a coupon with a normalized code', async () => {
      repository.findById.mockResolvedValue(makeDiscount());
      prisma.coupon.findUnique.mockResolvedValue(null);
      prisma.coupon.create.mockResolvedValue({ id: 'c1', code: 'EID20' });

      await service.createCoupon('d1', { code: 'eid20' });

      expect(prisma.coupon.create).toHaveBeenCalledWith({
        data: { code: 'EID20', discountId: 'd1', isActive: true },
      });
    });
  });
});
