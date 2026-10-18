import { Prisma } from '@prisma/client';
import { ProductSort, QueryProductDto } from './dto/query-product.dto';

const NEW_ARRIVALS_DAYS = 30;

/**
 * Single source of truth for turning a `QueryProductDto` into a Prisma filter.
 *
 * Used by BOTH the product list and the facets endpoint, so the counts in the
 * filter sidebar can never drift from the actual result set.
 */
export function buildProductWhere(query: QueryProductDto): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {
    isActive: true,
    deletedAt: null,
  };

  // ── text search ───────────────────────────────────────────────────────────
  const term = (query.q ?? query.search)?.trim();
  if (term) {
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { sku: { contains: term, mode: 'insensitive' } },
      { brand: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } },
      { shortDescription: { contains: term, mode: 'insensitive' } },
    ];
  }

  // ── category + gender (combined into a single relation filter) ────────────
  const categoryFilter: Prisma.CategoryWhereInput = {};
  if (query.gender) categoryFilter.gender = query.gender;

  const categorySlugs = query.categorySlugs?.length
    ? query.categorySlugs
    : query.categorySlug
      ? [query.categorySlug]
      : undefined;

  if (categorySlugs?.length) {
    categoryFilter.slug = { in: categorySlugs };
  }

  if (Object.keys(categoryFilter).length > 0) {
    where.categories = { some: { category: categoryFilter } };
  }

  // ── collection ────────────────────────────────────────────────────────────
  if (query.collectionSlug) {
    where.collections = { some: { collection: { slug: query.collectionSlug } } };
  }

  // ── tags ──────────────────────────────────────────────────────────────────
  if (query.tags?.length) {
    where.tags = { some: { tag: { in: query.tags } } };
  }

  // ── brand / material ──────────────────────────────────────────────────────
  if (query.brands?.length) where.brand = { in: query.brands };
  if (query.materials?.length) where.material = { in: query.materials };

  // ── price range ───────────────────────────────────────────────────────────
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    where.basePrice = {};
    if (query.minPrice !== undefined) where.basePrice.gte = query.minPrice;
    if (query.maxPrice !== undefined) where.basePrice.lte = query.maxPrice;
  }

  // ── discount ──────────────────────────────────────────────────────────────
  if (query.onSale) where.compareAtPrice = { not: null };
  if (query.minDiscount !== undefined) where.discountPercent = { gte: query.minDiscount };

  // ── availability ──────────────────────────────────────────────────────────
  if (query.inStock) where.totalStock = { gt: 0 };

  if (query.minRating !== undefined) {
    where.reviews = {
      some: { isApproved: true, rating: { gte: query.minRating } },
    };
  }

  // ── new arrivals ──────────────────────────────────────────────────────────
  if (query.newArrivals) {
    const since = new Date();
    since.setDate(since.getDate() - NEW_ARRIVALS_DAYS);
    where.createdAt = { gte: since };
  }

  // ── variant size / color ──────────────────────────────────────────────────
  if (query.sizes?.length || query.colors?.length) {
    const variantFilter: Prisma.ProductVariantWhereInput = { stock: { gt: 0 } };
    if (query.sizes?.length) variantFilter.size = { in: query.sizes };
    if (query.colors?.length) variantFilter.color = { in: query.colors };

    where.variants = { some: variantFilter };
  }

  return where;
}

/**
 * Sort map for the storefront. Always appends `id` as a tiebreaker so cursor
 * pagination never skips or repeats a row.
 */
export function buildProductOrderBy(
  query: QueryProductDto,
): Prisma.ProductOrderByWithRelationInput[] {
  const primary = primaryOrderBy(query);
  return [primary, { id: 'asc' }];
}

function primaryOrderBy(query: QueryProductDto): Prisma.ProductOrderByWithRelationInput {
  switch (query.sort as ProductSort | undefined) {
    case 'price_asc':
      return { basePrice: 'asc' };
    case 'price_desc':
      return { basePrice: 'desc' };
    case 'best_selling':
      return { totalSold: 'desc' };
    case 'discount_desc':
      return { discountPercent: 'desc' };
    case 'oldest':
      return { createdAt: 'asc' };
    case 'relevance':
      // Full-text ranking arrives with the tsvector migration (Phase 2).
      return query.q ? { totalSold: 'desc' } : { createdAt: 'desc' };
    case 'newest':
    default:
      return { createdAt: 'desc' };
  }
}
