import 'reflect-metadata';
import { VoucherStatus } from '@prisma/client';
import { VoucherService } from './voucher.service';

describe('VoucherService', () => {
  let prisma: Record<string, any>;
  let service: VoucherService;

  async function expectRejection(promise: Promise<unknown>): Promise<any> {
    return promise.then(
      () => {
        throw new Error('expected promise to reject');
      },
      (error) => error,
    );
  }

  beforeEach(() => {
    prisma = {
      giftVoucher: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn().mockImplementation((args) => Promise.resolve({ id: 'v1', ...args.data })),
        update: jest.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
      },
    };
    service = new VoucherService(prisma as any);
  });

  it('generates codes in the RGL-XXXX-XXXX format', () => {
    expect(VoucherService.generateCode()).toMatch(/^RGL-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it('rejects a duplicate code', async () => {
    prisma.giftVoucher.findUnique.mockResolvedValue({ id: 'other' });
    const error = await expectRejection(service.create({ code: 'RGL-AAAA-BBBB', amount: 500 }, 'admin'));
    expect(error.code).toBe('VOUCHER.CODE_TAKEN');
  });

  it('issues a voucher with the full balance', async () => {
    prisma.giftVoucher.findUnique.mockResolvedValue(null);
    const voucher = await service.create({ amount: 1000 }, 'admin');
    expect(voucher).toMatchObject({ initialAmount: 1000, balance: 1000 });
    expect(voucher.code).toMatch(/^RGL-/);
  });

  it('caps the applicable amount at the order value', async () => {
    prisma.giftVoucher.findUnique.mockResolvedValue({
      code: 'RGL-AAAA-BBBB',
      balance: 5000,
      status: VoucherStatus.ACTIVE,
      expiresAt: null,
    });
    const preview = await service.preview('rgl-aaaa-bbbb', 3000);
    expect(preview).toMatchObject({ applicable: 3000 });
  });

  it('rejects an expired voucher', async () => {
    prisma.giftVoucher.findUnique.mockResolvedValue({
      code: 'RGL-AAAA-BBBB',
      balance: 5000,
      status: VoucherStatus.ACTIVE,
      expiresAt: new Date(Date.now() - 1000),
    });
    const error = await expectRejection(service.preview('RGL-AAAA-BBBB'));
    expect(error.code).toBe('VOUCHER.EXPIRED');
  });

  it('decrements the balance on partial redemption', async () => {
    const tx = {
      giftVoucher: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'v1',
          code: 'RGL-AAAA-BBBB',
          balance: 5000,
          status: VoucherStatus.ACTIVE,
          expiresAt: null,
        }),
        update: jest.fn(),
      },
    };
    const applied = await service.redeemInTx(tx as any, 'RGL-AAAA-BBBB', 2000);
    expect(applied).toBe(2000);
    expect(tx.giftVoucher.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { balance: 3000, status: VoucherStatus.ACTIVE, redeemedAt: null },
    });
  });

  it('marks the voucher redeemed when the balance hits zero', async () => {
    const tx = {
      giftVoucher: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'v1',
          code: 'RGL-AAAA-BBBB',
          balance: 2000,
          status: VoucherStatus.ACTIVE,
          expiresAt: null,
        }),
        update: jest.fn(),
      },
    };
    await service.redeemInTx(tx as any, 'RGL-AAAA-BBBB', 5000);
    expect(tx.giftVoucher.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: expect.objectContaining({ balance: 0, status: VoucherStatus.REDEEMED }),
    });
  });

  it('will not cancel a fully redeemed voucher', async () => {
    prisma.giftVoucher.findUnique.mockResolvedValue({ id: 'v1', status: VoucherStatus.REDEEMED });
    const error = await expectRejection(service.cancel('v1'));
    expect(error.code).toBe('VOUCHER.ALREADY_REDEEMED');
  });
});
