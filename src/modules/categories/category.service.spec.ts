import { Category } from '@prisma/client';
import { CategoryService } from './category.service';
import { CategoryRepository } from './category.repository';
import { categorySlug } from './dto/category.dto';

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

function row(overrides: Partial<Category> = {}): Category {
  return {
    id: 'c1',
    name: 'Women',
    slug: 'women',
    description: null,
    image: null,
    parentId: null,
    sortOrder: 0,
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Category;
}

describe('CategoryService', () => {
  let repository: MockRepository;
  let service: CategoryService;

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
    service = new CategoryService(repository as unknown as CategoryRepository);
  });

  async function expectRejection(promise: Promise<unknown>): Promise<any> {
    return promise.then(
      () => {
        throw new Error('expected promise to reject');
      },
      (error) => error,
    );
  }

  describe('create (slug rules)', () => {
    it('derives a slug from the name when none was given', async () => {
      repository.findOne.mockResolvedValue(null);
      repository.create.mockResolvedValue(row({ id: 'new' }));

      await service.create({ name: 'Women Ethnic Wear' });

      const persisted = repository.create.mock.calls[0][0];
      expect(persisted.slug).toBe(categorySlug('Women Ethnic Wear'));
      expect(persisted.sortOrder).toBe(0);
      expect(persisted.isActive).toBe(true);
    });

    it('keeps an explicit admin slug', async () => {
      repository.findOne.mockResolvedValue(null);
      repository.create.mockResolvedValue(row({ id: 'new' }));

      await service.create({ name: 'Women', slug: 'ladies' });

      expect(repository.create.mock.calls[0][0].slug).toBe('ladies');
    });

    it('rejects a duplicate slug with CATEGORY.SLUG_TAKEN', async () => {
      repository.findOne.mockResolvedValue(row({ id: 'other' }));

      const error = await expectRejection(service.create({ name: 'Women', slug: 'women' }));
      expect(error.code).toBe('CATEGORY.SLUG_TAKEN');
      expect(error.getStatus()).toBe(409);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('allows re-saving the same slug on a no-op create path via findOne exclusion', async () => {
      // findOne only sees the current record when excludeId matches — update path:
      repository.findOne.mockResolvedValue(row({ id: 'c1' }));
      repository.findById.mockResolvedValue(row({ id: 'c1' }));
      repository.update.mockResolvedValue(row());

      await service.update('c1', { slug: 'women' });

      expect(repository.update).toHaveBeenCalled();
    });
  });

  describe('update (slug rules)', () => {
    it('follows an auto-derived slug when the name changes', async () => {
      const current = row({ name: 'Men', slug: categorySlug('Men') });
      repository.findById.mockResolvedValue(current);
      repository.update.mockResolvedValue(row());

      await service.update('c1', { name: 'Menswear' });

      expect(repository.update.mock.calls[0][1].slug).toBe(categorySlug('Menswear'));
    });

    it('never overwrites a customised slug on rename', async () => {
      const current = row({ name: 'Men', slug: 'gentlemen' });
      repository.findById.mockResolvedValue(current);
      repository.update.mockResolvedValue(row());

      await service.update('c1', { name: 'Menswear' });

      expect(repository.update.mock.calls[0][1].slug).toBeUndefined();
    });
  });

  describe('update (tree rules)', () => {
    it('rejects a category as its own parent', async () => {
      repository.findById.mockResolvedValue(row({ id: 'c1' }));

      const error = await expectRejection(service.update('c1', { parentId: 'c1' }));
      expect(error.code).toBe('CATEGORY.PARENT_SELF');
      expect(error.getStatus()).toBe(400);
    });

    it('rejects a parent that would create a cycle', async () => {
      const graph: Record<string, { parentId: string | null }> = {
        a: { parentId: 'b' },
        b: { parentId: 'a' },
      };
      repository.findById.mockImplementation((id: string) =>
        Promise.resolve(graph[id] ? row({ id, parentId: graph[id].parentId }) : null),
      );

      const error = await expectRejection(service.update('a', { parentId: 'b' }));
      expect(error.code).toBe('CATEGORY.CYCLE');
    });

    it('enforces the 3-level depth cap', async () => {
      // parent 'p' sits at depth 3 (p → q → r), so attaching below it is level 4
      const graph: Record<string, { parentId: string | null }> = {
        c1: { parentId: null },
        p: { parentId: 'q' },
        q: { parentId: 'r' },
        r: { parentId: null },
      };
      repository.findById.mockImplementation((id: string) =>
        Promise.resolve(graph[id] ? row({ id, parentId: graph[id].parentId }) : null),
      );
      repository.findOne.mockResolvedValue(null);

      const error = await expectRejection(service.create({ name: 'Deep', parentId: 'p' }));
      expect(error.code).toBe('CATEGORY.MAX_DEPTH');
      expect(error.message).toMatch(/3 levels/);
    });

    it('accepts a parent at depth 2 (child becomes level 3)', async () => {
      const graph: Record<string, { parentId: string | null }> = {
        p: { parentId: 'q' },
        q: { parentId: null },
      };
      repository.findById.mockImplementation((id: string) =>
        Promise.resolve(graph[id] ? row({ id, parentId: graph[id].parentId }) : null),
      );
      repository.findOne.mockResolvedValue(null);
      repository.create.mockResolvedValue(row({ id: 'new' }));

      await service.create({ name: 'Level 3', parentId: 'p' });

      expect(repository.create).toHaveBeenCalled();
    });
  });

  describe('remove (guard rails)', () => {
    it('blocks deleting a category that still has children', async () => {
      repository.findById.mockResolvedValue(row());
      repository.count.mockResolvedValueOnce(2);

      const error = await expectRejection(service.remove('c1'));
      expect(error.code).toBe('CATEGORY.HAS_CHILDREN');
      expect(error.getStatus()).toBe(409);
      expect(repository.softDelete).not.toHaveBeenCalled();
    });

    it('blocks deleting a category used by products', async () => {
      repository.findById.mockResolvedValue(row());
      repository.count
        .mockResolvedValueOnce(0) // children
        .mockResolvedValueOnce(5); // products
      repository.softDelete.mockResolvedValue(row());

      const error = await expectRejection(service.remove('c1'));
      expect(error.code).toBe('CATEGORY.HAS_PRODUCTS');
      expect(repository.softDelete).not.toHaveBeenCalled();
    });

    it('soft-deletes an empty leaf category', async () => {
      repository.findById.mockResolvedValue(row());
      repository.count
        .mockResolvedValueOnce(0) // children
        .mockResolvedValueOnce(0); // products
      repository.softDelete.mockResolvedValue(row());

      await service.remove('c1');

      expect(repository.softDelete).toHaveBeenCalledWith('c1');
    });
  });

  describe('reads', () => {
    it('getTree nests children under their parents', async () => {
      repository.findMany.mockResolvedValue([
        row({ id: 'root', parentId: null }),
        row({ id: 'kid', parentId: 'root' }),
        row({ id: 'orphan', parentId: 'missing' }),
      ]);

      const tree = await service.getTree();

      expect(tree.map((node) => node.id).sort()).toEqual(['orphan', 'root']);
      const root = tree.find((node) => node.id === 'root') as any;
      expect(root.children.map((child: any) => child.id)).toEqual(['kid']);
    });

    it('getTree hides inactive categories unless asked', async () => {
      repository.findMany.mockResolvedValue([]);
      await service.getTree(false);
      expect(repository.findMany.mock.calls[0][0].where).toEqual({
        deletedAt: null,
        isActive: true,
      });

      await service.getTree(true);
      expect(repository.findMany.mock.calls[1][0].where).toEqual({ deletedAt: null });
    });

    it('findBySlug only matches active, non-deleted categories', async () => {
      repository.findOne.mockResolvedValue(row());

      await service.findBySlug('women');

      expect(repository.findOne.mock.calls[0][0]).toEqual({
        slug: 'women',
        isActive: true,
        deletedAt: null,
      });
    });

    it('findBySlug 404s for inactive categories', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findBySlug('hidden')).rejects.toMatchObject({
        code: 'RESOURCE.NOT_FOUND',
        status: 404,
      });
    });
  });
});
