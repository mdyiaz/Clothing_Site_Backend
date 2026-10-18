import { Gender, PrismaClient } from '@prisma/client';

const CATEGORIES: {
  name: string;
  slug: string;
  gender?: Gender;
  description?: string;
  children?: { name: string; slug: string; gender?: Gender }[];
}[] = [
  {
    name: 'Men',
    slug: 'men',
    gender: 'MEN',
    description: 'menswear',
    children: [
      { name: 'Panjabi', slug: 'men-panjabi', gender: 'MEN' },
      { name: 'T-Shirt', slug: 'men-t-shirt', gender: 'MEN' },
      { name: 'Shirt', slug: 'men-shirt', gender: 'MEN' },
      { name: 'Jeans', slug: 'men-jeans', gender: 'MEN' },
    ],
  },
  {
    name: 'Women',
    slug: 'women',
    gender: 'WOMEN',
    description: 'womenswear',
    children: [
      { name: 'Kurti', slug: 'women-kurti', gender: 'WOMEN' },
      { name: 'Three Piece', slug: 'women-three-piece', gender: 'WOMEN' },
      { name: 'Saree', slug: 'women-saree', gender: 'WOMEN' },
    ],
  },
  {
    name: 'Kids',
    slug: 'kids',
    gender: 'KIDS',
    description: 'boys & girls',
    children: [
      { name: 'Boys', slug: 'kids-boys', gender: 'KIDS' },
      { name: 'Girls', slug: 'kids-girls', gender: 'KIDS' },
    ],
  },
];

export async function seedCategories(prisma: PrismaClient): Promise<void> {
  let order = 0;

  for (const category of CATEGORIES) {
    const parent = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, gender: category.gender, sortOrder: order },
      create: {
        name: category.name,
        slug: category.slug,
        gender: category.gender,
        description: category.description,
        sortOrder: order,
      },
    });

    order += 1;
    let childOrder = 0;

    for (const child of category.children ?? []) {
      await prisma.category.upsert({
        where: { slug: child.slug },
        update: { parentId: parent.id, sortOrder: childOrder },
        create: {
          name: child.name,
          slug: child.slug,
          gender: child.gender,
          parentId: parent.id,
          sortOrder: childOrder,
        },
      });
      childOrder += 1;
    }
  }

  console.log(`  ✓ ${CATEGORIES.length} root categories`);
}
