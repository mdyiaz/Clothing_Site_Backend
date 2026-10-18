import { Injectable } from '@nestjs/common';
import { DataMismatch, Prisma } from '@prisma/client';
import { BaseService } from '../../common/base/base.service';
import { AppException } from '../../common/exceptions/app.exception';
import { QueryMismatchDto } from './dto/system-health.dto';
import { MismatchRepository } from './mismatch.repository';

@Injectable()
export class MismatchService extends BaseService<DataMismatch> {
  protected readonly resourceName = 'Data mismatch';
  protected readonly sortableFields = ['detectedAt', 'severity', 'type'];
  protected readonly searchFields = ['description', 'referenceCode', 'referenceId'];
  protected override readonly defaultSort: Prisma.DataMismatchOrderByWithRelationInput = {
    detectedAt: 'desc',
  };

  constructor(repository: MismatchRepository) {
    super(repository);
  }

  protected override async buildWhere(query: QueryMismatchDto): Promise<Prisma.DataMismatchWhereInput> {
    const where = (await super.buildWhere(query)) as Prisma.DataMismatchWhereInput;

    if (query.type) where.type = query.type;
    if (query.severity) where.severity = query.severity;
    if (query.isResolved !== undefined) where.isResolved = query.isResolved;
    if (query.referenceType) where.referenceType = query.referenceType;
    if (query.from || query.to) {
      where.detectedAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }
    return where;
  }

  async resolve(id: string, resolvedBy: string, note?: string): Promise<DataMismatch> {
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
      'MISMATCH.READ_ONLY',
      'Mismatches are written by the reconciliation service only.',
    );
  }

  protected override async beforeDelete(): Promise<void> {
    throw AppException.badRequest(
      'MISMATCH.READ_ONLY',
      'Mismatches are audit history and cannot be deleted.',
    );
  }
}
