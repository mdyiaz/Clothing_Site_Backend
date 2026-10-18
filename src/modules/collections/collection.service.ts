import { Injectable } from '@nestjs/common';
import { Collection, Prisma } from '@prisma/client';
import { BaseService } from '../../common/base/base.service';
import { AppException } from '../../common/exceptions/app.exception';
import { slugify } from '../../common/utils/slug';
import { liveNow } from '../../common/utils/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CollectionRepository } from './collection.repository';

/** How many products an AUTO collection resolves on the storefront. */
const AUTO_LIMIT = 50;

const STOREFRONT_PRODUCT_SELECT = {
  id: true,
  name: true,
  slug: true,
  basePrice: true,
  compareAtPrice: true,
  discountPercent: true,
  primaryImageUrl: true,
  primaryVideoUrl: true,
  totalStock: true,
  totalSold: true,
  isFeatured: true,
} satisfies Prisma.ProductSelect;

@Injectable()
export class CollectionService extends BaseService<Collection> {
  protected readonly resourceName = 'Collection';
  protected readonly sortableFields = ['sortOrder', 'name', 'createdAt'];
  protected readonly searchFields = ['name', 'slug', 'description'];
  protected override readonly defaultSort: Prisma.CollectionOrderByWithRelationInput = {
    sortOrder: 'asc',
  };
  protected override readonly includeOnList = {
    _count: { select: { products: true } },
  };
  protected override readonly includeOnDetail = {
    products: {
      orderBy: { sortOrder: 'asc' as const },
      include: { product: { select: STOREFRONT_PRODUCT_SELECT } },
    },
  };

  constructor(
    repository: CollectionRepository,
    private readonly prisma: PrismaService,
  ) {
    super(repository);
  }

  // -------------------------------------------------------------------------
  // Storefront (public)
  // -------------------------------------------------------------------------

