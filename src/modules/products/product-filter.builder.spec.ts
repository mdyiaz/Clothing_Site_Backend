import { Gender } from '@prisma/client';
import { QueryProductDto } from './dto/query-product.dto';
import { buildProductOrderBy, buildProductWhere } from './product-filter.builder';

function query(overrides: Partial<QueryProductDto> = {}): QueryProductDto {
  return Object.assign(new QueryProductDto(), overrides);
}

describe('buildProductWhere', () => {
  it('always scopes to active, non-deleted products', () => {
    expect(buildProductWhere(query())).toEqual({ isActive: true, deletedAt: null });
  });

  describe('text search', () => {
    it('searches name, sku, brand and both description fields', () => {
      const where = buildProductWhere(query({ q: 'Panjabi' }));

      expect(where.OR).toEqual([
        { name: { contains: 'Panjabi', mode: 'insensitive' } },
        { sku: { contains: 'Panjabi', mode: 'insensitive' } },
        { brand: { contains: 'Panjabi', mode: 'insensitive' } },
        { description: { contains: 'Panjabi', mode: 'insensitive' } },
        { shortDescription: { contains: 'Panjabi', mode: 'insensitive' } },
      ]);
    });

    it('accepts `search` as an alias of `q` and trims it', () => {
      const where = buildProductWhere(query({ search: '  kameez  ' }));
      expect(where.OR?.[0]).toEqual({
        name: { contains: 'kameez', mode: 'insensitive' },
      });
    });
  });

  describe('category + gender', () => {
    it('combines single categorySlug with gender into one relation filter', () => {
      const where = buildProductWhere(
        query({ categorySlug: 'men-panjabi', gender: Gender.MEN }),
      );

      expect(where.categories).toEqual({
        some: { category: { gender: 'MEN', slug: { in: ['men-panjabi'] } } },
      });
    });

    it('accepts multiple categorySlugs', () => {
      const where = buildProductWhere(
        query({ categorySlugs: ['men-shirt', 'men-panjabi'] }),
      );

      expect(where.categories).toEqual({
        some: { category: { slug: { in: ['men-shirt', 'men-panjabi'] } } },
      });
    });

    it('keeps gender alone when no category is chosen', () => {
      const where = buildProductWhere(query({ gender: Gender.KIDS }));
      expect(where.categories).toEqual({ some: { category: { gender: 'KIDS' } } });
    });
  });

  describe('commercial filters', () => {
    it('builds an inclusive price range', () => {
      const where = buildProductWhere(query({ minPrice: 500, maxPrice: 4500 }));
      expect(where.basePrice).toEqual({ gte: 500, lte: 4500 });
    });

    it('sets only the bound that was provided', () => {
      expect(buildProductWhere(query({ maxPrice: 900 })).basePrice).toEqual({ lte: 900 });
      expect(buildProductWhere(query({ minPrice: 900 })).basePrice).toEqual({ gte: 900 });
    });

    it('onSale means compareAtPrice is present', () => {
      expect(buildProductWhere(query({ onSale: true })).compareAtPrice).toEqual({ not: null });
    });

    it('minDiscount filters on computed discountPercent', () => {
      expect(buildProductWhere(query({ minDiscount: 20 })).discountPercent).toEqual({ gte: 20 });
    });

    it('inStock requires totalStock > 0', () => {
      expect(buildProductWhere(query({ inStock: true })).totalStock).toEqual({ gt: 0 });
    });
  });

  describe('relations', () => {
    it('filters by collection slug', () => {
      const where = buildProductWhere(query({ collectionSlug: 'eid-collection' }));
      expect(where.collections).toEqual({
        some: { collection: { slug: 'eid-collection' } },
      });
    });

    it('filters by tags', () => {
      const where = buildProductWhere(query({ tags: ['summer', 'cotton'] }));
      expect(where.tags).toEqual({ some: { tag: { in: ['summer', 'cotton'] } } });
    });

    it('requires an approved rating', () => {
      const where = buildProductWhere(query({ minRating: 4 }));
      expect(where.reviews).toEqual({ some: { isApproved: true, rating: { gte: 4 } } });
    });
  });

  describe('variants', () => {
    it('only matches variants that are in stock', () => {
      const where = buildProductWhere(query({ sizes: ['M'], colors: ['Red'] }));
      expect(where.variants).toEqual({
        some: { stock: { gt: 0 }, size: { in: ['M'] }, color: { in: ['Red'] } },
      });
    });

    it('works with sizes alone or colors alone', () => {
      expect(buildProductWhere(query({ sizes: ['L'] })).variants).toEqual({
        some: { stock: { gt: 0 }, size: { in: ['L'] } },
      });
      expect(buildProductWhere(query({ colors: ['Blue'] })).variants).toEqual({
        some: { stock: { gt: 0 }, color: { in: ['Blue'] } },
      });
    });
  });

  it('newArrivals windows to the last 30 days', () => {
    const before = Date.now();
    const where = buildProductWhere(query({ newArrivals: true }));
    const after = Date.now();

    const gte = (where.createdAt as { gte: Date }).gte.getTime();
    const expectedMin = before - 30 * 86_400_000;
    const expectedMax = after - 30 * 86_400_000;
    expect(gte).toBeGreaterThanOrEqual(expectedMin);
    expect(gte).toBeLessThanOrEqual(expectedMax);
  });

  it('supports brands + materials lists', () => {
    const where = buildProductWhere(
      query({ brands: ['Rangoli', 'Envoy'], materials: ['Cotton'] }),
    );
    expect(where.brand).toEqual({ in: ['Rangoli', 'Envoy'] });
    expect(where.material).toEqual({ in: ['Cotton'] });
  });
});

describe('buildProductOrderBy', () => {
  it('always appends id as a stable tiebreaker', () => {
    expect(buildProductOrderBy(query({ sort: 'price_asc' }))).toEqual([
      { basePrice: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('maps every supported sort', () => {
    expect(buildProductOrderBy(query({ sort: 'price_desc' }))[0]).toEqual({ basePrice: 'desc' });
    expect(buildProductOrderBy(query({ sort: 'best_selling' }))[0]).toEqual({ totalSold: 'desc' });
    expect(buildProductOrderBy(query({ sort: 'discount_desc' }))[0]).toEqual({
      discountPercent: 'desc',
    });
    expect(buildProductOrderBy(query({ sort: 'oldest' }))[0]).toEqual({ createdAt: 'asc' });
    expect(buildProductOrderBy(query({ sort: 'newest' }))[0]).toEqual({ createdAt: 'desc' });
  });

  it('defaults to newest', () => {
    expect(buildProductOrderBy(query())[0]).toEqual({ createdAt: 'desc' });
  });

  it('relevance without a search term falls back to newest', () => {
    expect(buildProductOrderBy(query({ sort: 'relevance' }))[0]).toEqual({ createdAt: 'desc' });
  });

  it('relevance with a search term ranks by popularity', () => {
    expect(buildProductOrderBy(query({ sort: 'relevance', q: 'panjabi' }))[0]).toEqual({
      totalSold: 'desc',
    });
  });
});
