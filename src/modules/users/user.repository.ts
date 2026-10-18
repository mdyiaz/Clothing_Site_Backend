import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { BaseRepository, PrismaDelegate } from '../../common/base/base.repository';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UserRepository extends BaseRepository<User> {
  /** User has a `deletedAt` column — soft delete. */
  protected readonly softDeleteField: string | null = 'deletedAt';

  constructor(prisma: PrismaService) {
    super(prisma.user as unknown as PrismaDelegate);
  }
}
