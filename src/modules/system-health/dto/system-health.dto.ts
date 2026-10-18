import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ErrorLevel, MismatchSeverity, MismatchType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/** "true"/"1" → true, "false"/"0" → false, everything else passes through. */
const toBool = ({ value }: { value: unknown }): unknown =>
  value === true || value === 'true' || value === '1'
    ? true
    : value === false || value === 'false' || value === '0'
      ? false
      : value;

export class QueryErrorLogDto extends PaginationDto {
  @IsOptional()
  @IsEnum(ErrorLevel)
  level?: ErrorLevel;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  source?: string;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isResolved?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  correlationId?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

export class QueryMismatchDto extends PaginationDto {
  @IsOptional()
  @IsEnum(MismatchType)
  type?: MismatchType;

  @IsOptional()
  @IsEnum(MismatchSeverity)
  severity?: MismatchSeverity;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isResolved?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  referenceType?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

export class ResolveDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
