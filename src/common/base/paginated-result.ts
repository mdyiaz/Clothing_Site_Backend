export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  from: number;
  to: number;
  /** Present only for cursor-based listings. */
  nextCursor?: string | null;
}

export class PaginatedResult<T> {
  readonly items: T[];
  readonly meta: PaginationMeta;

  constructor(items: T[], meta: PaginationMeta) {
    this.items = items;
    this.meta = meta;
  }
}

export function buildMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return {
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1 && total > 0,
    from,
    to,
  };
}

export function isPaginatedResult(value: unknown): value is PaginatedResult<unknown> {
  return value instanceof PaginatedResult;
}
