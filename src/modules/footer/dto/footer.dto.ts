import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/mapped-types';
import { ContactType } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// ── columns ──────────────────────────────────────────────────────────────────

export class CreateFooterColumnDto {
  @ApiProperty({ example: 'CUSTOMER SERVICE' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  title!: string;

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

export class UpdateFooterColumnDto extends PartialType(CreateFooterColumnDto) {}

// ── links ────────────────────────────────────────────────────────────────────

export class CreateFooterLinkDto {
  @ApiProperty({ example: 'Track Order' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label!: string;

  @ApiProperty({ example: '/account/orders' })
  @IsString()
  @MaxLength(500)
  url!: string;

  @ApiPropertyOptional({ enum: ['_self', '_blank'], default: '_self' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  target?: string;

  @ApiPropertyOptional({ description: 'Icon name (rendered by the frontend)' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  icon?: string;

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

export class UpdateFooterLinkDto extends PartialType(CreateFooterLinkDto) {}

// ── contact info ─────────────────────────────────────────────────────────────

export class CreateContactInfoDto {
  @ApiProperty({ enum: ContactType })
  @IsEnum(ContactType)
  type!: ContactType;

  @ApiPropertyOptional({ example: 'Hotline (10 AM – 8 PM)' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @ApiProperty({ example: '16247' })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  value!: string;

  @ApiPropertyOptional({ example: 'tel:16247' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  linkUrl?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}

export class UpdateContactInfoDto extends PartialType(CreateContactInfoDto) {}

// ── social links ─────────────────────────────────────────────────────────────

export class CreateSocialLinkDto {
  @ApiProperty({ example: 'facebook' })
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  platform!: string;

  @ApiProperty({ example: 'https://facebook.com/rangoli' })
  @IsString()
  @MaxLength(500)
  url!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}

export class UpdateSocialLinkDto extends PartialType(CreateSocialLinkDto) {}

// ── newsletter ───────────────────────────────────────────────────────────────

export class SubscribeNewsletterDto {
  @ApiPropertyOptional({ example: 'someone@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional({ example: '01712345678' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'footer', description: 'Where the signup happened' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  source?: string;
}
