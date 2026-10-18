import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { CartService } from '../cart/cart.service';

/**
 * Wishlists belong to signed-in users only — guests use the cart.
 * Every route needs a JWT but no role permission (like `GET /auth/me`),
 * so these handlers are allow-listed in the route-security contract.
 */
@Injectable()
export class WishlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
  ) {}

  async list(userId: string) {
    const rows = await this.prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { id: 'asc' },
      include: {
        product: {
          select: {
            id: true, name: true, slug: true, basePrice: true, compareAtPrice: true,
            primaryImageUrl: true, isActive: true, deletedAt: true, totalStock: true,
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      variantId: row.variantId,
      name: row.product.name,
      slug: row.product.slug,
      image: row.product.primaryImageUrl,
      price: row.product.basePrice,
      compareAtPrice: row.product.compareAtPrice,
      inStock: !row.product.deletedAt && row.product.isActive && row.product.totalStock > 0,
      available: !row.product.deletedAt && row.product.isActive,
    }));
  }

  /** Idempotent heart button: adds when absent, removes when present. */
  async toggle(userId: string, productId: string, variantId?: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true, isActive: true },
    });
    if (!product || !product.isActive) {
      throw AppException.badRequest('WISHLIST.PRODUCT_UNAVAILABLE', 'That product is no longer available.', {
        field: 'productId',
      });
    }
    if (variantId) {
      const variant = await this.prisma.productVariant.findFirst({
        where: { id: variantId, productId },
        select: { id: true },
      });
      if (!variant) {
        throw AppException.badRequest('WISHLIST.UNKNOWN_VARIANT', 'That variant does not exist for this product.', {
          field: 'variantId',
        });
      }
    }

    const existing = await this.prisma.wishlistItem.findFirst({
      where: { userId, productId, variantId: variantId ?? null },
    });
    if (existing) {
      await this.prisma.wishlistItem.delete({ where: { id: existing.id } });
      return { added: false, item: null };
    }

    const item = await this.prisma.wishlistItem.create({
      data: { userId, productId, variantId: variantId ?? null },
    });
    return { added: true, item: { id: item.id, productId, variantId: variantId ?? null } };
  }

  async remove(userId: string, itemId: string) {
    const existing = await this.prisma.wishlistItem.findFirst({ where: { id: itemId, userId } });
    if (!existing) throw AppException.notFound('Wishlist item');
    await this.prisma.wishlistItem.delete({ where: { id: existing.id } });
    return { id: existing.id };
  }

  /** Move a saved line into the user's cart, then drop it from the wishlist. */
  async moveToCart(userId: string, itemId: string, quantity = 1) {
    const existing = await this.prisma.wishlistItem.findFirst({ where: { id: itemId, userId } });
    if (!existing) throw AppException.notFound('Wishlist item');

    const cart = await this.cart.addItem(
      { userId },
      { productId: existing.productId, variantId: existing.variantId ?? undefined, quantity },
    );
    await this.prisma.wishlistItem.delete({ where: { id: existing.id } });
    return cart;
  }
}
