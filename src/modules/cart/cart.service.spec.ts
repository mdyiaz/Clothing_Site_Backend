import { CartService } from './cart.service';

type PrismaLike = Record<string, Record<string, jest.Mock>>;

const PRODUCT = {
  id: 'p1',
  name: 'Cotton Panjabi',
  isActive: true,
  basePrice: 900,
  compareAtPrice: 1200,
  totalStock: 10,
};

const VARIANT = { id: 'v1', stock: 4, price: 950 };

function line(overrides: Record<string, any> = {}) {
  return {
    id: 'line1',
    productId: 'p1',
    variantId: null,
    quantity: 2,
    product: {
      name: 'Cotton Panjabi',
      slug: 'cotton-panjabi',
      basePrice: 900,
      compareAtPrice: 1200,
      primaryImageUrl: 'p.jpg',
      isActive: true,
      deletedAt: null,
    },
    variant: null,
    ...overrides,
  };
}

describe('CartService', () => {
  let prisma: PrismaLike;
  let service: CartService;

  beforeEach(() => {
    prisma = {
      cart: { findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
      cartItem: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      product: { findFirst: jest.fn() },
      productVariant: { findFirst: jest.fn() },
    };
    service = new CartService(prisma as any);
  });

  async function expectRejection(promise: Promise<unknown>): Promise<any> {
    return promise.then(
      () => {
        throw new Error('expected promise to reject');
      },
      (error) => error,
    );
  }

  describe('resolveIdentity', () => {
    const user = { userId: 'u1', isGuest: false } as any;
    const guest = { userId: 'g1', isGuest: true } as any;

    it('prefers the signed-in user over any session', () => {
      expect(service.resolveIdentity(user, 'sess')).toEqual({ userId: 'u1' });
      expect(service.resolveIdentity(user, undefined)).toEqual({ userId: 'u1' });
    });

    it('keeps guests on their session cart while they have one', () => {
      expect(service.resolveIdentity(guest, 'sess')).toEqual({ sessionId: 'sess' });
      expect(service.resolveIdentity(guest, undefined)).toEqual({ userId: 'g1' });
    });

    it('accepts anonymous sessions and rejects bare requests', () => {
      expect(service.resolveIdentity(undefined, 'sess')).toEqual({ sessionId: 'sess' });
    });

    it('rejects requests with neither token nor session', async () => {
      const error = await expectRejection(
        (async () => service.resolveIdentity(undefined, undefined))(),
      );
      expect(error.code).toBe('CART.IDENTITY_REQUIRED');
    });
  });

  describe('getCart', () => {
    it('creates a cart on first visit', async () => {
      prisma.cart.findFirst.mockResolvedValue(null);
      prisma.cart.create.mockResolvedValue({ id: 'c1', items: [] });

      const cart = await service.getCart({ userId: 'u1' });

      expect(prisma.cart.create).toHaveBeenCalledWith({
        data: { userId: 'u1' },
        include: expect.anything(),
      });
      expect(cart).toMatchObject({ id: 'c1', items: [], subtotal: 0, savings: 0 });
    });

    it('presents lines with variant-price override, totals and savings', async () => {
      prisma.cart.findFirst.mockResolvedValue({
        id: 'c1',
        items: [
          line(),
          line({
            id: 'line2',
            variantId: 'v1',
            quantity: 1,
            variant: { price: 950, compareAtPrice: null, primaryImageUrl: 'v.jpg', size: 'M', color: 'Red' },
          }),
        ],
      });

      const cart = await service.getCart({ sessionId: 's1' });

      expect(cart.itemCount).toBe(3);
      expect(cart.uniqueCount).toBe(2);
      expect(cart.subtotal).toBe(900 * 2 + 950); // variant price wins
      // the variant has no own compareAtPrice, so it inherits the product-wide sale
      expect(cart.savings).toBe((1200 * 2 + 1200) - (900 * 2 + 950));
      expect(cart.items[1]).toMatchObject({ size: 'M', color: 'Red', image: 'v.jpg' });
    });

    it('flags unavailable lines without dropping them', async () => {
      prisma.cart.findFirst.mockResolvedValue({
        id: 'c1',
        items: [line({ product: { ...line().product, isActive: false } })],
      });

      const cart = await service.getCart({ sessionId: 's1' });

      expect(cart.items[0].available).toBe(false);
      expect(cart.subtotal).toBe(1800); // still counted; checkout revalidates
    });
  });

  describe('addItem', () => {
    beforeEach(() => {
      prisma.cart.findFirst.mockResolvedValue({ id: 'c1', items: [] });
      prisma.product.findFirst.mockResolvedValue({ ...PRODUCT });
    });

    it('creates a new line for a fresh product', async () => {
      prisma.cartItem.findFirst.mockResolvedValue(null);
      prisma.cartItem.create.mockResolvedValue({});

      await service.addItem({ userId: 'u1' }, { productId: 'p1', quantity: 2 });

      expect(prisma.cartItem.create).toHaveBeenCalledWith({
        data: { cartId: 'c1', productId: 'p1', variantId: null, quantity: 2 },
      });
    });

    it('merges into an identical existing line', async () => {
      prisma.cartItem.findFirst.mockResolvedValue({ id: 'line1', quantity: 1 });

      await service.addItem({ userId: 'u1' }, { productId: 'p1', quantity: 2 });

      expect(prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: 'line1' },
        data: { quantity: 3 },
      });
      expect(prisma.cartItem.create).not.toHaveBeenCalled();
    });

    it('checks variant stock for variant lines', async () => {
      prisma.productVariant.findFirst.mockResolvedValue({ ...VARIANT });
      prisma.cartItem.findFirst.mockResolvedValue({ id: 'line1', quantity: 3 });

      const error = await expectRejection(
        service.addItem({ userId: 'u1' }, { productId: 'p1', variantId: 'v1', quantity: 2 }),
      );
      expect(error.code).toBe('CART.INSUFFICIENT_STOCK');
      expect(prisma.cartItem.update).not.toHaveBeenCalled();
    });

    it('rejects inactive products and unknown variants', async () => {
      prisma.product.findFirst.mockResolvedValue({ ...PRODUCT, isActive: false });
      const gone = await expectRejection(
        service.addItem({ userId: 'u1' }, { productId: 'p1', quantity: 1 }),
      );
      expect(gone.code).toBe('CART.PRODUCT_UNAVAILABLE');

      prisma.product.findFirst.mockResolvedValue({ ...PRODUCT });
      prisma.productVariant.findFirst.mockResolvedValue(null);
      const unknown = await expectRejection(
        service.addItem({ userId: 'u1' }, { productId: 'p1', variantId: 'ghost', quantity: 1 }),
      );
      expect(unknown.code).toBe('CART.UNKNOWN_VARIANT');
    });
  });

  describe('updateItem / removeItem / clear', () => {
    beforeEach(() => {
      prisma.cart.findFirst.mockResolvedValue({ id: 'c1', items: [] });
    });

    it('sets a new quantity after a stock check', async () => {
      prisma.cartItem.findFirst.mockResolvedValue({ id: 'line1', productId: 'p1', variantId: null });
      prisma.product.findFirst.mockResolvedValue({ ...PRODUCT });

      await service.updateItem({ userId: 'u1' }, 'line1', 5);

      expect(prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: 'line1' },
        data: { quantity: 5 },
      });
    });

    it('quantity 0 deletes the line', async () => {
      prisma.cartItem.findFirst.mockResolvedValue({ id: 'line1', productId: 'p1', variantId: null });

      await service.updateItem({ userId: 'u1' }, 'line1', 0);

      expect(prisma.cartItem.delete).toHaveBeenCalledWith({ where: { id: 'line1' } });
      expect(prisma.product.findFirst).not.toHaveBeenCalled();
    });

    it('refuses lines from another cart', async () => {
      prisma.cartItem.findFirst.mockResolvedValue(null);

      await expect(service.updateItem({ userId: 'u1' }, 'foreign-line', 1)).rejects.toMatchObject({
        code: 'RESOURCE.NOT_FOUND',
      });
    });

    it('removeItem deletes only owned lines', async () => {
      prisma.cartItem.findFirst.mockResolvedValueOnce({ id: 'line1' });
      await service.removeItem({ userId: 'u1' }, 'line1');
      expect(prisma.cartItem.delete).toHaveBeenCalledWith({ where: { id: 'line1' } });

      prisma.cartItem.findFirst.mockResolvedValueOnce(null);
      await expect(service.removeItem({ userId: 'u1' }, 'nope')).rejects.toMatchObject({
        code: 'RESOURCE.NOT_FOUND',
      });
    });

    it('clear empties the cart', async () => {
      await service.clear({ userId: 'u1' });
      expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: 'c1' } });
    });
  });

  describe('merge', () => {
    it('folds guest lines into the user cart and drops the guest cart', async () => {
      prisma.cart.findFirst
        .mockResolvedValueOnce({
          id: 'guest-cart',
          items: [{ productId: 'p1', variantId: null, quantity: 2 }],
        })
        .mockResolvedValue({ id: 'user-cart', items: [] });
      prisma.product.findFirst.mockResolvedValue({ ...PRODUCT });
      prisma.cartItem.findFirst.mockResolvedValue(null);
      prisma.cartItem.create.mockResolvedValue({});

      await service.merge('sess-1', 'u1');

      expect(prisma.cartItem.create).toHaveBeenCalledWith({
        data: { cartId: 'user-cart', productId: 'p1', variantId: null, quantity: 2 },
      });
      expect(prisma.cart.delete).toHaveBeenCalledWith({ where: { id: 'guest-cart' } });
    });

    it('caps merged quantities at available stock', async () => {
      prisma.cart.findFirst
        .mockResolvedValueOnce({
          id: 'guest-cart',
          items: [{ productId: 'p1', variantId: null, quantity: 9 }],
        })
        .mockResolvedValue({ id: 'user-cart', items: [] });
      prisma.product.findFirst.mockResolvedValue({ ...PRODUCT, totalStock: 4 });
      prisma.cartItem.findFirst.mockResolvedValue({ id: 'mine', quantity: 2 });

      await service.merge('sess-1', 'u1');

      expect(prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: 'mine' },
        data: { quantity: 4 },
      });
    });

    it('is a no-op (minus cleanup) when there is no guest cart', async () => {
      prisma.cart.findFirst.mockResolvedValue(null);
      prisma.cart.create.mockResolvedValue({ id: 'user-cart', items: [] });

      await service.merge('unknown-session', 'u1');

      expect(prisma.cartItem.create).not.toHaveBeenCalled();
      expect(prisma.cart.delete).not.toHaveBeenCalled();
    });
  });
});
