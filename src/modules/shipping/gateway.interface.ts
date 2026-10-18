export interface ShipmentRequest {
  orderNumber: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  city: string;
  /** COD amount to collect (৳); 0 for prepaid. */
  amountToCollect: number;
  itemQuantity: number;
  weightGrams: number;
}

export interface ShipmentResult {
  trackingCode: string;
  courier: string;
  raw: Record<string, unknown>;
}

export interface TrackingResult {
  status: string;
  raw: Record<string, unknown>;
}

/** A third-party logistics provider (Pathao, RedX, …). */
export interface ShipmentGateway {
  readonly courier: string;
  isConfigured(): boolean;
  create(req: ShipmentRequest): Promise<ShipmentResult>;
  track(trackingCode: string): Promise<TrackingResult>;
  cancel(trackingCode: string): Promise<void>;
}