  /** Every collection that is live right now — the navbar / landing-page list. */
  async findLive(): Promise<Collection[]> {
    return this.repository.findMany({
      where: { isActive: true, ...liveNow() },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        bannerUrl: true,
        thumbnail: true,
        type: true,
        startsAt: true,
        endsAt: true,
        sortOrder: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /** Live detail by slug (`/collections/:slug`) with its resolved products. */
  async findLiveBySlug(slug: string): Promise<Collection & { resolvedProducts: unknown[] }> {
    const collection = await this.repository.findOne({ slug, isActive: true, ...liveNow() });
    if (!collection) throw AppException.notFound(this.resourceName);

    const resolvedProducts = await this.resolveProducts(collection);
    return { ...collection, resolvedProducts };
  }

  /**
   * Products a collection shows right now.
   *  - MANUAL       → admin hand-picked join rows
   *  - AUTO_SALE    → products with compareAtPrice > basePrice, biggest discount first
   *  - AUTO_NEW     → newest products
   *  - AUTO_TRENDING→ best sellers
   */
  async resolveProducts(collection: Pick<Collection, 'id' | 'type'>, limit = AUTO_LIMIT): Promise<unknown[]> {
    const liveProduct = { isActive: true, deletedAt: null } satisfies Prisma.ProductWhereInput;

    switch (collection.type) {
      case 'AUTO_SALE':
        return this.prisma.product.findMany({
          where: { ...liveProduct, compareAtPrice: { not: null }, discountPercent: { not: null } },
          orderBy: [{ discountPercent: 'desc' }, { totalSold: 'desc' }],
          take: limit,
          select: STOREFRONT_PRODUCT_SELECT,
        });
      case 'AUTO_NEW':
        return this.prisma.product.findMany({
          where: liveProduct,
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: STOREFRONT_PRODUCT_SELECT,
        });
      case 'AUTO_TRENDING':
        return this.prisma.product.findMany({
          where: liveProduct,
          orderBy: { totalSold: 'desc' },
          take: limit,
          select: STOREFRONT_PRODUCT_SELECT,
        });
      default: {
        const rows = await this.prisma.collectionProduct.findMany({
          where: { collectionId: collection.id, product: liveProduct },
          orderBy: { sortOrder: 'asc' },
          take: limit,
          include: { product: { select: STOREFRONT_PRODUCT_SELECT } },
        });
        return rows.map((row) => row.product);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Admin helpers
  // -------------------------------------------------------------------------

  /** Replace / add / remove the hand-picked product set of a MANUAL collection. */
  async setProducts(
    collectionId: string,
    productIds: string[],
    mode: 'replace' | 'add' | 'remove',
  ): Promise<{ collectionId: string; count: number; mode: string }> {
    await this.findById(collectionId);

    if (mode !== 'remove' && productIds.length > 0) {
      const found = await this.prisma.product.count({
        where: { id: { in: productIds }, deletedAt: null },
      });
      if (found !== productIds.length) {
        throw AppException.badRequest(
          'COLLECTION.UNKNOWN_PRODUCT',
          'One or more products no longer exist.',
          { field: 'productIds' },
        );
      }
    }

    if (mode === 'remove') {
      const removed = await this.prisma.collectionProduct.deleteMany({
        where: { collectionId, productId: { in: productIds } },
      });
      return { collectionId, count: removed.count, mode };
    }

    if (mode === 'replace') {
      await this.prisma.collectionProduct.deleteMany({ where: { collectionId } });
    }

    let nextOrder =
      mode === 'add'
        ? (await this.prisma.collectionProduct.count({ where: { collectionId } })) * 10
        : 0;

    let count = 0;
    for (const productId of productIds) {
      const existing = await this.prisma.collectionProduct.findUnique({
        where: { collectionId_productId: { collectionId, productId } },
      });
      if (existing) continue;
      await this.prisma.collectionProduct.create({
        data: { collectionId, productId, sortOrder: nextOrder },
      });
      count += 1;
      nextOrder += 10;
    }

    return { collectionId, count, mode };
  }

  // -------------------------------------------------------------------------
  // Hooks
  // -------------------------------------------------------------------------

  protected override async beforeCreate(data: Record<string, any>): Promise<void> {
    data.slug = (data.slug as string) || slugify(data.name);
    await this.assertSlugUnique(data.slug);
    data.sortOrder ??= 0;
    data.isActive ??= true;
    this.assertWindow(data);
  }

  protected override async beforeUpdate(id: string, data: Record<string, any>): Promise<void> {
    if (data.slug) {
      await this.assertSlugUnique(data.slug, id);
    } else if (data.name) {
      const current = await this.repository.findById(id);
      if (current && current.slug === slugify(current.name)) {
        data.slug = slugify(data.name);
      }
    }

    const current = await this.repository.findById(id);
    this.assertWindow({
      startsAt: 'startsAt' in data ? data.startsAt : current?.startsAt,
      endsAt: 'endsAt' in data ? data.endsAt : current?.endsAt,
    });
  }

  protected override async beforeDelete(id: string): Promise<void> {
    const linked = await this.prisma.navbarItem.count({ where: { collectionId: id } });
    if (linked > 0) {
      throw AppException.conflict(
        'COLLECTION.IN_NAVBAR',
        'This collection is used by the navbar. Remove that menu entry first.',
      );
    }
  }

  private async assertSlugUnique(slug?: string, excludeId?: string): Promise<void> {
    if (!slug) return;
    const existing = await this.repository.findOne({ slug });
    if (existing && existing.id !== excludeId) {
      throw AppException.conflict(
        'COLLECTION.SLUG_TAKEN',
        `The URL "/collections/${slug}" is already used by another collection.`,
      );
    }
  }

  private assertWindow(data: { startsAt?: Date | null; endsAt?: Date | null }): void {
    if (data.startsAt && data.endsAt && data.startsAt >= data.endsAt) {
      throw AppException.badRequest(
        'COLLECTION.BAD_WINDOW',
        'The end date must be after the start date.',
        { field: 'endsAt', action: 'focus' },
      );
    }
  }
}
