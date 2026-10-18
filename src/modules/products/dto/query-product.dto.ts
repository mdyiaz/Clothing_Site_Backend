import { ApiPropertyOptional } from '@nestjs/swagger';
import { Gender } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/** "M,L" → ['M','L']; already-parsed arrays pass through. */
const toList = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
    : value;

const toBool = ({ value }: { value: unknown }): unknown =>
  value === true || value === 'true' || value === '1'
    ? true
    : value === false || value === 'false' || value === '0'
      ? false
      : value;

export const PRODUCT_SORTS = [
  'newest',
  'oldest',
  'price_asc',
  'price_desc',
  'best_selling',
  'discount_desc',
  'relevance',
] as const;

export type ProductSort = (typeof PRODUCT_SORTS)[number];

/**
 * Query string contract for `GET /products`.
 *
 * Arrays may be sent repeated (`?sizes=M&sizes=L`) or comma-joined (`?sizes=M,L`).
 * When `cursor` is present the listing runs in cursor mode (storefront infinite
 * scroll) and `page` is ignored.
 */
export class QueryProductDto extends PaginationDto {
  // ── search ────────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'panjabi' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  // ── category ──────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'men-panjabi' })
  @IsOptional()
  @IsString()
  @MaxLength(90)
  categorySlug?: string;

  @ApiPropertyOptional({ example: 'men-panjabi,men-shirt', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(toList)
  categorySlugs?: string[];

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  // ── variant ───────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'S,M,L' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(toList)
  sizes?: string[];

  @ApiPropertyOptional({ example: 'Red,Blue' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(toList)
  colors?: string[];

  // ── price ─────────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 590 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ example: 4500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  // ── brand / material ──────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'Rangoli,Envoy' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(toList)
  brands?: string[];

  @ApiPropertyOptional({ example: 'Cotton,Silk' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(toList)
  materials?: string[];

  // ── discount ──────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  onSale?: boolean;

  @ApiPropertyOptional({ example: 20, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  minDiscount?: number;

  // ── availability ──────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  inStock?: boolean;

  @ApiPropertyOptional({ example: 4, minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  minRating?: number;

  // ── collection / tags ─────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'eid-collection' })
  @IsOptional()
  @IsString()
  @MaxLength(90)
  collectionSlug?: string;

  @ApiPropertyOptional({ example: 'summer,cotton' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(toList)
  tags?: string[];

  // ── new arrivals ──────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  newArrivals?: boolean;

  // ── sort ──────────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ enum: PRODUCT_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(PRODUCT_SORTS)
  sort?: ProductSort;

  // ── cursor (storefront infinite scroll) ───────────────────────────────────
  @ApiPropertyOptional({ description: 'Switches the listing into cursor mode' })
  @IsOptional()
  @IsString()
  cursor?: string;
}
