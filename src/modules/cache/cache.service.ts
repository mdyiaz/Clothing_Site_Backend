import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

/**
 * Small in-memory LRU cache with per-entry TTL.
 *
 * Same async interface a Redis-backed implementation would expose, so swapping
 * `get`/`set` internals for ioredis later is a drop-in change.
 *
 * Usage:
 *   const facets = await this.cache.getOrSet(key, 300, () => this.compute(query));
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly store = new Map<string, CacheEntry>();
  private readonly maxEntries: number;
  private readonly timer: NodeJS.Timeout;
  private hits = 0;
  private misses = 0;

  constructor() {
    this.maxEntries = Number(process.env.CACHE_MAX_ITEMS ?? 2000);
    this.timer = setInterval(() => this.prune(), 60_000);
    this.timer.unref();
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);

    if (!entry) {
      this.misses += 1;
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      this.misses += 1;
      return undefined;
    }

    // LRU touch: re-insert so the oldest key stays at the front of the Map
    this.store.delete(key);
    this.store.set(key, entry);
    this.hits += 1;
    return entry.value as T;
  }

  async set(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
    if (this.store.has(key)) {
      this.store.delete(key);
    }

    while (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next();
      if (oldest.done) break;
      this.store.delete(oldest.value);
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + Math.max(1, ttlSeconds) * 1000,
    });
  }

  /** Read-through helper: returns the cached value or computes and stores it. */
  async getOrSet<T>(key: string, ttlSeconds: number, factory: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) return cached;

    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  /** Invalidates every key that starts with `prefix` (e.g. `facets:` after a product write). */
  async deletePrefix(prefix: string): Promise<number> {
    let removed = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  stats(): { size: number; hits: number; misses: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      size: this.store.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? 0 : Number((this.hits / total).toFixed(3)),
    };
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
    this.store.clear();
  }

  private prune(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
        removed += 1;
      }
    }

    if (removed > 0) {
      this.logger.debug(`Cache prune removed ${removed} expired entries`);
    }
  }
}
