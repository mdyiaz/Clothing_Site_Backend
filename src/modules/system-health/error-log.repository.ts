import { Injectable } from '@nestjs/common';
import { ErrorLog } from '@prisma/client';
import { BaseRepository, PrismaDelegate } from '../../common/base/base.repository';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ErrorLogRepository extends BaseRepository<ErrorLog> {
  /** ErrorLog rows are audit history — hard delete only, never soft-deleted. */
  protected readonly softDeleteField: string | null = null;

  constructor(prisma: PrismaService) {
    super(prisma.errorLog as unknown as PrismaDelegate);
  }
}
