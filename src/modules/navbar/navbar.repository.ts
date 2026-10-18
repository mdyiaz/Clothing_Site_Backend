import { Injectable } from '@nestjs/common';
import { NavbarItem } from '@prisma/client';
import { BaseRepository, PrismaDelegate } from '../../common/base/base.repository';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NavbarRepository extends BaseRepository<NavbarItem> {
  /** NavbarItem has no `deletedAt` column — delete is a hard delete. */
  protected readonly softDeleteField: string | null = null;

  constructor(prisma: PrismaService) {
    super(prisma.navbarItem as unknown as PrismaDelegate);
  }
}
