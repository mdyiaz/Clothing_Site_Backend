import { Injectable } from '@nestjs/common';
import { StoreSetting } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';

const CACHE_TTL = 300;
const CACHE_KEY = 'settings:storefront';

/** `store.currency`, `vat.enabled`, … — lowercase root, dot-separated segments. */
const KEY_PATTERN = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+)+$/;

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** Public map for the storefront: `{ "store.currency": "BDT", … }`. */
  getPublic(): Promise<Record<string, unknown>> {
    return this.cache.getOrSet(CACHE_KEY, CACHE_TTL, async () => {
      const rows = await this.prisma.storeSetting.findMany();
      return Object.fromEntries(rows.map((row) => [row.key, row.value]));
    });
  }

  async getAdmin(): Promise<StoreSetting[]> {
    return this.prisma.storeSetting.findMany({ orderBy: { key: 'asc' } });
  }

  async getOne(key: string): Promise<{ key: string; value: unknown }> {
    const row = await this.prisma.storeSetting.findUnique({ where: { key } });
    if (!row) throw AppException.notFound('Setting');
    return { key: row.key, value: row.value };
  }

  /** Batch upsert — the settings screen saves every changed key in one call. */
  async upsertMany(settings: Record<string, unknown>): Promise<{ keys: string[] }> {
    const entries = Object.entries(settings);
    if (entries.length === 0) {
      throw AppException.badRequest('SETTINGS.EMPTY', 'No settings were provided.', {
        field: 'settings',
      });
    }

    const keys: string[] = [];
    for (const [key, value] of entries) {
      this.assertKey(key);
      this.assertValue(value);

      await this.prisma.storeSetting.upsert({
        where: { key },
        update: { value: value as never },
        create: { key, value: value as never },
      });
      keys.push(key);
    }

    await this.invalidate();
    return { keys };
  }

  async remove(key: string): Promise<{ key: string }> {
    this.assertKey(key);
    const existing = await this.prisma.storeSetting.findUnique({ where: { key } });
    if (!existing) throw AppException.notFound('Setting');

    await this.prisma.storeSetting.delete({ where: { key } });
    await this.invalidate();
    return { key };
  }

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  private assertKey(key: string): void {
    if (!KEY_PATTERN.test(key)) {
      throw AppException.badRequest(
        'SETTINGS.BAD_KEY',
        'Setting keys look like "store.currency" — lowercase root, dot-separated segments.',
        { field: 'settings' },
      );
    }
  }

  private assertValue(value: unknown): void {
    if (value === null) return;
    const type = typeof value;
    if (type === 'string' || type === 'boolean') return;
    if (type === 'number' && Number.isFinite(value)) return;
    if (type === 'object') return;

    throw AppException.badRequest(
      'SETTINGS.BAD_VALUE',
      'A setting value must be text, a number, true/false, or an object.',
      { field: 'settings' },
    );
  }

  private async invalidate(): Promise<void> {
    await this.cache.deletePrefix('settings:');
  }
}
