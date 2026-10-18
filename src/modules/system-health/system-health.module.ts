import { Module } from '@nestjs/common';
import { ErrorLogRepository } from './error-log.repository';
import { ErrorLogService } from './error-log.service';
import { MismatchRepository } from './mismatch.repository';
import { MismatchService } from './mismatch.service';
import { ReconciliationService } from './reconciliation.service';
import { SystemHealthController } from './system-health.controller';
import { SystemHealthService } from './system-health.service';

@Module({
  controllers: [SystemHealthController],
  providers: [
    ErrorLogRepository,
    ErrorLogService,
    MismatchRepository,
    MismatchService,
    SystemHealthService,
    ReconciliationService,
  ],
})
export class SystemHealthModule {}
