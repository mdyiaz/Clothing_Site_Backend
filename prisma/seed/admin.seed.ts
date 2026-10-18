import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

export interface AdminSeedResult {
  email: string;
  created: boolean;
  password: string | null;
}

export async function seedAdmin(
  prisma: PrismaClient,
  options: { email: string; password: string; fullName?: string },
): Promise<AdminSeedResult> {
  const role = await prisma.role.findUnique({ where: { slug: 'super-admin' } });
  if (!role) {
    throw new Error('seedRoles() must run before seedAdmin()');
  }

  const existing = await prisma.user.findUnique({ where: { email: options.email } });
  const passwordHash = await bcrypt.hash(options.password, BCRYPT_ROUNDS);

  const user =
    existing ??
    (await prisma.user.create({
      data: {
        email: options.email,
        fullName: options.fullName ?? 'Rangoli Admin',
        passwordHash,
        emailVerified: true,
        isActive: true,
      },
    }));

  // Keep the password in sync on re-seed so a forgotten local password can be reset.
  if (existing) {
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  }

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });

  return { email: user.email as string, created: !existing, password: existing ? null : options.password };
}
