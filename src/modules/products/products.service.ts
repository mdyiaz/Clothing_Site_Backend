import { Injectable } from '@nestjs/common';
import { Prisma, Product } from '@prisma/client';
import { BaseService } from '../../common/base/base.service';
import { PaginatedResult } from '../../common/base/paginated-result';
import { AppException } from '../../common/exceptions/app.exception';
import { slugify } from '../../common/utils/slug';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryProductDto } from './dto/query-product.dto';
import { buildProductOrderBy, buildProductWhere } from './product-filter.builder';
import { ProductsRepository } from './products.repository';

/** Query DTO + internal admin flag (never comes from the query string). */
export type ProductQuery = QueryProductDto & { admin?: boolean };

@Injectable()
export class ProductsService extends BaseService<Product> {
  protected readonly resourceName = 'Product';
  protected readonly sortableFields = ['createdAt', 'basePrice', 'totalSold', 'discountPercent'];
  protected readonly searchFields = ['name', 'sku', 'brand', 'description', 'shortDescription'];

  protected override readonly defaultSort: Prisma.ProductOrderByWithRelationInput = {
    createdAt: 'desc',
  };

  protected override readonly includeOnList = {
    media: {
      where: { isActive: true },
      orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
      take: 1,
    },
    variants: {
      select: {
        id: true,
        size: true,
        color: true,
        colorHex: true,
        price: true,
        compareAtPrice: true,
        stock: true,
        primaryImageUrl: true,
      },
    },
    categories: {
      select: { category: { select: { id: true, name: true, slug: true, gender: true } } },
    },
  };

