import { PrismaClient } from '@prisma/client';
import { slugify } from '../../src/common/utils/slug';

type Color = [name: string, hex: string];

interface SeedVariant {
  size?: string;
  color?: string;
  colorHex?: string;
  stock: number;
}

interface SeedProduct {
  name: string;
  sku: string;
  categorySlug: string;
  brand: string;
  material: string;
  basePrice: number;
  compareAtPrice?: number;
  shortDescription: string;
  description: string;
  isFeatured?: boolean;
  totalSold?: number;
  variants: SeedVariant[];
}

/** size × colour matrix — keeps the product list below readable. */
function vs(sizes: string[], colors: Color[], stock: number): SeedVariant[] {
  return sizes.flatMap((size) =>
    colors.map(([color, colorHex]) => ({ size, color, colorHex, stock })),
  );
}

const NO_SIZES: string[] = ['One Size'];

const PRODUCTS: SeedProduct[] = [
  // ── Men ──────────────────────────────────────────────────────────────────
  {
    name: 'Classic Cotton Panjabi — Eid Edition',
    sku: 'RNG-M-PANJ-001',
    categorySlug: 'men-panjabi',
    brand: 'Rangoli',
    material: 'Cotton',
    basePrice: 1290,
    compareAtPrice: 1790,
    shortDescription: 'Embroidered cotton panjabi with a mandarin collar.',
    description:
      'A breathable cotton panjabi cut for Eid gatherings — subtle chest embroidery, mandarin collar, side pockets and a straight hem. Machine washable, colour-fast dye.',
    isFeatured: true,
    totalSold: 142,
    variants: vs(['M', 'L', 'XL'], [['Navy', '#1E3A8A'], ['Maroon', '#7F1D1D']], 14),
  },
  {
    name: 'Linen Panjabi — Summer Weave',
    sku: 'RNG-M-PANJ-002',
    categorySlug: 'men-panjabi',
    brand: 'Rangoli',
    material: 'Linen',
    basePrice: 1590,
    shortDescription: 'Lightweight linen panjabi for humid Dhaka days.',
    description:
      'Woven from soft linen that keeps you cool through the hottest afternoons. Minimal placket, tonal buttons and a relaxed fit.',
    totalSold: 61,
    variants: vs(['M', 'L', 'XL'], [['Sky', '#7DD3FC'], ['Olive', '#4D7C0F']], 10),
  },
  {
    name: 'Oxford Formal Shirt — Slim Fit',
    sku: 'RNG-M-SHRT-001',
    categorySlug: 'men-shirt',
    brand: 'Envoy',
    material: 'Cotton',
    basePrice: 1190,
    compareAtPrice: 1490,
    shortDescription: 'Wrinkle-resistant oxford shirt for office wear.',
    description:
      'Slim-fit oxford with a soft collar that holds its shape. Pairs with chinos or dress trousers, and survives the commute without ironing.',
    isFeatured: true,
    totalSold: 98,
    variants: vs(['S', 'M', 'L', 'XL'], [['White', '#FFFFFF'], ['Sky', '#7DD3FC']], 18),
  },
  {
    name: 'Denim Casual Shirt — Stone Wash',
    sku: 'RNG-M-SHRT-002',
    categorySlug: 'men-shirt',
    brand: 'Envoy',
    material: 'Denim',
    basePrice: 1390,
    shortDescription: 'Stone-washed denim shirt with a worn-in feel.',
    description:
      'Mid-weight denim washed for a soft hand feel, with twin chest pockets and adjustable cuffs.',
    variants: vs(['M', 'L', 'XL'], [['Indigo', '#3730A3']], 12),
  },
  {
    name: 'Premium Cotton T-Shirt — Crew Neck',
    sku: 'RNG-M-TS-001',
    categorySlug: 'men-t-shirt',
    brand: 'Rangoli',
    material: 'Cotton',
    basePrice: 590,
    compareAtPrice: 790,
    shortDescription: '220 GSM combed cotton crew neck.',
    description:
      'Heavy 220 GSM combed cotton that keeps its shape wash after wash. Pre-shrunk, side-seamed, shoulder-to-shoulder tape.',
    isFeatured: true,
    totalSold: 310,
    variants: vs(['S', 'M', 'L', 'XL', 'XXL'], [['Black', '#111827'], ['White', '#FFFFFF']], 25),
  },
  {
    name: 'Polo T-Shirt — Piqué Knit',
    sku: 'RNG-M-TS-002',
    categorySlug: 'men-t-shirt',
    brand: 'Envoy',
    material: 'Cotton',
    basePrice: 790,
    shortDescription: 'Classic piqué polo with a two-button placket.',
    description:
      'Breathable piqué knit with a ribbed collar, side vents and a reinforced placket.',
    variants: vs(['M', 'L', 'XL'], [['Navy', '#1E3A8A'], ['Forest', '#166534']], 16),
  },
  {
    name: 'Straight Fit Denim Jeans',
    sku: 'RNG-M-JEANS-001',
    categorySlug: 'men-jeans',
    brand: 'Envoy',
    material: 'Denim',
    basePrice: 1790,
    compareAtPrice: 2190,
    shortDescription: 'Mid-rise straight jeans with stretch.',
    description:
      'Mid-rise straight leg with 2% stretch for everyday comfort. Five-pocket layout, YKK zip.',
    totalSold: 87,
    variants: vs(['30', '32', '34', '36'], [['Indigo', '#3730A3'], ['Black', '#111827']], 11),
  },

  // ── Women ────────────────────────────────────────────────────────────────
  {
    name: 'Block Print Kurti — Cotton',
    sku: 'RNG-W-KURT-001',
    categorySlug: 'women-kurti',
    brand: 'Rangoli',
    material: 'Cotton',
    basePrice: 990,
    compareAtPrice: 1290,
    shortDescription: 'Hand-block printed cotton kurti with a round neck.',
    description:
      'Soft cotton kurti with traditional block print, three-quarter sleeves and side slits. Fully lined bodice.',
    isFeatured: true,
    totalSold: 176,
    variants: vs(['S', 'M', 'L'], [['Rust', '#B45309'], ['Teal', '#0F766E']], 20),
  },
  {
    name: 'Embroidered Kurti — Festive',
    sku: 'RNG-W-KURT-002',
    categorySlug: 'women-kurti',
    brand: 'Rangoli',
    material: 'Georgette',
    basePrice: 1490,
    shortDescription: 'Georgette kurti with tonal thread embroidery.',
    description:
      'Flowy georgette with tonal embroidery along the yoke and sleeves. Includes an inner slip.',
    variants: vs(['S', 'M', 'L'], [['Wine', '#7F1D1D'], ['Emerald', '#047857']], 12),
  },
  {
    name: 'Three Piece — Printed Salwar Set',
    sku: 'RNG-W-3PC-001',
    categorySlug: 'women-three-piece',
    brand: 'Rangoli',
    material: 'Cotton',
    basePrice: 2190,
    compareAtPrice: 2790,
    shortDescription: 'Kameez, salwar and dupatta in one set.',
    description:
      'Complete three-piece set — printed cotton kameez, churidar salwar and a soft dupatta. Sizes checked for a comfortable fit.',
    isFeatured: true,
    totalSold: 73,
    variants: vs(['S', 'M', 'L', 'XL'], [['Mustard', '#CA8A04'], ['Lilac', '#8B5CF6']], 9),
  },
  {
    name: 'Katan Silk Saree — Wedding Edit',
    sku: 'RNG-W-SAREE-001',
    categorySlug: 'women-saree',
    brand: 'Rangoli',
    material: 'Silk',
    basePrice: 4590,
    compareAtPrice: 5490,
    shortDescription: 'Katan silk saree with a woven zari border.',
    description:
      'Lustrous katan silk with a woven zari border and pallu. Comes with a matching blouse piece. Dry clean only.',
    totalSold: 34,
    variants: vs(NO_SIZES, [['Red', '#DC2626'], ['Bottle Green', '#166534']], 6),
  },

  // ── Kids ─────────────────────────────────────────────────────────────────
  {
    name: "Boys Cotton T-Shirt — Pack of 1",
    sku: 'RNG-K-BOY-TS-001',
    categorySlug: 'kids-boys',
    brand: 'Rangoli',
    material: 'Cotton',
    basePrice: 450,
    compareAtPrice: 550,
    shortDescription: 'Soft cotton tee for everyday play.',
    description:
      'Rounds off any school-day outfit — soft combed cotton, printed neck label (no scratchy tags).',
    variants: vs(['4Y', '6Y', '8Y'], [['Sky', '#7DD3FC'], ['Lime', '#65A30D']], 22),
  },
  {
    name: 'Girls Frock — Floral Cotton',
    sku: 'RNG-K-GIRL-FR-001',
    categorySlug: 'kids-girls',
    brand: 'Rangoli',
    material: 'Cotton',
    basePrice: 790,
    shortDescription: 'Flared cotton frock with a satin sash.',
    description:
      'A-line frock in breathable floral cotton with a removable satin sash and hidden back zip.',
    variants: vs(['4Y', '6Y', '8Y'], [['Pink', '#EC4899'], ['Lavender', '#A78BFA']], 15),
  },
];

