import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class SearchSuggestionDto {
  @ApiProperty({ example: 'panjabi', minLength: 1 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  q!: string;

  @ApiPropertyOptional({ example: 8, minimum: 1, maximum: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  limit = 8;
}

export class SearchLogDto {
  @ApiProperty({ example: 'panjabi for eid', minLength: 2 })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(60)
  query!: string;

  @ApiPropertyOptional({ example: 14, description: 'Number of results shown to the shopper' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  resultCount = 0;
}
