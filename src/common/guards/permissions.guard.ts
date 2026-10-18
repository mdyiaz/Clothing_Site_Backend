import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { hasPermission } from '../permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{ user?: { permissions?: string[] } }>();

    if (!user) {
      throw new ForbiddenException({
        code: 'AUTH.NOT_AUTHENTICATED',
        message: 'You must be signed in to do that.',
      });
    }

    const granted = user.permissions ?? [];

    // Super Admin wildcard bypass
    if (granted.includes('*')) {
      return true;
    }

    const missing = required.filter((permission) => !hasPermission(granted, permission));

    if (missing.length > 0) {
      throw new ForbiddenException({
        code: 'AUTH.MISSING_PERMISSION',
        message: `Missing permission: ${missing.join(', ')}`,
        ui: { action: 'toast' },
      });
    }

    return true;
  }
}
