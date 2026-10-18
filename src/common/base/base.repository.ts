export type PrismaWhere = Record<string, any>;
export type PrismaOrderBy = Record<string, any> | Record<string, any>[];

/** Structural subset of a Prisma model delegate — keeps BaseRepository model-agnostic. */
export interface PrismaDelegate {
  findMany(args?: any): Promise<any[]>;
  findUnique(args: any): Promise<any | null>;
  findFirst(args: any): Promise<any | null>;
  count(args?: any): Promise<number>;
  create(args: any): Promise<any>;
  update(args: any): Promise<any>;
  delete(args: any): Promise<any>;
}

export interface FindAllArgs {
  where?: PrismaWhere;
  orderBy?: PrismaOrderBy;
  skip?: number;
  take?: number;
  include?: Record<string, any>;
  select?: Record<string, any>;
}

export abstract class BaseRepository<T = any> {
  /** Set to null for entities without soft delete. */
  protected readonly softDeleteField: string | null = 'deletedAt';

  constructor(protected readonly model: PrismaDelegate) {}

  get supportsSoftDelete(): boolean {
    return this.softDeleteField !== null;
  }

  findById(id: string, include?: Record<string, any>): Promise<T | null> {
    return this.model.findUnique({ where: { id }, include }) as Promise<T | null>;
  }

  findOne(where: PrismaWhere, include?: Record<string, any>): Promise<T | null> {
    return this.model.findFirst({ where, include }) as Promise<T | null>;
  }

  findMany(args: FindAllArgs = {}): Promise<T[]> {
    return this.model.findMany(args) as Promise<T[]>;
  }

  async findAndCount(args: FindAllArgs = {}): Promise<{ rows: T[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.model.findMany(args),
      this.model.count({ where: args.where }),
    ]);
    return { rows: rows as T[], total };
  }

  /** Cursor-based listing for infinite scroll on the storefront. */
  findCursor(args: FindAllArgs = {}): Promise<T[]> {
    return this.model.findMany(args) as Promise<T[]>;
  }

  async create(data: Record<string, any>, include?: Record<string, any>): Promise<T> {
    return (await this.model.create({ data, include })) as T;
  }

  async update(id: string, data: Record<string, any>, include?: Record<string, any>): Promise<T> {
    return (await this.model.update({ where: { id }, data, include })) as T;
  }

  async delete(id: string): Promise<T> {
    return (await this.model.delete({ where: { id } })) as T;
  }

  /**
   * Soft delete when the entity supports `deletedAt`, otherwise hard delete.
   */
  async softDelete(id: string): Promise<T> {
    if (!this.softDeleteField) {
      return this.delete(id);
    }
    return (await this.model.update({
      where: { id },
      data: { [this.softDeleteField]: new Date() },
    })) as T;
  }

  count(where: PrismaWhere = {}): Promise<number> {
    return this.model.count({ where });
  }

  async exists(where: PrismaWhere): Promise<boolean> {
    const found = await this.model.findFirst({ where, take: 1 });
    return found !== null;
  }
}
