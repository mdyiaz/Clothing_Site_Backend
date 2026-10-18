import { PaymentMethod } from '@prisma/client';

export interface CreateSessionInput {
  orderNumber: string;
  amount: number;
  /** Where the gateway should return the shopper after payment. */
  callbackUrl: string;
}

export interface GatewaySession {
  redirectUrl: string;
  /** Payment/session reference stored on the Payment row. */
  gatewayRef: string;
}

export interface GatewayCallbackResult {
  success: boolean;
  gatewayTxnId: string | null;
  /** Amount reported by the gateway (৳), when available. */
  amount: number | null;
  raw: Record<string, unknown>;
}

/** A redirect-based payment provider (bKash, SSLCommerz, …). */
export interface PaymentGateway {
  readonly method: PaymentMethod;
  isConfigured(): boolean;
  createSession(input: CreateSessionInput): Promise<GatewaySession>;
  verifyCallback(payload: Record<string, unknown>): Promise<GatewayCallbackResult>;
}
