import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { SearchLogDto, SearchSuggestionDto } from './dto/search.dto';

const SUGGESTION_TTL = 120;
const POPULAR_TTL = 600;
const POPULAR_WINDOW_DAYS = 30;

export interface SearchSuggestions {
  products: { name: string; slug: string; primaryImageUrl: string | null; basePrice: number }[];
  categories: { name: string; slug: string }[];
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async suggestions(query: SearchSuggestionDto): Promise<SearchSuggestions> {
    const term = query.q.trim().toLowerCase();
    const key = `search:suggest:${term}:${query.limit}`;

    return this.cache.getOrSet(key, SUGGESTION_TTL, async () => {
      const [products, categories] = await Promise.all([
        this.prisma.product.findMany({
          where: {
            isActive: true,
            deletedAt: null,
            name: { contains: term, mode: 'insensitive' },
          },
          select: {
            name: true,
            slug: true,
            primaryImageUrl: true,
            basePrice: true,
          },
          orderBy: [{ totalSold: 'desc' }, { createdAt: 'desc' }],
          take: query.limit,
        }),
        this.prisma.category.findMany({
          where: {
            isActive: true,
            deletedAt: null,
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { slug: { startsWith: term } },
            ],
          },
          select: { name: true, slug: true },
          orderBy: { sortOrder: 'asc' },
          take: 4,
        }),
      ]);

      return { products, categories };
    });
  }

  async popular(limit = 10): Promise<{ query: string; count: number }[]> {
    const bounded = Math.min(Math.max(limit, 1), 25);
    const key = `search:popular:${bounded}`;

    return this.cache.getOrSet(key, POPULAR_TTL, async () => {
      const since = new Date();
      since.setDate(since.getDate() - POPULAR_WINDOW_DAYS);

      const grouped = await this.prisma.searchLog.groupBy({
        by: ['query'],
        where: { createdAt: { gte: since } },
        _count: true,
        orderBy: { _count: { query: 'desc' } },
        take: bounded * 3,
      });

      return grouped
        .map((row) => ({ query: row.query.trim(), count: row._count }))
        .filter((row) => row.query.length >= 2)
        .slice(0, bounded);
    });
  }

  /** Fire-and-forget: a failed analytics write must never fail the search request. */
  async log(dto: SearchLogDto, userId?: string | null): Promise<void> {
    try {
      await this.prisma.searchLog.create({
        data: {
          query: dto.query.trim(),
          userId: userId ?? null,
          resultCount: dto.resultCount,
        },
      });
    } catch (error) {
      this.logger.warn(`Failed to persist search log for "${dto.query}"`, error);
    }
  }
}
