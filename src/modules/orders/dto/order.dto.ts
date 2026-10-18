import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaymentMethod, ShippingZone } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CartIdentityDto } from '../../cart/dto/cart.dto';

export class CheckoutDto extends CartIdentityDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  guestName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  guestEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  guestPhone?: string;

  @IsObject()
  shippingAddress!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  billingAddress?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  shippingMethod?: string;

  @IsEnum(ShippingZone)
  shippingZone!: ShippingZone;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customerNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  couponCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  voucherCode?: string;

  /** Client-generated key — retries with the same key return the same order. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  idempotencyKey?: string;
}

export class UpdateOrderStatusDto {
  @IsString()
  @MaxLength(30)
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class UpdatePaymentDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  paymentStatus?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  codCollected?: boolean;
}

export class TrackOrderDto {
  @IsString()
  @MaxLength(40)
  orderNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}

export class QueryOrderDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  paymentStatus?: string;
}
