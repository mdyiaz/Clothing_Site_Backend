import { NavbarItem, NavbarLinkType } from '@prisma/client';
import { NavbarService } from './navbar.service';
import { NavbarRepository } from './navbar.repository';

interface MockRepository {
  findById: jest.Mock;
  findOne: jest.Mock;
  findMany: jest.Mock;
  findAndCount: jest.Mock;
  findCursor: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  softDelete: jest.Mock;
  count: jest.Mock;
  supportsSoftDelete: boolean;
}

type PrismaLike = Record<string, any>;

function item(overrides: Record<string, unknown> = {}): NavbarItem {
  return {
    id: 'n1',
    label: 'Men',
    linkType: 'CATEGORY',
    categoryId: 'c1',
    collectionId: null,
    parentId: null,
    customUrl: null,
    highlight: false,
    sortOrder: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as NavbarItem;
}

describe('NavbarService', () => {
  let repository: MockRepository;
  let prisma: PrismaLike;
  let service: NavbarService;

  beforeEach(() => {
    repository = {
      supportsSoftDelete: true,
      findById: jest.fn(),
      findOne: jest.fn(),
      findMany: jest.fn(),
      findAndCount: jest.fn(),
      findCursor: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      count: jest.fn(),
    };
    prisma = {
      category: { findMany: jest.fn(), findFirst: jest.fn() },
      collection: { findUnique: jest.fn() },
      navbarItem: { count: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    prisma.category.findFirst.mockResolvedValue({ id: 'c1' }); // default: category exists
    service = new NavbarService(repository as unknown as NavbarRepository, prisma as any);
  });

  async function expectRejection(promise: Promise<unknown>): Promise<any> {
    return promise.then(
      () => {
        throw new Error('expected promise to reject');
      },
      (error) => error,
    );
  }

  // ── storefront ────────────────────────────────────────────────────────────

  describe('getStorefront', () => {
    it('resolves URLs, nests children and hides broken links', async () => {
      repository.findMany.mockResolvedValue([
        item({ id: 'n1', label: 'Men', linkType: NavbarLinkType.CATEGORY, categoryId: 'c1' }),
        item({
          id: 'n2',
          label: 'Panjabi',
          linkType: NavbarLinkType.CATEGORY,
          categoryId: 'c1',
          parentId: 'n1',
        }),
        item({
          id: 'n3',
          label: 'Sale',
          linkType: NavbarLinkType.CUSTOM_URL,
          customUrl: '/products?onSale=true',
          highlight: true,
        }),
        item({
          id: 'n4',
          label: 'Ghost Category',
          linkType: NavbarLinkType.CATEGORY,
          categoryId: 'deleted-cat',
        }),
        item({
          id: 'n5',
          label: 'Retired Collection',
          linkType: NavbarLinkType.COLLECTION,
          collectionId: 'col1',
          collection: { slug: 'old', isActive: false },
        }),
      ]);
      prisma.category.findMany.mockResolvedValue([{ id: 'c1', slug: 'men' }]);

      const tree = await service.getStorefront();

      expect(tree.map((node) => node.id)).toEqual(['n1', 'n3']); // n4 + n5 hidden
      expect(tree[0]).toMatchObject({ url: '/c/men', label: 'Men' });
      expect(tree[0].children.map((child) => child.url)).toEqual(['/c/men']);
      expect(tree[1]).toMatchObject({
        url: '/products?onSale=true',
        highlight: true,
        children: [],
      });

      expect(prisma.category.findMany.mock.calls[0][0].where.id.in).toEqual(['c1', 'deleted-cat']);
    });

    it('resolves live collections to /collections/:slug', async () => {
      repository.findMany.mockResolvedValue([
        item({
          id: 'n1',
          label: 'Eid',
          linkType: NavbarLinkType.COLLECTION,
          collectionId: 'col1',
          collection: { slug: 'eid', isActive: true },
        }),
      ]);
      prisma.category.findMany.mockResolvedValue([]);

      const tree = await service.getStorefront();

      expect(tree).toHaveLength(1);
      expect(tree[0].url).toBe('/collections/eid');
    });

    it('hides CUSTOM_URL items with no URL', async () => {
      repository.findMany.mockResolvedValue([
        item({ linkType: NavbarLinkType.CUSTOM_URL, customUrl: null }),
      ]);
      prisma.category.findMany.mockResolvedValue([]);

      await expect(service.getStorefront()).resolves.toEqual([]);
    });
  });

  describe('getAdmin', () => {
    it('lists everything flat, sorted, with collection details', async () => {
      repository.findMany.mockResolvedValue([]);
      await service.getAdmin();

      expect(repository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: { collection: { select: { id: true, name: true, slug: true } } },
        }),
      );
    });
  });

  describe('reorder', () => {
    it('persists the new order in 10-step increments', async () => {
      prisma.navbarItem.count.mockResolvedValue(3);

      const result = await service.reorder(['a', 'b', 'c']);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.navbarItem.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'a' },
        data: { sortOrder: 0 },
      });
      expect(prisma.navbarItem.update).toHaveBeenNthCalledWith(3, {
        where: { id: 'c' },
        data: { sortOrder: 20 },
      });
      expect(result).toEqual({ count: 3 });
    });

    it('rejects when ids vanished from the database', async () => {
      prisma.navbarItem.count.mockResolvedValue(2);

      const error = await expectRejection(service.reorder(['a', 'b', 'c']));
      expect(error.code).toBe('NAVBAR.REORDER_MISMATCH');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ── create / update hooks ─────────────────────────────────────────────────

  describe('create (hooks)', () => {
    it('applies defaults and accepts a valid category link', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: 'c1' });
      repository.create.mockResolvedValue(item({ id: 'new' }));

      await service.create({ label: 'Men', linkType: NavbarLinkType.CATEGORY, categoryId: 'c1' });

      const persisted = repository.create.mock.calls[0][0];
      expect(persisted.sortOrder).toBe(0);
      expect(persisted.isActive).toBe(true);
      expect(persisted.highlight).toBe(false);
    });

    it('CATEGORY requires a categoryId', async () => {
      const error = await expectRejection(
        service.create({ label: 'Men', linkType: NavbarLinkType.CATEGORY }),
      );
      expect(error.code).toBe('NAVBAR.CATEGORY_REQUIRED');
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('CATEGORY rejects a category that no longer exists', async () => {
      prisma.category.findFirst.mockResolvedValue(null);
      const error = await expectRejection(
        service.create({ label: 'Men', linkType: NavbarLinkType.CATEGORY, categoryId: 'x' }),
      );
      expect(error.code).toBe('NAVBAR.UNKNOWN_CATEGORY');
    });

    it('COLLECTION requires and validates the collection', async () => {
      const missingId = await expectRejection(
        service.create({ label: 'Eid', linkType: NavbarLinkType.COLLECTION }),
      );
      expect(missingId.code).toBe('NAVBAR.COLLECTION_REQUIRED');

      prisma.collection.findUnique.mockResolvedValue(null);
      const unknown = await expectRejection(
        service.create({ label: 'Eid', linkType: NavbarLinkType.COLLECTION, collectionId: 'x' }),
      );
      expect(unknown.code).toBe('NAVBAR.UNKNOWN_COLLECTION');
    });

    it('CUSTOM_URL rejects a blank URL', async () => {
      const error = await expectRejection(
        service.create({ label: 'Sale', linkType: NavbarLinkType.CUSTOM_URL, customUrl: '   ' }),
      );
      expect(error.code).toBe('NAVBAR.URL_REQUIRED');
    });

    it('a child item must attach to a root item (depth cap 2)', async () => {
      repository.findById.mockResolvedValue(item({ id: 'parent', parentId: 'grandparent' }));

      const error = await expectRejection(
        service.create({
          label: 'Deep',
          linkType: NavbarLinkType.CUSTOM_URL,
          customUrl: '/x',
          parentId: 'parent',
        }),
      );
      expect(error.code).toBe('NAVBAR.MAX_DEPTH');
    });

    it('rejects an unknown parent', async () => {
      repository.findById.mockResolvedValue(null);
      const error = await expectRejection(
        service.create({ label: 'X', linkType: NavbarLinkType.CUSTOM_URL, customUrl: '/x', parentId: 'ghost' }),
      );
      expect(error.getStatus()).toBe(404);
    });
  });

  describe('update (hooks)', () => {
    it('404s when the item is gone', async () => {
      repository.findById.mockResolvedValue(null);
      const error = await expectRejection(service.update('missing', { label: 'x' }));
      expect(error.code).toBe('RESOURCE.NOT_FOUND');
    });

    it('rejects self-parenting', async () => {
      repository.findById.mockResolvedValue(item());
      const error = await expectRejection(service.update('n1', { parentId: 'n1' }));
      expect(error.code).toBe('NAVBAR.PARENT_SELF');
    });

    it('rejects a cycle in the menu tree', async () => {
      const graph: Record<string, { parentId: string | null }> = { a: { parentId: 'b' }, b: { parentId: 'a' } };
      repository.findById.mockImplementation((id: string) =>
        Promise.resolve(graph[id] ? item({ id, parentId: graph[id].parentId }) : null),
      );

      const error = await expectRejection(service.update('a', { parentId: 'b' }));
      expect(error.code).toBe('NAVBAR.CYCLE');
    });

    it('rejects a third nesting level', async () => {
      repository.findById.mockImplementation((id: string) =>
        Promise.resolve(
          id === 'n1'
            ? item({ id: 'n1' }) // current
            : item({ id, parentId: 'someone' }), // the proposed parent is itself a child
        ),
      );

      const error = await expectRejection(service.update('n1', { parentId: 'n2' }));
      expect(error.code).toBe('NAVBAR.MAX_DEPTH');
    });
  });

  describe('remove (hooks)', () => {
    it('blocks deleting an item that still has children', async () => {
      repository.findById.mockResolvedValue(item());
      repository.count.mockResolvedValue(2);

      const error = await expectRejection(service.remove('n1'));
      expect(error.code).toBe('NAVBAR.HAS_CHILDREN');
      expect(error.getStatus()).toBe(409);
      expect(repository.softDelete).not.toHaveBeenCalled();
    });

    it('deletes a leaf item', async () => {
      repository.findById.mockResolvedValue(item());
      repository.count.mockResolvedValue(0);
      repository.softDelete.mockResolvedValue(item());

      await service.remove('n1');

      expect(repository.softDelete).toHaveBeenCalledWith('n1');
    });
  });
});