  protected override readonly includeOnDetail = {
    media: { where: { isActive: true }, orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }] },
    variants: {
      orderBy: [{ size: 'asc' as const }, { color: 'asc' as const }],
      include: { media: { where: { isActive: true }, orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }] } },
    },
    categories: { include: { category: { select: { id: true, name: true, slug: true, gender: true, parentId: true } } } },
    collections: { include: { collection: { select: { id: true, name: true, slug: true } } } },
    tags: { select: { id: true, tag: true } },
  };

  constructor(
    repository: ProductsRepository,
    private readonly cache: CacheService,
    private readonly prisma: PrismaService,
  ) {
    super(repository);
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /** `cursor` in the query switches the storefront list into cursor mode. */
  override async findAll(query: ProductQuery): Promise<PaginatedResult<Product>> {
    if (query.cursor) {
      return super.findAllCursor(query);
    }
    return super.findAll(query);
  }

  /** Admin catalogue: includes inactive / soft-deleted-excluded products. */
  async findAllAdmin(query: ProductQuery) {
    const scope = query as ProductQuery;
    scope.admin = true;
    delete scope.cursor;
    return this.findAll(scope);
  }

  async findBySlug(slug: string): Promise<Product> {
    return this.findOne({ slug, isActive: true, deletedAt: null });
  }

  // -------------------------------------------------------------------------
  // Query shaping
  // -------------------------------------------------------------------------

  protected override async buildWhere(query: ProductQuery): Promise<Prisma.ProductWhereInput> {
    if (query.admin) {
      const where: Prisma.ProductWhereInput = { deletedAt: null };
      const term = (query.q ?? query.search)?.trim();
      if (term) {
        where.OR = [
          { name: { contains: term, mode: 'insensitive' } },
          { sku: { contains: term, mode: 'insensitive' } },
          { brand: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
        ];
      }
      return where;
    }

    return buildProductWhere(query);
  }

  protected override buildOrderBy(
    query: ProductQuery,
  ): Prisma.ProductOrderByWithRelationInput[] {
    return buildProductOrderBy(query);
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  /**
   * Flattens the DTO into a Prisma write payload.
   *
   * Nested collections:
   *  - `categoryIds` → replace the category links
   *  - `media[]`     → entries with `id` update, without `id` create;
   *                    `removeMediaIds` (update only) deletes
   *  - `variants[]`  → entries with `id` update, without `id` create;
   *                    `removeVariantIds` (update only) deletes
   *
   * `discountPercent` / `totalSold` are always computed server-side;
   * `totalStock` is recomputed from variant stock whenever a variant payload
   * is present (single-SKU products keep the manually entered number).
   */
  protected override async toPersistence(
    dto: Record<string, any>,
    op: 'create' | 'update',
  ): Promise<Record<string, any>> {
    const { categoryIds, variants, media, removeVariantIds, removeMediaIds, ...rest } = dto;
    const data: Record<string, any> = { ...rest };

    // computed server-side only — never trust a client-provided value
    delete data.discountPercent;
    delete data.totalSold;

    await this.assertVariantSkus(variants);

    if (Array.isArray(categoryIds)) {
      data.categories = {
        deleteMany: {},
        create: categoryIds.map((categoryId: string) => ({ categoryId })),
      };
    }

    const mediaPayload = this.buildMediaPayload(op, media, removeMediaIds);
    if (mediaPayload) data.media = mediaPayload;

    const variantPayload = this.buildVariantPayload(op, variants, removeVariantIds);
    if (variantPayload) {
      data.variants = variantPayload;
      // will be recomputed from the variant rows after the write
      delete data.totalStock;
    }

    return data;
  }

  private buildMediaPayload(
    op: 'create' | 'update',
    media: any,
    removeMediaIds: any,
  ): Record<string, any> | null {
    const payload: Record<string, any> = {};

    if (Array.isArray(media)) {
      const create: Record<string, any>[] = [];
      const update: { where: { id: string }; data: Record<string, any> }[] = [];

      for (const entry of media) {
        const { id, ...fields } = entry ?? {};
        if (id) update.push({ where: { id }, data: fields });
        else if (fields.publicId) create.push(fields);
      }

      if (create.length > 0) payload.create = create;
      if (update.length > 0) payload.update = update;
    }

    if (op === 'update' && Array.isArray(removeMediaIds) && removeMediaIds.length > 0) {
      payload.delete = removeMediaIds.map((id: string) => ({ id }));
    }

    return Object.keys(payload).length > 0 ? payload : null;
  }

  private buildVariantPayload(
    op: 'create' | 'update',
    variants: any,
    removeVariantIds: any,
  ): Record<string, any> | null {
    const payload: Record<string, any> = {};

    if (Array.isArray(variants)) {
      const create: Record<string, any>[] = [];
      const update: { where: { id: string }; data: Record<string, any> }[] = [];

      for (const entry of variants) {
        const { id, media, ...fields } = entry ?? {};
        // variant-level images are always NEW rows (removal goes via removeMediaIds)
        const nestedMedia = Array.isArray(media) && media.length > 0
          ? { media: { create: media.map((m: any) => stripKeys(m, ['id'])) } }
          : {};

        if (id) update.push({ where: { id }, data: { ...fields, ...nestedMedia } });
        else create.push({ ...fields, ...nestedMedia });
      }

      if (update.length > 0) payload.update = update;
      if (create.length > 0) payload.create = create;
    }

    if (op === 'update' && Array.isArray(removeVariantIds) && removeVariantIds.length > 0) {
      payload.delete = removeVariantIds.map((id: string) => ({ id }));
    }

    return Object.keys(payload).length > 0 ? payload : null;
  }

  /**
   * Slug rules (frontend builds `/products/:slug` from it):
   *  - create: admin slug if given, otherwise derived from the name;
   *  - update: an admin-customised slug is NEVER overwritten by a name change.
   */
  protected override async beforeCreate(data: Record<string, any>): Promise<void> {
    data.slug = (data.slug as string) || slugify(data.name ?? '');
    await this.assertSlugUnique(data.slug);
    await this.assertSkuUnique(data.sku);
    data.discountPercent = computeDiscountPercent(data.basePrice, data.compareAtPrice);
  }

  protected override async beforeUpdate(id: string, data: Record<string, any>): Promise<void> {
    if (data.sku) await this.assertSkuUnique(data.sku, id);

    const current = await this.repository.findById(id);
    if (!current) {
      throw AppException.notFound(this.resourceName);
    }

    if (data.slug) {
      await this.assertSlugUnique(data.slug, id);
    } else if (data.name && current.slug === slugify(current.name)) {
      // slug was auto-derived from the old name → follow the rename
      data.slug = slugify(data.name);
    }
    // else: admin set a custom slug earlier → keep it as-is

    const basePrice = data.basePrice ?? current.basePrice;
    const compareAtPrice =
      'compareAtPrice' in data ? (data.compareAtPrice as number | null) : current.compareAtPrice;

    data.discountPercent = computeDiscountPercent(basePrice, compareAtPrice);
  }

  // Any product write invalidates derived search data and refreshes stock.
  protected override async afterCreate(entity: Product): Promise<void> {
    await this.syncTotalStock(entity.id);
    await this.invalidateSearchCache();
  }

  protected override async afterUpdate(entity: Product): Promise<void> {
    await this.syncTotalStock(entity.id);
    await this.invalidateSearchCache();
  }

  protected override async afterDelete(): Promise<void> {
    await this.invalidateSearchCache();
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async assertSkuUnique(sku?: string, excludeId?: string): Promise<void> {
    if (!sku) return;

    const existing = await this.repository.findOne({ sku });
    if (existing && existing.id !== excludeId) {
      throw AppException.conflict('PRODUCT.SKU_TAKEN', `SKU "${sku}" is already in use.`);
    }
  }

  private async assertSlugUnique(slug?: string, excludeId?: string): Promise<void> {
    if (!slug) return;

    const existing = await this.repository.findOne({ slug });
    if (existing && existing.id !== excludeId) {
      throw AppException.conflict(
        'PRODUCT.SLUG_TAKEN',
        `The URL "/products/${slug}" is already used by another product.`,
      );
    }
  }

  /**
   * Variant SKUs are globally unique (`@unique`). Catches duplicates inside the
   * payload and clashes with variants already stored on other products.
   */
  private async assertVariantSkus(variants: unknown): Promise<void> {
    if (!Array.isArray(variants) || variants.length === 0) return;

    const entries = variants as { id?: string; sku?: string }[];
    const skus = entries.map((entry) => entry?.sku).filter((sku): sku is string => Boolean(sku));

    if (new Set(skus).size !== skus.length) {
      throw AppException.badRequest(
        'PRODUCT.VARIANT_SKU_DUPLICATE',
        'Two variants in this product share the same SKU.',
        { field: 'variants' },
      );
    }

    const keptIds = new Set(entries.filter((entry) => entry?.id).map((entry) => entry!.id));
    const existing = await this.prisma.productVariant.findMany({
      where: { sku: { in: skus } },
      select: { id: true, sku: true },
    });
    const clash = existing.find((row) => !keptIds.has(row.id));
    if (clash) {
      throw AppException.conflict(
        'PRODUCT.VARIANT_SKU_TAKEN',
        `Variant SKU "${clash.sku}" is already in use.`,
      );
    }
  }

  /** `totalStock` = Σ variant stock (skipped for single-SKU products). */
  private async syncTotalStock(productId: string): Promise<void> {
    const aggregate = await this.prisma.productVariant.aggregate({
      where: { productId },
      _sum: { stock: true },
      _count: true,
    });
    if (aggregate._count === 0) return;

    await this.prisma.product.update({
      where: { id: productId },
      data: { totalStock: aggregate._sum.stock ?? 0 },
    });
  }

  private async invalidateSearchCache(): Promise<void> {
    await this.cache.deletePrefix('facets:');
    await this.cache.deletePrefix('search:');
  }
}

/** Removes keys Prisma must never receive (ids handled by the payload itself). */
function stripKeys<T extends Record<string, any>>(obj: T, keys: string[]): Record<string, any> {
  const copy: Record<string, any> = { ...obj };
  for (const key of keys) delete copy[key];
  return copy;
}

/** ((compareAtPrice - basePrice) / compareAtPrice) * 100, rounded. */
function computeDiscountPercent(
  basePrice?: number,
  compareAtPrice?: number | null,
): number | null {
  if (!basePrice || !compareAtPrice) return null;
  if (compareAtPrice <= basePrice) return null;
  return Math.round(((compareAtPrice - basePrice) / compareAtPrice) * 100);
}
