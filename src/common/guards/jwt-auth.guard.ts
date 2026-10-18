import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AppException } from '../exceptions/app.exception';
import { setActor } from '../correlation/correlation-storage';
import { IS_PUBLIC_KEY } from '../decorators/auth.decorators';
import { AuthenticatedActor } from '../../types/express';
import { PrismaService } from '../../prisma/prisma.service';

export interface AccessTokenPayload {
  sub: string;
  email?: string | null;
  isGuest: boolean;
  isSuperAdmin: boolean;
  roles: string[];
  permissions: string[];
  sv: number;
  typ: 'access';
}

export const ACCESS_TOKEN_COOKIE = 'rangoli_access_token';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      if (isPublic) return true;
      throw AppException.unauthorized();
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch {
      if (isPublic) return true;
      throw AppException.unauthorized('Your session has expired. Please sign in again.');
    }

    if (payload.typ !== 'access') {
      if (isPublic) return true;
      throw AppException.unauthorized('Invalid session token.');
    }

    const actor = await this.resolveActor(payload);
    if (!actor) {
      if (isPublic) return true;
      throw AppException.unauthorized('Your session is no longer valid.');
    }

    request.user = actor;
    setActor(actor);
    return true;
  }

  /**
   * The token carries permissions for speed, but the session version is re-checked
   * server-side so password/role changes revoke tokens immediately.
   */
  private async resolveActor(payload: AccessTokenPayload): Promise<AuthenticatedActor | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, sessionVersion: true, isActive: true, deletedAt: true },
    });

    if (!user || !user.isActive || user.deletedAt) return null;
    if (user.sessionVersion !== payload.sv) return null;

    return {
      userId: user.id,
      email: user.email ?? payload.email ?? null,
      isGuest: payload.isGuest,
      isSuperAdmin: payload.isSuperAdmin,
      roles: payload.roles ?? [],
      permissions: payload.permissions ?? [],
      sessionVersion: user.sessionVersion,
    };
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      return header.slice(7);
    }
    const cookies = (request as Request & { cookies?: Record<string, string> }).cookies;
    return cookies?.[ACCESS_TOKEN_COOKIE];
  }
}
