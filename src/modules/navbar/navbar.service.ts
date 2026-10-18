import { Injectable } from '@nestjs/common';
import { NavbarItem, NavbarLinkType, Prisma } from '@prisma/client';
import { BaseService } from '../../common/base/base.service';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { NavbarRepository } from './navbar.repository';

/** The storefront renders 2 levels: top links + mega-menu children. */
const MAX_DEPTH = 2;

export interface StorefrontNavItem {
  id: string;
  label: string;
  highlight: boolean;
  linkType: NavbarLinkType;
  url: string;
  children: StorefrontNavItem[];
}

@Injectable()
export class NavbarService extends BaseService<NavbarItem> {
  protected readonly resourceName = 'Navbar item';
  protected readonly sortableFields = ['sortOrder', 'label', 'createdAt'];
  protected readonly searchFields = ['label', 'customUrl'];
  protected override readonly defaultSort: Prisma.NavbarItemOrderByWithRelationInput = {
    sortOrder: 'asc',
  };

  constructor(
    repository: NavbarRepository,
    private readonly prisma: PrismaService,
  ) {
    super(repository);
  }

  // -------------------------------------------------------------------------
  // Storefront (public)
  // -------------------------------------------------------------------------

  /** Active nav tree with every link resolved to a real URL. */
  async getStorefront(): Promise<StorefrontNavItem[]> {
    const items = await this.repository.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { collection: { select: { slug: true, isActive: true } } },
    });

    const categoryIds = [
      ...new Set(
        items
          .filter((item) => item.linkType === NavbarLinkType.CATEGORY && item.categoryId)
          .map((item) => item.categoryId as string),
      ),
    ];
    const categories = await this.prisma.category.findMany({
      where: { id: { in: categoryIds }, isActive: true, deletedAt: null },
      select: { id: true, slug: true },
    });
    const categorySlug = new Map(categories.map((category) => [category.id, category.slug]));

    // Resolve every URL first — items whose target is gone/inactive are hidden.
    const nodes = new Map<string, StorefrontNavItem>();
    for (const item of items) {
      const url = this.resolveUrl(item, categorySlug);
      if (!url) continue;
      nodes.set(item.id, {
        id: item.id,
        label: item.label,
        highlight: item.highlight,
        linkType: item.linkType,
        url,
        children: [],
      });
    }

    // `items` is already sortOrder-ordered, so insertion order = display order.
    const roots: StorefrontNavItem[] = [];
    for (const item of items) {
      const node = nodes.get(item.id);
      if (!node) continue;
      const parent = item.parentId ? nodes.get(item.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  private resolveUrl(item: NavbarItem, categorySlug: Map<string, string>): string | null {
    switch (item.linkType) {
      case NavbarLinkType.CATEGORY: {
        if (!item.categoryId) return null;
        const slug = categorySlug.get(item.categoryId);
        return slug ? `/c/${slug}` : null;
      }
      case NavbarLinkType.COLLECTION: {
        const collection = (item as NavbarItem & { collection?: { slug: string; isActive: boolean } | null })
          .collection;
        if (!collection || !collection.isActive) return null;
        return `/collections/${collection.slug}`;
      }
      default:
        return item.customUrl || null;
    }
  }

  // -------------------------------------------------------------------------
  // Admin
  // -------------------------------------------------------------------------

  /** Flat admin list (nav items are a small config set — never paginated). */
  getAdmin(): Promise<NavbarItem[]> {
    return this.repository.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { collection: { select: { id: true, name: true, slug: true } } },
    });
  }

  async reorder(itemIds: string[]): Promise<{ count: number }> {
    const existing = await this.prisma.navbarItem.count({ where: { id: { in: itemIds } } });
    if (existing !== itemIds.length) {
      throw AppException.badRequest(
        'NAVBAR.REORDER_MISMATCH',
        'One or more menu items no longer exist. Refresh and try again.',
      );
    }

    await this.prisma.$transaction(
      itemIds.map((id, index) =>
        this.prisma.navbarItem.update({ where: { id }, data: { sortOrder: index * 10 } }),
      ),
    );
    return { count: itemIds.length };
  }

  // -------------------------------------------------------------------------
  // Hooks
  // -------------------------------------------------------------------------

  protected override async beforeCreate(data: Record<string, any>): Promise<void> {
    data.sortOrder ??= 0;
    data.isActive ??= true;
    data.highlight ??= false;
    await this.assertLink(data);

    if (data.parentId) {
      const parent = await this.repository.findById(data.parentId);
      if (!parent) throw AppException.notFound('Parent menu item');
      if (parent.parentId) {
        throw AppException.badRequest(
          'NAVBAR.MAX_DEPTH',
          `The menu is limited to ${MAX_DEPTH} levels.`,
          { field: 'parentId', action: 'focus' },
        );
      }
    }
  }

  protected override async beforeUpdate(id: string, data: Record<string, any>): Promise<void> {
    const current = await this.repository.findById(id);
    if (!current) throw AppException.notFound(this.resourceName);

    await this.assertLink({ ...current, ...data });

    if (data.parentId) {
      if (data.parentId === id) {
        throw AppException.badRequest('NAVBAR.PARENT_SELF', 'An item cannot be its own parent.', {
          field: 'parentId',
        });
      }
      await this.assertNoCycle(id, data.parentId);
      const parent = await this.repository.findById(data.parentId);
      if (!parent) throw AppException.notFound('Parent menu item');
      if (parent.parentId) {
        throw AppException.badRequest(
          'NAVBAR.MAX_DEPTH',
          `The menu is limited to ${MAX_DEPTH} levels.`,
          { field: 'parentId', action: 'focus' },
        );
      }
    }
  }

  protected override async beforeDelete(id: string): Promise<void> {
    const children = await this.repository.count({ parentId: id });
    if (children > 0) {
      throw AppException.conflict('NAVBAR.HAS_CHILDREN', 'Delete or move the sub-menu items first.');
    }
  }

  /** Each link type must point somewhere real before it can be saved. */
  private async assertLink(data: Record<string, any>): Promise<void> {
    const linkType = data.linkType as NavbarLinkType;

    if (linkType === NavbarLinkType.CATEGORY) {
      if (!data.categoryId) {
        throw AppException.badRequest('NAVBAR.CATEGORY_REQUIRED', 'Choose a category for this link.', {
          field: 'categoryId',
          action: 'focus',
        });
      }
      const category = await this.prisma.category.findFirst({
        where: { id: data.categoryId, deletedAt: null },
        select: { id: true },
      });
      if (!category) {
        throw AppException.badRequest('NAVBAR.UNKNOWN_CATEGORY', 'That category no longer exists.', {
          field: 'categoryId',
        });
      }
    }

    if (linkType === NavbarLinkType.COLLECTION) {
      if (!data.collectionId) {
        throw AppException.badRequest(
          'NAVBAR.COLLECTION_REQUIRED',
          'Choose a collection for this link.',
          { field: 'collectionId', action: 'focus' },
        );
      }
      const collection = await this.prisma.collection.findUnique({
        where: { id: data.collectionId },
        select: { id: true },
      });
      if (!collection) {
        throw AppException.badRequest('NAVBAR.UNKNOWN_COLLECTION', 'That collection no longer exists.', {
          field: 'collectionId',
        });
      }
    }

    if (linkType === NavbarLinkType.CUSTOM_URL || linkType === NavbarLinkType.PAGE) {
      const url = (data.customUrl as string) ?? '';
      if (!url.trim()) {
        throw AppException.badRequest('NAVBAR.URL_REQUIRED', 'Enter the link URL.', {
          field: 'customUrl',
          action: 'focus',
        });
      }
    }
  }

  private async assertNoCycle(id: string, newParentId: string): Promise<void> {
    let cursor: string | null = newParentId;
    const seen = new Set<string>();

    while (cursor && !seen.has(cursor)) {
      if (cursor === id) {
        throw AppException.badRequest('NAVBAR.CYCLE', 'That parent would create a loop in the menu.');
      }
      seen.add(cursor);
      const node = await this.repository.findById(cursor);
      cursor = node?.parentId ?? null;
    }
  }
}
