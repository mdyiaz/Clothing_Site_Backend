import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getJson } from '../../common/http/get-json';
import { postJson } from '../../common/http/post-json';
import { AppException } from '../../common/exceptions/app.exception';
import { ShipmentGateway, ShipmentRequest, ShipmentResult, TrackingResult } from './gateway.interface';

interface PathaoConfig {
  enabled: boolean;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  storeId: string;
}

const DELIVERY_TYPE_NORMAL = 48;
const ITEM_TYPE_PARCEL = 2;

/** Pathao Merchant (Aladdin) API adapter. */
@Injectable()
export class PathaoGateway implements ShipmentGateway {
  readonly courier = 'PATHAO';
  private readonly logger = new Logger(PathaoGateway.name);
  private tokenCache?: { token: string; expiresAt: number };

  constructor(private readonly config: ConfigService) {}

  private cfg(): PathaoConfig {
    return this.config.get<{ pathao: PathaoConfig }>('shipping3pl')!.pathao;
  }

  isConfigured(): boolean {
    const c = this.cfg();
    return Boolean(c.enabled && c.baseUrl && c.clientId && c.clientSecret && c.username && c.password && c.storeId);
  }

  async create(req: ShipmentRequest): Promise<ShipmentResult> {
    const c = this.cfg();
    const token = await this.grantToken();

    const res = await postJson(
      `${c.baseUrl}/aladdin/api/v1/orders`,
      {
        store_id: Number(c.storeId),
        merchant_order_id: req.orderNumber,
        recipient_name: req.recipientName,
        recipient_phone: req.recipientPhone,
        recipient_address: req.recipientAddress,
        recipient_city: 1,
        delivery_type: DELIVERY_TYPE_NORMAL,
        item_type: ITEM_TYPE_PARCEL,
        item_quantity: req.itemQuantity,
        item_weight: Math.max(0.5, req.weightGrams / 1000),
        amount_to_collect: req.amountToCollect,
      },
      { Authorization: `Bearer ${token}` },
    );

    const data = res.json.data as { consignment_id?: string } | undefined;
    if (res.status >= 300 || !data?.consignment_id) {
      this.logger.warn(`[pathao] create failed: ${JSON.stringify(res.json)}`);
      throw AppException.badRequest('SHIPMENT.GATEWAY_ERROR', 'Pathao rejected the shipment.');
    }
    return { trackingCode: data.consignment_id, courier: this.courier, raw: res.json };
  }

  async track(trackingCode: string): Promise<TrackingResult> {
    const c = this.cfg();
    const token = await this.grantToken();
    const res = await getJson(`${c.baseUrl}/aladdin/api/v1/orders/${trackingCode}/info`, {
      Authorization: `Bearer ${token}`,
    });
    const data = res.json.data as { order_status?: string } | undefined;
    return { status: data?.order_status ?? 'UNKNOWN', raw: res.json };
  }

  async cancel(trackingCode: string): Promise<void> {
    const c = this.cfg();
    const token = await this.grantToken();
    await postJson(
      `${c.baseUrl}/aladdin/api/v1/orders/${trackingCode}/cancel`,
      {},
      { Authorization: `Bearer ${token}` },
    );
  }

  private async grantToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) return this.tokenCache.token;
    const c = this.cfg();
    const res = await postJson(`${c.baseUrl}/aladdin/api/v1/issue-token`, {
      client_id: c.clientId,
      client_secret: c.clientSecret,
      username: c.username,
      password: c.password,
      grant_type: 'password',
    });
    const token = res.json.access_token as string | undefined;
    if (res.status >= 300 || !token) {
      this.logger.warn(`[pathao] token failed: ${JSON.stringify(res.json)}`);
      throw AppException.badRequest('SHIPMENT.GATEWAY_ERROR', 'Could not authenticate with Pathao.');
    }
    const expiresIn = Number(res.json.expires_in ?? 3600);
    this.tokenCache = { token, expiresAt: Date.now() + Math.max(30, expiresIn - 60) * 1000 };
    return token;
  }
}
