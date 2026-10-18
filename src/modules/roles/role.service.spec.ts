import { AppException } from '../../common/exceptions/app.exception';
import { ALL_PERMISSIONS, PERMISSIONS } from '../../common/permissions';
import { AssignRoleDto } from './dto/role.dto';
import { RoleService } from './role.service';
import { RoleRepository } from './role.repository';

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

type PrismaLike = Record<string, Record<string, jest.Mock>>;

const VALID_PERMISSION = PERMISSIONS.MEDIA_MANAGE;

describe('RoleService', () => {
  let repository: MockRepository;
  let prisma: PrismaLike;
  let service: RoleService;

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
      user: { findUnique: jest.fn(), update: jest.fn() },
      userRole: { upsert: jest.fn(), deleteMany: jest.fn(), count: jest.fn(), findMany: jest.fn() },
      role: { findUnique: jest.fn() },
    };
    service = new RoleService(repository as unknown as RoleRepository, prisma as any);
  });

  async function expectRejection(promise: Promise<unknown>): Promise<any> {
    return promise.then(
      () => {
        throw new Error('expected promise to reject');
      },
      (error) => error,
    );
  }

  describe('assign', () => {
    it('upserts the join row and bumps sessionVersion', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', deletedAt: null });
      prisma.role.findUnique.mockResolvedValue({ id: 'r1', isActive: true });

      const result = await service.assign({
        userId: 'u1',
        roleId: 'r1',
        assignedBy: 'admin',
      } as AssignRoleDto);

      expect(result).toEqual({ userId: 'u1', roleId: 'r1' });
      expect(prisma.userRole.upsert).toHaveBeenCalledWith({
        where: { userId_roleId: { userId: 'u1', roleId: 'r1' } },
        update: { assignedBy: 'admin' },
        create: { userId: 'u1', roleId: 'r1', assignedBy: 'admin' },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { sessionVersion: { increment: 1 } },
      });
    });

    it('rejects unknown or soft-deleted users', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue({ id: 'r1', isActive: true });
      const missing = await expectRejection(service.assign({ userId: 'x', roleId: 'r1' } as any));
      expect(missing.code).toBe('RESOURCE.NOT_FOUND');
      expect(missing.getStatus()).toBe(404);

      prisma.user.findUnique.mockResolvedValue({ id: 'x', deletedAt: new Date() });
      const deleted = await expectRejection(service.assign({ userId: 'x', roleId: 'r1' } as any));
      expect(deleted.code).toBe('RESOURCE.NOT_FOUND');
      expect(prisma.userRole.upsert).not.toHaveBeenCalled();
    });

    it('rejects unknown or inactive roles', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', deletedAt: null });
      prisma.role.findUnique.mockResolvedValue(null);

      const error = await expectRejection(service.assign({ userId: 'u1', roleId: 'x' } as any));
      expect(error.code).toBe('RESOURCE.NOT_FOUND');
    });
  });

  describe('unassign', () => {
    it('deletes the join row and bumps sessionVersion', async () => {
      await service.unassign({ userId: 'u1', roleId: 'r1' } as AssignRoleDto);

      expect(prisma.userRole.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1', roleId: 'r1' },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { sessionVersion: { increment: 1 } },
      });
    });
  });

  describe('users', () => {
    it('lists assigned users after verifying the role exists', async () => {
      repository.findById.mockResolvedValue({ id: 'r1', deletedAt: null });
      prisma.userRole.findMany.mockResolvedValue([
        { user: { id: 'u1', fullName: 'A', email: 'a@x.com' } },
        { user: { id: 'u2', fullName: 'B', email: null } },
      ]);

      const users = await service.users('r1');

      expect(users).toEqual([
        { id: 'u1', fullName: 'A', email: 'a@x.com' },
        { id: 'u2', fullName: 'B', email: null },
      ]);
      expect(prisma.userRole.findMany).toHaveBeenCalledWith({
        where: { roleId: 'r1' },
        include: { user: { select: { id: true, fullName: true, email: true } } },
      });
    });

    it('404s for an unknown role', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.users('nope')).rejects.toMatchObject({
        code: 'RESOURCE.NOT_FOUND',
      });
    });
  });

  describe('create (hooks)', () => {
    it('derives a slug, applies defaults, and persists known permissions', async () => {
      repository.create.mockResolvedValue({ id: 'new' });

      await service.create({ name: 'Store Manager', permissions: [VALID_PERMISSION] });

      const persisted = repository.create.mock.calls[0][0];
      expect(persisted.slug).toBe('store-manager');
      expect(persisted.level).toBe(1);
      expect(persisted.sortOrder).toBe(0);
      expect(persisted.isActive).toBe(true);
      expect(persisted.permissions).toEqual([VALID_PERMISSION]);
    });

    it('accepts the super-admin wildcard and deduplicates', async () => {
      repository.create.mockResolvedValue({ id: 'new' });

      await service.create({ name: 'Owner', permissions: ['*', '*', VALID_PERMISSION] });

      expect(repository.create.mock.calls[0][0].permissions).toEqual(['*', VALID_PERMISSION]);
    });

    it('rejects unknown permission strings', async () => {
      const error = await expectRejection(
        service.create({ name: 'X', permissions: ['not:a_permission'] }),
      );
      expect(error.code).toBe('ROLE.PERMISSION_UNKNOWN');
      expect(error.getStatus()).toBe(400);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('rejects a non-array permissions payload', async () => {
      const error = await expectRejection(service.create({ name: 'X', permissions: 'yes' }));
      expect(error.code).toBe('ROLE.PERMISSIONS_INVALID');
    });
  });

  describe('update (hooks)', () => {
    it('re-derives the slug when the name changes and no slug was sent', async () => {
      repository.findById.mockResolvedValue({ id: 'r1', deletedAt: null });
      repository.update.mockResolvedValue({ id: 'r1' });

      await service.update('r1', { name: 'New Name' });

      expect(repository.update.mock.calls[0][1].slug).toBe('new-name');
    });

    it('validates permissions on update too', async () => {
      repository.findById.mockResolvedValue({ id: 'r1', deletedAt: null });

      const error = await expectRejection(
        service.update('r1', { permissions: ['nope:nope'] }),
      );
      expect(error.code).toBe('ROLE.PERMISSION_UNKNOWN');
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('remove (hooks)', () => {
    it('blocks deleting system roles', async () => {
      repository.findById.mockResolvedValue({ id: 'r1', isSystem: true, deletedAt: null });

      const error = await expectRejection(service.remove('r1'));
      expect(error.code).toBe('ROLE.SYSTEM_PROTECTED');
      expect(error.getStatus()).toBe(409);
      expect(repository.softDelete).not.toHaveBeenCalled();
    });

    it('blocks deleting a role still assigned to users', async () => {
      repository.findById.mockResolvedValue({ id: 'r1', isSystem: false, deletedAt: null });
      prisma.userRole.count.mockResolvedValue(3);

      const error = await expectRejection(service.remove('r1'));
      expect(error.code).toBe('ROLE.IN_USE');
      expect(repository.softDelete).not.toHaveBeenCalled();
    });

    it('deletes an unassigned non-system role', async () => {
      repository.findById.mockResolvedValue({ id: 'r1', isSystem: false, deletedAt: null });
      prisma.userRole.count.mockResolvedValue(0);
      repository.softDelete.mockResolvedValue({ id: 'r1' });

      await service.remove('r1');

      expect(repository.softDelete).toHaveBeenCalledWith('r1');
    });
  });

  describe('permission guard coverage', () => {
    it('every permission in the catalog passes the role editor validation', async () => {
      repository.create.mockResolvedValue({ id: 'new' });

      await service.create({ name: 'Kitchen Sink', permissions: [...ALL_PERMISSIONS, '*'] });

      const persisted = repository.create.mock.calls[0][0];
      expect(persisted.permissions).toHaveLength(ALL_PERMISSIONS.length + 1);
      expect(persisted.permissions).toEqual(expect.arrayContaining(['*', 'media:manage']));
    });

    it('AppException surfaces as HTTP 409 on conflicts', () => {
      const conflict = AppException.conflict('X.Y', 'nope');
      expect(conflict.getStatus()).toBe(409);
      expect(conflict.code).toBe('X.Y');
    });
  });
});
