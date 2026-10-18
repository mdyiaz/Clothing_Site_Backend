import { Logger } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { SearchService } from './search.service';

type PrismaLike = Record<string, Record<string, jest.Mock>>;

describe('SearchService', () => {
  let prisma: PrismaLike;
  let cache: CacheService;
  let service: SearchService;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    prisma = {
      product: { findMany: jest.fn() },
      category: { findMany: jest.fn() },
      searchLog: { groupBy: jest.fn(), create: jest.fn() },
    };
    cache = new CacheService();
    service = new SearchService(prisma as any, cache);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cache.onModuleDestroy();
    warnSpy.mockRestore();
  });

  describe('suggestions', () => {
    it('returns active products + categories for the term', async () => {
      prisma.product.findMany.mockResolvedValue([
        { name: 'Cotton Panjabi', slug: 'cotton-panjabi', primaryImageUrl: 'x.jpg', basePrice: 900 },
      ]);
      prisma.category.findMany.mockResolvedValue([
        { name: 'Men Panjabi', slug: 'men-panjabi' },
      ]);

      const result = await service.suggestions({ q: 'Panjabi ', limit: 8 } as any);

      expect(result.products).toHaveLength(1);
      expect(result.categories).toEqual([{ name: 'Men Panjabi', slug: 'men-panjabi' }]);

      expect(prisma.product.findMany.mock.calls[0][0]).toMatchObject({
        where: {
          isActive: true,
          deletedAt: null,
          name: { contains: 'panjabi', mode: 'insensitive' },
        },
        take: 8,
      });
      expect(prisma.category.findMany.mock.calls[0][0]).toMatchObject({
        where: {
          OR: [
            { name: { contains: 'panjabi', mode: 'insensitive' } },
            { slug: { startsWith: 'panjabi' } },
          ],
        },
        take: 4,
      });
    });

    it('serves repeat queries from cache', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.category.findMany.mockResolvedValue([]);

      await service.suggestions({ q: 'panjabi', limit: 8 } as any);
      await service.suggestions({ q: '  PANJABI ', limit: 8 } as any); // normalised → same key

      expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.category.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('popular', () => {
    it('trims, drops 1-char queries and respects the limit', async () => {
      // groupBy comes back pre-sorted by the DB (orderBy _count desc)
      prisma.searchLog.groupBy.mockResolvedValue([
        { query: 'x', _count: 99 },
        { query: ' panjabi ', _count: 40 },
        { query: 'kurta', _count: 20 },
        { query: 'dress', _count: 5 },
      ]);

      const result = await service.popular(3);

      expect(result).toEqual([
        { query: 'panjabi', count: 40 },
        { query: 'kurta', count: 20 },
        { query: 'dress', count: 5 },
      ]);
      expect(prisma.searchLog.groupBy.mock.calls[0][0]).toMatchObject({ take: 9 }); // limit * 3
    });

    it('clamps the limit to 1..25', async () => {
      prisma.searchLog.groupBy.mockResolvedValue([]);

      await service.popular(500);
      expect(prisma.searchLog.groupBy.mock.calls[0][0].take).toBe(75); // 25 * 3

      await service.popular(0);
      expect(prisma.searchLog.groupBy.mock.calls[1][0].take).toBe(3); // 1 * 3
    });

    it('caches the ranking', async () => {
      prisma.searchLog.groupBy.mockResolvedValue([]);

      await service.popular(5);
      await service.popular(5);

      expect(prisma.searchLog.groupBy).toHaveBeenCalledTimes(1);
    });
  });

  describe('log', () => {
    it('persists the trimmed query with the user when known', async () => {
      prisma.searchLog.create.mockResolvedValue({});

      await service.log({ query: '  panjabi  ', resultCount: 12 }, 'u1');

      expect(prisma.searchLog.create).toHaveBeenCalledWith({
        data: { query: 'panjabi', userId: 'u1', resultCount: 12 },
      });
    });

    it('defaults to an anonymous log', async () => {
      prisma.searchLog.create.mockResolvedValue({});

      await service.log({ query: 'panjabi', resultCount: 0 });

      expect(prisma.searchLog.create.mock.calls[0][0].data.userId).toBeNull();
    });

    it('never lets analytics failures break the request', async () => {
      prisma.searchLog.create.mockRejectedValue(new Error('db down'));

      await expect(service.log({ query: 'panjabi', resultCount: 1 })).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
    });
  });
});
