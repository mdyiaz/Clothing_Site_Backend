import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod } from '@prisma/client';
import { postJson } from '../../common/http/post-json';
import { AppException } from '../../common/exceptions/app.exception';
import {
  CreateSessionInput,
  GatewayCallbackResult,
  GatewaySession,
  PaymentGateway,
} from './gateway.interface';

interface BkashConfig {
  enabled: boolean;
  baseUrl: string;
  appKey: string;
  appSecret: string;
  username: string;
  password: string;
}

/**
 * bKash Tokenized Checkout (v1.2.0). Three server-to-server calls:
 * grant token → create payment → execute. The shopper is redirected to
 * `bkashURL`; bKash returns to our callback with a `paymentID` which we
 * execute to obtain the final `trxID`.
 */
@Injectable()
export class BkashGateway implements PaymentGateway {
  readonly method = PaymentMethod.BKASH;
  private readonly logger = new Logger(BkashGateway.name);
  private tokenCache?: { token: string; expiresAt: number };

  constructor(private readonly config: ConfigService) {}

  private cfg(): BkashConfig {
    return this.config.get<{ bkash: BkashConfig }>('payments')!.bkash;
  }

  isConfigured(): boolean {
    const c = this.cfg();
    return Boolean(c.enabled && c.baseUrl && c.appKey && c.appSecret && c.username && c.password);
  }

  async createSession(input: CreateSessionInput): Promise<GatewaySession> {
    const c = this.cfg();
    const token = await this.grantToken();

    const res = await postJson(
      `${c.baseUrl}/tokenized/checkout/create`,
      {
        mode: '0011',
        payerReference: input.orderNumber,
        callbackURL: input.callbackUrl,
        amount: input.amount.toString(),
        currency: 'BDT',
        intent: 'sale',
        merchantInvoiceNumber: input.orderNumber,
      },
      { Authorization: token, 'X-APP-Key': c.appKey },
    );

    const bkashURL = res.json.bkashURL as string | undefined;
    const paymentID = res.json.paymentID as string | undefined;
    if (res.status >= 300 || !bkashURL || !paymentID) {
      this.logger.warn(`[bkash] create failed: ${JSON.stringify(res.json)}`);
      throw AppException.badRequest('PAYMENT.GATEWAY_ERROR', 'Could not start the bKash payment.');
    }
    return { redirectUrl: bkashURL, gatewayRef: paymentID };
  }

  async verifyCallback(payload: Record<string, unknown>): Promise<GatewayCallbackResult> {
    const c = this.cfg();
    const paymentID = payload.paymentID as string | undefined;
    if (!paymentID) {
      return { success: false, gatewayTxnId: null, amount: null, raw: payload };
    }

    const token = await this.grantToken();
    const res = await postJson(
      `${c.baseUrl}/tokenized/checkout/execute`,
      { paymentID },
      { Authorization: token, 'X-APP-Key': c.appKey },
    );

    const status = res.json.transactionStatus as string | undefined;
    const amount = res.json.amount != null ? Number(res.json.amount) : null;
    return {
      success: status === 'Completed',
      gatewayTxnId: (res.json.trxID as string | undefined) ?? null,
      amount: Number.isFinite(amount) ? amount : null,
      raw: res.json,
    };
  }

  private async grantToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) return this.tokenCache.token;

    const c = this.cfg();
    const res = await postJson(
      `${c.baseUrl}/tokenized/checkout/token/grant`,
      { app_key: c.appKey, app_secret: c.appSecret },
      { username: c.username, password: c.password },
    );

    const token = res.json.id_token as string | undefined;
    if (res.status >= 300 || !token) {
      this.logger.warn(`[bkash] token grant failed: ${JSON.stringify(res.json)}`);
      throw AppException.badRequest('PAYMENT.GATEWAY_ERROR', 'Could not authenticate with bKash.');
    }
    const expiresIn = Number(res.json.expires_in ?? 3600);
    this.tokenCache = { token, expiresAt: Date.now() + Math.max(30, expiresIn - 60) * 1000 };
    return token;
  }
}