export async function seedProducts(prisma: PrismaClient): Promise<void> {
  const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
  const categoryBySlug = new Map(categories.map((row) => [row.slug, row.id]));

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const product of PRODUCTS) {
    const slug = slugify(product.name);
    const categoryId = categoryBySlug.get(product.categorySlug);

    if (!categoryId) {
      console.warn(`  ⚠️  "${product.name}" skipped — category "${product.categorySlug}" not seeded`);
      skipped += 1;
      continue;
    }

    const discountPercent = computeDiscountPercent(product.basePrice, product.compareAtPrice);
    const totalStock = product.variants.reduce((sum, variant) => sum + variant.stock, 0);

    const core = {
      sku: product.sku,
      name: product.name,
      description: product.description,
      shortDescription: product.shortDescription,
      basePrice: product.basePrice,
      compareAtPrice: product.compareAtPrice ?? null,
      discountPercent,
      brand: product.brand,
      material: product.material,
      totalStock,
      totalSold: product.totalSold ?? 0,
      isActive: true,
      isFeatured: product.isFeatured ?? false,
      categories: {
        // re-link on every run so the seed stays idempotent
        deleteMany: {},
        create: [{ categoryId }],
      },
    };

    const existing = await prisma.product.findUnique({ where: { slug } });

    if (existing) {
      // never touch variants/media an editor has already changed
      await prisma.product.update({ where: { id: existing.id }, data: core });
      updated += 1;
      continue;
    }

    await prisma.product.create({
      data: {
        ...core,
        slug,
        variants: {
          create: product.variants.map((variant) => ({
            sku: variantSku(product.sku, variant),
            size: variant.size ?? null,
            color: variant.color ?? null,
            colorHex: variant.colorHex ?? null,
            stock: variant.stock,
            price: null,
            compareAtPrice: null,
          })),
        },
      },
    });
    created += 1;
  }

  console.log(
    `  ✓ ${PRODUCTS.length} products (${created} created, ${updated} updated, ${skipped} skipped)`,
  );
}

function variantSku(baseSku: string, variant: SeedVariant): string {
  const parts = [baseSku, variant.size ?? 'os', variant.color ?? 'std'];
  return parts
    .join('-')
    .replace(/\s+/g, '')
    .toUpperCase();
}

/** Same formula the API applies on every product write. */
function computeDiscountPercent(basePrice: number, compareAtPrice?: number): number | null {
  if (!compareAtPrice || compareAtPrice <= basePrice) return null;
  return Math.round(((compareAtPrice - basePrice) / compareAtPrice) * 100);
}
