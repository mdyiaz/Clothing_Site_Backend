import { CacheService } from '../cache/cache.service';
import { SettingsService } from './settings.service';

type PrismaLike = Record<string, Record<string, jest.Mock>>;

describe('SettingsService', () => {
  let prisma: PrismaLike;
  let cache: CacheService;
  let service: SettingsService;

  beforeEach(() => {
    prisma = {
      storeSetting: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
    };
    cache = new CacheService();
    service = new SettingsService(prisma as any, cache);
  });

  afterEach(() => {
    cache.onModuleDestroy();
  });

  describe('getPublic', () => {
    it('flattens rows into a key → value map', async () => {
      prisma.storeSetting.findMany.mockResolvedValue([
        { key: 'store.currency', value: 'BDT' },
        { key: 'vat.enabled', value: true },
      ]);

      await expect(service.getPublic()).resolves.toEqual({
        'store.currency': 'BDT',
        'vat.enabled': true,
      });
    });

    it('serves the storefront map from cache', async () => {
      prisma.storeSetting.findMany.mockResolvedValue([]);

      await service.getPublic();
      await service.getPublic();

      expect(prisma.storeSetting.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAdmin / getOne', () => {
    it('lists everything sorted by key', async () => {
      prisma.storeSetting.findMany.mockResolvedValue([]);
      await service.getAdmin();
      expect(prisma.storeSetting.findMany).toHaveBeenCalledWith({ orderBy: { key: 'asc' } });
    });

    it('returns one setting', async () => {
      prisma.storeSetting.findUnique.mockResolvedValue({ key: 'store.currency', value: 'BDT' });
      await expect(service.getOne('store.currency')).resolves.toEqual({
        key: 'store.currency',
        value: 'BDT',
      });
    });

    it('404s on an unknown key', async () => {
      prisma.storeSetting.findUnique.mockResolvedValue(null);
      await expect(service.getOne('nope.no')).rejects.toMatchObject({
        code: 'RESOURCE.NOT_FOUND',
        status: 404,
      });
    });
  });

  describe('upsertMany', () => {
    it('upserts every entry and invalidates the public map', async () => {
      prisma.storeSetting.findMany.mockResolvedValue([]);
      prisma.storeSetting.upsert.mockResolvedValue({});

      await service.getPublic(); // prime the storefront cache
      expect(prisma.storeSetting.findMany).toHaveBeenCalledTimes(1);

      const result = await service.upsertMany({
        'store.currency': 'BDT',
        'vat.enabled': false,
        'store.hours': { open: '10:00', close: '22:00' },
      });

      expect(result.keys).toEqual(['store.currency', 'vat.enabled', 'store.hours']);
      expect(prisma.storeSetting.upsert).toHaveBeenCalledTimes(3);
      expect(prisma.storeSetting.upsert.mock.calls[0][0]).toEqual({
        where: { key: 'store.currency' },
        update: { value: 'BDT' },
        create: { key: 'store.currency', value: 'BDT' },
      });

      // public map was cached by the first findMany → recompute after invalidate
      await service.getPublic();
      expect(prisma.storeSetting.findMany).toHaveBeenCalledTimes(2);
    });

    it('rejects an empty payload', async () => {
      await expect(service.upsertMany({})).rejects.toMatchObject({
        code: 'SETTINGS.EMPTY',
      });
      expect(prisma.storeSetting.upsert).not.toHaveBeenCalled();
    });

    it('rejects malformed keys before writing anything', async () => {
      const bad = ['no-dots', 'Store.currency', 'store.', 'store..currency', 'store.cu-rrent'];

      for (const key of bad) {
        await expect(service.upsertMany({ [key]: 'x' })).rejects.toMatchObject({
          code: 'SETTINGS.BAD_KEY',
        });
      }
      expect(prisma.storeSetting.upsert).not.toHaveBeenCalled();
    });

    it('accepts well-formed keys', async () => {
      prisma.storeSetting.upsert.mockResolvedValue({});
      await service.upsertMany({
        'store.currency': 'BDT',
        'vat.enabled': true,
        'checkout.min_order': 500,
        'seo.og_image': null,
      });
      expect(prisma.storeSetting.upsert).toHaveBeenCalledTimes(4);
    });

    it('rejects values that are not JSON-safe primitives', async () => {
      const badValues: unknown[] = [undefined, Number.NaN, Symbol('x'), () => undefined];

      for (const value of badValues) {
        await expect(service.upsertMany({ 'store.x': value })).rejects.toMatchObject({
          code: 'SETTINGS.BAD_VALUE',
        });
      }
      expect(prisma.storeSetting.upsert).not.toHaveBeenCalled();
    });

    it('allows null, numbers, booleans and objects', async () => {
      prisma.storeSetting.upsert.mockResolvedValue({});
      await service.upsertMany({ 'a.b': null, 'c.d': 1.5, 'e.f': true, 'g.h': { nested: 1 } });
      expect(prisma.storeSetting.upsert).toHaveBeenCalledTimes(4);
    });
  });

  describe('remove', () => {
    it('deletes an existing key and invalidates the cache', async () => {
      prisma.storeSetting.findUnique.mockResolvedValue({ key: 'old.key', value: 'x' });
      prisma.storeSetting.delete.mockResolvedValue({});
      prisma.storeSetting.findMany.mockResolvedValue([]);

      await service.remove('old.key');

      expect(prisma.storeSetting.delete).toHaveBeenCalledWith({ where: { key: 'old.key' } });

      await service.getPublic(); // cache was invalidated → refetch
      expect(prisma.storeSetting.findMany).toHaveBeenCalledTimes(1);
    });

    it('404s when the key does not exist', async () => {
      prisma.storeSetting.findUnique.mockResolvedValue(null);
      await expect(service.remove('missing.key')).rejects.toMatchObject({
        code: 'RESOURCE.NOT_FOUND',
      });
      expect(prisma.storeSetting.delete).not.toHaveBeenCalled();
    });

    it('validates the key format first', async () => {
      await expect(service.remove('BAD')).rejects.toMatchObject({ code: 'SETTINGS.BAD_KEY' });
      expect(prisma.storeSetting.findUnique).not.toHaveBeenCalled();
    });
  });
});
