import { CacheService } from './cache.service';

describe('CacheService', () => {
  let cache: CacheService;

  beforeEach(() => {
    cache = new CacheService();
  });

  afterEach(() => {
    cache.onModuleDestroy();
    jest.useRealTimers();
  });

  describe('get / set', () => {
    it('round-trips a value', async () => {
      await cache.set('a', { hello: 'world' });
      await expect(cache.get('a')).resolves.toEqual({ hello: 'world' });
    });

    it('returns undefined for a missing key', async () => {
      await expect(cache.get('nope')).resolves.toBeUndefined();
    });

    it('expires entries once the TTL passes', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

      await cache.set('ttl', 'value', 2);
      await expect(cache.get('ttl')).resolves.toBe('value');

      jest.setSystemTime(new Date('2026-01-01T00:00:03.000Z'));
      await expect(cache.get('ttl')).resolves.toBeUndefined();
    });

    it('overwrites an existing key without growing', async () => {
      await cache.set('a', 1);
      await cache.set('a', 2);
      await expect(cache.get('a')).resolves.toBe(2);
      expect(cache.stats().size).toBe(1);
    });
  });

  describe('LRU behaviour', () => {
    it('evicts the oldest entry past maxEntries', async () => {
      const previous = process.env.CACHE_MAX_ITEMS;
      process.env.CACHE_MAX_ITEMS = '2';
      const small = new CacheService();

      await small.set('first', 1);
      await small.set('second', 2);
      await small.set('third', 3);

      await expect(small.get('first')).resolves.toBeUndefined();
      await expect(small.get('third')).resolves.toBe(3);

      small.onModuleDestroy();
      if (previous === undefined) delete process.env.CACHE_MAX_ITEMS;
      else process.env.CACHE_MAX_ITEMS = previous;
    });

    it('a read re-touches the entry so it survives one more eviction', async () => {
      const previous = process.env.CACHE_MAX_ITEMS;
      process.env.CACHE_MAX_ITEMS = '2';
      const small = new CacheService();

      await small.set('first', 1);
      await small.set('second', 2);
      await small.get('first'); // touch → 'second' becomes the oldest
      await small.set('third', 3);

      await expect(small.get('first')).resolves.toBe(1);
      await expect(small.get('second')).resolves.toBeUndefined();

      small.onModuleDestroy();
      if (previous === undefined) delete process.env.CACHE_MAX_ITEMS;
      else process.env.CACHE_MAX_ITEMS = previous;
    });
  });

  describe('getOrSet', () => {
    it('computes once and serves the cached value afterwards', async () => {
      const factory = jest.fn().mockResolvedValue('computed');

      await expect(cache.getOrSet('k', 60, factory)).resolves.toBe('computed');
      await expect(cache.getOrSet('k', 60, factory)).resolves.toBe('computed');

      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('propagates factory errors without caching them', async () => {
      const factory = jest.fn().mockRejectedValue(new Error('boom'));

      await expect(cache.getOrSet('k', 60, factory)).rejects.toThrow('boom');
      await expect(cache.getOrSet('k', 60, factory)).rejects.toThrow('boom');
      expect(factory).toHaveBeenCalledTimes(2);
      await expect(cache.get('k')).resolves.toBeUndefined();
    });
  });

  describe('deletePrefix', () => {
    it('removes only matching keys and reports the count', async () => {
      await cache.set('facets:a', 1);
      await cache.set('facets:b', 2);
      await cache.set('search:a', 3);

      await expect(cache.deletePrefix('facets:')).resolves.toBe(2);

      await expect(cache.get('facets:a')).resolves.toBeUndefined();
      await expect(cache.get('search:a')).resolves.toBe(3);
    });

    it('is a no-op for an unknown prefix', async () => {
      await cache.set('a', 1);
      await expect(cache.deletePrefix('zzz:')).resolves.toBe(0);
      await expect(cache.get('a')).resolves.toBe(1);
    });
  });

  describe('clear + stats', () => {
    it('clear empties the store', async () => {
      await cache.set('a', 1);
      await cache.clear();
      await expect(cache.get('a')).resolves.toBeUndefined();
      expect(cache.stats().size).toBe(0);
    });

    it('stats tracks hits, misses and hit rate', async () => {
      await cache.set('a', 1);
      await cache.get('a');
      await cache.get('missing');

      const stats = cache.stats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });
  });
});
