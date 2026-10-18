import { Injectable } from '@nestjs/common';
import { Discount, DiscountScope, DiscountType, Prisma } from '@prisma/client';
import { BaseService } from '../../common/base/base.service';
import { AppException } from '../../common/exceptions/app.exception';
import { isLive } from '../../common/utils/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { DiscountRepository } from './discount.repository';
import { CreateCouponDto, QueryDiscountDto, UpdateCouponDto } from './dto/discount.dto';

/** A priced cart line the engine evaluates against a discount's scope. */
export interface DiscountLine {
  productId: string;
  price: number;
  quantity: number;
  total: number;
}

export interface DiscountContext {
  userId?: string;
  lines: DiscountLine[];
  subtotal: number;
  shippingAmount: number;
}

export interface DiscountOutcome {
  couponCode: string;
  couponId: string;
  discountId: string;
  name: string;
  description: string;
  /** Money taken off the item subtotal (৳). */
  productDiscount: number;
  /** Money taken off shipping (৳) — full shipping cost when `freeShipping`. */
  shippingDiscount: number;
  freeShipping: boolean;
}

interface LineWithDiscount {
  productDiscount: number;
  shippingDiscount: number;
}

@Injectable()
export class DiscountService extends BaseService<Discount> {
  protected readonly resourceName = 'Discount';
  protected readonly sortableFields = ['createdAt', 'name', 'value', 'currentUsage'];
  protected readonly searchFields = ['name', 'description'];
  protected override readonly defaultSort: Prisma.DiscountOrderByWithRelationInput = {
    createdAt: 'desc',
  };
  protected override readonly includeOnList = { _count: { select: { coupons: true } } };
  protected override readonly includeOnDetail = { coupons: { orderBy: { createdAt: 'asc' as const } } };

  constructor(
    repository: DiscountRepository,
    private readonly prisma: PrismaService,
  ) {
    super(repository);
  }

  // -------------------------------------------------------------------------
  // Admin — discounts
  // -------------------------------------------------------------------------

  protected override async buildWhere(query: QueryDiscountDto): Promise<Prisma.DiscountWhereInput> {
    const where = (await super.buildWhere(query)) as Prisma.DiscountWhereInput;
    if (query.scope) where.scope = query.scope;
    if (query.type) where.type = query.type;
    if (query.isActive !== undefined) where.isActive = query.isActive === 'true' || query.isActive === '1';
    return where;
  }

  protected override beforeCreate(data: Record<string, any>): void {
    data.isActive ??= true;
    data.currentUsage ??= 0;
    this.assertShape(data);
    this.assertWindow(data);
  }

  protected override async beforeUpdate(id: string, data: Record<string, any>): Promise<void> {
    const current = await this.repository.findById(id);
    if (!current) throw AppException.notFound(this.resourceName);
    this.assertShape({ ...current, ...data });
    this.assertWindow({
      startsAt: 'startsAt' in data ? data.startsAt : current.startsAt,
      endsAt: 'endsAt' in data ? data.endsAt : current.endsAt,
    });
  }

  // -------------------------------------------------------------------------
  // Admin — coupons (child of a discount)
  // -------------------------------------------------------------------------

