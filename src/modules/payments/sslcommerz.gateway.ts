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

interface SslConfig {
  enabled: boolean;
  baseUrl: string;
  storeId: string;
  storePassword: string;
}

/**
 * SSLCommerz hosted checkout. `createSession` returns a GatewayPageURL; the
 * shopper pays there and SSLCommerz hits our IPN / success URL. We then confirm
 * the transaction server-to-server through the validator API (never trust the
 * raw callback fields).
 */
@Injectable()
export class SslcommerzGateway implements PaymentGateway {
  readonly method = PaymentMethod.SSLCOMMERZ;
  private readonly logger = new Logger(SslcommerzGateway.name);

  constructor(private readonly config: ConfigService) {}

  private cfg(): SslConfig {
    return this.config.get<{ sslcommerz: SslConfig }>('payments')!.sslcommerz;
  }

  isConfigured(): boolean {
    const c = this.cfg();
    return Boolean(c.enabled && c.baseUrl && c.storeId && c.storePassword);
  }

  async createSession(input: CreateSessionInput): Promise<GatewaySession> {
    const c = this.cfg();
    const base = input.callbackUrl;

    const res = await postJson(`${c.baseUrl}/gwprocess/v4/api.php`, {
      store_id: c.storeId,
      store_passwd: c.storePassword,
      total_amount: input.amount.toString(),
      currency: 'BDT',
      tran_id: input.orderNumber,
      success_url: `${base}/sslcommerz/success`,
      fail_url: `${base}/sslcommerz/fail`,
      cancel_url: `${base}/sslcommerz/cancel`,
      ipn_url: `${base}/sslcommerz/ipn`,
      cus_name: 'Rangoli Customer',
      cus_email: 'customer@rangoli.com.bd',
      cus_phone: '01700000000',
      cus_add1: 'N/A',
      cus_city: 'Dhaka',
      cus_country: 'Bangladesh',
      shipping_method: 'NO',
      product_name: 'Rangoli order',
      product_category: 'general',
      product_profile: 'general',
    });

    const redirectUrl = res.json.GatewayPageURL as string | undefined;
    if (res.status >= 300 || !redirectUrl) {
      this.logger.warn(`[sslcommerz] create failed: ${JSON.stringify(res.json)}`);
      throw AppException.badRequest('PAYMENT.GATEWAY_ERROR', 'Could not start the SSLCommerz payment.');
    }
    return { redirectUrl, gatewayRef: (res.json.sessionkey as string | undefined) ?? input.orderNumber };
  }

  async verifyCallback(payload: Record<string, unknown>): Promise<GatewayCallbackResult> {
    const c = this.cfg();
    const valId = (payload.val_id as string | undefined) ?? '';
    const fallbackTranId = (payload.tran_id as string | undefined) ?? null;

    if (!valId) {
      return { success: false, gatewayTxnId: null, amount: null, raw: payload };
    }

    const url =
      `${c.baseUrl}/validator/api/validationserverAPI.php` +
      `?val_id=${encodeURIComponent(valId)}` +
      `&store_id=${encodeURIComponent(c.storeId)}` +
      `&store_passwd=${encodeURIComponent(c.storePassword)}` +
      `&format=json`;

    const res = await postJson(url, {});
    const status = res.json.status as string | undefined;
    const amount = res.json.amount != null ? Number(res.json.amount) : null;
    return {
      success: status === 'VALID' || status === 'VALIDATED',
      gatewayTxnId: (res.json.bank_tran_id as string | undefined) ?? fallbackTranId,
      amount: Number.isFinite(amount) ? amount : null,
      raw: res.json,
    };
  }
}
