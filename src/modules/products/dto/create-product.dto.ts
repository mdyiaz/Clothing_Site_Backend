import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDecimal,
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
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { MediaType } from '@prisma/client';

// ---------------------------------------------------------------------------
// Nested: product media (one Cloudinary asset + its SEO metadata)
// ---------------------------------------------------------------------------

export class ProductMediaDto {
  @ApiPropertyOptional({ description: 'Existing media id — omit for a new image' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional({ enum: MediaType, default: MediaType.IMAGE })
  @IsOptional()
  @IsEnum(MediaType)
  type?: MediaType;

  @ApiProperty({ example: 'products/uuid/common/eid-panjabi-front', description: 'Cloudinary public_id' })
  @IsString()
  @MaxLength(250)
  publicId!: string;

  @ApiPropertyOptional({ example: 'jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  format?: string;

  @ApiPropertyOptional({ default: 'image' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  resourceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  bytes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  width?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  height?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  duration?: number;

  @ApiPropertyOptional({ description: 'LQIP placeholder (data URL)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  blurDataUrl?: string;

  @ApiPropertyOptional({ description: 'Full URL (built from publicId on the frontend)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  thumbnailUrl?: string;

  // SEO metadata (admin-provided, max 125 chars on alt)
  @ApiPropertyOptional({ maxLength: 125 })
  @IsOptional()
  @IsString()
  @MaxLength(125)
  altText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  keywords?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  seoFilename?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  geoLocation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  credit?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Variant this image belongs to (null = common to all)' })
  @IsOptional()
  @IsUUID()
  variantId?: string | null;
}

// ---------------------------------------------------------------------------
// Nested: product variant (size/colour/stock row)
// ---------------------------------------------------------------------------

export class ProductVariantDto {
  @ApiPropertyOptional({ description: 'Existing variant id — omit to create' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: 'RNG-PANJABI-001-RED-M' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  sku!: string;

  @ApiPropertyOptional({ example: 'M' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  size?: string;

  @ApiPropertyOptional({ example: 'Red' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  color?: string;

  @ApiPropertyOptional({ example: '#DC2626' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  colorHex?: string;

  @ApiPropertyOptional({ example: 'Cotton' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  material?: string;

  @ApiPropertyOptional({ description: 'Override price (BDT); falls back to product basePrice' })
  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  compareAtPrice?: number | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockAlert?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  weightGrams?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  primaryImageUrl?: string;

  @ApiPropertyOptional({ type: [ProductMediaDto], description: 'Images specific to this variant' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductMediaDto)
  media?: ProductMediaDto[];
}


export class CreateProductDto {
  @ApiProperty({ example: 'RNG-PANJABI-001' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  sku!: string;

  @ApiProperty({ example: 'Eid Panjabi — Embroidered Cotton' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ example: 'eid-panjabi-embroidered-cotton' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'Slug may only contain lowercase letters, numbers and hyphens.',
  })
  @MaxLength(180)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  shortDescription?: string;

  @ApiProperty({ example: 1290, description: 'Price in BDT (integer, no decimals)' })
  @IsInt()
  @Min(0)
  basePrice!: number;

  @ApiPropertyOptional({ example: 1790 })
  @IsOptional()
  @IsInt()
  @Min(0)
  compareAtPrice?: number;

  @ApiPropertyOptional({ example: 900 })
  @IsOptional()
  @IsInt()
  @Min(0)
  costPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isVatInclusive?: boolean;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsDecimal({ decimal_digits: '1,2' })
  vatPercentage?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isVatExempt?: boolean;

  @ApiPropertyOptional({ example: 'Rangoli' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  brand?: string;

  @ApiPropertyOptional({ example: 'Cotton' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  material?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  careInstructions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  sizeChartUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  primaryImageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  primaryVideoUrl?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ type: [String], description: 'Category ids (max 3 levels deep)' })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  categoryIds?: string[];

  @ApiPropertyOptional({
    type: [ProductVariantDto],
    description: 'Size/colour variants — omit for a single-SKU product',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  variants?: ProductVariantDto[];

  @ApiPropertyOptional({
    type: [ProductMediaDto],
    description: 'Gallery images (Cloudinary publicIds + SEO fields)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductMediaDto)
  media?: ProductMediaDto[];
}

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiPropertyOptional({ type: [String], description: 'Variant ids to delete (update only)' })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  removeVariantIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Media ids to delete (update only)' })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  removeMediaIds?: string[];
}
