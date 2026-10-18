import { BaseService } from './base.service';
import { BaseRepository } from './base.repository';
import { AppException } from '../exceptions/app.exception';
import { CursorPaginationDto, PaginationDto } from '../dto/pagination.dto';

interface Row {
  id: string;
  name?: string;
  deletedAt?: Date | null;
}

/** Records every lifecycle hook so ordering and data mutation can be asserted. */
class TestService extends BaseService<Row> {
  protected readonly resourceName = 'Thing';
  protected readonly sortableFields = ['name'];
  protected readonly searchFields = ['name'];
  hooks: string[] = [];

  protected override beforeCreate(data: Record<string, any>): void {
    this.hooks.push('beforeCreate');
    data.name = `${data.name ?? ''}+beforeCreate`;
  }

  protected override afterCreate(entity: Row): void {
    this.hooks.push(`afterCreate:${entity.id}`);
  }

  protected override beforeUpdate(_id: string, data: Record<string, any>): void {
    this.hooks.push('beforeUpdate');
    data.name = `${data.name ?? ''}+beforeUpdate`;
  }

  protected override afterUpdate(): void {
    this.hooks.push('afterUpdate');
  }

  protected override beforeDelete(id: string): void {
    this.hooks.push(`beforeDelete:${id}`);
  }

  protected override afterDelete(): void {
    this.hooks.push('afterDelete');
  }

  protected override transform(entity: Row): Row {
    return { ...entity, name: `${entity.name ?? ''}|transformed` };
  }
}

interface MockRepository extends BaseRepository<Row> {
  supportsSoftDelete: boolean;
  findById: jest.Mock;
  findOne: jest.Mock;
  findMany: jest.Mock;
  findAndCount: jest.Mock;
  findCursor: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  softDelete: jest.Mock;
  count: jest.Mock;
}

function makeRepository(overrides: Partial<Record<string, jest.Mock>> = {}): MockRepository {
  return {
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
    ...overrides,
  } as unknown as MockRepository;
}

/** Real DTO instance so the `skip` getter works (plain object casts would not). */
function pageQuery(overrides: Partial<PaginationDto> = {}): PaginationDto {
  return Object.assign(new PaginationDto(), overrides);
}

function cursorQuery(overrides: Partial<CursorPaginationDto> = {}): CursorPaginationDto {
  return Object.assign(new CursorPaginationDto(), overrides);
}

describe('BaseService', () => {
  let repository: MockRepository;
  let service: TestService;

  beforeEach(() => {
    repository = makeRepository();
    service = new TestService(repository);
  });

  describe('findAll', () => {
    it('filters out soft-deleted rows and applies search across searchFields', async () => {
      repository.findAndCount.mockResolvedValue({ rows: [], total: 0 });

      await service.findAll(pageQuery({ search: 'panjabi' }));

      const args = repository.findAndCount.mock.calls[0][0];
      expect(args.where.deletedAt).toBeNull();
      expect(args.where.OR).toEqual([{ name: { contains: 'panjabi', mode: 'insensitive' } }]);
      expect(args.skip).toBe(0);
    });

    it('returns transformed items with pagination meta', async () => {
      repository.findAndCount.mockResolvedValue({
        rows: [{ id: '1', name: 'raw' }],
        total: 45,
      });

      const result = await service.findAll(pageQuery({ page: 2, limit: 20 }));

      expect(repository.findAndCount.mock.calls[0][0].skip).toBe(20);
      expect(result.items).toEqual([{ id: '1', name: 'raw|transformed' }]);
      expect(result.meta).toMatchObject({ total: 45, page: 2, hasNext: true, hasPrev: true });
    });

    it('honours an allow-listed sortBy and ignores anything else', async () => {
      repository.findAndCount.mockResolvedValue({ rows: [], total: 0 });

      await service.findAll(pageQuery({ sortBy: 'name', sortOrder: 'asc' }));
      expect(repository.findAndCount.mock.calls[0][0].orderBy).toEqual({ name: 'asc' });

      await service.findAll(pageQuery({ sortBy: 'hacker', sortOrder: 'asc' }));
      expect(repository.findAndCount.mock.calls[1][0].orderBy).toEqual({ createdAt: 'desc' });
    });
  });

  describe('findAllCursor', () => {
    it('detects the next page from the extra row and returns its id as cursor', async () => {
      repository.findCursor.mockResolvedValue([
        { id: 'a' },
        { id: 'b' },
        { id: 'c' }, // the +1 probe row
      ]);

      const result = await service.findAllCursor(cursorQuery({ limit: 2 }));

      expect(repository.findCursor.mock.calls[0][0].take).toBe(3); // limit + 1 probe row

      expect(result.items.map((item) => item.id)).toEqual(['a', 'b']);
      expect(result.meta.hasNext).toBe(true);
      expect(result.meta.nextCursor).toBe('b');
    });

    it('reports the end of the list when there is no probe row', async () => {
      repository.findCursor.mockResolvedValue([{ id: 'a' }]);

      const result = await service.findAllCursor(cursorQuery({ limit: 5 }));

      expect(result.meta.hasNext).toBe(false);
      expect(result.meta.nextCursor).toBeNull();
    });
  });

  describe('findById', () => {
    it('throws RESOURCE.NOT_FOUND when the row is missing', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.findById('nope')).rejects.toMatchObject({
        code: 'RESOURCE.NOT_FOUND',
      });
    });

    it('throws for soft-deleted rows', async () => {
      repository.findById.mockResolvedValue({ id: '1', deletedAt: new Date() });
      await expect(service.findById('1')).rejects.toBeInstanceOf(AppException);
    });

    it('returns the transformed row', async () => {
      repository.findById.mockResolvedValue({ id: '1', name: 'x' });
      await expect(service.findById('1')).resolves.toEqual({ id: '1', name: 'x|transformed' });
    });
  });

  describe('writes + hooks', () => {
    it('runs create hooks in order and transforms the result', async () => {
      repository.create.mockResolvedValue({ id: 'new', name: 'ignored' });

      const created = await service.create({ name: 'raw' });

      expect(service.hooks).toEqual(['beforeCreate', 'afterCreate:new']);
      const persisted = repository.create.mock.calls[0][0];
      expect(persisted.name).toBe('raw+beforeCreate');
      expect(created.name).toContain('transformed');
    });

    it('update refuses unknown ids', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.update('nope', { name: 'x' })).rejects.toMatchObject({
        code: 'RESOURCE.NOT_FOUND',
      });
    });

    it('update runs before/after hooks around the repository call', async () => {
      repository.findById.mockResolvedValue({ id: '1' });
      repository.update.mockResolvedValue({ id: '1' });

      await service.update('1', { name: 'raw' });

      expect(service.hooks).toEqual(['beforeUpdate', 'afterUpdate']);
      expect(repository.update.mock.calls[0][1].name).toBe('raw+beforeUpdate');
    });

    it('remove soft-deletes and runs delete hooks', async () => {
      repository.findById.mockResolvedValue({ id: '1', deletedAt: null });
      repository.softDelete.mockResolvedValue({ id: '1' });

      await service.remove('1');

      expect(repository.softDelete).toHaveBeenCalledWith('1');
      expect(service.hooks).toEqual(['beforeDelete:1', 'afterDelete']);
    });
  });
});
