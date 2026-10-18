import { PrismaClient } from '@prisma/client';

type SeedRole = {
  name: string;
  slug: string;
  description: string;
  isSystem: boolean;
  level: number;
  color: string;
  icon: string;
  sortOrder: number;
  permissions: string[];
};

export const ROLES: SeedRole[] = [
  // 1. SUPER ADMIN
  {
    name: 'Super Admin',
    slug: 'super-admin',
    description: 'Full system access — cannot be deleted',
    isSystem: true,
    level: 99,
    color: '#DC2626',
    icon: 'ShieldCheck',
    sortOrder: 0,
    permissions: ['*'],
  },

  // 2. OWNER
  {
    name: 'Owner',
    slug: 'owner',
    description: 'Business owner — full read access across all modules',
    isSystem: false,
    level: 90,
    color: '#6B7280',
    icon: 'Crown',
    sortOrder: 1,
    permissions: [
      'menu.dashboard',
      'menu.delivery', 'menu.delivery.queue', 'menu.delivery.packed', 'menu.delivery.shipped', 'menu.delivery.cod',
      'menu.marketing', 'menu.marketing.overview', 'menu.marketing.banners', 'menu.marketing.homepage', 'menu.marketing.collections', 'menu.marketing.coupons', 'menu.marketing.analytics',
      'menu.accounting', 'menu.accounting.overview', 'menu.accounting.sales', 'menu.accounting.cod', 'menu.accounting.profit_loss',
      'menu.support', 'menu.support.tickets', 'menu.support.returns', 'menu.support.reviews',
      'menu.catalog', 'menu.catalog.products', 'menu.catalog.categories', 'menu.catalog.collections', 'menu.catalog.inventory',
      'menu.orders',
      'menu.customers',
      'menu.reports',
      'menu.settings', 'menu.settings.roles', 'menu.settings.users', 'menu.settings.store',
      'product:read', 'category:read', 'order:read', 'user:read', 'settings:view',
    ],
  },

  // 3. DELIVERY DEPARTMENT
  {
    name: 'Delivery Department',
    slug: 'delivery-department',
    description: 'Order confirmation, packing, shipping, COD collection',
    isSystem: false,
    level: 50,
    color: '#3B82F6',
    icon: 'Truck',
    sortOrder: 2,
    permissions: [
      'menu.dashboard',
      'menu.delivery', 'menu.delivery.queue', 'menu.delivery.packed', 'menu.delivery.shipped', 'menu.delivery.out_for_delivery', 'menu.delivery.cod', 'menu.delivery.3pl',
      'menu.orders',
      'order:read',
      'order:update_status',
      'order:assign_delivery',
      'delivery:view_queue',
      'delivery:mark_packed',
      'delivery:mark_shipped',
      'delivery:mark_delivered',
      'delivery:collect_cod',
      'delivery:manage_3pl',
    ],
  },

  // 4. CUSTOMER CARE
  {
    name: 'Customer Care',
    slug: 'customer-care',
    description: 'Support tickets, returns, reviews, order help',
    isSystem: false,
    level: 50,
    color: '#EF4444',
    icon: 'Headphones',
    sortOrder: 3,
    permissions: [
      'menu.dashboard',
      'menu.support', 'menu.support.tickets', 'menu.support.returns', 'menu.support.reviews',
      'menu.orders',
      'order:read',
      'support:view_tickets',
      'support:reply',
      'support:manage_returns',
      'support:manage_reviews',
    ],
  },

  // 5. MARKETING DEPARTMENT
  {
    name: 'Marketing Department',
    slug: 'marketing-department',
    description: 'Banners, collections, coupons, campaigns, homepage',
    isSystem: false,
    level: 50,
    color: '#8B5CF6',
    icon: 'Megaphone',
    sortOrder: 4,
    permissions: [
      'menu.dashboard',
      'menu.marketing', 'menu.marketing.overview', 'menu.marketing.banners', 'menu.marketing.homepage', 'menu.marketing.collections', 'menu.marketing.coupons', 'menu.marketing.campaigns', 'menu.marketing.analytics',
      'menu.catalog', 'menu.catalog.products', 'menu.catalog.collections',
      'product:read',
      'category:read',
      'marketing:view_analytics',
      'marketing:manage_banners',
      'marketing:manage_collections',
      'marketing:manage_coupons',
      'marketing:manage_homepage',
      'marketing:manage_campaigns',
      'media:upload',
      'media:manage',
      'content:manage',
    ],
  },

  // 6. ACCOUNTING DEPARTMENT
  {
    name: 'Accounting Department',
    slug: 'accounting-department',
    description: 'Invoices, VAT, P&L, COD reconciliation, vendors',
    isSystem: false,
    level: 50,
    color: '#10B981',
    icon: 'Calculator',
    sortOrder: 5,
    permissions: [
      'menu.dashboard',
      'menu.accounting', 'menu.accounting.overview', 'menu.accounting.sales', 'menu.accounting.cod', 'menu.accounting.vendors', 'menu.accounting.expenses', 'menu.accounting.vat', 'menu.accounting.profit_loss',
      'menu.orders',
      'order:read',
      'accounting:view_reports',
      'accounting:manage_invoices',
      'accounting:manage_expenses',
      'accounting:reconcile_cod',
      'accounting:manage_vendors',
      'accounting:view_profit',
    ],
  },

  // 7. INVENTORY MANAGER
  {
    name: 'Inventory Manager',
    slug: 'inventory-manager',
    description: 'Stock management and procurement',
    isSystem: false,
    level: 40,
    color: '#F59E0B',
    icon: 'Package',
    sortOrder: 6,
    permissions: [
      'menu.dashboard',
      'menu.catalog', 'menu.catalog.products', 'menu.catalog.categories', 'menu.catalog.inventory',
      'product:read',
      'product:update',
      'inventory:read',
      'inventory:update',
      'inventory:procure',
    ],
  },
];

export async function seedRoles(prisma: PrismaClient): Promise<void> {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { slug: role.slug },
      update: {
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        color: role.color,
        icon: role.icon,
        level: role.level,
        sortOrder: role.sortOrder,
        isActive: true,
      },
      create: role,
    });
  }

  console.log(`  ✓ ${ROLES.length} roles`);
}
