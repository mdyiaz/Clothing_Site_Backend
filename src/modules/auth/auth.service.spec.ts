import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { AppException } from '../../common/exceptions/app.exception';
import { AuthService } from './auth.service';

type PrismaLike = Record<string, Record<string, jest.Mock>>;
type JwtLike = { signAsync: jest.Mock; verifyAsync: jest.Mock };

const CONFIG: Record<string, string> = {
  'jwt.accessTtl': '2h',
  'jwt.refreshTtl': '7d',
  'jwt.refreshSecret': 'refresh-secret',
  'jwt.resetSecret': 'reset-secret',
  frontendUrl: 'https://shop.rangoli.com.bd',
};

describe('AuthService', () => {
  let prisma: PrismaLike;
  let jwt: JwtLike;
  let config: { get: jest.Mock };
  let mail: { send: jest.Mock };
  let sms: { send: jest.Mock };
  let service: AuthService;
  let passwordHash: string;

  const fingerprint = (hash: string) => createHash('sha256').update(hash).digest('hex').slice(0, 16);

  const user = {
    id: 'u1',
    email: 'admin@rangoli.com.bd',
    phone: null,
    fullName: 'Admin',
    avatarUrl: null,
    isGuest: false,
    emailVerified: true,
    phoneVerified: true,
    loyaltyPoints: 0,
    loyaltyTier: 'BRONZE',
    isActive: true,
    deletedAt: null,
    sessionVersion: 3,
    passwordHash: '',
  };

  const role = {
    id: 'r1',
    name: 'Marketing',
    slug: 'marketing',
    color: '#f00',
    icon: null,
    isActive: true,
    permissions: ['media:manage', 'menu.dashboard', 'media:manage'],
  };

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('correct-password', 4);
  });

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      userRole: { findMany: jest.fn() },
    };
    jwt = {
      signAsync: jest.fn().mockResolvedValue('signed-token'),
      verifyAsync: jest.fn(),
    };
    config = { get: jest.fn((key: string, fallback?: string) => CONFIG[key] ?? fallback) };
    mail = { send: jest.fn().mockResolvedValue({ delivered: false, channel: 'log' }) };
    sms = { send: jest.fn().mockResolvedValue({ delivered: false, channel: 'log' }) };
    service = new AuthService(prisma as any, jwt as any, config as any, mail as any, sms as any);
  });

  async function expectRejection(promise: Promise<unknown>): Promise<any> {
    return promise.then(
      () => {
        throw new Error('expected promise to reject');
      },
      (error) => error,
    );
  }

  describe('adminLogin', () => {
    it('issues access + refresh tokens for valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...user, passwordHash });
      prisma.userRole.findMany.mockResolvedValue([{ role }]);

      const result = await service.adminLogin(
        { email: '  ADMIN@rangoli.com.bd ', password: 'correct-password' } as any,
        '127.0.0.1',
      );

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'admin@rangoli.com.bd' },
      });
      expect(jwt.signAsync).toHaveBeenCalledTimes(2);

      const [accessPayload, accessOptions] = jwt.signAsync.mock.calls[0];
      expect(accessPayload).toMatchObject({
        sub: 'u1',
        typ: 'access',
        sv: 3,
        isSuperAdmin: false,
        roles: ['marketing'],
        permissions: ['media:manage', 'menu.dashboard'], // deduplicated
      });
      expect(accessOptions.expiresIn).toBe('2h');

      const [refreshPayload, refreshOptions] = jwt.signAsync.mock.calls[1];
      expect(refreshPayload).toEqual({ sub: 'u1', sv: 3, typ: 'refresh' });
      expect(refreshOptions.secret).toBe('refresh-secret');
      expect(refreshOptions.expiresIn).toBe('7d');

      expect(result.expiresIn).toBe(7200); // '2h' → seconds
      expect(result.user.permissions).toEqual(['media:manage', 'menu.dashboard']);
      expect(result.accessToken).toBe('signed-token');
    });

    it('marks super-admin via the wildcard permission', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...user, passwordHash });
      prisma.userRole.findMany.mockResolvedValue([
        { role: { ...role, permissions: ['*'] } },
      ]);

      const result = await service.adminLogin({
        email: 'admin@rangoli.com.bd',
        password: 'correct-password',
      } as any);

      expect(result.user.isSuperAdmin).toBe(true);
      expect(jwt.signAsync.mock.calls[0][0].isSuperAdmin).toBe(true);
    });

    it('rejects an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const error = await expectRejection(
        service.adminLogin({ email: 'ghost@x.com', password: 'anything' } as any),
      );
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.getResponse()).toMatchObject({ code: 'AUTH.INVALID_CREDENTIALS' });
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it('rejects a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...user, passwordHash });

      const error = await expectRejection(
        service.adminLogin({ email: user.email, password: 'wrong' } as any),
      );
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.getResponse()).toMatchObject({ ui: { field: 'password' } });
    });

    it('rejects a soft-deleted or deactivated account', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...user, passwordHash, deletedAt: new Date() });
      const first = await expectRejection(
        service.adminLogin({ email: user.email, password: 'correct-password' } as any),
      );
      expect(first).toBeInstanceOf(UnauthorizedException);

      prisma.user.findUnique.mockResolvedValue({ ...user, passwordHash, isActive: false });
      const second = await expectRejection(
        service.adminLogin({ email: user.email, password: 'correct-password' } as any),
      );
      expect(second).toBeInstanceOf(UnauthorizedException);
    });

    it('forbids login when the account has no roles', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...user, passwordHash });
      prisma.userRole.findMany.mockResolvedValue([]);

      const error = await expectRejection(
        service.adminLogin({ email: user.email, password: 'correct-password' } as any),
      );
      expect(error).toBeInstanceOf(AppException);
      expect(error.code).toBe('AUTH.FORBIDDEN');
      expect(error.getStatus()).toBe(403);
    });
  });

  describe('customerLogin', () => {
    it('requires an email or phone', async () => {
      const error = await expectRejection(
        service.customerLogin({ password: 'x' } as any),
      );
      expect(error.code).toBe('AUTH.IDENTIFIER_MISSING');
      expect(error.getStatus()).toBe(400);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('looks the user up by email OR phone', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...user, passwordHash });
      prisma.userRole.findMany.mockResolvedValue([{ role }]);

      await service.customerLogin({ phone: ' 01711 ', password: 'correct-password' } as any);

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          OR: [{ phone: '01711' }],
        },
      });
    });

    it('rejects guest accounts and bad passwords', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...user, passwordHash, isGuest: true });
      const guestError = await expectRejection(
        service.customerLogin({ email: 'a@b.c', password: 'correct-password' } as any),
      );
      expect(guestError).toBeInstanceOf(UnauthorizedException);

      prisma.user.findFirst.mockResolvedValue({ ...user, passwordHash });
      const badPassword = await expectRejection(
        service.customerLogin({ email: 'a@b.c', password: 'nope' } as any),
      );
      expect(badPassword).toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('guestLogin', () => {
    it('creates a guest user and issues role-less tokens', async () => {
      prisma.user.create.mockResolvedValue({ ...user, isGuest: true, sessionVersion: 1 });
      prisma.userRole.findMany.mockResolvedValue([]);

      const result = await service.guestLogin({
        fullName: 'Guest',
        phone: '01712345678',
      } as any);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          isGuest: true,
          fullName: 'Guest',
          phone: '01712345678',
          phoneVerified: true,
        },
      });
      expect(result.user.roles).toEqual([]);
      expect(result.user.isGuest).toBe(true);
      expect(jwt.signAsync).toHaveBeenCalledTimes(2);
    });
  });

  describe('register', () => {
    it('requires an email or phone', async () => {
      const error = await expectRejection(service.register({ password: 'supersecret' } as any));
      expect(error.code).toBe('AUTH.IDENTIFIER_MISSING');
      expect(error.getStatus()).toBe(400);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects an email that already exists', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ ...user });

      const error = await expectRejection(
        service.register({ email: 'dupe@rangoli.com.bd', password: 'supersecret' } as any),
      );

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'dupe@rangoli.com.bd' },
      });
      expect(error.code).toBe('AUTH.EMAIL_TAKEN');
      expect(error.getStatus()).toBe(409);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects a phone that already exists', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ ...user });

      const error = await expectRejection(
        service.register({ phone: '01711111111', password: 'supersecret' } as any),
      );

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { phone: '01711111111' } });
      expect(error.code).toBe('AUTH.PHONE_TAKEN');
      expect(error.getStatus()).toBe(409);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('creates a customer, hashes the password and issues role-less tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        ...user,
        email: 'new@rangoli.com.bd',
        phone: '01711111111',
        isGuest: false,
        sessionVersion: 0,
      });
      prisma.userRole.findMany.mockResolvedValue([]);

      const result = await service.register({
        fullName: '  Ayesha  ',
        email: '  NEW@Rangoli.com.bd ',
        phone: '01711111111',
        password: 'supersecret',
      } as any);

      const createArg = prisma.user.create.mock.calls[0][0];
      expect(createArg.data).toMatchObject({
        email: 'new@rangoli.com.bd',
        phone: '01711111111',
        fullName: 'Ayesha',
        isGuest: false,
      });
      expect(createArg.data.passwordHash).toEqual(expect.any(String));
      expect(await bcrypt.compare('supersecret', createArg.data.passwordHash)).toBe(true);

      expect(jwt.signAsync).toHaveBeenCalledTimes(2);
      expect(result.user.isGuest).toBe(false);
      expect(result.user.roles).toEqual([]);
      expect(result.accessToken).toBe('signed-token');
    });
  });

  describe('refresh', () => {
    it('rotates tokens when the refresh token is valid', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u1', sv: 3, typ: 'refresh' });
      prisma.user.findUnique.mockResolvedValue({ ...user, passwordHash });
      prisma.userRole.findMany.mockResolvedValue([{ role }]);

      const result = await service.refresh('some.jwt');

      expect(jwt.verifyAsync).toHaveBeenCalledWith('some.jwt', { secret: 'refresh-secret' });
      expect(result.accessToken).toBe('signed-token');
    });

    it('rejects a tampered or expired token', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('bad signature'));
      const error = await expectRejection(service.refresh('bad'));
      expect(error.code).toBe('AUTH.UNAUTHORIZED');
      expect(error.getStatus()).toBe(401);
    });

    it('rejects a non-refresh token type', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u1', sv: 3, typ: 'access' });
      const error = await expectRejection(service.refresh('token'));
      expect(error.getStatus()).toBe(401);
    });

    it('rejects a revoked session (sessionVersion mismatch)', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u1', sv: 2, typ: 'refresh' });
      prisma.user.findUnique.mockResolvedValue({ ...user, sessionVersion: 3 });

      const error = await expectRejection(service.refresh('token'));
      expect(error.getResponse()).toMatchObject({
        code: 'AUTH.UNAUTHORIZED',
        message: 'Your session is no longer valid.',
      });
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it('rejects a missing/disabled user', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u1', sv: 3, typ: 'refresh' });
      prisma.user.findUnique.mockResolvedValue({ ...user, isActive: false });

      const error = await expectRejection(service.refresh('token'));
      expect(error.getStatus()).toBe(401);
    });
  });

  describe('verifySession / getMe', () => {
    it('returns the full session payload for a valid access token', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u1', sv: 3, typ: 'access' });
      prisma.user.findUnique.mockResolvedValue({ ...user, passwordHash });
      prisma.userRole.findMany.mockResolvedValue([{ role }]);

      const session = await service.verifySession('access.jwt');

      expect(session).toMatchObject({
        id: 'u1',
        isSuperAdmin: false,
        permissions: ['media:manage', 'menu.dashboard'],
        loyaltyTier: 'BRONZE',
      });
      expect(session.roles).toEqual([
        { id: 'r1', name: 'Marketing', slug: 'marketing', color: '#f00', icon: null },
      ]);
    });

    it('rejects a refresh token presented as an access token', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u1', sv: 3, typ: 'refresh' });
      const error = await expectRejection(service.verifySession('token'));
      expect(error.getStatus()).toBe(401);
    });

    it('getMe rejects revoked sessions', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...user, deletedAt: new Date() });
      const error = await expectRejection(service.getMe('u1'));
      expect(error.getResponse()).toMatchObject({ code: 'AUTH.UNAUTHORIZED' });
    });
  });

  describe('revokeAllSessions', () => {
    it('bumps sessionVersion so every outstanding token dies', async () => {
      await service.revokeAllSessions('u1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { sessionVersion: { increment: 1 } },
      });
    });
  });

  describe('forgotPassword', () => {
    it('requires an email or phone', async () => {
      const error = await expectRejection(service.forgotPassword({} as any));
      expect(error.code).toBe('AUTH.IDENTIFIER_MISSING');
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('emails a reset link containing the token', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...user, passwordHash });
      jwt.signAsync.mockResolvedValue('reset.jwt');

      const result = await service.forgotPassword({ email: ' ADMIN@rangoli.com.bd ' } as any);

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { deletedAt: null, OR: [{ email: 'admin@rangoli.com.bd' }] },
      });
      const [payload, options] = jwt.signAsync.mock.calls[0];
      expect(payload).toMatchObject({ sub: 'u1', sv: 3, typ: 'reset', pv: fingerprint(passwordHash) });
      expect(options.secret).toBe('reset-secret');
      expect(options.expiresIn).toBe('30m');
      expect(result).toEqual({ sent: true });
      expect(mail.send).toHaveBeenCalledTimes(1);
      expect(mail.send.mock.calls[0][0].to).toBe('admin@rangoli.com.bd');
      expect(mail.send.mock.calls[0][0].html).toContain('reset-password?token=reset.jwt');
    });

    it('falls back to SMS when the account has no email', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...user, email: null, phone: '01711111111', passwordHash });
      jwt.signAsync.mockResolvedValue('reset.jwt');

      await service.forgotPassword({ phone: '01711111111' } as any);

      expect(mail.send).not.toHaveBeenCalled();
      expect(sms.send).toHaveBeenCalledTimes(1);
      expect(sms.send.mock.calls[0][0].to).toBe('01711111111');
    });

    it('stays silent for unknown or guest accounts', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      expect(await service.forgotPassword({ email: 'ghost@x.com' } as any)).toEqual({ sent: true });

      prisma.user.findFirst.mockResolvedValue({ ...user, isGuest: true, passwordHash });
      expect(await service.forgotPassword({ email: user.email } as any)).toEqual({ sent: true });

      expect(mail.send).not.toHaveBeenCalled();
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('rotates the password and revokes sessions for a valid token', async () => {
      jwt.verifyAsync.mockResolvedValue({
        sub: 'u1',
        sv: 3,
        pv: fingerprint(passwordHash),
        typ: 'reset',
      });
      prisma.user.findUnique.mockResolvedValue({ ...user, passwordHash });

      const result = await service.resetPassword({ token: 'reset.jwt', password: 'brand-new-pass' } as any);

      expect(jwt.verifyAsync).toHaveBeenCalledWith('reset.jwt', { secret: 'reset-secret' });
      const updateArg = prisma.user.update.mock.calls[0][0];
      expect(updateArg.where).toEqual({ id: 'u1' });
      expect(updateArg.data.sessionVersion).toEqual({ increment: 1 });
      expect(await bcrypt.compare('brand-new-pass', updateArg.data.passwordHash)).toBe(true);
      expect(result).toEqual({ ok: true });
    });

    it('rejects invalid, wrong-type, stale or reused tokens', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('bad signature'));
      let error = await expectRejection(service.resetPassword({ token: 'x', password: 'whatever-1' } as any));
      expect(error.code).toBe('AUTH.RESET_INVALID');
      expect(prisma.user.update).not.toHaveBeenCalled();

      jwt.verifyAsync.mockResolvedValue({ sub: 'u1', sv: 3, pv: 'x', typ: 'refresh' });
      error = await expectRejection(service.resetPassword({ token: 'x', password: 'whatever-1' } as any));
      expect(error.code).toBe('AUTH.RESET_INVALID');

      jwt.verifyAsync.mockResolvedValue({ sub: 'u1', sv: 3, pv: 'stale', typ: 'reset' });
      prisma.user.findUnique.mockResolvedValue({ ...user, passwordHash });
      error = await expectRejection(service.resetPassword({ token: 'x', password: 'whatever-1' } as any));
      expect(error.code).toBe('AUTH.RESET_INVALID');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
