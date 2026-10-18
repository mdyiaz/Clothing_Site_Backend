import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { BaseService } from '../../common/base/base.service';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminUpdateUserDto, QueryUserDto, UpdateProfileDto } from './dto/user.dto';
import { UserRepository } from './user.repository';

const ROLE_INCLUDE = {
  roles: { include: { role: { select: { id: true, name: true, slug: true, color: true } } } },
} satisfies Prisma.UserInclude;

@Injectable()
export class UserService extends BaseService<User> {
  protected readonly resourceName = 'User';
  protected readonly sortableFields = ['createdAt', 'fullName', 'loyaltyPoints'];
  protected readonly searchFields = ['fullName', 'email', 'phone'];
  protected override readonly defaultSort: Prisma.UserOrderByWithRelationInput = { createdAt: 'desc' };
  protected override readonly includeOnList = ROLE_INCLUDE;
  protected override readonly includeOnDetail = ROLE_INCLUDE;

  constructor(
    repository: UserRepository,
    private readonly prisma: PrismaService,
  ) {
    super(repository);
  }

  /** Never leak the password hash to any caller. */
  protected override transform(entity: User): User {
    if (!entity || typeof entity !== 'object') return entity;
    const { passwordHash: _passwordHash, ...safe } = entity as User & { passwordHash?: string | null };
    return safe as User;
  }

  protected override async buildWhere(query: QueryUserDto): Promise<Prisma.UserWhereInput> {
    const where = (await super.buildWhere(query)) as Prisma.UserWhereInput;
    if (query.isActive !== undefined) where.isActive = query.isActive === 'true' || query.isActive === '1';
    if (query.roleSlug) where.roles = { some: { role: { slug: query.roleSlug } } };
    return where;
  }

  // -------------------------------------------------------------------------
  // Customer profile
  // -------------------------------------------------------------------------

  getProfile(userId: string): Promise<User> {
    return this.findById(userId);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    await this.findById(userId);
    const updated = await this.repository.update(userId, { ...dto });
    return this.transform(updated);
  }

  // -------------------------------------------------------------------------
  // Admin
  // -------------------------------------------------------------------------

  async adminUpdate(id: string, dto: AdminUpdateUserDto): Promise<User> {
    const current = await this.repository.findById(id);
    if (!current) throw AppException.notFound(this.resourceName);

    await this.assertEmailPhoneFree(dto, id);

    const updated = await this.repository.update(id, { ...dto });
    return this.transform(updated);
  }

  private async assertEmailPhoneFree(dto: AdminUpdateUserDto, excludeId: string): Promise<void> {
    if (dto.email) {
      const clash = await this.prisma.user.findFirst({
        where: { email: dto.email, id: { not: excludeId } },
        select: { id: true },
      });
      if (clash) throw AppException.conflict('USER.EMAIL_TAKEN', 'That email is already registered.');
    }
    if (dto.phone) {
      const clash = await this.prisma.user.findFirst({
        where: { phone: dto.phone, id: { not: excludeId } },
        select: { id: true },
      });
      if (clash) throw AppException.conflict('USER.PHONE_TAKEN', 'That phone number is already registered.');
    }
  }
}
