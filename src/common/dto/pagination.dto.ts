import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const MAX_ADMIN_LIMIT = 100;
const MAX_CURSOR_LIMIT = 50;

/**
 * Offset pagination — used by the admin panel (default 20, hard cap 100).
 */
export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ADMIN_LIMIT)
  limit = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

/**
 * Cursor pagination — used by the customer-facing store (default 20, hard cap 50).
 */
export class CursorPaginationDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_CURSOR_LIMIT)
  limit = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

export const PAGINATION_LIMITS = { ADMIN: MAX_ADMIN_LIMIT, CURSOR: MAX_CURSOR_LIMIT } as const;
