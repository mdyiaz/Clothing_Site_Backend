import 'reflect-metadata';
import { QueryReviewDto } from './dto/review.dto';
import { ReviewRepository } from './review.repository';
import { ReviewService } from './review.service';

interface MockRepository {
  supportsSoftDelete: boolean;
  findById: jest.Mock;
  findOne: jest.Mock;
  findMany: jest.Mock;
  findAndCount: jest.Mock;
  findCursor: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  softDelete: jest.Mock;
  count: jest.Mock;
}

describe('ReviewService', () => {
  let repository: MockRepository;
  let prisma: Record<string, any>;
  let service: ReviewService;

  async function expectRejection(promise: Promise<unknown>): Promise<any> {
    return promise.then(
      () => {
        throw new Error('expected promise to reject');
      },
      (error) => error,
    );
  }

  beforeEach(() => {
    repository = {
      supportsSoftDelete: false,
      findById: jest.fn(),
      findOne: jest.fn(),
      findMany: jest.fn(),
      findAndCount: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
      findCursor: jest.fn(),
      create: jest.fn().mockImplementation((data) => Promise.resolve({ id: 'r1', ...data })),
      update: jest.fn().mockImplementation((id, data) => Promise.resolve({ id, ...data })),
      delete: jest.fn(),
      softDelete: jest.fn(),
      count: jest.fn(),
    };
    prisma = {
      product: { findFirst: jest.fn() },
      review: { findFirst: jest.fn(), groupBy: jest.fn() },
      orderItem: { findFirst: jest.fn() },
    };
    service = new ReviewService(repository as unknown as ReviewRepository, prisma as any);
  });

  it('forces approved-only scope for the public product list', async () => {
    const query = Object.assign(new QueryReviewDto(), { productId: 'p1', page: 1, limit: 20 });
    await service.listForProduct('p1', query);
    expect(repository.findAndCount.mock.calls[0][0].where).toMatchObject({
      productId: 'p1',
      isApproved: true,
    });
  });

  it('requires a productId for public list and summary', async () => {
    expect((await expectRejection(service.listForProduct('', new QueryReviewDto()))).code).toBe(
      'REVIEW.PRODUCT_REQUIRED',
    );
    expect((await expectRejection(service.summary(''))).code).toBe('REVIEW.PRODUCT_REQUIRED');
  });

  it('aggregates the rating summary', async () => {
    prisma.review.groupBy.mockResolvedValue([
      { rating: 5, _count: 3 },
      { rating: 4, _count: 1 },
      { rating: 1, _count: 1 },
    ]);

    const summary = await service.summary('p1');

    expect(summary.total).toBe(5);
    expect(summary.average).toBe(4); // (15+4+1)/5 = 4
    expect(summary.distribution['5']).toBe(3);
    expect(summary.distribution['1']).toBe(1);
  });

  it('rejects a review for an unknown product', async () => {
    prisma.product.findFirst.mockResolvedValue(null);
    const error = await expectRejection(
      service.createForUser('u1', { productId: 'p1', rating: 5 }),
    );
    expect(error.code).toBe('REVIEW.UNKNOWN_PRODUCT');
  });

  it('rejects a second review of the same product', async () => {
    prisma.product.findFirst.mockResolvedValue({ id: 'p1', isActive: true });
    prisma.review.findFirst.mockResolvedValue({ id: 'existing' });
    const error = await expectRejection(
      service.createForUser('u1', { productId: 'p1', rating: 5 }),
    );
    expect(error.code).toBe('REVIEW.ALREADY_REVIEWED');
  });

  it('marks a review verified only for delivered orders and keeps it unapproved', async () => {
    prisma.product.findFirst.mockResolvedValue({ id: 'p1', isActive: true });
    prisma.review.findFirst.mockResolvedValue(null);
    prisma.orderItem.findFirst.mockResolvedValue({ id: 'oi1' });

    const review = await service.createForUser('u1', { productId: 'p1', rating: 5, comment: 'Great' });

    expect(prisma.orderItem.findFirst).toHaveBeenCalledWith({
      where: { productId: 'p1', order: { userId: 'u1', status: 'DELIVERED' } },
      select: { id: true },
    });
    expect(review).toMatchObject({ isVerified: true, isApproved: false });
  });

  it('stores an unverified review when the customer never received the product', async () => {
    prisma.product.findFirst.mockResolvedValue({ id: 'p1', isActive: true });
    prisma.review.findFirst.mockResolvedValue(null);
    prisma.orderItem.findFirst.mockResolvedValue(null);

    const review = await service.createForUser('u1', { productId: 'p1', rating: 4 });
    expect(review).toMatchObject({ isVerified: false });
  });

  it('only lets a customer delete their own review', async () => {
    prisma.review.findFirst.mockResolvedValue(null);
    expect((await expectRejection(service.removeMine('u1', 'r1'))).code).toBe('RESOURCE.NOT_FOUND');

    prisma.review.findFirst.mockResolvedValue({ id: 'r1' });
    await service.removeMine('u1', 'r1');
    expect(repository.delete).toHaveBeenCalledWith('r1');
  });

  it('moderates approval after checking the review exists', async () => {
    repository.findById.mockResolvedValue({ id: 'r1' });
    const review = await service.setApproval('r1', true);
    expect(repository.update).toHaveBeenCalledWith('r1', { isApproved: true });
    expect(review).toMatchObject({ isApproved: true });
  });
});
