import { CacheService } from '../cache/cache.service';
import { Product } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { ProductsService } from './products.service';
import { ProductsRepository } from './products.repository';

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

type PrismaLike = Record<string, Record<string, jest.Mock>>;

const PRODUCT: Partial<Product> = {
  id: 'p1',
  name: 'Classic Panjabi',
  slug: 'classic-panjabi',
  sku: 'RP-001',
  basePrice: 800,
  compareAtPrice: 1000,
  discountPercent: 20,
  totalSold: 5,
  totalStock: 7,
  isActive: true,
  deletedAt: null,
};

describe('ProductsService', () => {
  let repository: MockRepository;
  let prisma: PrismaLike;
  let cache: { deletePrefix: jest.Mock; getOrSet: jest.Mock };
  let service: ProductsService;

  beforeEach(() => {
    repository = {
      supportsSoftDelete: true,
      findById: jest.fn(),
      findOne: jest.fn(),
      findMany: jest.fn(),
      findAndCount: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
      findCursor: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      count: jest.fn(),
    };
    prisma = {
      productVariant: { findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn() },
      product: { update: jest.fn() },
    };
    cache = {
      deletePrefix: jest.fn().mockResolvedValue(0),
      getOrSet: jest.fn(),
    };
    service = new ProductsService(
      repository as unknown as ProductsRepository,
      cache as unknown as CacheService,
      prisma as any,
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

  // ── toPersistence (nested writes) ─────────────────────────────────────────

  describe('toPersistence', () => {
    it('maps categoryIds into a replace-all relation write', async () => {
      const data = await (service as any).toPersistence({ categoryIds: ['c1', 'c2'] }, 'create');

      expect(data.categories).toEqual({
        deleteMany: {},
        create: [{ categoryId: 'c1' }, { categoryId: 'c2' }],
      });
    });

    it('never trusts client-provided discountPercent or totalSold', async () => {
      const data = await (service as any).toPersistence(
        { discountPercent: 99, totalSold: 9999 },
        'create',
      );

      expect(data.discountPercent).toBeUndefined();
      expect(data.totalSold).toBeUndefined();
    });

    it('splits media entries into create (new) and update (has id) buckets', async () => {
      const data = await (service as any).toPersistence(
        {
          media: [
            { id: 'm1', sortOrder: 0 },
            { publicId: 'shop/new', sortOrder: 1 },
            { sortOrder: 2 }, // no id, no publicId → dropped
          ],
        },
        'create',
      );

      expect(data.media).toEqual({
        update: [{ where: { id: 'm1' }, data: { sortOrder: 0 } }],
        create: [{ publicId: 'shop/new', sortOrder: 1 }],
      });
    });

    it('honours removeMediaIds / removeVariantIds on update only', async () => {
      const updated = await (service as any).toPersistence(
        { removeMediaIds: ['m1'], removeVariantIds: ['v1'] },
        'update',
      );
      expect(updated.media.delete).toEqual([{ id: 'm1' }]);
      expect(updated.variants.delete).toEqual([{ id: 'v1' }]);

      const created = await (service as any).toPersistence(
        { removeMediaIds: ['m1'], removeVariantIds: ['v1'] },
        'create',
      );
      expect(created.media).toBeUndefined();
      expect(created.variants).toBeUndefined();
    });

    it('splits variants into create/update buckets and nests fresh variant media', async () => {
      const data = await (service as any).toPersistence(
        {
          variants: [
            { id: 'v1', size: 'M', stock: 3 },
            { size: 'L', stock: 2, media: [{ id: 'old', publicId: 'x' }] },
          ],
        },
        'create',
      );

      expect(data.variants.update).toEqual([
        { where: { id: 'v1' }, data: { size: 'M', stock: 3 } },
      ]);
      // variant-level media is always NEW rows — ids are stripped
      expect(data.variants.create).toEqual([
        {
          size: 'L',
          stock: 2,
          media: { create: [{ publicId: 'x' }] },
        },
      ]);
    });

    it('drops totalStock when variants are written (recomputed afterwards)', async () => {
      const data = await (service as any).toPersistence(
        { totalStock: 99, variants: [{ size: 'M', stock: 1 }] },
        'create',
      );
      expect(data.variants).toBeDefined();
      expect(data.totalStock).toBeUndefined();
    });

    it('keeps manual totalStock for single-SKU products', async () => {
      const data = await (service as any).toPersistence({ totalStock: 42 }, 'create');
      expect(data.totalStock).toBe(42);
    });
  });

  // ── variant SKU guard ─────────────────────────────────────────────────────

  describe('variant SKU guards', () => {
    it('rejects duplicate SKUs inside one payload', async () => {
      const error = await expectRejection(
        service.create({ name: 'X', variants: [{ sku: 'A' }, { sku: 'A' }] }),
      );
      expect(error.code).toBe('PRODUCT.VARIANT_SKU_DUPLICATE');
      expect(prisma.productVariant.findMany).not.toHaveBeenCalled();
    });

    it('rejects a SKU already owned by another product', async () => {
      prisma.productVariant.findMany.mockResolvedValue([{ id: 'v9', sku: 'TAKEN' }]);

      const error = await expectRejection(
        service.create({ name: 'X', variants: [{ sku: 'TAKEN' }] }),
      );
      expect(error.code).toBe('PRODUCT.VARIANT_SKU_TAKEN');
      expect(error.getStatus()).toBe(409);
    });

    it('allows keeping a variant that already belongs to this product', async () => {
      prisma.productVariant.findMany.mockResolvedValue([{ id: 'v9', sku: 'MINE' }]);
      repository.findOne.mockResolvedValue(null);
      repository.create.mockResolvedValue({ ...PRODUCT, id: 'new' });
      prisma.productVariant.aggregate.mockResolvedValue({ _sum: { stock: 3 }, _count: 1 });

      await service.create({
        name: 'X',
        variants: [{ id: 'v9', sku: 'MINE', stock: 1 }],
      });

      expect(repository.create).toHaveBeenCalled();
    });
  });

  // ── create / update hooks ─────────────────────────────────────────────────

  describe('create', () => {
    it('derives slug + discount and runs stock sync + cache invalidation', async () => {
      repository.findOne.mockResolvedValue(null);
      repository.create.mockResolvedValue({ ...PRODUCT, id: 'new' });
      prisma.productVariant.aggregate.mockResolvedValue({ _sum: { stock: 9 }, _count: 2 });

      const created = await service.create({
        name: 'Classic Panjabi',
        sku: 'RP-001',
        basePrice: 800,
        compareAtPrice: 1000,
      });

      const persisted = repository.create.mock.calls[0][0];
      expect(persisted.slug).toBe('classic-panjabi');
      expect(persisted.discountPercent).toBe(20);
      expect(created.id).toBe('new');

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'new' },
        data: { totalStock: 9 },
      });
      expect(cache.deletePrefix).toHaveBeenCalledWith('facets:');
      expect(cache.deletePrefix).toHaveBeenCalledWith('search:');
    });

    it('nulls the discount when compareAtPrice does not beat basePrice', async () => {
      repository.findOne.mockResolvedValue(null);
      repository.create.mockResolvedValue({ ...PRODUCT, id: 'new' });
      prisma.productVariant.aggregate.mockResolvedValue({ _sum: null, _count: 0 });

      await service.create({ name: 'No Deal', basePrice: 500, compareAtPrice: 500 });

      expect(repository.create.mock.calls[0][0].discountPercent).toBeNull();
      expect(prisma.product.update).not.toHaveBeenCalled(); // _count 0 → skip stock sync
    });

    it('rejects a duplicate product slug', async () => {
      repository.findOne
        .mockResolvedValueOnce({ id: 'other' }) // slug probe
        .mockResolvedValue(null);

      const error = await expectRejection(service.create({ name: 'Classic Panjabi' }));
      expect(error.code).toBe('PRODUCT.SLUG_TAKEN');
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate SKU', async () => {
      repository.findOne
        .mockResolvedValueOnce(null) // slug probe
        .mockResolvedValueOnce({ id: 'other' }); // sku probe

      const error = await expectRejection(
        service.create({ name: 'Fresh', sku: 'RP-001' }),
      );
      expect(error.code).toBe('PRODUCT.SKU_TAKEN');
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('keeps a customised slug across renames', async () => {
      repository.findById.mockResolvedValue({
        ...PRODUCT,
        slug: 'handpicked-slug',
        name: 'Classic Panjabi',
      });
      repository.findOne.mockResolvedValue(null);
      repository.update.mockResolvedValue(PRODUCT);
      prisma.productVariant.aggregate.mockResolvedValue({ _sum: { stock: 0 }, _count: 0 });

      await service.update('p1', { name: 'Renamed', basePrice: 700 });

      const patch = repository.update.mock.calls[0][1];
      expect(patch.slug).toBeUndefined();
      expect(patch.discountPercent).toBe(30); // (1000-700)/1000
    });

    it('follows the rename when the slug was still auto-derived', async () => {
      repository.findById.mockResolvedValue({
        ...PRODUCT,
        name: 'Classic Panjabi',
        slug: 'classic-panjabi', // === slugify(name)
      });
      repository.findOne.mockResolvedValue(null);
      repository.update.mockResolvedValue(PRODUCT);
      prisma.productVariant.aggregate.mockResolvedValue({ _sum: { stock: 0 }, _count: 0 });

      await service.update('p1', { name: 'Eid Panjabi' });

      expect(repository.update.mock.calls[0][1].slug).toBe('eid-panjabi');
    });
  });

  // ── reads ─────────────────────────────────────────────────────────────────

  describe('reads', () => {
    it('storefront scope always hides inactive products', async () => {
      await service.findAll({ q: 'panjabi' } as any);

      const where = repository.findAndCount.mock.calls[0][0].where;
      expect(where.isActive).toBe(true);
      expect(where.OR).toBeDefined();
    });

    it('admin scope includes inactive products and only hides deleted', async () => {
      await service.findAll({ q: 'panjabi', admin: true } as any);

      const where = repository.findAndCount.mock.calls[0][0].where;
      expect(where.deletedAt).toBeNull();
      expect(where.isActive).toBeUndefined();
      expect(where.OR).toEqual([
        { name: { contains: 'panjabi', mode: 'insensitive' } },
        { sku: { contains: 'panjabi', mode: 'insensitive' } },
        { brand: { contains: 'panjabi', mode: 'insensitive' } },
        { description: { contains: 'panjabi', mode: 'insensitive' } },
      ]);
    });

    it('switches to cursor mode when a cursor is present', async () => {
      await service.findAll({ cursor: 'abc', limit: 10 } as any);

      expect(repository.findCursor).toHaveBeenCalledWith(
        expect.objectContaining({ take: 11 }),
      );
      expect(repository.findAndCount).not.toHaveBeenCalled();
    });

    it('findBySlug only returns active products', async () => {
      repository.findOne.mockResolvedValue(PRODUCT);

      await service.findBySlug('classic-panjabi');

      expect(repository.findOne.mock.calls[0][0]).toEqual({
        slug: 'classic-panjabi',
        isActive: true,
        deletedAt: null,
      });
    });
  });

  describe('error surface', () => {
    it('uses the standard envelope codes', async () => {
      repository.findById.mockResolvedValue(null);
      const error = await expectRejection(service.update('missing', { name: 'x' }));
      expect(error).toBeInstanceOf(AppException);
      expect(error.code).toBe('RESOURCE.NOT_FOUND');
      expect(error.getStatus()).toBe(404);
    });
  });
});
