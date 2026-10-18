import { Injectable } from '@nestjs/common';
import { HomepageSection } from '@prisma/client';
import { BaseRepository, PrismaDelegate } from '../../common/base/base.repository';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HomepageRepository extends BaseRepository<HomepageSection> {
  /** HomepageSection has no `deletedAt` column — delete is a hard delete. */
  protected readonly softDeleteField: string | null = null;

  constructor(prisma: PrismaService) {
    super(prisma.homepageSection as unknown as PrismaDelegate);
  }
}
