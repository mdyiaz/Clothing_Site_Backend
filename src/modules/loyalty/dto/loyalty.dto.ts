import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryLoyaltyDto extends PaginationDto {}

export class RedeemPointsDto {
  @ApiProperty({ description: 'Points to redeem (positive)' })
  @IsInt()
  @Min(1)
  points!: number;
}

export class AdjustPointsDto {
  @ApiProperty({ description: 'Signed delta: positive grants, negative deducts' })
  @IsInt()
  points!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
