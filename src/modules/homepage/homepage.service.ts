import { Injectable } from '@nestjs/common';
import { HomepageSection, HomepageSectionMedia, Prisma, SectionSourceType } from '@prisma/client';
import { BaseService } from '../../common/base/base.service';
import { AppException } from '../../common/exceptions/app.exception';
import { liveNow } from '../../common/utils/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { HomepageRepository } from './homepage.repository';

/** Products returned per section on the storefront (carousel / grid). */
const PRODUCT_LIMIT = 12;
const CACHE_TTL = 60;

const PRODUCT_SELECT = {
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
  isActive: true,
} satisfies Prisma.ProductSelect;

export type StorefrontSection = HomepageSection & {
  media: HomepageSectionMedia[];
  products: unknown[];
};

@Injectable()
export class HomepageService extends BaseService<HomepageSection> {
  protected readonly resourceName = 'Homepage section';
  protected readonly sortableFields = ['sortOrder', 'createdAt'];
  protected override readonly defaultSort: Prisma.HomepageSectionOrderByWithRelationInput = {
    sortOrder: 'asc',
  };
  protected override readonly includeOnList = {
    media: {
      orderBy: [{ position: 'asc' as const }, { sortOrder: 'asc' as const }],
    },
  };
  protected override readonly includeOnDetail = {
    media: {
      orderBy: [{ position: 'asc' as const }, { sortOrder: 'asc' as const }],
    },
    items: {
      orderBy: { sortOrder: 'asc' as const },
      include: { product: { select: PRODUCT_SELECT } },
    },
  };

  constructor(
    repository: HomepageRepository,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {
    super(repository);
  }

  // -------------------------------------------------------------------------
  // Storefront (public)
  // -------------------------------------------------------------------------

  /** The full homepage payload the Next.js renderer streams to shoppers. */
  async getStorefront(pageKey = 'home'): Promise<StorefrontSection[]> {
    return this.cache.getOrSet(`homepage:${pageKey}`, CACHE_TTL, async () => {
      const sections = await this.prisma.homepageSection.findMany({
        where: { pageKey, isActive: true, ...liveNow() },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          media: {
            where: { isActive: true },
            orderBy: [{ position: 'asc' }, { sortOrder: 'asc' }],
          },
        },
      });

      return Promise.all(
        sections.map(async (section) => ({
          ...section,
          products: await this.resolveProducts(section),
        })),
      );
    });
  }

