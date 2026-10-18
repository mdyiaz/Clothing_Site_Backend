import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { DiscountsModule } from '../discounts/discounts.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrderController } from './order.controller';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';

@Module({
  imports: [CartModule, DiscountsModule, LoyaltyModule, NotificationsModule],
  controllers: [OrderController],
  providers: [OrderRepository, OrderService],
  exports: [OrderService],
})
export class OrderModule {}
