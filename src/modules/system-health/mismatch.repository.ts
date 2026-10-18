import { Injectable } from '@nestjs/common';
import { DataMismatch } from '@prisma/client';
import { BaseRepository, PrismaDelegate } from '../../common/base/base.repository';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MismatchRepository extends BaseRepository<DataMismatch> {
  /** Mismatch rows are audit history — hard delete only, never soft-deleted. */
  protected readonly softDeleteField: string | null = null;

  constructor(prisma: PrismaService) {
    super(prisma.dataMismatch as unknown as PrismaDelegate);
  }
}
