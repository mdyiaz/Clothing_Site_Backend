import { Injectable } from '@nestjs/common';
import { Banner } from '@prisma/client';
import { BaseRepository, PrismaDelegate } from '../../common/base/base.repository';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BannerRepository extends BaseRepository<Banner> {
  /** Banner has no `deletedAt` column — delete is a hard delete. */
  protected readonly softDeleteField: string | null = null;

  constructor(prisma: PrismaService) {
    super(prisma.banner as unknown as PrismaDelegate);
  }
}
