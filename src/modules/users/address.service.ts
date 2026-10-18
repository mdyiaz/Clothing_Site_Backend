import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAddressDto, UpdateAddressDto } from './dto/user.dto';

/** Customer shipping/billing addresses — scoped to the owning user. */
@Injectable()
export class AddressService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(userId: string, dto: CreateAddressDto) {
    const existing = await this.prisma.address.count({ where: { userId } });
    const isDefault = dto.isDefault ?? existing === 0;

    return this.prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      }
      return tx.address.create({ data: { userId, ...dto, isDefault } });
    });
  }

  async update(userId: string, id: string, dto: UpdateAddressDto) {
    await this.requireOwn(userId, id);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      }
      return tx.address.update({ where: { id }, data: { ...dto } as Prisma.AddressUpdateInput });
    });
  }

  async setDefault(userId: string, id: string) {
    await this.requireOwn(userId, id);

    return this.prisma.$transaction(async (tx) => {
      await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      return tx.address.update({ where: { id }, data: { isDefault: true } });
    });
  }

  async remove(userId: string, id: string): Promise<{ id: string }> {
    await this.requireOwn(userId, id);
    await this.prisma.address.delete({ where: { id } });
    return { id };
  }

  private async requireOwn(userId: string, id: string): Promise<void> {
    const found = await this.prisma.address.findFirst({ where: { id, userId }, select: { id: true } });
    if (!found) throw AppException.notFound('Address');
  }
}
