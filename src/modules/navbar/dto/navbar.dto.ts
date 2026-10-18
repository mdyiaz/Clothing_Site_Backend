import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/mapped-types';
import { NavbarLinkType } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateNavbarItemDto {
  @ApiProperty({ example: 'Men' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label!: string;

  @ApiProperty({ enum: NavbarLinkType })
  @IsEnum(NavbarLinkType)
  linkType!: NavbarLinkType;

  @ApiPropertyOptional({ description: 'Required when linkType = CATEGORY' })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({ description: 'Required when linkType = COLLECTION' })
  @IsOptional()
  @IsUUID()
  collectionId?: string | null;

  @ApiPropertyOptional({ example: '/pages/about-us', description: 'Required for CUSTOM_URL / PAGE' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  customUrl?: string | null;

  @ApiPropertyOptional({ default: false, description: 'Red highlight (Sale / New)' })
  @IsOptional()
  @IsBoolean()
  highlight?: boolean;

  @ApiPropertyOptional({ description: 'Parent item — storefront supports 2 levels' })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

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
}

export class UpdateNavbarItemDto extends PartialType(CreateNavbarItemDto) {}

export class ReorderNavbarDto {
  @ApiProperty({ type: [String], description: 'Item ids in their new left-to-right order' })
  @IsArray()
  @IsUUID(undefined, { each: true })
  itemIds!: string[];
}
