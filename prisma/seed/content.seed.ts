import { NavbarLinkType, PrismaClient } from '@prisma/client';

/**
 * Storefront content defaults (footer, contact strip, social icons, navbar).
 * Idempotent: each group only seeds while its table is empty, so admin edits
 * are never overwritten on re-run.
 */

const FOOTER_COLUMNS: { title: string; links: { label: string; url: string }[] }[] = [
  {
    title: 'SHOP',
    links: [
      { label: 'Men', url: '/c/men' },
      { label: 'Women', url: '/c/women' },
      { label: 'Kids', url: '/c/kids' },
      { label: 'New Arrivals', url: '/products?sort=newest' },
      { label: 'Sale', url: '/products?onSale=true' },
      { label: 'Collections', url: '/collections' },
    ],
  },
  {
    title: 'ABOUT US',
    links: [
      { label: 'Our Story', url: '/pages/our-story' },
      { label: 'Careers', url: '/pages/careers' },
      { label: 'Store Locator', url: '/pages/store-locator' },
      { label: 'Blog', url: '/pages/blog' },
    ],
  },
  {
    title: 'CUSTOMER SERVICE',
    links: [
      { label: 'Contact', url: '/pages/contact' },
      { label: 'FAQ', url: '/pages/faq' },
      { label: 'Track Order', url: '/track-order' },
      { label: 'Return Policy', url: '/pages/return-policy' },
      { label: 'Shipping', url: '/pages/shipping' },
      { label: 'Size Guide', url: '/pages/size-guide' },
    ],
  },
  {
    title: 'HELP',
    links: [
      { label: 'Terms & Conditions', url: '/pages/terms' },
      { label: 'Privacy Policy', url: '/pages/privacy' },
      { label: 'Refund Policy', url: '/pages/refund-policy' },
    ],
  },
];

const CONTACT_INFO = [
  {
    type: 'HOTLINE' as const,
    label: 'Hotline (10 AM – 8 PM)',
    value: '16247',
    linkUrl: 'tel:16247',
    sortOrder: 0,
  },
  {
    type: 'WHATSAPP' as const,
    label: 'WhatsApp',
    value: '+880 1XXX-XXXXXX',
    linkUrl: 'https://wa.me/',
    sortOrder: 1,
  },
  {
    type: 'EMAIL' as const,
    label: 'Email',
    value: 'support@rangoli.com.bd',
    linkUrl: 'mailto:support@rangoli.com.bd',
    sortOrder: 2,
  },
  {
    type: 'ADDRESS' as const,
    label: 'Address',
    value: 'Dhaka, Bangladesh',
    linkUrl: null,
    sortOrder: 3,
  },
];

// Placeholder profile URLs — the admin swaps in the real pages.
const SOCIAL_LINKS = [
  { platform: 'facebook', url: 'https://facebook.com/', sortOrder: 0 },
  { platform: 'instagram', url: 'https://instagram.com/', sortOrder: 1 },
  { platform: 'youtube', url: 'https://youtube.com/', sortOrder: 2 },
  { platform: 'tiktok', url: 'https://tiktok.com/', sortOrder: 3 },
];

const NAVBAR_CATEGORIES = [
  { label: 'Men', slug: 'men', sortOrder: 0 },
  { label: 'Women', slug: 'women', sortOrder: 10 },
  { label: 'Kids', slug: 'kids', sortOrder: 20 },
];

const NAVBAR_CUSTOM = [
  { label: 'Sale', url: '/products?onSale=true', sortOrder: 30, highlight: true },
];

export async function seedContent(prisma: PrismaClient): Promise<void> {
  const notes: string[] = [];

  // ── Footer columns + links ────────────────────────────────────────────────
  const columnCount = await prisma.footerColumn.count();
  if (columnCount === 0) {
    let order = 0;
    for (const column of FOOTER_COLUMNS) {
      const created = await prisma.footerColumn.create({
        data: { title: column.title, sortOrder: order, isActive: true },
      });
      let linkOrder = 0;
      for (const link of column.links) {
        await prisma.footerLink.create({
          data: {
            columnId: created.id,
            label: link.label,
            url: link.url,
            target: '_self',
            sortOrder: linkOrder,
            isActive: true,
          },
        });
        linkOrder += 10;
      }
      order += 10;
    }
    notes.push(`${FOOTER_COLUMNS.length} footer columns`);
  }

  // ── Contact strip ─────────────────────────────────────────────────────────
  const contactCount = await prisma.storeContactInfo.count();
  if (contactCount === 0) {
    await prisma.storeContactInfo.createMany({ data: CONTACT_INFO });
    notes.push(`${CONTACT_INFO.length} contact entries`);
  }

  // ── Social icons ──────────────────────────────────────────────────────────
  const socialCount = await prisma.socialLink.count();
  if (socialCount === 0) {
    await prisma.socialLink.createMany({ data: SOCIAL_LINKS });
    notes.push(`${SOCIAL_LINKS.length} social links`);
  }

  // ── Navbar (categories + a highlighted Sale link) ─────────────────────────
  const navbarCount = await prisma.navbarItem.count();
  if (navbarCount === 0) {
    for (const item of NAVBAR_CATEGORIES) {
      const category = await prisma.category.findUnique({
        where: { slug: item.slug },
        select: { id: true },
      });
      if (!category) continue;
      await prisma.navbarItem.create({
        data: {
          label: item.label,
          linkType: NavbarLinkType.CATEGORY,
          categoryId: category.id,
          sortOrder: item.sortOrder,
          isActive: true,
        },
      });
    }
    for (const item of NAVBAR_CUSTOM) {
      await prisma.navbarItem.create({
        data: {
          label: item.label,
          linkType: NavbarLinkType.CUSTOM_URL,
          customUrl: item.url,
          highlight: item.highlight,
          sortOrder: item.sortOrder,
          isActive: true,
        },
      });
    }
    notes.push(`${NAVBAR_CATEGORIES.length + NAVBAR_CUSTOM.length} navbar items`);
  }

  if (notes.length > 0) {
    console.log(`  ✓ content: ${notes.join(', ')}`);
  }
}
