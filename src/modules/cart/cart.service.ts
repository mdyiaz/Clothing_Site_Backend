import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedActor } from '../../types/express';
import { AddToCartDto } from './dto/cart.dto';

export interface CartIdentity {
  userId?: string;
  sessionId?: string;
}

const LINE_INCLUDE = {
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
      basePrice: true,
      compareAtPrice: true,
      primaryImageUrl: true,
      isActive: true,
      deletedAt: true,
      totalStock: true,
    },
  },
  variant: {
    select: {
      id: true,
      size: true,
      color: true,
      price: true,
      compareAtPrice: true,
      stock: true,
      primaryImageUrl: true,
    },
  },
} satisfies Prisma.CartItemInclude;

type CartWithLines = Prisma.CartGetPayload<{ include: { items: { include: typeof LINE_INCLUDE } } }>;

/**
 * Guest carts live behind `sessionId` (client UUID, no login); user carts
 * behind the JWT identity. All routes are public — a valid token simply
 * upgrades the request to the user's cart.
 */
@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  /** A request must identify a cart owner: token user wins, else sessionId. */
  resolveIdentity(actor: AuthenticatedActor | undefined, sessionId?: string): CartIdentity {
    if (actor && !actor.isGuest) return { userId: actor.userId };
    // Guests with a token still shop as guests — their cart follows the session.
    if (actor?.isGuest && sessionId) return { sessionId };
    if (actor?.isGuest) return { userId: actor.userId };
    if (sessionId?.trim()) return { sessionId: sessionId.trim() };
    throw AppException.badRequest(
      'CART.IDENTITY_REQUIRED',
      'Sign in or send a sessionId to use the cart.',
      { field: 'sessionId' },
    );
  }

  async getCart(identity: CartIdentity) {
    const cart = await this.getOrCreateCart(identity);
    return this.present(cart);
  }

  async addItem(identity: CartIdentity, dto: AddToCartDto) {
    const cart = await this.getOrCreateCart(identity);
    const { product, variant } = await this.resolveLine(dto.productId, dto.variantId);

    const existing = await this.prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        productId: product.id,
        variantId: variant?.id ?? null,
      },
    });
    const nextQty = (existing?.quantity ?? 0) + dto.quantity;
    this.assertStock(product, variant, nextQty);

    if (existing) {
      await this.prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: nextQty } });
    } else {
      await this.prisma.cartItem.create({
        data: { cartId: cart.id, productId: product.id, variantId: variant?.id ?? null, quantity: dto.quantity },
      });
    }
    return this.getCart(identity);
  }

  async updateItem(identity: CartIdentity, itemId: string, quantity: number) {
    const cart = await this.getOrCreateCart(identity);
    const line = await this.requireLine(cart.id, itemId);

    if (quantity === 0) {
      await this.prisma.cartItem.delete({ where: { id: line.id } });
      return this.getCart(identity);
    }

    const { product, variant } = await this.resolveLine(line.productId, line.variantId);
    this.assertStock(product, variant, quantity);

    await this.prisma.cartItem.update({ where: { id: line.id }, data: { quantity } });
    return this.getCart(identity);
  }

  async removeItem(identity: CartIdentity, itemId: string) {
    const cart = await this.getOrCreateCart(identity);
    const line = await this.requireLine(cart.id, itemId);
    await this.prisma.cartItem.delete({ where: { id: line.id } });
    return this.getCart(identity);
  }

  async clear(identity: CartIdentity) {
    const cart = await this.getOrCreateCart(identity);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return this.getCart(identity);
  }

  /**
   * After login: fold the guest cart into the user cart (quantities merge,
   * capped by stock), then drop the guest cart. Idempotent — missing guest
   * cart just returns the user cart.
   */
  async merge(sessionId: string, userId: string) {
    const guest = await this.prisma.cart.findFirst({
      where: { sessionId, userId: null },
      include: { items: true },
    });
    if (!guest || guest.items.length === 0) {
      if (guest) await this.prisma.cart.delete({ where: { id: guest.id } });
      return this.getCart({ userId });
    }

    const userCart = await this.getOrCreateCart({ userId });
    for (const line of guest.items) {
      const { product, variant } = await this.resolveLine(line.productId, line.variantId);
      const existing = await this.prisma.cartItem.findFirst({
        where: { cartId: userCart.id, productId: line.productId, variantId: line.variantId },
      });
      const available = variant ? variant.stock : product.totalStock;
      const merged = Math.min((existing?.quantity ?? 0) + line.quantity, Math.max(available, 0));
      if (merged <= 0) continue;
      if (existing) {
        await this.prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: merged } });
      } else {
        await this.prisma.cartItem.create({
          data: { cartId: userCart.id, productId: line.productId, variantId: line.variantId, quantity: merged },
        });
      }
    }
    await this.prisma.cart.delete({ where: { id: guest.id } });
    return this.getCart({ userId });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async getOrCreateCart(identity: CartIdentity): Promise<CartWithLines> {
    const where = identity.userId ? { userId: identity.userId } : { sessionId: identity.sessionId! };
    const found = await this.prisma.cart.findFirst({
      where,
      include: { items: { include: LINE_INCLUDE, orderBy: { id: 'asc' } } },
    });
    if (found) return found;

    return this.prisma.cart.create({
      data: identity.userId ? { userId: identity.userId } : { sessionId: identity.sessionId! },
      include: { items: { include: LINE_INCLUDE, orderBy: { id: 'asc' } } },
    });
  }

  private async requireLine(cartId: string, itemId: string) {
    const line = await this.prisma.cartItem.findFirst({ where: { id: itemId, cartId } });
    if (!line) throw AppException.notFound('Cart item');
    return line;
  }

  private async resolveLine(productId: string, variantId?: string | null) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: {
        id: true, name: true, isActive: true, basePrice: true, compareAtPrice: true, totalStock: true,
      },
    });
    if (!product || !product.isActive) {
      throw AppException.badRequest('CART.PRODUCT_UNAVAILABLE', 'That product is no longer available.', {
        field: 'productId',
      });
    }

    let variant: { id: string; stock: number; price: number | null } | null = null;
    if (variantId) {
      const row = await this.prisma.productVariant.findFirst({
        where: { id: variantId, productId },
        select: { id: true, stock: true, price: true },
      });
      if (!row) {
        throw AppException.badRequest('CART.UNKNOWN_VARIANT', 'That variant does not exist for this product.', {
          field: 'variantId',
        });
      }
      variant = row;
    }

    return { product, variant, price: variant?.price ?? product.basePrice };
  }

  private assertStock(
    product: { totalStock: number },
    variant: { stock: number } | null,
    quantity: number,
  ): void {
    const available = variant ? variant.stock : product.totalStock;
    if (quantity > available) {
      throw AppException.badRequest(
        'CART.INSUFFICIENT_STOCK',
        available <= 0 ? 'That item just sold out.' : `Only ${available} left in stock.`,
        { field: 'quantity' },
      );
    }
  }

  private present(cart: CartWithLines) {
    const items = cart.items.map((line) => {
      const price = line.variant?.price ?? line.product.basePrice;
      const compareAt = line.variant?.compareAtPrice ?? line.product.compareAtPrice;
      return {
        id: line.id,
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
        name: line.product.name,
        slug: line.product.slug,
        image: line.variant?.primaryImageUrl ?? line.product.primaryImageUrl,
        size: line.variant?.size ?? null,
        color: line.variant?.color ?? null,
        price,
        compareAtPrice: compareAt,
        lineTotal: price * line.quantity,
        available: !line.product.deletedAt && line.product.isActive,
      };
    });

    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const mrpTotal = items.reduce(
      (sum, item) => sum + (item.compareAtPrice ?? item.price) * item.quantity,
      0,
    );

    return {
      id: cart.id,
      items,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      uniqueCount: items.length,
      subtotal,
      savings: Math.max(mrpTotal - subtotal, 0),
    };
  }
}
