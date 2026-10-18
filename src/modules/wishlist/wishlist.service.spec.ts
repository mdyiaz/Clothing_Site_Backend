import { WishlistService } from './wishlist.service';

type PrismaLike = Record<string, Record<string, jest.Mock>>;

const PRODUCT_ROW = {
  id: 'p1',
  name: 'Cotton Panjabi',
  slug: 'cotton-panjabi',
  basePrice: 900,
  compareAtPrice: 1200,
  primaryImageUrl: 'p.jpg',
  isActive: true,
  deletedAt: null,
  totalStock: 5,
};

describe('WishlistService', () => {
  let prisma: PrismaLike;
  let cart: { addItem: jest.Mock };
  let service: WishlistService;

  beforeEach(() => {
    prisma = {
      product: { findFirst: jest.fn() },
      productVariant: { findFirst: jest.fn() },
      wishlistItem: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
    };
    cart = { addItem: jest.fn().mockResolvedValue({ id: 'cart-1' }) };
    service = new WishlistService(prisma as any, cart as any);
  });

  async function expectRejection(promise: Promise<unknown>): Promise<any> {
    return promise.then(
      () => {
        throw new Error('expected promise to reject');
      },
      (error) => error,
    );
  }

  describe('list', () => {
    it('maps rows to storefront snapshots with stock flags', async () => {
      prisma.wishlistItem.findMany.mockResolvedValue([
        { id: 'w1', productId: 'p1', variantId: null, product: PRODUCT_ROW },
        {
          id: 'w2',
          productId: 'p2',
          variantId: 'v9',
          product: { ...PRODUCT_ROW, totalStock: 0 },
        },
      ]);

      const rows = await service.list('u1');

      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ id: 'w1', price: 900, inStock: true, available: true });
      expect(rows[1]).toMatchObject({ inStock: false, available: true });
      expect(prisma.wishlistItem.findMany.mock.calls[0][0]).toMatchObject({
        where: { userId: 'u1' },
      });
    });
  });

  describe('toggle', () => {
    beforeEach(() => {
      prisma.product.findFirst.mockResolvedValue({ id: 'p1', isActive: true });
    });

    it('adds when absent', async () => {
      prisma.wishlistItem.findFirst.mockResolvedValue(null);
      prisma.wishlistItem.create.mockResolvedValue({ id: 'w1' });

      const result = await service.toggle('u1', 'p1');

      expect(prisma.wishlistItem.create).toHaveBeenCalledWith({
        data: { userId: 'u1', productId: 'p1', variantId: null },
      });
      expect(result).toMatchObject({ added: true });
    });

    it('removes when already saved', async () => {
      prisma.productVariant.findFirst.mockResolvedValue({ id: 'v9' });
      prisma.wishlistItem.findFirst.mockResolvedValue({ id: 'w1' });
      prisma.wishlistItem.delete.mockResolvedValue({});

      const result = await service.toggle('u1', 'p1', 'v9');

      expect(prisma.wishlistItem.findFirst).toHaveBeenCalledWith({
        where: { userId: 'u1', productId: 'p1', variantId: 'v9' },
      });
      expect(prisma.wishlistItem.delete).toHaveBeenCalledWith({ where: { id: 'w1' } });
      expect(result).toEqual({ added: false, item: null });
    });

    it('rejects unavailable products and unknown variants', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'p1', isActive: false });
      const gone = await expectRejection(service.toggle('u1', 'p1'));
      expect(gone.code).toBe('WISHLIST.PRODUCT_UNAVAILABLE');

      prisma.product.findFirst.mockResolvedValue({ id: 'p1', isActive: true });
      prisma.productVariant.findFirst.mockResolvedValue(null);
      const unknown = await expectRejection(service.toggle('u1', 'p1', 'ghost'));
      expect(unknown.code).toBe('WISHLIST.UNKNOWN_VARIANT');
      expect(prisma.wishlistItem.create).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes owned lines and 404s the rest', async () => {
      prisma.wishlistItem.findFirst.mockResolvedValueOnce({ id: 'w1' });
      await expect(service.remove('u1', 'w1')).resolves.toEqual({ id: 'w1' });
      expect(prisma.wishlistItem.delete).toHaveBeenCalledWith({ where: { id: 'w1' } });

      prisma.wishlistItem.findFirst.mockResolvedValueOnce(null);
      await expect(service.remove('u1', 'foreign-line')).rejects.toMatchObject({
        code: 'RESOURCE.NOT_FOUND',
      });
    });
  });

  describe('moveToCart', () => {
    it('adds the saved line to the cart and drops it from the wishlist', async () => {
      prisma.wishlistItem.findFirst.mockResolvedValue({
        id: 'w1',
        productId: 'p1',
        variantId: 'v9',
      });

      const result = await service.moveToCart('u1', 'w1', 2);

      expect(cart.addItem).toHaveBeenCalledWith(
        { userId: 'u1' },
        { productId: 'p1', variantId: 'v9', quantity: 2 },
      );
      expect(prisma.wishlistItem.delete).toHaveBeenCalledWith({ where: { id: 'w1' } });
      expect(result).toEqual({ id: 'cart-1' });
    });

    it('defaults to quantity 1 and 404s missing lines', async () => {
      prisma.wishlistItem.findFirst.mockResolvedValue({
        id: 'w1',
        productId: 'p1',
        variantId: null,
      });

      await service.moveToCart('u1', 'w1');

      expect(cart.addItem.mock.calls[0][1]).toMatchObject({ quantity: 1, variantId: undefined });

      prisma.wishlistItem.findFirst.mockResolvedValue(null);
      await expect(service.moveToCart('u1', 'ghost')).rejects.toMatchObject({
        code: 'RESOURCE.NOT_FOUND',
      });
    });
  });
});
