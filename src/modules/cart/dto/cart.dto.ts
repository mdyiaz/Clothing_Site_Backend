import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CartIdentityDto {
  /** Guest carts are keyed by a client-generated UUID (no login needed). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sessionId?: string;
}

export class AddToCartDto extends CartIdentityDto {
  @IsString()
  productId!: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  @IsInt()
  @Min(1)
  @Max(999)
  quantity!: number;
}

export class UpdateCartItemDto extends CartIdentityDto {
  @IsInt()
  @Min(0)
  @Max(999)
  quantity!: number;
}

export class MergeCartDto {
  @IsString()
  @MaxLength(80)
  sessionId!: string;
}
