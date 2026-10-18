import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { DiscountController } from './discount.controller';
import { DiscountRepository } from './discount.repository';
import { DiscountService } from './discount.service';

@Module({
  imports: [CartModule],
  controllers: [DiscountController],
  providers: [DiscountRepository, DiscountService],
  exports: [DiscountService],
})
export class DiscountsModule {}
