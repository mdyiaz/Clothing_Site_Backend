import { Injectable } from '@nestjs/common';
import { GiftVoucher, Prisma, VoucherStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PaginatedResult, buildMeta } from '../../common/base/paginated-result';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateVoucherDto, QueryVoucherDto, UpdateVoucherDto } from './dto/voucher.dto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Stored-value gift vouchers. Redemption decrements `balance`; the row flips to
 * REDEEMED once the balance hits zero. Expiry is evaluated lazily on read/redeem
 * (a stale ACTIVE row past `expiresAt` is rejected and flipped to EXPIRED).
 */
@Injectable()
export class VoucherService {
  constructor(private readonly prisma: PrismaService) {}

  static generateCode(): string {
    const bytes = randomBytes(8);
    let out = '';
    for (let i = 0; i < 8; i += 1) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    return `RGL-${out.slice(0, 4)}-${out.slice(4, 8)}`;
  }

  async create(dto: CreateVoucherDto, actorId: string): Promise<GiftVoucher> {
    const code = (dto.code ?? VoucherService.generateCode()).toUpperCase();
    const existing = await this.prisma.giftVoucher.findUnique({ where: { code }, select: { id: true } });
    if (existing) throw AppException.conflict('VOUCHER.CODE_TAKEN', 'That voucher code is already in use.');

    return this.prisma.giftVoucher.create({
      data: {
        code,
        initialAmount: dto.amount,
        balance: dto.amount,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        issuedToEmail: dto.issuedToEmail ?? null,
        note: dto.note ?? null,
        createdBy: actorId,
      },
    });
  }

  async list(query: QueryVoucherDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.GiftVoucherWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.search) where.code = { contains: query.search, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      this.prisma.giftVoucher.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      this.prisma.giftVoucher.count({ where }),
    ]);
    return new PaginatedResult(items, buildMeta(total, page, limit));
  }

  async get(id: string): Promise<GiftVoucher> {
    const voucher = await this.prisma.giftVoucher.findUnique({ where: { id } });
    if (!voucher) throw AppException.notFound('Voucher');
    return voucher;
  }

  async update(id: string, dto: UpdateVoucherDto): Promise<GiftVoucher> {
    await this.get(id);
    return this.prisma.giftVoucher.update({
      where: { id },
      data: {
        expiresAt: dto.expiresAt === undefined ? undefined : dto.expiresAt ? new Date(dto.expiresAt) : null,
        issuedToEmail: dto.issuedToEmail,
        note: dto.note,
        status: dto.status,
      },
    });
  }

  async cancel(id: string): Promise<GiftVoucher> {
    const voucher = await this.get(id);
    if (voucher.status === VoucherStatus.REDEEMED) {
      throw AppException.badRequest('VOUCHER.ALREADY_REDEEMED', 'A fully redeemed voucher cannot be cancelled.');
    }
    return this.prisma.giftVoucher.update({ where: { id }, data: { status: VoucherStatus.CANCELLED } });
  }

  /** Read-only preview used before checkout settles. */
  async preview(code: string, amount?: number) {
    const voucher = await this.findUsable(code);
    const applicable = amount === undefined ? voucher.balance : Math.min(voucher.balance, amount);
    return { code: voucher.code, balance: voucher.balance, applicable };
  }

  /** Redeem against an order inside a transaction. Returns the applied amount. */
  async redeemInTx(tx: Prisma.TransactionClient, code: string, amount: number): Promise<number> {
    const voucher = await tx.giftVoucher.findUnique({ where: { code: code.toUpperCase() } });
    if (!voucher) throw AppException.badRequest('VOUCHER.NOT_FOUND', 'That voucher code does not exist.');
    this.assertUsable(voucher);

    const applied = Math.min(voucher.balance, amount);
    if (applied <= 0) return 0;

    const remaining = voucher.balance - applied;
    await tx.giftVoucher.update({
      where: { id: voucher.id },
      data: {
        balance: remaining,
        status: remaining === 0 ? VoucherStatus.REDEEMED : VoucherStatus.ACTIVE,
        redeemedAt: remaining === 0 ? new Date() : null,
      },
    });
    return applied;
  }

  private async findUsable(code: string): Promise<GiftVoucher> {
    const voucher = await this.prisma.giftVoucher.findUnique({ where: { code: code.toUpperCase() } });
    if (!voucher) throw AppException.badRequest('VOUCHER.NOT_FOUND', 'That voucher code does not exist.');
    this.assertUsable(voucher);
    return voucher;
  }

  private assertUsable(voucher: GiftVoucher): void {
    if (voucher.status === VoucherStatus.REDEEMED) {
      throw AppException.badRequest('VOUCHER.ALREADY_REDEEMED', 'This voucher has already been fully used.');
    }
    if (voucher.status === VoucherStatus.CANCELLED) {
      throw AppException.badRequest('VOUCHER.CANCELLED', 'This voucher has been cancelled.');
    }
    if (voucher.expiresAt && voucher.expiresAt.getTime() < Date.now()) {
      throw AppException.badRequest('VOUCHER.EXPIRED', 'This voucher has expired.');
    }
  }
}
