/** Human-friendly status labels for customer-facing messages. */
export const STATUS_LABELS: Record<string, string> = {
  PENDING: 'placed',
  CONFIRMED: 'confirmed',
  PROCESSING: 'being prepared',
  PACKED: 'packed',
  SHIPPED: 'shipped',
  OUT_FOR_DELIVERY: 'out for delivery',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  RETURN_REQUESTED: 'return requested',
  RETURNED: 'returned',
  REFUNDED: 'refunded',
};

export function formatBdt(amount: number): string {
  return `৳${amount.toLocaleString('en-BD')}`;
}

export interface OrderTemplateData {
  orderNumber: string;
  totalAmount?: number;
  status?: string;
  customerName?: string | null;
  trackingNumber?: string | null;
}

export function orderPlacedEmail(data: OrderTemplateData): { subject: string; html: string; text: string } {
  const greeting = data.customerName ? `Hi ${data.customerName},` : 'Hello,';
  const total = data.totalAmount != null ? ` Total: ${formatBdt(data.totalAmount)}.` : '';
  const text = `${greeting}\n\nThanks for your order ${data.orderNumber}.${total}\nWe will notify you as it moves along.\n\n— Rangoli`;
  return {
    subject: `Order ${data.orderNumber} received`,
    html: `<p>${greeting}</p><p>Thanks for your order <strong>${data.orderNumber}</strong>.${total ? ` Total: <strong>${formatBdt(
      data.totalAmount as number,
    )}</strong>.` : ''}</p><p>We will notify you as it moves along.</p><p>— Rangoli</p>`,
    text,
  };
}

export function orderStatusEmail(data: OrderTemplateData): { subject: string; html: string; text: string } {
  const label = STATUS_LABELS[data.status ?? ''] ?? (data.status ?? '').toLowerCase();
  const tracking = data.trackingNumber ? ` Tracking: ${data.trackingNumber}.` : '';
  const text = `Your order ${data.orderNumber} is now ${label}.${tracking}`;
  return {
    subject: `Order ${data.orderNumber} is ${label}`,
    html: `<p>Your order <strong>${data.orderNumber}</strong> is now <strong>${label}</strong>.${tracking}</p>`,
    text,
  };
}

export function orderPlacedSms(data: OrderTemplateData): string {
  return `Rangoli: order ${data.orderNumber} received${data.totalAmount != null ? ` (${formatBdt(data.totalAmount)})` : ''}. We'll keep you updated.`;
}

export function orderStatusSms(data: OrderTemplateData): string {
  const label = STATUS_LABELS[data.status ?? ''] ?? (data.status ?? '').toLowerCase();
  return `Rangoli: order ${data.orderNumber} is ${label}.${data.trackingNumber ? ` Tracking ${data.trackingNumber}.` : ''}`;
}

export interface PasswordResetTemplateData {
  link: string;
  customerName?: string | null;
}

export function passwordResetEmail(data: PasswordResetTemplateData): {
  subject: string;
  html: string;
  text: string;
} {
  const greeting = data.customerName ? `Hi ${data.customerName},` : 'Hello,';
  const text = `${greeting}\n\nWe received a request to reset your Rangoli password.\nSet a new password here (valid for 30 minutes):\n${data.link}\n\nIf you did not request this, you can ignore this email.\n\n— Rangoli`;
  return {
    subject: 'Reset your Rangoli password',
    html: `<p>${greeting}</p><p>We received a request to reset your Rangoli password.</p><p><a href="${data.link}">Set a new password</a> (valid for 30 minutes).</p><p>If you did not request this, you can safely ignore this email.</p><p>— Rangoli</p>`,
    text,
  };
}

export function passwordResetSms(link: string): string {
  return `Rangoli: reset your password (valid 30 min): ${link}`;
}
