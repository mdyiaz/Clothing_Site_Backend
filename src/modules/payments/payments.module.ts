import { Module } from '@nestjs/common';
import { BkashGateway } from './bkash.gateway';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { SslcommerzGateway } from './sslcommerz.gateway';

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, BkashGateway, SslcommerzGateway],
  exports: [PaymentService],
})
export class PaymentsModule {}
