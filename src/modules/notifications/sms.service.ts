import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { postJson } from '../../common/http/post-json';
import { SendResult } from './mail.service';

export interface SmsMessage {
  to: string;
  message: string;
}

/**
 * Outbound SMS. Provider-agnostic JSON POST (default: a generic gateway).
 * Disabled / unconfigured → logs to console (dev mode); never throws.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    const sms = this.config.get<{ enabled: boolean; apiUrl: string; apiKey: string }>('sms');
    return Boolean(sms?.enabled && sms.apiUrl && sms.apiKey);
  }

  async send(message: SmsMessage): Promise<SendResult> {
    const sms = this.config.get<{
      enabled: boolean;
      provider: string;
      apiUrl: string;
      apiKey: string;
      senderId: string;
    }>('sms');

    if (!this.isEnabled()) {
      this.logger.log(`[sms:dev] → ${message.to} | ${message.message}`);
      return { delivered: false, channel: 'log' };
    }

    try {
      const res = await postJson(
        sms!.apiUrl,
        { to: message.to, message: message.message, sender_id: sms!.senderId },
        { Authorization: `Bearer ${sms!.apiKey}` },
      );
      const delivered = res.status >= 200 && res.status < 300;
      if (!delivered) {
        this.logger.warn(`[sms] provider returned ${res.status} for ${message.to}`);
      }
      return { delivered, channel: 'api', status: res.status };
    } catch (error) {
      this.logger.warn(`[sms] send failed for ${message.to}: ${(error as Error).message}`);
      return { delivered: false, channel: 'api' };
    }
  }
}
