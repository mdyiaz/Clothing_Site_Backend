import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getJson } from '../../common/http/get-json';
import { postJson } from '../../common/http/post-json';
import { AppException } from '../../common/exceptions/app.exception';
import { ShipmentGateway, ShipmentRequest, ShipmentResult, TrackingResult } from './gateway.interface';

interface RedxConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
}

/** RedX OpenAPI adapter (API-ACCESS-TOKEN auth). */
@Injectable()
export class RedxGateway implements ShipmentGateway {
  readonly courier = 'REDX';
  private readonly logger = new Logger(RedxGateway.name);

  constructor(private readonly config: ConfigService) {}

  private cfg(): RedxConfig {
    return this.config.get<{ redx: RedxConfig }>('shipping3pl')!.redx;
  }

  isConfigured(): boolean {
    const c = this.cfg();
    return Boolean(c.enabled && c.baseUrl && c.apiKey);
  }

  async create(req: ShipmentRequest): Promise<ShipmentResult> {
    const c = this.cfg();
    const res = await postJson(
      `${c.baseUrl}/parcel`,
      {
        customer_name: req.recipientName,
        customer_phone: req.recipientPhone,
        delivery_area: req.city,
        customer_address: req.recipientAddress,
        merchant_invoice_id: req.orderNumber,
        cash_collection_amount: req.amountToCollect,
        parcel_weight: Math.max(500, req.weightGrams),
        value: req.amountToCollect,
      },
      { 'API-ACCESS-TOKEN': `Bearer ${c.apiKey}` },
    );

    const trackingCode = res.json.tracking_id as string | undefined;
    if (res.status >= 300 || !trackingCode) {
      this.logger.warn(`[redx] create failed: ${JSON.stringify(res.json)}`);
      throw AppException.badRequest('SHIPMENT.GATEWAY_ERROR', 'RedX rejected the shipment.');
    }
    return { trackingCode, courier: this.courier, raw: res.json };
  }

  async track(trackingCode: string): Promise<TrackingResult> {
    const c = this.cfg();
    const res = await getJson(`${c.baseUrl}/parcel/track/${trackingCode}`, {
      'API-ACCESS-TOKEN': `Bearer ${c.apiKey}`,
    });
    const status = (res.json.tracking as { status_name?: string }[] | undefined)?.[0]?.status_name;
    return { status: status ?? 'UNKNOWN', raw: res.json };
  }

  async cancel(trackingCode: string): Promise<void> {
    const c = this.cfg();
    await postJson(
      `${c.baseUrl}/parcel/cancel`,
      { tracking_id: trackingCode },
      { 'API-ACCESS-TOKEN': `Bearer ${c.apiKey}` },
    );
  }
}
