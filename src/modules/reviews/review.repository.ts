import { Injectable } from '@nestjs/common';
import { Review } from '@prisma/client';
import { BaseRepository, PrismaDelegate } from '../../common/base/base.repository';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReviewRepository extends BaseRepository<Review> {
  /** Review has no `deletedAt` column — delete is a hard delete. */
  protected readonly softDeleteField: string | null = null;

  constructor(prisma: PrismaService) {
    super(prisma.review as unknown as PrismaDelegate);
  }
}
