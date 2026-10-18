import { Injectable, Logger } from '@nestjs/common';
import { MailService } from './mail.service';
import { SmsService } from './sms.service';
import {
  orderPlacedEmail,
  orderPlacedSms,
  orderStatusEmail,
  orderStatusSms,
} from './templates';

export interface OrderNotification {
  orderNumber: string;
  totalAmount?: number;
  status?: string;
  email?: string | null;
  phone?: string | null;
  customerName?: string | null;
  trackingNumber?: string | null;
}

/**
 * High-level customer notifications over the order lifecycle.
 * Every method is failure-proof and safe to call fire-and-forget.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly mail: MailService,
    private readonly sms: SmsService,
  ) {}

  async notifyOrderPlaced(order: OrderNotification): Promise<void> {
    await this.fanOut(order, orderPlacedEmail(order), orderPlacedSms(order));
  }

  async notifyOrderStatus(order: OrderNotification): Promise<void> {
    await this.fanOut(order, orderStatusEmail(order), orderStatusSms(order));
  }

  private async fanOut(
    order: OrderNotification,
    email: { subject: string; html: string; text: string },
    sms: string,
  ): Promise<void> {
    const tasks: Promise<unknown>[] = [];
    if (order.email) {
      tasks.push(this.mail.send({ to: order.email, ...email }));
    }
    if (order.phone) {
      tasks.push(this.sms.send({ to: order.phone, message: sms }));
    }
    if (tasks.length === 0) return;

    try {
      await Promise.all(tasks);
    } catch (error) {
      this.logger.warn(`Notification failed for ${order.orderNumber}: ${(error as Error).message}`);
    }
  }
}
