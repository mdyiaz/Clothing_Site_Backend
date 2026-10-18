import { Collection } from '@prisma/client';
import { CollectionService } from './collection.service';
import { CollectionRepository } from './collection.repository';

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

function collection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: 'col1',
    name: 'Eid Collection',
    slug: 'eid-collection',
    description: null,
    type: 'MANUAL',
    bannerUrl: null,
    thumbnail: null,
    startsAt: null,
    endsAt: null,
    sortOrder: 0,
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Collection;
}

describe('CollectionService', () => {
  let repository: MockRepository;
  let prisma: PrismaLike;
  let service: CollectionService;

  beforeEach(() => {
    repository = {
      supportsSoftDelete: true,
      findById: jest.fn(),
      findOne: jest.fn(),
      findMany: jest.fn(),
      findAndCount: jest.fn(),
      findCursor: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      count: jest.fn(),
    };
    prisma = {
      product: { count: jest.fn(), findMany: jest.fn() },
      collectionProduct: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
      },
      navbarItem: { count: jest.fn() },
    };
    service = new CollectionService(
      repository as unknown as CollectionRepository,
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

  // ── storefront ────────────────────────────────────────────────────────────

  describe('storefront reads', () => {
    it('findLive only returns active collections inside their window', async () => {
      repository.findMany.mockResolvedValue([]);

      await service.findLive();

      const args = repository.findMany.mock.calls[0][0];
      expect(args.where.isActive).toBe(true);
      expect(args.where.AND).toHaveLength(2); // startsAt open, endsAt open
      expect(args.select).toMatchObject({ id: true, slug: true, bannerUrl: true });
    });

    it('findLiveBySlug resolves MANUAL products from the join table', async () => {
      repository.findOne.mockResolvedValue(collection());
      prisma.collectionProduct.findMany.mockResolvedValue([
        { product: { id: 'p1', name: 'Panjabi' } },
        { product: { id: 'p2', name: 'Kameez' } },
      ]);

      const result = await service.findLiveBySlug('eid-collection');

      expect(repository.findOne.mock.calls[0][0]).toMatchObject({
        slug: 'eid-collection',
        isActive: true,
      });
      expect(result.resolvedProducts).toEqual([
        { id: 'p1', name: 'Panjabi' },
        { id: 'p2', name: 'Kameez' },
      ]);
    });

    it('findLiveBySlug 404s when the collection is not live', async () => {
      repository.findOne.mockResolvedValue(null);
      await expect(service.findLiveBySlug('hidden')).rejects.toMatchObject({
        code: 'RESOURCE.NOT_FOUND',
      });
    });
  });

  describe('resolveProducts (AUTO types)', () => {
    it('AUTO_SALE ranks by biggest discount', async () => {
      prisma.product.findMany.mockResolvedValue([]);

      await service.resolveProducts({ id: 'c', type: 'AUTO_SALE' } as Collection);

      expect(prisma.product.findMany.mock.calls[0][0]).toMatchObject({
        where: { isActive: true, compareAtPrice: { not: null } },
        orderBy: [{ discountPercent: 'desc' }, { totalSold: 'desc' }],
        take: 50,
      });
    });

    it('AUTO_NEW ranks by newest', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      await service.resolveProducts({ id: 'c', type: 'AUTO_NEW' } as Collection);
      expect(prisma.product.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
    });

    it('AUTO_TRENDING ranks by totalSold', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      await service.resolveProducts({ id: 'c', type: 'AUTO_TRENDING' } as Collection);
      expect(prisma.product.findMany.mock.calls[0][0].orderBy).toEqual({ totalSold: 'desc' });
    });

    it('MANUAL reads join rows and maps to their products', async () => {
      prisma.collectionProduct.findMany.mockResolvedValue([
        { product: { id: 'p1' } },
        { product: { id: 'p2' } },
      ]);

      const products = await service.resolveProducts({ id: 'col1', type: 'MANUAL' } as Collection);

      expect(prisma.collectionProduct.findMany.mock.calls[0][0].where).toMatchObject({
        collectionId: 'col1',
        product: { isActive: true, deletedAt: null },
      });
      expect(products).toEqual([{ id: 'p1' }, { id: 'p2' }]);
    });
  });

  // ── setProducts ───────────────────────────────────────────────────────────

  describe('setProducts', () => {
    beforeEach(() => {
      repository.findById.mockResolvedValue(collection());
    });

    it('replace wipes the join table and re-creates in payload order', async () => {
      prisma.product.count.mockResolvedValue(2);
      prisma.collectionProduct.deleteMany.mockResolvedValue({ count: 5 });
      prisma.collectionProduct.findUnique.mockResolvedValue(null);
      prisma.collectionProduct.create.mockResolvedValue({});

      const result = await service.setProducts('col1', ['p1', 'p2'], 'replace');

      expect(prisma.collectionProduct.deleteMany).toHaveBeenCalledWith({
        where: { collectionId: 'col1' },
      });
      expect(prisma.collectionProduct.create).toHaveBeenNthCalledWith(1, {
        data: { collectionId: 'col1', productId: 'p1', sortOrder: 0 },
      });
      expect(prisma.collectionProduct.create).toHaveBeenNthCalledWith(2, {
        data: { collectionId: 'col1', productId: 'p2', sortOrder: 10 },
      });
      expect(result).toEqual({ collectionId: 'col1', count: 2, mode: 'replace' });
    });

    it('add continues the sortOrder after the existing rows', async () => {
      prisma.product.count.mockResolvedValue(1);
      prisma.collectionProduct.count.mockResolvedValue(3);
      prisma.collectionProduct.findUnique.mockResolvedValue(null);
      prisma.collectionProduct.create.mockResolvedValue({});

      await service.setProducts('col1', ['p3'], 'add');

      expect(prisma.collectionProduct.create.mock.calls[0][0].data.sortOrder).toBe(30); // 3*10
      expect(prisma.collectionProduct.deleteMany).not.toHaveBeenCalled();
    });

    it('add skips products already in the collection', async () => {
      prisma.product.count.mockResolvedValue(2);
      prisma.collectionProduct.count.mockResolvedValue(0);
      prisma.collectionProduct.findUnique
        .mockResolvedValueOnce({ id: 'join1' }) // p1 already linked
        .mockResolvedValueOnce(null);
      prisma.collectionProduct.create.mockResolvedValue({});

      const result = await service.setProducts('col1', ['p1', 'p2'], 'add');

      expect(prisma.collectionProduct.create).toHaveBeenCalledTimes(1);
      expect(result.count).toBe(1);
    });

    it('remove deletes only the given product ids', async () => {
      prisma.collectionProduct.deleteMany.mockResolvedValue({ count: 2 });

      const result = await service.setProducts('col1', ['p1', 'p2'], 'remove');

      expect(prisma.collectionProduct.deleteMany).toHaveBeenCalledWith({
        where: { collectionId: 'col1', productId: { in: ['p1', 'p2'] } },
      });
      expect(result).toEqual({ collectionId: 'col1', count: 2, mode: 'remove' });
      expect(prisma.product.count).not.toHaveBeenCalled(); // existence check skipped on remove
    });

    it('rejects when a product no longer exists', async () => {
      prisma.product.count.mockResolvedValue(1); // 2 requested, 1 alive

      const error = await expectRejection(service.setProducts('col1', ['p1', 'p2'], 'replace'));
      expect(error.code).toBe('COLLECTION.UNKNOWN_PRODUCT');
      expect(prisma.collectionProduct.deleteMany).not.toHaveBeenCalled();
    });

    it('404s for a missing collection', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.setProducts('nope', [], 'replace')).rejects.toMatchObject({
        code: 'RESOURCE.NOT_FOUND',
      });
    });
  });

  // ── create / update / delete hooks ────────────────────────────────────────

  describe('create (hooks)', () => {
    it('derives slug, applies defaults and passes the window check', async () => {
      repository.findOne.mockResolvedValue(null);
      repository.create.mockResolvedValue(collection({ id: 'new' }));

      await service.create({ name: 'Eid Collection' });

      const persisted = repository.create.mock.calls[0][0];
      expect(persisted.slug).toBe('eid-collection');
      expect(persisted.sortOrder).toBe(0);
      expect(persisted.isActive).toBe(true);
    });

    it('rejects a duplicate slug', async () => {
      repository.findOne.mockResolvedValue(collection({ id: 'other' }));

      const error = await expectRejection(
        service.create({ name: 'Eid Collection', slug: 'eid-collection' }),
      );
      expect(error.code).toBe('COLLECTION.SLUG_TAKEN');
      expect(error.getStatus()).toBe(409);
    });

    it('rejects a window that ends before it starts', async () => {
      const error = await expectRejection(
        service.create({
          name: 'Flash',
          startsAt: new Date('2026-06-10'),
          endsAt: new Date('2026-06-01'),
        }),
      );
      expect(error.code).toBe('COLLECTION.BAD_WINDOW');
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('update (hooks)', () => {
    it('keeps a customised slug on rename', async () => {
      repository.findById.mockResolvedValue(
        collection({ slug: 'handpicked', name: 'Eid Collection' }),
      );
      repository.findOne.mockResolvedValue(null);
      repository.update.mockResolvedValue(collection());

      await service.update('col1', { name: 'Renamed' });

      expect(repository.update.mock.calls[0][1].slug).toBeUndefined();
    });

    it('follows an auto-derived slug on rename', async () => {
      repository.findById.mockResolvedValue(collection()); // slug === slugify(name)
      repository.findOne.mockResolvedValue(null);
      repository.update.mockResolvedValue(collection());

      await service.update('col1', { name: 'Ramadan' });

      expect(repository.update.mock.calls[0][1].slug).toBe('ramadan');
    });

    it('validates the merged window against the stored row', async () => {
      repository.findById.mockResolvedValue(
        collection({ startsAt: new Date('2026-06-10'), endsAt: null }),
      );
      repository.findOne.mockResolvedValue(null);

      const error = await expectRejection(
        service.update('col1', { endsAt: new Date('2026-06-01') }),
      );
      expect(error.code).toBe('COLLECTION.BAD_WINDOW');
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('remove (hooks)', () => {
    it('blocks deletion while the collection is used by the navbar', async () => {
      repository.findById.mockResolvedValue(collection());
      prisma.navbarItem.count.mockResolvedValue(2);

      const error = await expectRejection(service.remove('col1'));
      expect(error.code).toBe('COLLECTION.IN_NAVBAR');
      expect(error.getStatus()).toBe(409);
      expect(repository.softDelete).not.toHaveBeenCalled();
    });

    it('deletes an unused collection', async () => {
      repository.findById.mockResolvedValue(collection());
      prisma.navbarItem.count.mockResolvedValue(0);
      repository.softDelete.mockResolvedValue(collection());

      await service.remove('col1');

      expect(repository.softDelete).toHaveBeenCalledWith('col1');
    });
  });
});
