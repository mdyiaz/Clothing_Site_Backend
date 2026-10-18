import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/mapped-types';
import {
  Gender,
  HomepageSectionType,
  SectionSourceType,
  BannerMediaType,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSectionDto {
  @ApiPropertyOptional({ default: 'home' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  pageKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subtitle?: string;

  @ApiProperty({ enum: HomepageSectionType })
  @IsEnum(HomepageSectionType)
  sectionType!: HomepageSectionType;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  columns?: number | null;

  @ApiPropertyOptional({ example: '#F5F5F5' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  bgColor?: string | null;

  @ApiPropertyOptional({ example: '#111111' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  textColor?: string | null;

  @ApiPropertyOptional({ example: 'py-16', description: 'Tailwind padding class' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  paddingY?: string | null;

  @ApiPropertyOptional({ enum: SectionSourceType, default: SectionSourceType.MANUAL })
  @IsOptional()
  @IsEnum(SectionSourceType)
  sourceType?: SectionSourceType;

  @ApiPropertyOptional({ description: 'Required when sourceType = COLLECTION' })
  @IsOptional()
  @IsUUID()
  collectionId?: string | null;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startsAt?: Date | null;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endsAt?: Date | null;
}

export class UpdateSectionDto extends PartialType(CreateSectionDto) {}

export class ReorderSectionsDto {
  @ApiProperty({ type: [String], description: 'Section ids in their new top-to-bottom order' })
  @IsArray()
  @IsUUID(undefined, { each: true })
  sectionIds!: string[];
}

export class SetSectionItemsDto {
  @ApiProperty({ type: [String], description: 'Product ids (MANUAL sections only)' })
  @IsArray()
  @IsUUID(undefined, { each: true })
  productIds!: string[];
}

export class CreateSectionMediaDto {
  @ApiPropertyOptional({ enum: BannerMediaType, default: BannerMediaType.IMAGE })
  @IsOptional()
  @IsEnum(BannerMediaType)
  mediaType?: BannerMediaType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  videoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  mobileImageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  videoPoster?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  videoDuration?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  subtitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  ctaText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  ctaUrl?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @ApiPropertyOptional({ example: '16/9', description: 'Aspect ratio hint for the renderer' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  width?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSectionMediaDto extends PartialType(CreateSectionMediaDto) {}
