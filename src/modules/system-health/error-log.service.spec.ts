import { ErrorLogService } from './error-log.service';
import { ErrorLogRepository } from './error-log.repository';
import { PaginationDto } from '../../common/dto/pagination.dto';

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

function pageQuery(overrides: Record<string, unknown> = {}): PaginationDto {
  return Object.assign(new PaginationDto(), overrides);
}

describe('ErrorLogService', () => {
  let repository: MockRepository;
  let service: ErrorLogService;

  beforeEach(() => {
    repository = {
      supportsSoftDelete: false,
      findById: jest.fn(),
      findOne: jest.fn(),
      findMany: jest.fn(),
      findAndCount: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
      findCursor: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      count: jest.fn(),
    };
    service = new ErrorLogService(repository as unknown as ErrorLogRepository);
  });

  async function expectRejection(promise: Promise<unknown>): Promise<any> {
    return promise.then(
      () => {
        throw new Error('expected promise to reject');
      },
      (error) => error,
    );
  }

  it('builds filter + search + date range into the where clause', async () => {
    await service.findAll(
      pageQuery({
        search: 'SKU_TAKEN',
        level: 'ERROR',
        source: 'api',
        isResolved: false,
        correlationId: 'corr-1',
        from: new Date('2026-01-01'),
        to: new Date('2026-02-01'),
      }),
    );

    const where = repository.findAndCount.mock.calls[0][0].where;
    expect(where.level).toBe('ERROR');
    expect(where.source).toBe('api');
    expect(where.isResolved).toBe(false);
    expect(where.correlationId).toBe('corr-1');
    expect(where.createdAt).toEqual({
      gte: new Date('2026-01-01'),
      lte: new Date('2026-02-01'),
    });
    expect(where.OR).toBeDefined(); // search across message/code/path/correlationId
  });

  it('resolve stamps the audit fields', async () => {
    repository.findById.mockResolvedValue({ id: 'log1' });
    repository.update.mockResolvedValue({ id: 'log1', isResolved: true });

    await service.resolve('log1', 'admin-1', 'fixed in #42');

    expect(repository.update).toHaveBeenCalledWith(
      'log1',
      expect.objectContaining({
        isResolved: true,
        resolvedBy: 'admin-1',
        resolvedNote: 'fixed in #42',
        resolvedAt: expect.any(Date),
      }),
    );
  });

  it('resolve 404s for unknown ids', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(service.resolve('ghost', 'admin-1')).rejects.toMatchObject({
      code: 'RESOURCE.NOT_FOUND',
    });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('blocks create and delete — logs are append-only audit history', async () => {
    const createError = await expectRejection(service.create({ message: 'handmade' }));
    expect(createError.code).toBe('ERROR_LOG.READ_ONLY');

    repository.findById.mockResolvedValue({ id: 'log1' });
    const deleteError = await expectRejection(service.remove('log1'));
    expect(deleteError.code).toBe('ERROR_LOG.READ_ONLY');
    expect(repository.softDelete).not.toHaveBeenCalled();
  });
});
