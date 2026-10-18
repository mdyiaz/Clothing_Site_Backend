import { PrismaClient } from '@prisma/client';
import { seedAdmin } from './seed/admin.seed';
import { seedCategories } from './seed/categories.seed';
import { seedContent } from './seed/content.seed';
import { seedProducts } from './seed/products.seed';
import { seedRoles } from './seed/roles.seed';
import { seedSettings } from './seed/settings.seed';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('\n🌱 Seeding Rangoli database\n');

  await seedRoles(prisma);
  await seedSettings(prisma);
  await seedCategories(prisma);
  await seedProducts(prisma);
  await seedContent(prisma);

  const adminPassword = process.env.ADMIN_PASSWORD ?? 'Rangoli@2026!';
  const admin = await seedAdmin(prisma, {
    email: process.env.ADMIN_EMAIL ?? 'admin@rangoli.com.bd',
    password: adminPassword,
    fullName: 'Rangoli Admin',
  });

  if (admin.created) {
    console.log(`  ✓ Super Admin created: ${admin.email}`);
    console.log(`    password: ${admin.password}`);
    console.log('    ⚠️  Change it after the first login.');
  } else {
    console.log(`  ✓ Super Admin already exists: ${admin.email} (password reset)`);
  }

  console.log('\n✅ Seed complete\n');
}

main()
  .catch((error) => {
    console.error('\n❌ Seed failed\n', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
