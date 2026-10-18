import { Injectable } from '@nestjs/common';
import { Order } from '@prisma/client';
import { BaseRepository, PrismaDelegate } from '../../common/base/base.repository';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OrderRepository extends BaseRepository<Order> {
  /** Orders are financial history — never deleted. */
  protected readonly softDeleteField: string | null = null;

  constructor(prisma: PrismaService) {
    super(prisma.order as unknown as PrismaDelegate);
  }
}
