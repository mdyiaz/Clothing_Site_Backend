import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { AppException } from '../../common/exceptions/app.exception';
import { AccessTokenPayload } from '../../common/guards/jwt-auth.guard';
import { SUPER_ADMIN_WILDCARD } from '../../common/permissions';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../notifications/mail.service';
import { SmsService } from '../notifications/sms.service';
import { passwordResetEmail, passwordResetSms } from '../notifications/templates';
import { AuthResult, RefreshPayload, ResetPayload, SessionRole, SessionUser } from './auth.types';
import {
  AdminLoginDto,
  CustomerLoginDto,
  ForgotPasswordDto,
  GuestLoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto';

const BCRYPT_ROUNDS = 12;
const RESET_TTL = '30m';

type UserRow = {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  isGuest: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  loyaltyPoints: number;
  loyaltyTier: unknown;
  isActive: boolean;
  deletedAt: Date | null;
  sessionVersion: number;
};

type RoleRow = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  icon: string | null;
  isActive: boolean;
  permissions: unknown;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly sms: SmsService,
  ) {}

  // -------------------------------------------------------------------------
  // Login flows
  // -------------------------------------------------------------------------

  async adminLogin(dto: AdminLoginDto, ip?: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (!user || !user.passwordHash || user.deletedAt || !user.isActive) {
      this.logger.warn(`Failed admin login for ${dto.email} from ${ip ?? 'unknown'}`);
      throw this.invalidCredentials('Incorrect email or password.', 'password');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      this.logger.warn(`Bad password for ${dto.email} from ${ip ?? 'unknown'}`);
      throw this.invalidCredentials('Incorrect email or password.', 'password');
    }

    const roles = await this.loadRoles(user.id);
    if (roles.length === 0) {
      throw AppException.forbidden(
        'Your account has no role yet. Ask an administrator to assign one.',
      );
    }

    return this.issueTokens(user, roles);
  }

  /**
   * Customer self-registration. At least one of email/phone is required and
   * each must be unique. Passwords are bcrypt-hashed; the customer starts with
   * no roles (just like a checkout account).
   */
  async register(dto: RegisterDto): Promise<AuthResult> {
    const email = dto.email?.toLowerCase().trim() || null;
    const phone = dto.phone?.trim() || null;

    if (!email && !phone) {
      throw AppException.badRequest('AUTH.IDENTIFIER_MISSING', 'Enter your email or phone number.', {
        field: 'email',
        action: 'focus',
      });
    }

    if (email) {
      const existing = await this.prisma.user.findUnique({ where: { email } });
      if (existing) {
        throw AppException.conflict('AUTH.EMAIL_TAKEN', 'An account with this email already exists.', {
          field: 'email',
        });
      }
    }
    if (phone) {
      const existing = await this.prisma.user.findUnique({ where: { phone } });
      if (existing) {
        throw AppException.conflict('AUTH.PHONE_TAKEN', 'An account with this phone number already exists.', {
          field: 'phone',
        });
      }
    }

    const passwordHash = await this.hashPassword(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email,
        phone,
        fullName: dto.fullName?.trim() || null,
        passwordHash,
        isGuest: false,
      },
    });

    this.logger.log(`New customer registered: ${email ?? phone}`);
    return this.issueTokens(user as UserRow, []);
  }

  async customerLogin(dto: CustomerLoginDto, ip?: string): Promise<AuthResult> {
    const email = dto.email?.toLowerCase().trim();
    if (!email && !dto.phone) {
      throw AppException.badRequest('AUTH.IDENTIFIER_MISSING', 'Enter your email or phone number.', {
        field: 'email',
        action: 'focus',
      });
    }

    const user = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [
          ...(email ? [{ email }] : []),
          ...(dto.phone ? [{ phone: dto.phone.trim() }] : []),
        ],
      },
    });

    if (!user || !user.passwordHash || user.isGuest) {
      this.logger.warn(`Failed customer login (${email ?? dto.phone}) from ${ip ?? 'unknown'}`);
      throw this.invalidCredentials('Incorrect email/phone or password.', 'password');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw this.invalidCredentials('Incorrect email/phone or password.', 'password');
    }

    return this.issueTokens(user, await this.loadRoles(user.id));
  }

  /**
   * Guest sessions power COD checkout — ~70% of Bangladeshi orders never sign in.
   */
  async guestLogin(dto: GuestLoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.create({
      data: {
        isGuest: true,
        fullName: dto.fullName,
        phone: dto.phone,
        phoneVerified: Boolean(dto.phone),
      },
    });

    return this.issueTokens(user, []);
  }

  // -------------------------------------------------------------------------
  // Refresh / verify / revoke
  // -------------------------------------------------------------------------

  async refresh(refreshToken: string): Promise<AuthResult> {
    let payload: RefreshPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret', ''),
      });
    } catch {
      throw AppException.unauthorized('Your session has expired. Please sign in again.');
    }

    if (payload.typ !== 'refresh') {
      throw AppException.unauthorized('Invalid session token.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!this.isActiveSessionUser(user) || user.sessionVersion !== payload.sv) {
      throw AppException.unauthorized('Your session is no longer valid.');
    }

    return this.issueTokens(user, await this.loadRoles(user.id));
  }

  /**
   * Called by NextAuth's `jwt` callback: turns a backend access token into the
   * session payload used by Rangoli-admin / Rangoli-frontend.
   */
  async verifySession(accessToken: string): Promise<SessionUser> {
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(accessToken);
    } catch {
      throw AppException.unauthorized('Your session has expired. Please sign in again.');
    }

    if (payload.typ !== 'access') {
      throw AppException.unauthorized('Invalid session token.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!this.isActiveSessionUser(user) || user.sessionVersion !== payload.sv) {
      throw AppException.unauthorized('Your session is no longer valid.');
    }

    return this.toSessionUser(user, await this.loadRoles(user.id));
  }

  /** `GET /auth/me` — full session payload including roles + permissions. */
  async getMe(userId: string): Promise<SessionUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!this.isActiveSessionUser(user)) {
      throw AppException.unauthorized('Your session is no longer valid.');
    }
    return this.toSessionUser(user, await this.loadRoles(user.id));
  }

  /** Bumps `sessionVersion` — instantly revokes every outstanding token. */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } },
    });
  }

  // -------------------------------------------------------------------------
  // Password reset
  // -------------------------------------------------------------------------

  /**
   * Sends a stateless, single-use reset link. Always resolves the same way so it
   * cannot be used to enumerate accounts. Delivery is via email when available,
   * otherwise SMS; both degrade to a console log when unconfigured.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ sent: true }> {
    const email = dto.email?.toLowerCase().trim() || null;
    const phone = dto.phone?.trim() || null;

    if (!email && !phone) {
      throw AppException.badRequest('AUTH.IDENTIFIER_MISSING', 'Enter your email or phone number.', {
        field: 'email',
        action: 'focus',
      });
    }

    const user = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [
          ...(email ? [{ email }] : []),
          ...(phone ? [{ phone }] : []),
        ],
      },
    });

    if (!user || !user.passwordHash || user.isGuest) {
      return { sent: true };
    }

    const token = await this.createResetToken(user as UserRow, user.passwordHash);
    const link = `${this.config.get<string>('frontendUrl', 'http://localhost:3000')}/reset-password?token=${encodeURIComponent(token)}`;

    if (user.email) {
      const mail = passwordResetEmail({ link, customerName: user.fullName });
      await this.mail.send({ to: user.email, subject: mail.subject, html: mail.html, text: mail.text });
    } else if (user.phone) {
      await this.sms.send({ to: user.phone, message: passwordResetSms(link) });
    }

    this.logger.log(`Password reset requested for ${user.email ?? user.phone}`);
    return { sent: true };
  }

  /** Consumes a reset token and rotates the password, revoking all sessions. */
  async resetPassword(dto: ResetPasswordDto): Promise<{ ok: true }> {
    let payload: ResetPayload;
    try {
      payload = await this.jwtService.verifyAsync<ResetPayload>(dto.token, {
        secret: this.config.get<string>('jwt.resetSecret', ''),
      });
    } catch {
      throw this.invalidResetToken();
    }

    if (payload.typ !== 'reset') {
      throw this.invalidResetToken();
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (
      !user ||
      !user.passwordHash ||
      user.isGuest ||
      user.deletedAt ||
      !user.isActive ||
      user.sessionVersion !== payload.sv ||
      this.fingerprint(user.passwordHash) !== payload.pv
    ) {
      throw this.invalidResetToken();
    }

    const passwordHash = await this.hashPassword(dto.password);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });

    this.logger.log(`Password reset completed for ${user.email ?? user.phone}`);
    return { ok: true };
  }

  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private invalidCredentials(message: string, field: string): UnauthorizedException {
    return new UnauthorizedException({
      code: 'AUTH.INVALID_CREDENTIALS',
      message,
      ui: { field, action: 'focus' },
    });
  }

  private invalidResetToken(): AppException {
    return AppException.badRequest(
      'AUTH.RESET_INVALID',
      'This reset link is invalid or has expired. Request a new one.',
      { action: 'reload' },
    );
  }

  private async createResetToken(user: UserRow, passwordHash: string): Promise<string> {
    const payload: ResetPayload = {
      sub: user.id,
      sv: user.sessionVersion,
      pv: this.fingerprint(passwordHash),
      typ: 'reset',
    };
    return this.jwtService.signAsync(payload, {
      secret: this.config.get<string>('jwt.resetSecret', ''),
      expiresIn: RESET_TTL,
    } as unknown as JwtSignOptions);
  }

  /**
   * Binds a reset token to the password in force when it was issued, so the
   * token is invalidated the moment the password changes.
   */
  private fingerprint(passwordHash: string): string {
    return createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);
  }

  private isActiveSessionUser(
    user: (UserRow & { passwordHash?: string | null }) | null,
  ): user is UserRow {
    return Boolean(user && user.isActive && !user.deletedAt);
  }

  private async loadRoles(userId: string): Promise<RoleRow[]> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId, role: { isActive: true } },
      include: { role: true },
      orderBy: { assignedAt: 'asc' },
    });

    return rows.map((row) => row.role);
  }

  private async issueTokens(user: UserRow, roles: RoleRow[]): Promise<AuthResult> {
    const permissions = this.flattenPermissions(roles);
    const isSuperAdmin =
      roles.some((role) => role.slug === 'super-admin') ||
      permissions.includes(SUPER_ADMIN_WILDCARD);

    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      isGuest: user.isGuest,
      isSuperAdmin,
      roles: this.unique(roles.map((role) => role.slug)),
      permissions,
      sv: user.sessionVersion,
      typ: 'access',
    };

    const refreshPayload: RefreshPayload = {
      sub: user.id,
      sv: user.sessionVersion,
      typ: 'refresh',
    };

    const accessTtl = this.config.get<string>('jwt.accessTtl', '2h');
    const refreshTtl = this.config.get<string>('jwt.refreshTtl', '7d');
    const refreshSecret = this.config.get<string>('jwt.refreshSecret', '');

    // `expiresIn` accepts '2h' style strings at runtime; the bundled typings only
    // declare `ms`'s StringValue, hence the cast.
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, { expiresIn: accessTtl } as unknown as JwtSignOptions),
      this.jwtService.signAsync(refreshPayload, {
        secret: refreshSecret,
        expiresIn: refreshTtl,
      } as unknown as JwtSignOptions),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.toSeconds(accessTtl),
      user: this.toSessionUser(user, roles),
    };
  }

  private toSessionUser(user: UserRow, roles: RoleRow[]): SessionUser {
    const permissions = this.flattenPermissions(roles);
    const isSuperAdmin =
      roles.some((role) => role.slug === 'super-admin') ||
      permissions.includes(SUPER_ADMIN_WILDCARD);

    const sessionRoles: SessionRole[] = roles.map((role) => ({
      id: role.id,
      name: role.name,
      slug: role.slug,
      color: role.color,
      icon: role.icon,
    }));

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      isGuest: user.isGuest,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      loyaltyPoints: user.loyaltyPoints,
      loyaltyTier: String(user.loyaltyTier),
      isSuperAdmin,
      roles: sessionRoles,
      permissions,
    };
  }

  private flattenPermissions(roles: RoleRow[]): string[] {
    const permissions = roles.flatMap((role) =>
      Array.isArray(role.permissions) ? (role.permissions as string[]) : [],
    );
    return this.unique(permissions);
  }

  private unique(values: string[]): string[] {
    return [...new Set(values)];
  }

  private toSeconds(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl.trim());
    if (!match) return 7200;
    const factor = { s: 1, m: 60, h: 3600, d: 86400 } as const;
    const unit = match[2] as keyof typeof factor;
    return Number(match[1]) * factor[unit];
  }
}
