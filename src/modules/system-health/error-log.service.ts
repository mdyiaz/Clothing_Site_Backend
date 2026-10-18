import { Injectable } from '@nestjs/common';
import { ErrorLog, Prisma } from '@prisma/client';
import { BaseService } from '../../common/base/base.service';
import { AppException } from '../../common/exceptions/app.exception';
import { QueryErrorLogDto } from './dto/system-health.dto';
import { ErrorLogRepository } from './error-log.repository';

@Injectable()
export class ErrorLogService extends BaseService<ErrorLog> {
  protected readonly resourceName = 'Error log';
  protected readonly sortableFields = ['createdAt', 'level', 'statusCode'];
  protected readonly searchFields = ['message', 'code', 'path', 'correlationId'];
  protected override readonly defaultSort: Prisma.ErrorLogOrderByWithRelationInput = {
    createdAt: 'desc',
  };

  constructor(repository: ErrorLogRepository) {
    super(repository);
  }

  protected override async buildWhere(query: QueryErrorLogDto): Promise<Prisma.ErrorLogWhereInput> {
    const where = (await super.buildWhere(query)) as Prisma.ErrorLogWhereInput;

    if (query.level) where.level = query.level;
    if (query.source) where.source = query.source;
    if (query.isResolved !== undefined) where.isResolved = query.isResolved;
    if (query.correlationId) where.correlationId = query.correlationId;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }
    return where;
  }

  /** Error logs are append-only — the one allowed mutation is resolving. */
  async resolve(id: string, resolvedBy: string, note?: string): Promise<ErrorLog> {
    await this.findById(id);
    const updated = await this.repository.update(id, {
      isResolved: true,
      resolvedBy,
      resolvedAt: new Date(),
      resolvedNote: note ?? null,
    });
    return this.transform(updated);
  }

  protected override async beforeCreate(): Promise<void> {
    throw AppException.badRequest(
      'ERROR_LOG.READ_ONLY',
      'Error logs are written by the exception filter only.',
    );
  }

  protected override async beforeDelete(): Promise<void> {
    throw AppException.badRequest(
      'ERROR_LOG.READ_ONLY',
      'Error logs are audit history and cannot be deleted.',
    );
  }
}
