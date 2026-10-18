import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class InitiatePaymentDto {
  @ApiProperty()
  @IsString()
  @MaxLength(40)
  orderNumber!: string;

  @ApiPropertyOptional({ description: 'Required only for guest orders' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}

export class PaymentStatusQueryDto {
  @ApiPropertyOptional({ description: 'Required only for guest orders' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
