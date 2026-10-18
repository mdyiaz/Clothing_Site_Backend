import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ToggleWishlistDto {
  @IsString()
  productId!: string;

  @IsOptional()
  @IsString()
  variantId?: string;
}

export class MoveToCartDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  quantity?: number;
}
