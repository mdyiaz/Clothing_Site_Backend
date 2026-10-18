import { CacheService } from '../cache/cache.service';
import { HomepageService } from './homepage.service';
import { HomepageRepository } from './homepage.repository';

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

type PrismaLike = Record<string, any>;

function section(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    title: 'Hero',
    pageKey: 'home',
    sourceType: 'MANUAL',
    collectionId: null,
    sortOrder: 0,
    isActive: true,
    startsAt: null,
    endsAt: null,
    ...overrides,
  };
}

describe('HomepageService', () => {
  let repository: MockRepository;
  let prisma: PrismaLike;
  let cache: CacheService;
  let service: HomepageService;

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
      homepageSection: { findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
      homepageSectionItem: { findMany: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
      homepageSectionMedia: { create: jest.fn(), update: jest.fn(), delete: jest.fn(), findFirst: jest.fn() },
      product: { count: jest.fn(), findMany: jest.fn() },
      collectionProduct: { findMany: jest.fn() },
      collection: { findUnique: jest.fn() },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    cache = new CacheService();
    service = new HomepageService(
      repository as unknown as HomepageRepository,
      prisma as any,
      cache,
    );
  });

  afterEach(() => {
    cache.onModuleDestroy();
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

  describe('getStorefront', () => {
    it('loads live sections for the page with active media', async () => {
      prisma.homepageSection.findMany.mockResolvedValue([]);

      await service.getStorefront();

      const args = prisma.homepageSection.findMany.mock.calls[0][0];
      expect(args.where).toMatchObject({ pageKey: 'home', isActive: true });
      expect(args.where.AND).toHaveLength(2); // schedule window
      expect(args.include.media).toMatchObject({ where: { isActive: true } });
    });

    it('resolves every source type into a products array', async () => {
      prisma.homepageSection.findMany.mockResolvedValue([
        section({ id: 'manual', sourceType: 'MANUAL' }),
        section({ id: 'top', sourceType: 'AUTO_TOP_SELLING' }),
        section({ id: 'linked', sourceType: 'COLLECTION', collectionId: 'col1' }),
        section({ id: 'orphan', sourceType: 'COLLECTION', collectionId: null }),
      ]);
      prisma.homepageSectionItem.findMany.mockResolvedValue([{ product: { id: 'p1' } }]);
      prisma.product.findMany.mockResolvedValue([{ id: 'p2' }]);
      prisma.collectionProduct.findMany.mockResolvedValue([{ product: { id: 'p3' } }]);

      const sections = await service.getStorefront();

      expect(sections[0].products).toEqual([{ id: 'p1' }]);
      expect(sections[1].products).toEqual([{ id: 'p2' }]);
      expect(prisma.product.findMany.mock.calls[0][0]).toMatchObject({
        orderBy: { totalSold: 'desc' },
        take: 12,
      });
      expect(sections[2].products).toEqual([{ id: 'p3' }]);
      expect(sections[3].products).toEqual([]); // COLLECTION without a link renders empty

      expect(prisma.homepageSectionItem.findMany.mock.calls[0][0].where).toMatchObject({
        sectionId: 'manual',
        product: { isActive: true, deletedAt: null },
      });
    });

    it('caches per pageKey', async () => {
      prisma.homepageSection.findMany.mockResolvedValue([]);

      await service.getStorefront('home');
      await service.getStorefront('home');
      expect(prisma.homepageSection.findMany).toHaveBeenCalledTimes(1);

      await service.getStorefront('sale');
      expect(prisma.homepageSection.findMany).toHaveBeenCalledTimes(2);
      expect(prisma.homepageSection.findMany.mock.calls[1][0].where.pageKey).toBe('sale');
    });
  });

  // ── create / update hooks ─────────────────────────────────────────────────

  describe('create (hooks)', () => {
    it('applies defaults and invalidates the storefront cache', async () => {
      prisma.homepageSection.findMany.mockResolvedValue([]);
      await service.getStorefront(); // prime cache
      expect(prisma.homepageSection.findMany).toHaveBeenCalledTimes(1);

      repository.create.mockResolvedValue(section({ id: 'new' }));
      await service.create({ title: 'Hero' });

      const persisted = repository.create.mock.calls[0][0];
      expect(persisted.pageKey).toBe('home');
      expect(persisted.sourceType).toBe('MANUAL');
      expect(persisted.sortOrder).toBe(0);
      expect(persisted.isActive).toBe(true);

      await service.getStorefront();
      expect(prisma.homepageSection.findMany).toHaveBeenCalledTimes(2); // invalidated
    });

    it('COLLECTION sections must name a collection', async () => {
      const error = await expectRejection(
        service.create({ title: 'Sale', sourceType: 'COLLECTION' }),
      );
      expect(error.code).toBe('HOMEPAGE.COLLECTION_REQUIRED');
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown collection', async () => {
      prisma.collection.findUnique.mockResolvedValue(null);
      const error = await expectRejection(
        service.create({ title: 'Sale', sourceType: 'COLLECTION', collectionId: 'ghost' }),
      );
      expect(error.code).toBe('HOMEPAGE.UNKNOWN_COLLECTION');
    });

    it('accepts a linked collection', async () => {
      prisma.collection.findUnique.mockResolvedValue({ id: 'col1' });
      repository.create.mockResolvedValue(section({ id: 'new' }));

      await service.create({ title: 'Sale', sourceType: 'COLLECTION', collectionId: 'col1' });

      expect(repository.create).toHaveBeenCalled();
    });

    it('rejects an inverted schedule window', async () => {
      const error = await expectRejection(
        service.create({
          title: 'Flash',
          startsAt: new Date('2026-06-10'),
          endsAt: new Date('2026-06-01'),
        }),
      );
      expect(error.code).toBe('HOMEPAGE.BAD_WINDOW');
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('update (hooks)', () => {
    it('404s for a missing section', async () => {
      repository.findById.mockResolvedValue(null);
      const error = await expectRejection(service.update('missing', { title: 'x' }));
      expect(error.code).toBe('RESOURCE.NOT_FOUND');
    });

    it('validates the merged schedule window', async () => {
      repository.findById.mockResolvedValue(section({ startsAt: new Date('2026-06-10') }));

      const error = await expectRejection(
        service.update('s1', { endsAt: new Date('2026-06-01') }),
      );
      expect(error.code).toBe('HOMEPAGE.BAD_WINDOW');
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  // ── reorder + items ───────────────────────────────────────────────────────

  describe('reorder', () => {
    it('writes 10-step sortOrder values and invalidates', async () => {
      prisma.homepageSection.findMany.mockResolvedValue([]);
      prisma.homepageSection.count.mockResolvedValue(2);

      const result = await service.reorder(['a', 'b']);

      expect(prisma.homepageSection.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'a' },
        data: { sortOrder: 0 },
      });
      expect(prisma.homepageSection.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'b' },
        data: { sortOrder: 10 },
      });
      expect(result).toEqual({ count: 2 });

      await service.getStorefront(); // invalidated → refetch
      expect(prisma.homepageSection.findMany).toHaveBeenCalledTimes(1);
    });

    it('rejects when a section id vanished', async () => {
      prisma.homepageSection.count.mockResolvedValue(1);
      const error = await expectRejection(service.reorder(['a', 'b']));
      expect(error.code).toBe('HOMEPAGE.REORDER_MISMATCH');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('setItems', () => {
    it('replaces the hand-picked products in order', async () => {
      repository.findById.mockResolvedValue(section());
      prisma.product.count.mockResolvedValue(2);
      prisma.homepageSectionItem.deleteMany.mockResolvedValue({ count: 3 });
      prisma.homepageSectionItem.create.mockResolvedValue({});

      const result = await service.setItems('s1', ['p1', 'p2']);

      expect(prisma.homepageSectionItem.deleteMany).toHaveBeenCalledWith({
        where: { sectionId: 's1' },
      });
      expect(prisma.homepageSectionItem.create).toHaveBeenNthCalledWith(1, {
        data: { sectionId: 's1', productId: 'p1', sortOrder: 0 },
      });
      expect(prisma.homepageSectionItem.create).toHaveBeenNthCalledWith(2, {
        data: { sectionId: 's1', productId: 'p2', sortOrder: 10 },
      });
      expect(result).toEqual({ count: 2 });
    });

    it('rejects unknown products', async () => {
      repository.findById.mockResolvedValue(section());
      prisma.product.count.mockResolvedValue(1);

      const error = await expectRejection(service.setItems('s1', ['p1', 'p2']));
      expect(error.code).toBe('HOMEPAGE.UNKNOWN_PRODUCT');
      expect(prisma.homepageSectionItem.deleteMany).not.toHaveBeenCalled();
    });

    it('404s for a missing section', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.setItems('ghost', [])).rejects.toMatchObject({
        code: 'RESOURCE.NOT_FOUND',
      });
    });
  });

  // ── section media ─────────────────────────────────────────────────────────

  describe('section media', () => {
    it('addMedia attaches media to an existing section', async () => {
      repository.findById.mockResolvedValue(section());
      prisma.homepageSectionMedia.create.mockResolvedValue({ id: 'm1' });

      await service.addMedia('s1', { publicId: 'hero.jpg', position: 'BACKGROUND' });

      expect(prisma.homepageSectionMedia.create).toHaveBeenCalledWith({
        data: { publicId: 'hero.jpg', position: 'BACKGROUND', sectionId: 's1' },
      });
    });

    it('addMedia 404s when the section does not exist', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.addMedia('ghost', {})).rejects.toMatchObject({
        code: 'RESOURCE.NOT_FOUND',
      });
    });

    it('updateMedia only touches media owned by that section', async () => {
      prisma.homepageSectionMedia.findFirst.mockResolvedValue(null);
      await expect(service.updateMedia('s1', 'm1', {})).rejects.toMatchObject({
        code: 'RESOURCE.NOT_FOUND',
        message: 'Section media was not found.',
      });

      prisma.homepageSectionMedia.findFirst.mockResolvedValue({ id: 'm1', sectionId: 's1' });
      prisma.homepageSectionMedia.update.mockResolvedValue({ id: 'm1' });

      await service.updateMedia('s1', 'm1', { sortOrder: 5 });

      expect(prisma.homepageSectionMedia.findFirst.mock.calls[0][0].where).toEqual({
        id: 'm1',
        sectionId: 's1',
      });
      expect(prisma.homepageSectionMedia.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { sortOrder: 5 },
      });
    });

    it('removeMedia 404s cross-section access and deletes owned media', async () => {
      prisma.homepageSectionMedia.findFirst.mockResolvedValue(null);
      await expect(service.removeMedia('s1', 'm1')).rejects.toMatchObject({
        code: 'RESOURCE.NOT_FOUND',
      });

      prisma.homepageSectionMedia.findFirst.mockResolvedValue({ id: 'm1', sectionId: 's1' });
      prisma.homepageSectionMedia.delete.mockResolvedValue({});

      await expect(service.removeMedia('s1', 'm1')).resolves.toEqual({ id: 'm1' });
      expect(prisma.homepageSectionMedia.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    });
  });
});
