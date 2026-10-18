import { Module } from '@nestjs/common';
import { PathaoGateway } from './pathao.gateway';
import { RedxGateway } from './redx.gateway';
import { ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';

@Module({
  controllers: [ShippingController],
  providers: [ShippingService, PathaoGateway, RedxGateway],
  exports: [ShippingService],
})
export class ShippingModule {}
