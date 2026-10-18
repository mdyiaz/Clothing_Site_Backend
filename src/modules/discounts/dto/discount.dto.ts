import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/mapped-types';
import { DiscountScope, DiscountType } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateDiscountDto {
  @ApiProperty({ example: 'Eid 20% off Panjabi' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ enum: DiscountScope })
  @IsEnum(DiscountScope)
  scope!: DiscountScope;

  @ApiPropertyOptional({ enum: DiscountType })
  @IsEnum(DiscountType)
  type!: DiscountType;

  @ApiPropertyOptional({
    description: 'PERCENTAGE → 1-100; otherwise a poisha amount (or "get Y" count for BUY_X_GET_Y).',
  })
  @IsInt()
  @Min(0)
  value!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  collectionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minPurchaseAmount?: number;

  @ApiPropertyOptional({
    description: 'Minimum cart quantity — also the "buy X" quantity for BUY_X_GET_Y.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  minQuantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  maxDiscountAmount?: number;

  @ApiPropertyOptional({ type: String, example: '2026-04-01T00:00:00.000Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startsAt?: Date | null;

  @ApiPropertyOptional({ type: String, example: '2026-04-30T23:59:59.000Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endsAt?: Date | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  totalUsageLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  perUserLimit?: number;
}

export class UpdateDiscountDto extends PartialType(CreateDiscountDto) {}

export class CreateCouponDto {
  @ApiProperty({ example: 'EID20' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'A coupon code may only contain letters, numbers, hyphens and underscores.',
  })
  @MinLength(3)
  @MaxLength(40)
  code!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCouponDto extends PartialType(CreateCouponDto) {}

export class QueryDiscountDto extends PaginationDto {
  @ApiPropertyOptional({ enum: DiscountScope })
  @IsOptional()
  @IsEnum(DiscountScope)
  scope?: DiscountScope;

  @ApiPropertyOptional({ enum: DiscountType })
  @IsOptional()
  @IsEnum(DiscountType)
  type?: DiscountType;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^(true|false|1|0)$/)
  isActive?: string;
}

/** Storefront cart "apply coupon" preview — public, identity upgrades with a token. */
export class ApplyCouponDto {
  @ApiProperty({ example: 'EID20' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code!: string;

  @ApiPropertyOptional({ description: 'Guest cart session id (omit when signed in).' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sessionId?: string;
}