  async listCoupons(discountId: string) {
    await this.findById(discountId);
    return this.prisma.coupon.findMany({
      where: { discountId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createCoupon(discountId: string, dto: CreateCouponDto) {
    await this.findById(discountId);
    const code = dto.code.trim().toUpperCase();
    const clash = await this.prisma.coupon.findUnique({ where: { code } });
    if (clash) {
      throw AppException.conflict(
        'DISCOUNT.CODE_TAKEN',
        `The coupon code "${code}" is already in use.`,
      );
    }
    return this.prisma.coupon.create({
      data: { code, discountId, isActive: dto.isActive ?? true },
    });
  }

  async updateCoupon(couponId: string, dto: UpdateCouponDto) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id: couponId } });
    if (!coupon) throw AppException.notFound('Coupon');

    const data: Prisma.CouponUpdateInput = {};
    if (dto.code !== undefined) {
      const code = dto.code.trim().toUpperCase();
      if (code !== coupon.code) {
        const clash = await this.prisma.coupon.findUnique({ where: { code } });
        if (clash) {
          throw AppException.conflict(
            'DISCOUNT.CODE_TAKEN',
            `The coupon code "${code}" is already in use.`,
          );
        }
      }
      data.code = code;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    return this.prisma.coupon.update({ where: { id: couponId }, data });
  }

  async removeCoupon(couponId: string): Promise<{ id: string }> {
    const coupon = await this.prisma.coupon.findUnique({ where: { id: couponId } });
    if (!coupon) throw AppException.notFound('Coupon');
    await this.prisma.coupon.delete({ where: { id: couponId } });
    return { id: couponId };
  }

  // -------------------------------------------------------------------------
  // Engine — validate a coupon against a priced context
  // -------------------------------------------------------------------------

  /**
   * Resolves a coupon code into a concrete discount for the given cart.
   * Reads-only — call `redeem()` inside the checkout transaction to consume it.
   * Throws a typed `DISCOUNT.*` AppException when the coupon cannot apply.
   */
  async validate(code: string, ctx: DiscountContext): Promise<DiscountOutcome> {
    const normalized = code.trim().toUpperCase();
    if (!normalized) throw AppException.badRequest('DISCOUNT.CODE_REQUIRED', 'Enter a coupon code.');

    const coupon = await this.prisma.coupon.findUnique({
      where: { code: normalized },
      include: { discount: true },
    });
    if (!coupon || !coupon.isActive || !coupon.discount.isActive) {
      throw AppException.badRequest('DISCOUNT.COUPON_INVALID', 'That coupon code is not valid.');
    }

    const discount = coupon.discount;
    if (!isLive(discount)) {
      throw AppException.badRequest('DISCOUNT.NOT_ACTIVE', 'That coupon is not active right now.');
    }

    if (discount.totalUsageLimit != null && discount.currentUsage >= discount.totalUsageLimit) {
      throw AppException.badRequest('DISCOUNT.USAGE_EXHAUSTED', 'This coupon has reached its usage limit.');
    }

    if (ctx.userId && discount.perUserLimit != null) {
      const used = await this.prisma.userCoupon.findUnique({
        where: { userId_couponId: { userId: ctx.userId, couponId: coupon.id } },
        select: { usedCount: true },
      });
      if ((used?.usedCount ?? 0) >= discount.perUserLimit) {
        throw AppException.badRequest('DISCOUNT.USER_LIMIT_REACHED', 'You have already used this coupon.');
      }
    }

    if (discount.minPurchaseAmount != null && ctx.subtotal < discount.minPurchaseAmount) {
      throw AppException.badRequest(
        'DISCOUNT.MIN_PURCHASE',
        `Add ${discount.minPurchaseAmount - ctx.subtotal} more to use this coupon.`,
      );
    }

    const totalQty = ctx.lines.reduce((sum, line) => sum + line.quantity, 0);
    if (discount.minQuantity != null && totalQty < discount.minQuantity) {
      throw AppException.badRequest(
        'DISCOUNT.MIN_QUANTITY',
        `Add at least ${discount.minQuantity} item(s) to use this coupon.`,
      );
    }

    const eligibleLines = await this.resolveEligibleLines(discount, ctx.lines);
    const eligibleSubtotal = eligibleLines.reduce((sum, line) => sum + line.total, 0);
    if (eligibleLines.length === 0) {
      throw AppException.badRequest(
        'DISCOUNT.NO_ELIGIBLE_ITEMS',
        'This coupon does not apply to anything in your cart.',
      );
    }

    const { productDiscount, shippingDiscount } = this.compute(discount, eligibleLines, eligibleSubtotal, ctx.shippingAmount);

    return {
      couponCode: coupon.code,
      couponId: coupon.id,
      discountId: discount.id,
      name: discount.name,
      description: discount.description ?? discount.name,
      productDiscount,
      shippingDiscount,
      freeShipping: discount.type === DiscountType.FREE_SHIPPING,
    };
  }

  /** Consumes the coupon — bumps every usage counter inside the checkout transaction. */
  async redeem(
    tx: Prisma.TransactionClient,
    outcome: DiscountOutcome,
    userId?: string,
  ): Promise<void> {
    await tx.discount.update({
      where: { id: outcome.discountId },
      data: { currentUsage: { increment: 1 } },
    });
    await tx.coupon.update({
      where: { id: outcome.couponId },
      data: { usageCount: { increment: 1 } },
    });
    if (userId) {
      await tx.userCoupon.upsert({
        where: { userId_couponId: { userId, couponId: outcome.couponId } },
        create: { userId, couponId: outcome.couponId, usedCount: 1 },
        update: { usedCount: { increment: 1 } },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async resolveEligibleLines(discount: Discount, lines: DiscountLine[]): Promise<DiscountLine[]> {
    switch (discount.scope) {
      case DiscountScope.CART:
        return lines;
      case DiscountScope.PRODUCT:
        return lines.filter((line) => line.productId === discount.productId);
      case DiscountScope.COLLECTION: {
        if (!discount.collectionId) return [];
        const rows = await this.prisma.collectionProduct.findMany({
          where: { collectionId: discount.collectionId },
          select: { productId: true },
        });
        const ids = new Set(rows.map((row) => row.productId));
        return lines.filter((line) => ids.has(line.productId));
      }
      case DiscountScope.CATEGORY: {
        if (!discount.categoryId) return [];
        const ids = await this.categoryWithDescendants(discount.categoryId);
        const rows = await this.prisma.productCategory.findMany({
          where: { categoryId: { in: [...ids] } },
          select: { productId: true },
        });
        const productIds = new Set(rows.map((row) => row.productId));
        return lines.filter((line) => productIds.has(line.productId));
      }
      default:
        return [];
    }
  }

  private async categoryWithDescendants(categoryId: string): Promise<string[]> {
    const children = await this.prisma.category.findMany({
      where: { parentId: categoryId },
      select: { id: true },
    });
    return [categoryId, ...children.map((child) => child.id)];
  }

  private compute(
    discount: Discount,
    eligibleLines: DiscountLine[],
    eligibleSubtotal: number,
    shippingAmount: number,
  ): LineWithDiscount {
    switch (discount.type) {
      case DiscountType.FREE_SHIPPING:
        return { productDiscount: 0, shippingDiscount: shippingAmount };

      case DiscountType.PERCENTAGE: {
        let amount = Math.round((eligibleSubtotal * discount.value) / 100);
        if (discount.maxDiscountAmount != null) amount = Math.min(amount, discount.maxDiscountAmount);
        return { productDiscount: this.clamp(amount, eligibleSubtotal), shippingDiscount: 0 };
      }

      case DiscountType.FIXED_AMOUNT:
        return { productDiscount: this.clamp(discount.value, eligibleSubtotal), shippingDiscount: 0 };

      case DiscountType.BUY_X_GET_Y: {
        const freeUnits = Math.max(discount.value, 0);
        const amount = this.cheapestUnitsValue(eligibleLines, freeUnits);
        return { productDiscount: this.clamp(amount, eligibleSubtotal), shippingDiscount: 0 };
      }

      default:
        throw AppException.badRequest('DISCOUNT.TYPE_UNSUPPORTED', 'That discount type cannot be applied.');
    }
  }

  /** Sum of the `count` cheapest individual units across eligible lines. */
  private cheapestUnitsValue(lines: DiscountLine[], count: number): number {
    if (count <= 0) return 0;
    const unitPrices: number[] = [];
    for (const line of lines) {
      for (let i = 0; i < line.quantity; i += 1) unitPrices.push(line.price);
    }
    unitPrices.sort((a, b) => a - b);
    return unitPrices.slice(0, count).reduce((sum, price) => sum + price, 0);
  }

  private clamp(amount: number, ceiling: number): number {
    return Math.max(0, Math.min(Math.round(amount), Math.max(ceiling, 0)));
  }

  private assertShape(data: Record<string, any>): void {
    if (data.type === DiscountType.PERCENTAGE && (data.value < 1 || data.value > 100)) {
      throw AppException.badRequest(
        'DISCOUNT.BAD_VALUE',
        'A percentage discount must be between 1 and 100.',
        { field: 'value' },
      );
    }
    if (data.scope === DiscountScope.PRODUCT && !data.productId) {
      throw AppException.badRequest('DISCOUNT.TARGET_REQUIRED', 'Pick a product for a product discount.', {
        field: 'productId',
      });
    }
    if (data.scope === DiscountScope.CATEGORY && !data.categoryId) {
      throw AppException.badRequest('DISCOUNT.TARGET_REQUIRED', 'Pick a category for a category discount.', {
        field: 'categoryId',
      });
    }
    if (data.scope === DiscountScope.COLLECTION && !data.collectionId) {
      throw AppException.badRequest('DISCOUNT.TARGET_REQUIRED', 'Pick a collection for a collection discount.', {
        field: 'collectionId',
      });
    }
    if (data.type === DiscountType.BUY_X_GET_Y && (data.minQuantity == null || data.value < 1)) {
      throw AppException.badRequest(
        'DISCOUNT.BAD_BOGO',
        'Buy X Get Y needs a minimum quantity (X) and a free-item count (Y).',
        { field: 'value' },
      );
    }
  }

  private assertWindow(data: { startsAt?: Date | null; endsAt?: Date | null }): void {
    if (data.startsAt && data.endsAt && data.startsAt >= data.endsAt) {
      throw AppException.badRequest('DISCOUNT.BAD_WINDOW', 'The end date must be after the start date.', {
        field: 'endsAt',
        action: 'focus',
      });
    }
  }
}
