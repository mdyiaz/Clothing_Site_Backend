import { Injectable } from '@nestjs/common';
import { Product } from '@prisma/client';
import { BaseRepository, PrismaDelegate } from '../../common/base/base.repository';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProductsRepository extends BaseRepository<Product> {
  constructor(prisma: PrismaService) {
    super(prisma.product as unknown as PrismaDelegate);
  }
}
