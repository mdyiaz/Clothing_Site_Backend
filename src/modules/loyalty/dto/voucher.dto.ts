import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VoucherStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateVoucherDto {
  @ApiPropertyOptional({ description: 'Auto-generated when omitted' })
  @IsOptional()
  @Matches(/^[A-Za-z0-9-]{4,32}$/)
  code?: string;

  @ApiProperty({ description: 'Face value in ৳' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  issuedToEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class UpdateVoucherDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  issuedToEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @ApiPropertyOptional({ enum: VoucherStatus })
  @IsOptional()
  @IsEnum(VoucherStatus)
  status?: VoucherStatus;
}

export class QueryVoucherDto extends PaginationDto {
  @ApiPropertyOptional({ enum: VoucherStatus })
  @IsOptional()
  @IsEnum(VoucherStatus)
  status?: VoucherStatus;
}

export class ValidateVoucherDto {
  @ApiProperty()
  @IsString()
  @MaxLength(32)
  code!: string;

  @ApiPropertyOptional({ description: 'Order amount the voucher is applied against' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  amount?: number;
}
