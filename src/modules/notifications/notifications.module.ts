import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { SmsService } from './sms.service';

@Module({
  controllers: [NotificationController],
  providers: [MailService, SmsService, NotificationService],
  exports: [NotificationService, MailService, SmsService],
})
export class NotificationsModule {}
