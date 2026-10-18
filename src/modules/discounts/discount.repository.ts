import { Injectable } from '@nestjs/common';
import { Discount } from '@prisma/client';
import { BaseRepository, PrismaDelegate } from '../../common/base/base.repository';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DiscountRepository extends BaseRepository<Discount> {
  /** Discount has no `deletedAt` column — delete is a hard delete (coupons cascade). */
  protected readonly softDeleteField: string | null = null;

  constructor(prisma: PrismaService) {
    super(prisma.discount as unknown as PrismaDelegate);
  }
}
