import 'reflect-metadata';
import { QueryUserDto } from './dto/user.dto';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';

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

describe('UserService', () => {
  let repository: MockRepository;
  let prisma: Record<string, any>;
  let service: UserService;

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
      supportsSoftDelete: true,
      findById: jest.fn(),
      findOne: jest.fn(),
      findMany: jest.fn(),
      findAndCount: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
      findCursor: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockImplementation((id, data) => Promise.resolve({ id, ...data })),
      delete: jest.fn(),
      softDelete: jest.fn(),
      count: jest.fn(),
    };
    prisma = { user: { findFirst: jest.fn() } };
    service = new UserService(repository as unknown as UserRepository, prisma as any);
  });

  it('never returns the password hash', async () => {
    repository.findById.mockResolvedValue({ id: 'u1', fullName: 'Riaz', passwordHash: 'secret' });
    const user = await service.getProfile('u1');
    expect(user).not.toHaveProperty('passwordHash');
    expect(user).toMatchObject({ id: 'u1', fullName: 'Riaz' });
  });

  it('maps admin filters onto the where clause', async () => {
    const query = Object.assign(new QueryUserDto(), {
      isActive: 'false',
      roleSlug: 'delivery-department',
      page: 1,
      limit: 20,
    });
    await service.findAll(query);
    expect(repository.findAndCount.mock.calls[0][0].where).toMatchObject({
      deletedAt: null,
      isActive: false,
      roles: { some: { role: { slug: 'delivery-department' } } },
    });
  });

  it('rejects a duplicate email on admin update', async () => {
    repository.findById.mockResolvedValue({ id: 'u1' });
    prisma.user.findFirst.mockResolvedValue({ id: 'other' });
    const error = await expectRejection(service.adminUpdate('u1', { email: 'taken@rangoli.com.bd' }));
    expect(error.code).toBe('USER.EMAIL_TAKEN');
  });

  it('rejects a duplicate phone on admin update', async () => {
    repository.findById.mockResolvedValue({ id: 'u1' });
    prisma.user.findFirst.mockResolvedValue({ id: 'other' });
    const error = await expectRejection(service.adminUpdate('u1', { phone: '01711' }));
    expect(error.code).toBe('USER.PHONE_TAKEN');
  });

  it('updates a user when the contact is free', async () => {
    repository.findById.mockResolvedValue({ id: 'u1' });
    prisma.user.findFirst.mockResolvedValue(null);
    const updated = await service.adminUpdate('u1', { isActive: false });
    expect(repository.update).toHaveBeenCalledWith('u1', { isActive: false });
    expect(updated).toMatchObject({ isActive: false });
  });
});
