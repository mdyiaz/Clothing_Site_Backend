import { CacheService } from '../cache/cache.service';
import { QueryProductDto } from './dto/query-product.dto';
import { ProductsFacetsService } from './products-facets.service';

type PrismaLike = Record<string, Record<string, jest.Mock>>;

function query(overrides: Partial<QueryProductDto> = {}): QueryProductDto {
  return Object.assign(new QueryProductDto(), overrides);
}

describe('ProductsFacetsService', () => {
  let prisma: PrismaLike;
  let cache: CacheService;
  let service: ProductsFacetsService;

  beforeEach(() => {
    prisma = {
      product: { count: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn() },
      productCategory: { groupBy: jest.fn() },
      category: { findMany: jest.fn() },
      productVariant: { groupBy: jest.fn() },
    };
    cache = new CacheService();
    service = new ProductsFacetsService(prisma as any, cache);
  });

  afterEach(() => {
    cache.onModuleDestroy();
  });

  function mockAggregates() {
    prisma.product.aggregate
      .mockResolvedValueOnce({ _min: { basePrice: 500 }, _max: { basePrice: 4500 } })
      .mockResolvedValueOnce({ _max: { discountPercent: 35 } });
  }

  it('assembles the full facet payload', async () => {
    prisma.product.count.mockResolvedValue(42);
    mockAggregates();
    prisma.productCategory.groupBy.mockResolvedValue([
      { categoryId: 'c1', _count: 4 },
      { categoryId: 'c2', _count: 9 },
    ]);
    prisma.category.findMany.mockResolvedValue([
      { id: 'c1', slug: 'men', name: 'Men', sortOrder: 0 },
      { id: 'c2', slug: 'women', name: 'Women', sortOrder: 1 },
    ]);
    prisma.product.groupBy
      .mockResolvedValueOnce([{ brand: 'Rangoli', _count: 7 }, { brand: null, _count: 2 }])
      .mockResolvedValueOnce([{ material: 'Cotton', _count: 12 }]);
    prisma.productVariant.groupBy
      .mockResolvedValueOnce([{ size: 'M', _count: 6 }, { size: 'XL', _count: 2 }])
      .mockResolvedValueOnce([{ color: 'Red', _count: 3 }]);

    const facets = await service.getFacets(query());

    expect(facets).toEqual({
      total: 42,
      price: { min: 500, max: 4500 },
      maxDiscount: 35,
      categories: [
        { value: 'women', label: 'Women', count: 9 },
        { value: 'men', label: 'Men', count: 4 },
      ],
      brands: [{ value: 'Rangoli', count: 7 }], // null brand dropped
      materials: [{ value: 'Cotton', count: 12 }],
      sizes: [{ value: 'M', count: 6 }, { value: 'XL', count: 2 }],
      colors: [{ value: 'Red', count: 3 }],
    });
  });

  it('only counts variants that are in stock', async () => {
    prisma.product.count.mockResolvedValue(0);
    mockAggregates();
    prisma.productCategory.groupBy.mockResolvedValue([]);
    prisma.product.groupBy.mockResolvedValue([]);
    prisma.productVariant.groupBy.mockResolvedValue([]);

    await service.getFacets(query());

    for (const call of prisma.productVariant.groupBy.mock.calls) {
      expect(call[0].where).toMatchObject({ stock: { gt: 0 } });
    }
  });

  it('shares buildProductWhere with the product list', async () => {
    prisma.product.count.mockResolvedValue(1);
    mockAggregates();
    prisma.productCategory.groupBy.mockResolvedValue([]);
    prisma.product.groupBy.mockResolvedValue([]);
    prisma.productVariant.groupBy.mockResolvedValue([]);

    await service.getFacets(query({ categorySlug: 'men-panjabi', onSale: true }));

    const where = prisma.product.count.mock.calls[0][0].where;
    expect(where).toMatchObject({
      isActive: true,
      categories: { some: { category: { slug: { in: ['men-panjabi'] } } } },
      compareAtPrice: { not: null },
    });
  });

  it('returns zeroed price bounds for an empty catalogue slice', async () => {
    prisma.product.count.mockResolvedValue(0);
    prisma.product.aggregate
      .mockResolvedValueOnce({ _min: { basePrice: null }, _max: { basePrice: null } })
      .mockResolvedValueOnce({ _max: { discountPercent: null } });
    prisma.productCategory.groupBy.mockResolvedValue([]);
    prisma.product.groupBy.mockResolvedValue([]);
    prisma.productVariant.groupBy.mockResolvedValue([]);

    const facets = await service.getFacets(query());

    expect(facets.price).toEqual({ min: 0, max: 0 });
    expect(facets.maxDiscount).toBeNull();
    expect(facets.categories).toEqual([]);
  });

  it('caches across pagination changes but not across filter changes', async () => {
    prisma.product.count.mockResolvedValue(3);
    mockAggregates(); // first compute
    mockAggregates(); // recompute for the changed filter
    prisma.productCategory.groupBy.mockResolvedValue([]);
    prisma.product.groupBy.mockResolvedValue([]);
    prisma.productVariant.groupBy.mockResolvedValue([]);

    await service.getFacets(query({ q: 'panjabi', page: 1 }));
    await service.getFacets(query({ q: 'panjabi', page: 2 }));
    expect(prisma.product.count).toHaveBeenCalledTimes(1); // page is not part of the cache key

    await service.getFacets(query({ q: 'kameez', page: 1 }));
    expect(prisma.product.count).toHaveBeenCalledTimes(2); // different filter → recompute
  });
});
