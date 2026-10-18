import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Requires the caller to hold ALL listed permissions.
 *
 *   @Get('queue')
 *   @RequirePermissions('delivery:view_queue')
 *   getQueue() {}
 *
 * Super Admin (`"*"`) always passes.
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
