import { Injectable } from '@nestjs/common';
import { Category, Prisma } from '@prisma/client';
import { BaseService } from '../../common/base/base.service';
import { AppException } from '../../common/exceptions/app.exception';
import { CategoryRepository } from './category.repository';
import { categorySlug } from './dto/category.dto';

/** Admin UI may create 3 levels; the storefront renders 2. */
const MAX_DEPTH = 3;

@Injectable()
export class CategoryService extends BaseService<Category> {
  protected readonly resourceName = 'Category';
  protected readonly sortableFields = ['sortOrder', 'name', 'createdAt'];
  protected readonly searchFields = ['name', 'slug', 'description'];
  protected override readonly defaultSort: Prisma.CategoryOrderByWithRelationInput = {
    sortOrder: 'asc',
  };

  constructor(repository: CategoryRepository) {
    super(repository);
  }

  /** Full tree for the admin panel (max 3 levels). */
  async getTree(includeInactive = false): Promise<Category[]> {    const categories = await this.repository.findMany({
      where: includeInactive ? { deletedAt: null } : { deletedAt: null, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const nodes = new Map<string, Category & { children: Category[] }>();
    categories.forEach((category) => nodes.set(category.id, { ...category, children: [] }));

    const roots: (Category & { children: Category[] })[] = [];
    nodes.forEach((node) => {
      const parentId = node.parentId;
      if (parentId && nodes.has(parentId)) {
        (nodes.get(parentId) as { children: Category[] }).children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  /** Storefront lookup for `/c/:slug` — inactive/deleted categories 404. */
  findBySlug(slug: string): Promise<Category> {
    return this.findOne({ slug, isActive: true, deletedAt: null });
  }

  /**
   * Slug rules (frontend builds `/c/:slug` from it):
   *  - create: admin slug if given, otherwise derived from the name;
   *  - update: an admin-customised slug is NEVER overwritten by a name change.
   */
  protected override async beforeCreate(data: Record<string, any>): Promise<void> {
    data.slug = (data.slug as string) || categorySlug(data.name);
    await this.assertSlugUnique(data.slug);
    data.sortOrder ??= 0;
    data.isActive ??= true;

    if (data.parentId) {
      const parentDepth = await this.depthOf(data.parentId);
      this.assertDepth(parentDepth);
    }
  }

  protected override async beforeUpdate(id: string, data: Record<string, any>): Promise<void> {
    if (data.slug) {
      await this.assertSlugUnique(data.slug, id);
    } else if (data.name) {
      const current = await this.repository.findById(id);
      if (current && current.slug === categorySlug(current.name)) {
        // slug was auto-derived from the old name → follow the rename
        data.slug = categorySlug(data.name);
      }
    }

    if (data.parentId !== undefined && data.parentId !== null) {
      if (data.parentId === id) {
        throw AppException.badRequest('CATEGORY.PARENT_SELF', 'A category cannot be its own parent.', {
          field: 'parentId',
        });
      }
      await this.assertNoCycle(id, data.parentId);
      this.assertDepth(await this.depthOf(data.parentId));
    }
  }

  protected override async beforeDelete(id: string): Promise<void> {
    const children = await this.repository.count({ parentId: id, deletedAt: null });
    if (children > 0) {
      throw AppException.conflict('CATEGORY.HAS_CHILDREN', 'Move or delete the subcategories first.');
    }

    const products = await this.repository.count({ products: { some: {} } });
    if (products > 0) {
      throw AppException.conflict(
        'CATEGORY.HAS_PRODUCTS',
        'This category is still used by products. Detach those products first.',
      );
    }
  }

  private async assertSlugUnique(slug?: string, excludeId?: string): Promise<void> {
    if (!slug) return;

    const existing = await this.repository.findOne({ slug });
    if (existing && existing.id !== excludeId) {
      throw AppException.conflict(
        'CATEGORY.SLUG_TAKEN',
        `The URL "/c/${slug}" is already used by another category.`,
      );
    }
  }

  /** Depth of a node: root = 1. */
  private async depthOf(id: string): Promise<number> {
    let depth = 1;
    let cursor: string | null = id;
    const seen = new Set<string>();

    while (cursor && !seen.has(cursor) && depth <= MAX_DEPTH + 1) {
      seen.add(cursor);
      const node = await this.repository.findById(cursor);
      if (!node?.parentId) break;
      depth += 1;
      cursor = node.parentId;
    }

    return depth;
  }

  private assertDepth(parentDepth: number): void {
    if (parentDepth >= MAX_DEPTH) {
      throw AppException.badRequest(
        'CATEGORY.MAX_DEPTH',
        `Categories are limited to ${MAX_DEPTH} levels.`,
        { field: 'parentId', action: 'focus' },
      );
    }
  }

  private async assertNoCycle(id: string, newParentId: string): Promise<void> {
    let cursor: string | null = newParentId;
    const seen = new Set<string>();

    while (cursor && !seen.has(cursor)) {
      if (cursor === id) {
        throw AppException.badRequest(
          'CATEGORY.CYCLE',
          'That parent would create a loop in the category tree.',
          { field: 'parentId' },
        );
      }
      seen.add(cursor);
      const node = await this.repository.findById(cursor);
      cursor = node?.parentId ?? null;
    }
  }
}
