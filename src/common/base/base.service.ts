import { CursorPaginationDto, PaginationDto } from '../dto/pagination.dto';
import { AppException } from '../exceptions/app.exception';
import { BaseRepository, PrismaOrderBy, PrismaWhere } from './base.repository';
import { buildMeta, PaginatedResult } from './paginated-result';

/**
 * Generic service with lifecycle hooks.
 *
 * Override the hooks to add business rules without touching the CRUD plumbing:
 *   beforeCreate / afterCreate / beforeUpdate / afterUpdate / beforeDelete / afterDelete
 *   buildWhere / buildOrderBy / transform / toPersistence
 */
export abstract class BaseService<T = any> {
  /** Human readable resource name used in error messages. */
  protected readonly resourceName: string = 'Record';

  /** Fields the client is allowed to sort by. Anything else falls back to `defaultSort`. */
  protected readonly sortableFields: string[] = ['createdAt'];

  /** Fields scanned when `query.search` is provided. */
  protected readonly searchFields: string[] = [];

  protected readonly defaultSort: PrismaOrderBy = { createdAt: 'desc' };

  /** Relations eagerly loaded on list endpoints. */
  protected readonly includeOnList: Record<string, any> | undefined = undefined;

  /** Relations eagerly loaded on single-record endpoints. */
  protected readonly includeOnDetail: Record<string, any> | undefined = undefined;

  constructor(protected readonly repository: BaseRepository<T>) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async findAll(query: PaginationDto): Promise<PaginatedResult<T>> {
    const where = await this.buildWhere(query);
    const orderBy = this.buildOrderBy(query);

    const { rows, total } = await this.repository.findAndCount({
      where,
      orderBy,
      skip: query.skip,
      take: query.limit,
      ...(this.includeOnList ? { include: this.includeOnList } : {}),
    });

    return new PaginatedResult<T>(
      rows.map((row) => this.transform(row)),
      buildMeta(total, query.page, query.limit),
    );
  }

  async findAllCursor(query: CursorPaginationDto): Promise<PaginatedResult<T>> {
    const where = await this.buildWhere(query);
    const orderBy = this.buildOrderBy(query);

    // fetch one extra row to know whether another page exists
    const rows = await this.repository.findCursor({
      where,
      orderBy,
      take: query.limit + 1,
      ...(this.includeOnList ? { include: this.includeOnList } : {}),
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasNext = rows.length > query.limit;
    const items = (hasNext ? rows.slice(0, query.limit) : rows).map((row) => this.transform(row));

    return new PaginatedResult<T>(items, {
      ...buildMeta(items.length, 1, query.limit),
      hasNext,
      nextCursor: hasNext && items.length > 0 ? (items[items.length - 1] as { id: string }).id : null,
    });
  }

  async findById(id: string): Promise<T> {
    const entity = await this.repository.findById(id, this.includeOnDetail);
    if (!entity || (this.repository.supportsSoftDelete && (entity as any).deletedAt)) {
      throw AppException.notFound(this.resourceName);
    }
    return this.transform(entity);
  }

  async findOne(where: PrismaWhere): Promise<T> {
    const entity = await this.repository.findOne(where, this.includeOnDetail);
    if (!entity) {
      throw AppException.notFound(this.resourceName);
    }
    return this.transform(entity);
  }

  async count(where: PrismaWhere = {}): Promise<number> {
    return this.repository.count(where);
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  async create(dto: Record<string, any>): Promise<T> {
    const data = await this.toPersistence(dto, 'create');
    await this.beforeCreate(data);
    const created = await this.repository.create(data);
    await this.afterCreate(created);
    return this.transform(created);
  }

  async update(id: string, dto: Record<string, any>): Promise<T> {
    await this.findById(id);
    const data = await this.toPersistence(dto, 'update');
    await this.beforeUpdate(id, data);
    const updated = await this.repository.update(id, data);
    await this.afterUpdate(updated);
    return this.transform(updated);
  }

  async remove(id: string): Promise<T> {
    await this.findById(id);
    await this.beforeDelete(id);
    const removed = await this.repository.softDelete(id);
    await this.afterDelete(removed);
    return this.transform(removed);
  }

  // -------------------------------------------------------------------------
  // Lifecycle hooks
  // -------------------------------------------------------------------------

  protected beforeCreate(_data: Record<string, any>): Promise<void> | void {
    return undefined;
  }

  protected afterCreate(_entity: T): Promise<void> | void {
    return undefined;
  }

  protected beforeUpdate(_id: string, _data: Record<string, any>): Promise<void> | void {
    return undefined;
  }

  protected afterUpdate(_entity: T): Promise<void> | void {
    return undefined;
  }

  protected beforeDelete(_id: string): Promise<void> | void {
    return undefined;
  }

  protected afterDelete(_entity: T): Promise<void> | void {
    return undefined;
  }

  // -------------------------------------------------------------------------
  // Query shaping (overridable)
  // -------------------------------------------------------------------------

  /**
   * Builds the Prisma `where` clause. `query` is the incoming query DTO;
   * typed as `any` here so every subclass can narrow it to its own DTO.
   *
   * Default behaviour: soft-delete filter + `search` across `searchFields`.
   */
  protected async buildWhere(query: any): Promise<PrismaWhere> {
    const where: PrismaWhere = { ...(query?.filters ?? {}) };

    if (this.repository.supportsSoftDelete) {
      where.deletedAt = null;
    }

    const term: string | undefined = query?.search ?? query?.q;
    if (term?.trim() && this.searchFields.length > 0) {
      where.OR = this.searchFields.map((field) => ({
        [field]: { contains: term.trim(), mode: 'insensitive' },
      }));
    }

    return where;
  }

  /** Builds the Prisma `orderBy` clause. Honours `sortBy`/`sortOrder` when allow-listed. */
  protected buildOrderBy(query: any): PrismaOrderBy {
    const field: string | undefined = query?.sortBy;
    if (field && this.sortableFields.includes(field)) {
      return { [field]: query?.sortOrder === 'asc' ? 'asc' : 'desc' };
    }
    return this.defaultSort;
  }

  protected transform(entity: T): T {
    return entity;
  }

  protected toPersistence(
    dto: Record<string, any>,
    _op: 'create' | 'update',
  ): Promise<Record<string, any>> | Record<string, any> {
    return dto;
  }
}
