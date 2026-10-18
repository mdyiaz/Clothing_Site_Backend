/**
 * Permission catalog — pure RBAC (no departments).
 *
 * Two families live in one flat list so a single `permissions: string[]` on Role
 * covers both sidebar visibility and API access:
 *
 *   - `menu.*`      → which sidebar entries a role can see
 *   - `resource:*`  → which API actions a role can perform
 *
 * Super Admin holds the wildcard `"*"` and bypasses every check.
 */

// ---------------------------------------------------------------------------
// Menu permissions (sidebar / navigation)
// ---------------------------------------------------------------------------

export const MENU_PERMISSIONS = [
  'menu.dashboard',

  'menu.orders',

  'menu.catalog',
  'menu.catalog.products',
  'menu.catalog.categories',
  'menu.catalog.collections',
  'menu.catalog.inventory',

  'menu.delivery',
  'menu.delivery.queue',
  'menu.delivery.packed',
  'menu.delivery.shipped',
  'menu.delivery.out_for_delivery',
  'menu.delivery.cod',
  'menu.delivery.3pl',

  'menu.marketing',
  'menu.marketing.overview',
  'menu.marketing.banners',
  'menu.marketing.homepage',
  'menu.marketing.collections',
  'menu.marketing.coupons',
  'menu.marketing.campaigns',
  'menu.marketing.analytics',

  'menu.accounting',
  'menu.accounting.overview',
  'menu.accounting.sales',
  'menu.accounting.cod',
  'menu.accounting.vendors',
  'menu.accounting.expenses',
  'menu.accounting.vat',
  'menu.accounting.profit_loss',

  'menu.support',
  'menu.support.tickets',
  'menu.support.returns',
  'menu.support.reviews',

  'menu.customers',
  'menu.reports',

  'menu.settings',
  'menu.settings.roles',
  'menu.settings.users',
  'menu.settings.store',
  'menu.settings.system_health',
  'menu.settings.errors',
  'menu.settings.mismatches',
] as const;

// ---------------------------------------------------------------------------
// Action permissions (API)
// ---------------------------------------------------------------------------

export const ACTION_PERMISSIONS = {
  // Products
  PRODUCT_READ: 'product:read',
  PRODUCT_CREATE: 'product:create',
  PRODUCT_UPDATE: 'product:update',
  PRODUCT_DELETE: 'product:delete',

  // Categories
  CATEGORY_READ: 'category:read',
  CATEGORY_CREATE: 'category:create',
  CATEGORY_UPDATE: 'category:update',
  CATEGORY_DELETE: 'category:delete',

  // Orders
  ORDER_READ: 'order:read',
  ORDER_UPDATE_STATUS: 'order:update_status',
  ORDER_CANCEL: 'order:cancel',
  ORDER_REFUND: 'order:refund',
  ORDER_ASSIGN_DELIVERY: 'order:assign_delivery',

  // Delivery
  DELIVERY_VIEW_QUEUE: 'delivery:view_queue',
  DELIVERY_MARK_PACKED: 'delivery:mark_packed',
  DELIVERY_MARK_SHIPPED: 'delivery:mark_shipped',
  DELIVERY_MARK_DELIVERED: 'delivery:mark_delivered',
  DELIVERY_COLLECT_COD: 'delivery:collect_cod',
  DELIVERY_MANAGE_3PL: 'delivery:manage_3pl',

  // Support
  SUPPORT_VIEW_TICKETS: 'support:view_tickets',
  SUPPORT_REPLY: 'support:reply',
  SUPPORT_MANAGE_RETURNS: 'support:manage_returns',
  SUPPORT_MANAGE_REVIEWS: 'support:manage_reviews',

  // Marketing
  MARKETING_VIEW_ANALYTICS: 'marketing:view_analytics',
  MARKETING_MANAGE_BANNERS: 'marketing:manage_banners',
  MARKETING_MANAGE_COLLECTIONS: 'marketing:manage_collections',
  MARKETING_MANAGE_COUPONS: 'marketing:manage_coupons',
  MARKETING_MANAGE_HOMEPAGE: 'marketing:manage_homepage',
  MARKETING_MANAGE_CAMPAIGNS: 'marketing:manage_campaigns',

  // Accounting
  ACCOUNTING_VIEW_REPORTS: 'accounting:view_reports',
  ACCOUNTING_MANAGE_INVOICES: 'accounting:manage_invoices',
  ACCOUNTING_MANAGE_EXPENSES: 'accounting:manage_expenses',
  ACCOUNTING_RECONCILE_COD: 'accounting:reconcile_cod',
  ACCOUNTING_MANAGE_VENDORS: 'accounting:manage_vendors',
  ACCOUNTING_VIEW_PROFIT: 'accounting:view_profit',

  // Inventory
  INVENTORY_READ: 'inventory:read',
  INVENTORY_UPDATE: 'inventory:update',
  INVENTORY_PROCURE: 'inventory:procure',

  // Users & roles
  USER_READ: 'user:read',
  USER_MANAGE: 'user:manage',
  ROLE_READ: 'role:read',
  ROLE_MANAGE: 'role:manage',

  // Loyalty & gift vouchers
  LOYALTY_READ: 'loyalty:read',
  LOYALTY_MANAGE: 'loyalty:manage',
  VOUCHER_READ: 'voucher:read',
  VOUCHER_MANAGE: 'voucher:manage',

  // Media (Cloudinary signed uploads)
  MEDIA_UPLOAD: 'media:upload',
  MEDIA_MANAGE: 'media:manage',

  // Site content (navbar, footer, contact info, social links)
  CONTENT_MANAGE: 'content:manage',

  // Settings
  SETTINGS_VIEW: 'settings:view',
  SETTINGS_UPDATE: 'settings:update',

  // Dashboards
  DASHBOARD_SUPER: 'dashboard:super',
  DASHBOARD_DELIVERY: 'dashboard:delivery',
  DASHBOARD_MARKETING: 'dashboard:marketing',
  DASHBOARD_ACCOUNTING: 'dashboard:accounting',
} as const;

export type ActionPermission =
  (typeof ACTION_PERMISSIONS)[keyof typeof ACTION_PERMISSIONS];

export type MenuPermission = (typeof MENU_PERMISSIONS)[number];

export type Permission = ActionPermission | MenuPermission | '*';

/** Wildcard granted to Super Admin — bypasses every permission check. */
export const SUPER_ADMIN_WILDCARD = '*';

export const PERMISSIONS = ACTION_PERMISSIONS;

export const ALL_PERMISSIONS: string[] = [
  ...MENU_PERMISSIONS,
  ...Object.values(ACTION_PERMISSIONS),
];

/**
 * True when the granted set satisfies the requirement.
 * `'*'` satisfies everything; a `menu.x` requirement is also satisfied by its
 * parent menu (e.g. `menu.delivery` unlocks `menu.delivery.queue`).
 */
export function hasPermission(granted: readonly string[], required: string): boolean {
  if (granted.includes(SUPER_ADMIN_WILDCARD)) return true;
  if (granted.includes(required)) return true;

  // parent menu unlocks child menu
  if (required.startsWith('menu.')) {
    const segments = required.split('.');
    for (let i = segments.length - 1; i > 1; i -= 1) {
      const parent = segments.slice(0, i).join('.');
      if (granted.includes(parent)) return true;
    }
  }

  return false;
}
