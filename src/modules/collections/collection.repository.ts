import { Injectable } from '@nestjs/common';
import { Collection } from '@prisma/client';
import { BaseRepository, PrismaDelegate } from '../../common/base/base.repository';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CollectionRepository extends BaseRepository<Collection> {
  /** Collection has no `deletedAt` column — delete is a hard delete. */
  protected readonly softDeleteField: string | null = null;

  constructor(prisma: PrismaService) {
    super(prisma.collection as unknown as PrismaDelegate);
  }
}
