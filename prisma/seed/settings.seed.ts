import { PrismaClient } from '@prisma/client';

const STORE_SETTINGS: { key: string; value: unknown }[] = [
  // VAT — beginner mode, off until NBR registration
  { key: 'vat.enabled', value: false },
  { key: 'vat.defaultPercentage', value: 15 },
  { key: 'vat.showOnProductPage', value: false },
  { key: 'vat.showOnInvoice', value: true },

  // Store
  { key: 'store.currency', value: 'BDT' },
  { key: 'store.freeShippingThreshold', value: 8000 },
  { key: 'store.shippingInsideDhaka', value: 60 },
  { key: 'store.shippingOutsideDhaka', value: 100 },
  { key: 'store.codEnabled', value: true },
  { key: 'store.guestCheckoutEnabled', value: true },

  // Chatbot
  { key: 'store.chatbotEnabled', value: true },
  { key: 'store.chatbotWelcomeMessage', value: 'Hi! How can I help you today?' },
];

const SHIPPING_RATES = [
  {
    name: 'Inside Dhaka',
    zone: 'INSIDE_DHAKA' as const,
    cost: 60,
    freeShippingThreshold: 8000,
    estimatedDays: '1-2 days',
  },
  {
    name: 'Outside Dhaka',
    zone: 'OUTSIDE_DHAKA' as const,
    cost: 100,
    freeShippingThreshold: 8000,
    estimatedDays: '3-5 days',
  },
];

export async function seedSettings(prisma: PrismaClient): Promise<void> {
  for (const setting of STORE_SETTINGS) {
    await prisma.storeSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value as never },
      create: setting as never,
    });
  }

  for (const rate of SHIPPING_RATES) {
    const existing = await prisma.shippingRate.findFirst({ where: { zone: rate.zone } });
    if (!existing) {
      await prisma.shippingRate.create({ data: rate });
    }
  }

  console.log(`  ✓ ${STORE_SETTINGS.length} store settings, ${SHIPPING_RATES.length} shipping rates`);
}
