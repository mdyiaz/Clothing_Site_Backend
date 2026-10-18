import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { BaseService } from '../../common/base/base.service';
import { AppException } from '../../common/exceptions/app.exception';
import { ALL_PERMISSIONS, SUPER_ADMIN_WILDCARD } from '../../common/permissions';
import { slugify } from '../../common/utils/slug';
import { PrismaService } from '../../prisma/prisma.service';
import { AssignRoleDto } from './dto/role.dto';
import { RoleRepository } from './role.repository';

@Injectable()
export class RoleService extends BaseService<Role> {
  protected readonly resourceName = 'Role';
  protected readonly sortableFields = ['sortOrder', 'level', 'name', 'createdAt'];
  protected readonly searchFields = ['name', 'slug', 'description'];
  protected override readonly defaultSort: Prisma.RoleOrderByWithRelationInput = {
    sortOrder: 'asc',
  };

  constructor(
    repository: RoleRepository,
    private readonly prisma: PrismaService,
  ) {
    super(repository);
  }

  // -------------------------------------------------------------------------
  // Role ↔ user assignment (pure RBAC join table)
  // -------------------------------------------------------------------------

  async assign(dto: AssignRoleDto): Promise<{ userId: string; roleId: string }> {
    const [user, role] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: dto.userId } }),
      this.prisma.role.findUnique({ where: { id: dto.roleId } }),
    ]);

    if (!user || user.deletedAt) throw AppException.notFound('User');
    if (!role || !role.isActive) throw AppException.notFound('Role');

    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId: dto.userId, roleId: dto.roleId } },
      update: { assignedBy: dto.assignedBy ?? null },
      create: {
        userId: dto.userId,
        roleId: dto.roleId,
        assignedBy: dto.assignedBy ?? null,
      },
    });

    // Revokes existing sessions so the new permissions take effect immediately.
    await this.prisma.user.update({
      where: { id: dto.userId },
      data: { sessionVersion: { increment: 1 } },
    });

    return { userId: dto.userId, roleId: dto.roleId };
  }

  async unassign(dto: AssignRoleDto): Promise<{ userId: string; roleId: string }> {
    await this.prisma.userRole.deleteMany({
      where: { userId: dto.userId, roleId: dto.roleId },
    });

    await this.prisma.user.update({
      where: { id: dto.userId },
      data: { sessionVersion: { increment: 1 } },
    });

    return { userId: dto.userId, roleId: dto.roleId };
  }

  async users(roleId: string): Promise<{ id: string; fullName: string | null; email: string | null }[]> {
    await this.findById(roleId);
    const rows = await this.prisma.userRole.findMany({
      where: { roleId },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });
    return rows.map((row) => row.user);
  }

  // -------------------------------------------------------------------------
  // Hooks
  // -------------------------------------------------------------------------

  protected override beforeCreate(data: Record<string, any>): void {
    data.slug = data.slug ?? slugify(data.name);
    data.level ??= 1;
    data.sortOrder ??= 0;
    data.isActive ??= true;
    data.permissions = this.assertKnownPermissions(data.permissions ?? []);
  }

  protected override beforeUpdate(_id: string, data: Record<string, any>): void {
    if (data.name && !data.slug) {
      data.slug = slugify(data.name);
    }
    if (data.permissions) {
      data.permissions = this.assertKnownPermissions(data.permissions);
    }
  }

  protected override async beforeDelete(id: string): Promise<void> {
    const role = await this.repository.findById(id);
    if (role?.isSystem) {
      throw AppException.conflict('ROLE.SYSTEM_PROTECTED', 'System roles cannot be deleted.');
    }

    const assigned = await this.prisma.userRole.count({ where: { roleId: id } });
    if (assigned > 0) {
      throw AppException.conflict(
        'ROLE.IN_USE',
        'This role is still assigned to users. Unassign them first.',
      );
    }
  }

  /**
   * Rejects unknown strings so the role editor cannot smuggle in permissions
   * that no guard will ever check.
   */
  private assertKnownPermissions(permissions: unknown): string[] {
    if (!Array.isArray(permissions)) {
      throw AppException.badRequest('ROLE.PERMISSIONS_INVALID', 'Permissions must be a list.');
    }

    const list = permissions as string[];
    const known = new Set<string>(ALL_PERMISSIONS);
    const invalid = list.filter((permission) => permission !== SUPER_ADMIN_WILDCARD && !known.has(permission));

    if (invalid.length > 0) {
      throw AppException.badRequest(
        'ROLE.PERMISSION_UNKNOWN',
        `Unknown permission(s): ${invalid.join(', ')}`,
        { field: 'permissions' },
      );
    }

    return [...new Set(list)];
  }
}
