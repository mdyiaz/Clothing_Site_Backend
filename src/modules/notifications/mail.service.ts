import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { postJson } from '../../common/http/post-json';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendResult {
  delivered: boolean;
  channel: 'api' | 'log';
  status?: number;
}

/**
 * Outbound email. Provider-agnostic JSON POST (default: Resend).
 * Disabled / unconfigured → logs to console (dev mode) and never throws,
 * so a mail outage can never break a checkout or a status change.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    const mail = this.config.get<{ enabled: boolean; apiUrl: string; apiKey: string }>('mail');
    return Boolean(mail?.enabled && mail.apiUrl && mail.apiKey);
  }

  async send(message: MailMessage): Promise<SendResult> {
    const mail = this.config.get<{
      enabled: boolean;
      provider: string;
      apiUrl: string;
      apiKey: string;
      from: string;
      fromName: string;
    }>('mail');

    if (!this.isEnabled()) {
      this.logger.log(`[mail:dev] → ${message.to} | ${message.subject}`);
      return { delivered: false, channel: 'log' };
    }

    try {
      const res = await postJson(
        mail!.apiUrl,
        {
          from: `${mail!.fromName} <${mail!.from}>`,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          ...(message.text ? { text: message.text } : {}),
        },
        { Authorization: `Bearer ${mail!.apiKey}` },
      );
      const delivered = res.status >= 200 && res.status < 300;
      if (!delivered) {
        this.logger.warn(`[mail] provider returned ${res.status} for ${message.to}`);
      }
      return { delivered, channel: 'api', status: res.status };
    } catch (error) {
      this.logger.warn(`[mail] send failed for ${message.to}: ${(error as Error).message}`);
      return { delivered: false, channel: 'api' };
    }
  }
}
