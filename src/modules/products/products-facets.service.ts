import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CacheService } from '../cache/cache.service';
import { QueryProductDto } from './dto/query-product.dto';
import { buildProductWhere } from './product-filter.builder';
import { PrismaService } from '../../prisma/prisma.service';

export interface FacetOption {
  value: string;
  label?: string;
  count: number;
}

export interface ProductFacets {
  total: number;
  price: { min: number; max: number };
  maxDiscount: number | null;
  categories: FacetOption[];
  brands: FacetOption[];
  materials: FacetOption[];
  sizes: FacetOption[];
  colors: FacetOption[];
}

const FACET_TTL_SECONDS = 300;

/**
 * Computes the filter-sidebar counts for a product query.
 *
 * Always shares `buildProductWhere` with the product list, so a facet count and
 * the number of rows you get after ticking that box can never disagree.
 */
@Injectable()
export class ProductsFacetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async getFacets(query: QueryProductDto): Promise<ProductFacets> {
    const key = `facets:${stableKey(query)}`;

    return this.cache.getOrSet(key, FACET_TTL_SECONDS, () => this.compute(query));
  }

  private async compute(query: QueryProductDto): Promise<ProductFacets> {
    const where = buildProductWhere(query);

    const [total, price, discount, categories, brands, materials, sizes, colors] =
      await Promise.all([
        this.prisma.product.count({ where }),
        this.prisma.product.aggregate({ where, _min: { basePrice: true }, _max: { basePrice: true } }),
        this.prisma.product.aggregate({ where, _max: { discountPercent: true } }),
        this.categoryFacets(where),
        this.valueFacets(where, 'brand'),
        this.valueFacets(where, 'material'),
        this.variantFacets(where, 'size'),
        this.variantFacets(where, 'color'),
      ]);

    return {
      total,
      price: { min: price._min.basePrice ?? 0, max: price._max.basePrice ?? 0 },
      maxDiscount: discount._max.discountPercent,
      categories,
      brands,
      materials,
      sizes,
      colors,
    };
  }

  private async categoryFacets(where: Prisma.ProductWhereInput): Promise<FacetOption[]> {
    const grouped = await this.prisma.productCategory.groupBy({
      by: ['categoryId'],
      where: { product: where },
      _count: true,
    });

    if (grouped.length === 0) return [];

    const categoryRows = await this.prisma.category.findMany({
      where: { id: { in: grouped.map((row) => row.categoryId) } },
      select: { id: true, slug: true, name: true, sortOrder: true },
    });

    const counts = new Map(grouped.map((row) => [row.categoryId, row._count]));

    return categoryRows
      .map((category) => ({
        value: category.slug,
        label: category.name,
        count: counts.get(category.id) ?? 0,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  private async valueFacets(
    where: Prisma.ProductWhereInput,
    field: 'brand' | 'material',
  ): Promise<FacetOption[]> {
    const grouped = await this.prisma.product.groupBy({
      by: [field],
      where,
      _count: true,
    });

    return grouped
      .filter((row) => row[field])
      .map((row) => ({ value: row[field] as string, count: row._count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }

  private async variantFacets(
    where: Prisma.ProductWhereInput,
    field: 'size' | 'color',
  ): Promise<FacetOption[]> {
    const grouped = await this.prisma.productVariant.groupBy({
      by: [field],
      where: { product: where, stock: { gt: 0 } },
      _count: true,
    });

    return grouped
      .filter((row) => row[field])
      .map((row) => ({ value: row[field] as string, count: row._count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }
}

/** Query-string key that ignores pagination + sort, so facets stay cached across pages. */
function stableKey(query: QueryProductDto): string {
  const entries = Object.entries(query as unknown as Record<string, unknown>)
    .filter(([key]) => !['page', 'limit', 'cursor', 'skip'].includes(key))
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b));

  return JSON.stringify(entries);
}