  /**
   * Content source per section:
   *  - MANUAL            → admin hand-picked `HomepageSectionItem` rows
   *  - COLLECTION        → products of the linked collection
   *  - AUTO_TOP_SELLING  → biggest `totalSold`
   *  - AUTO_NEW_ARRIVALS → newest `createdAt`
   *  - AUTO_DISCOUNTED   → biggest `discountPercent`
   */
  private async resolveProducts(
    section: HomepageSection,
    limit = PRODUCT_LIMIT,
  ): Promise<Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>[] | unknown[]> {
    const liveProduct = { isActive: true, deletedAt: null } satisfies Prisma.ProductWhereInput;

    switch (section.sourceType) {
      case SectionSourceType.COLLECTION:
        if (!section.collectionId) return [];
        return this.prisma.collectionProduct.findMany({
          where: { collectionId: section.collectionId, product: liveProduct },
          orderBy: { sortOrder: 'asc' },
          take: limit,
          include: { product: { select: PRODUCT_SELECT } },
        }).then((rows) => rows.map((row) => row.product));

      case SectionSourceType.AUTO_TOP_SELLING:
        return this.prisma.product.findMany({
          where: liveProduct,
          orderBy: { totalSold: 'desc' },
          take: limit,
          select: PRODUCT_SELECT,
        });

      case SectionSourceType.AUTO_NEW_ARRIVALS:
        return this.prisma.product.findMany({
          where: liveProduct,
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: PRODUCT_SELECT,
        });

      case SectionSourceType.AUTO_DISCOUNTED:
        return this.prisma.product.findMany({
          where: { ...liveProduct, discountPercent: { not: null } },
          orderBy: { discountPercent: 'desc' },
          take: limit,
          select: PRODUCT_SELECT,
        });

      default: {
        const rows = await this.prisma.homepageSectionItem.findMany({
          where: { sectionId: section.id, product: liveProduct },
          orderBy: { sortOrder: 'asc' },
          take: limit,
          include: { product: { select: PRODUCT_SELECT } },
        });
        return rows.map((row) => row.product);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Admin
  // -------------------------------------------------------------------------

  async getAdmin(pageKey = 'home'): Promise<HomepageSection[]> {
    return this.repository.findMany({
      where: { pageKey },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: this.includeOnDetail,
    });
  }

  /** Drag-and-drop save: ids arrive in their new top-to-bottom order. */
  async reorder(sectionIds: string[]): Promise<{ count: number }> {
    const existing = await this.prisma.homepageSection.count({
      where: { id: { in: sectionIds } },
    });
    if (existing !== sectionIds.length) {
      throw AppException.badRequest(
        'HOMEPAGE.REORDER_MISMATCH',
        'One or more sections no longer exist. Refresh and try again.',
      );
    }

    await this.prisma.$transaction(
      sectionIds.map((id, index) =>
        this.prisma.homepageSection.update({ where: { id }, data: { sortOrder: index * 10 } }),
      ),
    );
    await this.invalidate();
    return { count: sectionIds.length };
  }

  /** Replace the hand-picked product items of a MANUAL section. */
  async setItems(sectionId: string, productIds: string[]): Promise<{ count: number }> {
    await this.findById(sectionId);

    if (productIds.length > 0) {
      const found = await this.prisma.product.count({
        where: { id: { in: productIds }, deletedAt: null },
      });
      if (found !== productIds.length) {
        throw AppException.badRequest(
          'HOMEPAGE.UNKNOWN_PRODUCT',
          'One or more products no longer exist.',
          { field: 'productIds' },
        );
      }
    }

    await this.prisma.homepageSectionItem.deleteMany({ where: { sectionId } });
    let order = 0;
    for (const productId of productIds) {
      await this.prisma.homepageSectionItem.create({
        data: { sectionId, productId, sortOrder: order },
      });
      order += 10;
    }
    await this.invalidate();
    return { count: productIds.length };
  }

  // -------------------------------------------------------------------------
  // Section media (the images/videos a banner-style section renders)
  // -------------------------------------------------------------------------

  async addMedia(sectionId: string, dto: Record<string, any>): Promise<HomepageSectionMedia> {
    await this.findById(sectionId);
    const media = await this.prisma.homepageSectionMedia.create({
      data: { ...dto, sectionId },
    });
    await this.invalidate();
    return media;
  }

  async updateMedia(
    sectionId: string,
    mediaId: string,
    dto: Record<string, any>,
  ): Promise<HomepageSectionMedia> {
    const existing = await this.prisma.homepageSectionMedia.findFirst({
      where: { id: mediaId, sectionId },
    });
    if (!existing) throw AppException.notFound('Section media');

    const media = await this.prisma.homepageSectionMedia.update({
      where: { id: mediaId },
      data: dto,
    });
    await this.invalidate();
    return media;
  }

  async removeMedia(sectionId: string, mediaId: string): Promise<{ id: string }> {
    const existing = await this.prisma.homepageSectionMedia.findFirst({
      where: { id: mediaId, sectionId },
    });
    if (!existing) throw AppException.notFound('Section media');

    await this.prisma.homepageSectionMedia.delete({ where: { id: mediaId } });
    await this.invalidate();
    return { id: mediaId };
  }

  // -------------------------------------------------------------------------
  // Hooks
  // -------------------------------------------------------------------------

  protected override async beforeCreate(data: Record<string, any>): Promise<void> {
    data.pageKey = (data.pageKey as string) || 'home';
    data.sortOrder ??= 0;
    data.isActive ??= true;
    data.sourceType ??= SectionSourceType.MANUAL;
    this.assertWindow(data);
    await this.assertSourceValid(data, 'create');
  }

  protected override async beforeUpdate(id: string, data: Record<string, any>): Promise<void> {
    const current = await this.repository.findById(id);
    if (!current) throw AppException.notFound(this.resourceName);

    this.assertWindow({
      startsAt: 'startsAt' in data ? data.startsAt : current.startsAt,
      endsAt: 'endsAt' in data ? data.endsAt : current.endsAt,
    });
    await this.assertSourceValid({ ...current, ...data }, 'update');
  }

  protected override async afterCreate(): Promise<void> {
    await this.invalidate();
  }

  protected override async afterUpdate(): Promise<void> {
    await this.invalidate();
  }

  protected override async afterDelete(): Promise<void> {
    await this.invalidate();
  }

  private async assertSourceValid(
    data: Record<string, any>,
    _op: 'create' | 'update',
  ): Promise<void> {
    const sourceType = (data.sourceType as SectionSourceType) ?? SectionSourceType.MANUAL;
    const collectionId = data.collectionId as string | null | undefined;

    if (sourceType === SectionSourceType.COLLECTION && !collectionId) {
      throw AppException.badRequest(
        'HOMEPAGE.COLLECTION_REQUIRED',
        'Choose a collection for this section.',
        { field: 'collectionId', action: 'focus' },
      );
    }
    if (collectionId) {
      const collection = await this.prisma.collection.findUnique({
        where: { id: collectionId },
        select: { id: true },
      });
      if (!collection) {
        throw AppException.badRequest(
          'HOMEPAGE.UNKNOWN_COLLECTION',
          'That collection no longer exists.',
          { field: 'collectionId', action: 'focus' },
        );
      }
    }
  }

  private assertWindow(data: { startsAt?: Date | null; endsAt?: Date | null }): void {
    if (data.startsAt && data.endsAt && data.startsAt >= data.endsAt) {
      throw AppException.badRequest(
        'HOMEPAGE.BAD_WINDOW',
        'The end date must be after the start date.',
        { field: 'endsAt', action: 'focus' },
      );
    }
  }

  private async invalidate(): Promise<void> {
    await this.cache.deletePrefix('homepage:');
  }
}
