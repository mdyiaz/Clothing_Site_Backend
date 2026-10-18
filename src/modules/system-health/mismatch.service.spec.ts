import { MismatchService } from './mismatch.service';
import { MismatchRepository } from './mismatch.repository';
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

describe('MismatchService', () => {
  let repository: MockRepository;
  let service: MismatchService;

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
    service = new MismatchService(repository as unknown as MismatchRepository);
  });

  async function expectRejection(promise: Promise<unknown>): Promise<any> {
    return promise.then(
      () => {
        throw new Error('expected promise to reject');
      },
      (error) => error,
    );
  }

  it('builds type/severity/resolved/reference filters into the where clause', async () => {
    await service.findAll(
      pageQuery({
        type: 'NEGATIVE_STOCK',
        severity: 'CRITICAL',
        isResolved: false,
        referenceType: 'product',
        search: 'Red Saree',
      }),
    );

    const where = repository.findAndCount.mock.calls[0][0].where;
    expect(where).toMatchObject({
      type: 'NEGATIVE_STOCK',
      severity: 'CRITICAL',
      isResolved: false,
      referenceType: 'product',
    });
    expect(where.OR).toBeDefined();
  });

  it('resolve stamps the audit fields', async () => {
    repository.findById.mockResolvedValue({ id: 'm1' });
    repository.update.mockResolvedValue({ id: 'm1', isResolved: true });

    await service.resolve('m1', 'admin-1');

    expect(repository.update).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({
        isResolved: true,
        resolvedBy: 'admin-1',
        resolvedNote: null,
        resolvedAt: expect.any(Date),
      }),
    );
  });

  it('blocks create and delete — mismatches come from reconciliation only', async () => {
    const createError = await expectRejection(service.create({ type: 'GHOST_ORDER' }));
    expect(createError.code).toBe('MISMATCH.READ_ONLY');

    repository.findById.mockResolvedValue({ id: 'm1' });
    const deleteError = await expectRejection(service.remove('m1'));
    expect(deleteError.code).toBe('MISMATCH.READ_ONLY');
    expect(repository.softDelete).not.toHaveBeenCalled();
  });
});
