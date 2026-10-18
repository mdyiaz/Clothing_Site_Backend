import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { BaseRepository, PrismaDelegate } from '../../common/base/base.repository';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RoleRepository extends BaseRepository<Role> {
  protected override readonly softDeleteField = null;

  constructor(prisma: PrismaService) {
    super(prisma.role as unknown as PrismaDelegate);
  }
}
