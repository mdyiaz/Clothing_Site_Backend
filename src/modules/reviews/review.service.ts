import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, Review } from '@prisma/client';
import { BaseService } from '../../common/base/base.service';
import { PaginatedResult, buildMeta } from '../../common/base/paginated-result';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReviewDto, QueryReviewDto } from './dto/review.dto';
import { ReviewRepository } from './review.repository';

const REVIEWER_INCLUDE = {
  user: { select: { id: true, fullName: true, avatarUrl: true } },
} satisfies Prisma.ReviewInclude;

export interface ReviewSummary {
  productId: string;
  total: number;
  average: number;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

@Injectable()
export class ReviewService extends BaseService<Review> {
  protected readonly resourceName = 'Review';
  protected readonly sortableFields = ['createdAt', 'rating'];
  protected readonly searchFields = ['title', 'comment'];
  protected override readonly defaultSort: Prisma.ReviewOrderByWithRelationInput = {
    createdAt: 'desc',
  };
  protected override readonly includeOnList = REVIEWER_INCLUDE;
  protected override readonly includeOnDetail = REVIEWER_INCLUDE;

  constructor(
    repository: ReviewRepository,
    private readonly prisma: PrismaService,
  ) {
    super(repository);
  }

  protected override async buildWhere(query: QueryReviewDto): Promise<Prisma.ReviewWhereInput> {
    const where = (await super.buildWhere(query)) as Prisma.ReviewWhereInput;
    if (query.productId) where.productId = query.productId;
    if (query.rating) where.rating = query.rating;
    if (query.isApproved !== undefined) {
      where.isApproved = query.isApproved === 'true' || query.isApproved === '1';
    }
    return where;
  }

  // -------------------------------------------------------------------------
  // Storefront (public) — approved reviews only
  // -------------------------------------------------------------------------

  async listForProduct(productId: string, query: QueryReviewDto): Promise<PaginatedResult<Review>> {
    if (!productId) {
      throw AppException.badRequest('REVIEW.PRODUCT_REQUIRED', 'A productId is required.', {
        field: 'productId',
      });
    }
    const scoped = Object.assign(new QueryReviewDto(), query, { productId, isApproved: 'true' });
    return this.findAll(scoped);
  }

  async summary(productId: string): Promise<ReviewSummary> {
    if (!productId) {
      throw AppException.badRequest('REVIEW.PRODUCT_REQUIRED', 'A productId is required.', {
        field: 'productId',
      });
    }
    const rows = await this.prisma.review.groupBy({
      by: ['rating'],
      where: { productId, isApproved: true },
      _count: true,
    });

    const distribution: ReviewSummary['distribution'] = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    let total = 0;
    let sum = 0;
    for (const row of rows) {
      const bucket = String(row.rating) as keyof ReviewSummary['distribution'];
      distribution[bucket] = row._count;
      total += row._count;
      sum += row.rating * row._count;
    }

    return {
      productId,
      total,
      average: total > 0 ? Math.round((sum / total) * 10) / 10 : 0,
      distribution,
    };
  }

  // -------------------------------------------------------------------------
  // Customer
  // -------------------------------------------------------------------------

  async createForUser(userId: string, dto: CreateReviewDto): Promise<Review> {
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, deletedAt: null },
      select: { id: true, isActive: true },
    });
    if (!product || !product.isActive) {
      throw AppException.badRequest('REVIEW.UNKNOWN_PRODUCT', 'That product is no longer available.', {
        field: 'productId',
      });
    }

    const existing = await this.prisma.review.findFirst({
      where: { userId, productId: dto.productId },
      select: { id: true },
    });
    if (existing) {
      throw AppException.conflict('REVIEW.ALREADY_REVIEWED', 'You have already reviewed this product.');
    }

    const isVerified = await this.hasPurchased(userId, dto.productId);

    const created = await this.repository.create({
      userId,
      productId: dto.productId,
      orderId: dto.orderId ?? null,
      rating: dto.rating,
      title: dto.title ?? null,
      comment: dto.comment ?? null,
      images: (dto.images as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      isVerified,
      isApproved: false,
    });
    return this.transform(created);
  }

  async listMine(userId: string, query: QueryReviewDto): Promise<PaginatedResult<Review>> {
    const where = (await this.buildWhere(query)) as Prisma.ReviewWhereInput;
    const { rows, total } = await this.repository.findAndCount({
      where: { ...where, userId },
      orderBy: this.buildOrderBy(query),
      skip: query.skip,
      take: query.limit,
      include: REVIEWER_INCLUDE,
    });
    return new PaginatedResult(rows.map((row) => this.transform(row)), buildMeta(total, query.page, query.limit));
  }

  async removeMine(userId: string, id: string): Promise<{ id: string }> {
    const review = await this.prisma.review.findFirst({ where: { id, userId }, select: { id: true } });
    if (!review) throw AppException.notFound(this.resourceName);
    await this.repository.delete(id);
    return { id };
  }

  // -------------------------------------------------------------------------
  // Admin moderation
  // -------------------------------------------------------------------------

  async setApproval(id: string, isApproved: boolean): Promise<Review> {
    await this.findById(id);
    const updated = await this.repository.update(id, { isApproved });
    return this.transform(updated);
  }

  async remove(id: string): Promise<Review> {
    return super.remove(id);
  }

  private async hasPurchased(userId: string, productId: string): Promise<boolean> {
    const found = await this.prisma.orderItem.findFirst({
      where: { productId, order: { userId, status: OrderStatus.DELIVERED } },
      select: { id: true },
    });
    return found !== null;
  }
}
