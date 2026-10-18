import { buildMeta, PaginatedResult, PaginationMeta } from './paginated-result';
import { PaginationDto } from '../dto/pagination.dto';

/**
 * Helper for service methods that build their own query but still need the
 * standard pagination envelope. Prefer `BaseService.findAll` where possible.
 */
export class PaginateHelper {
  static async offset<T>(
    query: PaginationDto,
    fetchRows: () => Promise<T[]>,
    fetchTotal: () => Promise<number>,
    transform: (row: T) => T = (row) => row,
  ): Promise<PaginatedResult<T>> {
    const [rows, total] = await Promise.all([fetchRows(), fetchTotal()]);
    return new PaginatedResult<T>(rows.map(transform), buildMeta(total, query.page, query.limit));
  }

  static cursor<T>(
    rows: T[],
    limit: number,
    getId: (row: T) => string,
  ): PaginatedResult<T> {
    const hasNext = rows.length > limit;
    const items = hasNext ? rows.slice(0, limit) : rows;
    const meta: PaginationMeta = {
      ...buildMeta(items.length, 1, limit),
      hasNext,
      nextCursor: hasNext && items.length > 0 ? getId(items[items.length - 1]) : null,
    };
    return new PaginatedResult<T>(items, meta);
  }
}
