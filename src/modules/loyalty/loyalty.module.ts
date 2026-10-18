import { Module } from '@nestjs/common';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';
import { VoucherController } from './voucher.controller';
import { VoucherService } from './voucher.service';

@Module({
  controllers: [LoyaltyController, VoucherController],
  providers: [LoyaltyService, VoucherService],
  exports: [LoyaltyService, VoucherService],
})
export class LoyaltyModule {}
