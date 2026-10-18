import {
  ACTION_PERMISSIONS,
  ALL_PERMISSIONS,
  MENU_PERMISSIONS,
  PERMISSIONS,
  hasPermission,
} from './permissions';

describe('permissions', () => {
  describe('hasPermission', () => {
    it('grants everything for the wildcard', () => {
      expect(hasPermission(['*'], 'order:update_status')).toBe(true);
      expect(hasPermission(['*'], 'menu.dashboard')).toBe(true);
    });

    it('grants an exact match', () => {
      expect(hasPermission(['order:read'], 'order:read')).toBe(true);
    });

    it('denies an ungranted permission', () => {
      expect(hasPermission(['order:read'], 'order:cancel')).toBe(false);
    });

    it('lets a parent menu unlock its children', () => {
      expect(hasPermission(['menu.delivery'], 'menu.delivery.queue')).toBe(true);
      expect(hasPermission(['menu.delivery'], 'menu.delivery.cod')).toBe(true);
    });

    it('does not let a child menu unlock its parent', () => {
      expect(hasPermission(['menu.delivery.queue'], 'menu.delivery')).toBe(false);
    });

    it('does not treat action permissions like menus', () => {
      expect(hasPermission(['product:read'], 'product:read_extra')).toBe(false);
    });
  });

  describe('catalog', () => {
    it('exposes PERMISSIONS as an alias of ACTION_PERMISSIONS', () => {
      expect(PERMISSIONS).toBe(ACTION_PERMISSIONS);
    });

    it('contains no duplicates across menus + actions', () => {
      const all = [...MENU_PERMISSIONS, ...Object.values(ACTION_PERMISSIONS)];
      expect(new Set(all).size).toBe(all.length);
      expect(ALL_PERMISSIONS).toEqual(all);
    });

    it('includes the Phase 2 media and content permissions', () => {
      expect(ALL_PERMISSIONS).toContain('media:upload');
      expect(ALL_PERMISSIONS).toContain('media:manage');
      expect(ALL_PERMISSIONS).toContain('content:manage');
    });

    it('keeps the resource:action naming convention', () => {
      for (const permission of Object.values(ACTION_PERMISSIONS)) {
        expect(permission).toMatch(/^[a-z]+:[a-z_0-9]+$/);
      }
    });
  });
});
