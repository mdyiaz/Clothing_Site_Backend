import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from './common/decorators/auth.decorators';
import { PERMISSIONS_KEY } from './common/decorators/permissions.decorator';
import { ALL_PERMISSIONS } from './common/permissions';
import { AuthController } from './modules/auth/auth.controller';
import { BannerController } from './modules/banners/banner.controller';
import { CartController } from './modules/cart/cart.controller';
import { CategoryController } from './modules/categories/category.controller';
import { CollectionController } from './modules/collections/collection.controller';
import { FooterController } from './modules/footer/footer.controller';
import { HealthController } from './modules/health/health.controller';
import { HomepageController } from './modules/homepage/homepage.controller';
import { MediaController } from './modules/media/media.controller';
import { NavbarController } from './modules/navbar/navbar.controller';
import { OrderController } from './modules/orders/order.controller';
import { ProductsController } from './modules/products/products.controller';
import { RoleController } from './modules/roles/role.controller';
import { SearchController } from './modules/search/search.controller';
import { SettingsController } from './modules/settings/settings.controller';
import { SystemHealthController } from './modules/system-health/system-health.controller';
import { WishlistController } from './modules/wishlist/wishlist.controller';

type ControllerClass = new (...args: never[]) => object;

const CONTROLLERS: ControllerClass[] = [
  AuthController,
  BannerController,
  CartController,
  CategoryController,
  CollectionController,
  FooterController,
  HealthController,
  HomepageController,
  MediaController,
  NavbarController,
  OrderController,
  ProductsController,
  RoleController,
  SearchController,
  SettingsController,
  SystemHealthController,
  WishlistController,
];

/**
 * Routes that need a JWT but deliberately require NO extra permission:
 * the caller's own session, cart merge, and wishlist. Any authenticated
 * identity (customer, guest, staff) may call them — the resource owner is
 * always the token holder. Keep this list tiny and review additions in PRs.
 */
const AUTHENTICATED_BUT_UNPERMISSIONED = new Set([
  'AuthController.me',
  'CartController.merge',
  'WishlistController.list',
  'WishlistController.toggle',
  'WishlistController.remove',
  'WishlistController.moveToCart',
  'OrderController.myOrders',
  'OrderController.myOrder',
  'OrderController.cancelMine',
]);

interface RouteInfo {
  controller: string;
  handler: string;
  method: string;
  isPublic: boolean;
  permissions: string[] | undefined;
}

function routesOf(ControllerClass: ControllerClass): RouteInfo[] {
  const prototype = ControllerClass.prototype as Record<string, (...args: never[]) => unknown>;
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor')
    .filter((name) => Reflect.getMetadata(PATH_METADATA, prototype[name]) !== undefined)
    .map((name) => ({
      controller: ControllerClass.name,
      handler: name,
      method: String(Reflect.getMetadata(METHOD_METADATA, prototype[name]) ?? '?').toUpperCase(),
      isPublic: Reflect.getMetadata(IS_PUBLIC_KEY, prototype[name]) === true,
      permissions: Reflect.getMetadata(PERMISSIONS_KEY, prototype[name]) as
        | string[]
        | undefined,
    }));
}

const ALL_ROUTES = CONTROLLERS.flatMap(routesOf);

describe('Route security contract', () => {
  it('discovers every controller route', () => {
    expect(ALL_ROUTES.length).toBeGreaterThan(50);
    const withoutMethod = ALL_ROUTES.filter((route) => route.method === '?');
    expect(withoutMethod).toEqual([]);
  });

  it('every route is either @Public() or @RequirePermissions(...)', () => {
    const unguarded = ALL_ROUTES.filter(
      (route) =>
        !route.isPublic &&
        !route.permissions &&
        !AUTHENTICATED_BUT_UNPERMISSIONED.has(`${route.controller}.${route.handler}`),
    );

    expect(unguarded).toEqual([]);
  });

  it('the authenticated-but-unpermissioned allowlist stays exactly as reviewed', () => {
    const found = ALL_ROUTES.filter(
      (route) => !route.isPublic && !route.permissions,
    ).map((route) => `${route.controller}.${route.handler}`);

    expect(found.sort()).toEqual([...AUTHENTICATED_BUT_UNPERMISSIONED].sort());
  });

  it('no route is both public and permission-guarded', () => {
    const both = ALL_ROUTES.filter((route) => route.isPublic && route.permissions);
    expect(both).toEqual([]);
  });

  it('every @RequirePermissions value is a known permission', () => {
    const known = new Set<string>(ALL_PERMISSIONS);
    const unknown: string[] = [];

    for (const route of ALL_ROUTES) {
      for (const permission of route.permissions ?? []) {
        if (permission !== '*' && !known.has(permission)) {
          unknown.push(`${route.controller}.${route.handler}: ${permission}`);
        }
      }
    }

    expect(unknown).toEqual([]);
  });

  it('storefront reads are public and admin writes are guarded (spot checks)', () => {
    const byName = new Map(ALL_ROUTES.map((route) => [`${route.controller}.${route.handler}`, route]));

    expect(byName.get('CollectionController.listLive')?.isPublic).toBe(true);
    expect(byName.get('CollectionController.liveBySlug')?.isPublic).toBe(true);
    expect(byName.get('CollectionController.replaceProducts')?.permissions?.length).toBeGreaterThan(0);
    expect(byName.get('HomepageController.storefront')?.isPublic).toBe(true);
    expect(byName.get('FooterController.subscribe')?.isPublic).toBe(true);
    expect(byName.get('SettingsController.getPublic')?.isPublic).toBe(true);
    expect(byName.get('MediaController.sign')?.permissions).toContain('media:upload');
    expect(byName.get('CartController.getCart')?.isPublic).toBe(true);
    expect(byName.get('CartController.merge')?.isPublic).toBeFalsy();
    expect(byName.get('OrderController.checkout')?.isPublic).toBe(true);
    expect(byName.get('OrderController.adminList')?.permissions).toContain('order:read');
    expect(byName.get('SystemHealthController.listErrors')?.permissions).toContain(
      'menu.settings.errors',
    );
    expect(byName.get('SystemHealthController.rerunChecks')?.permissions).toContain(
      'menu.settings.mismatches',
    );
  });
});
