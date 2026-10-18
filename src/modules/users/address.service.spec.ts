import 'reflect-metadata';
import { AddressService } from './address.service';

function txStub() {
  return {
    address: {
      updateMany: jest.fn(),
      create: jest.fn().mockImplementation((args) => Promise.resolve({ id: 'a1', ...args.data })),
      update: jest.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
    },
  };
}

describe('AddressService', () => {
  let prisma: Record<string, any>;
  let service: AddressService;
  let tx: ReturnType<typeof txStub>;

  async function expectRejection(promise: Promise<unknown>): Promise<any> {
    return promise.then(
      () => {
        throw new Error('expected promise to reject');
      },
      (error) => error,
    );
  }

  beforeEach(() => {
    tx = txStub();
    prisma = {
      address: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    service = new AddressService(prisma as any);
  });

  it('makes the first address the default', async () => {
    prisma.address.count.mockResolvedValue(0);
    const address = await service.create('u1', { fullName: 'Riaz', phone: '01711' } as any);
    expect(address).toMatchObject({ isDefault: true });
  });

  it('does not default a second address unless asked', async () => {
    prisma.address.count.mockResolvedValue(2);
    const address = await service.create('u1', { fullName: 'Riaz', phone: '01711' } as any);
    expect(address).toMatchObject({ isDefault: false });
    expect(tx.address.updateMany).not.toHaveBeenCalled();
  });

  it('unsets the previous default when a new default is created', async () => {
    prisma.address.count.mockResolvedValue(2);
    await service.create('u1', { fullName: 'Riaz', phone: '01711', isDefault: true } as any);
    expect(tx.address.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', isDefault: true },
      data: { isDefault: false },
    });
  });

  it('scopes update/delete to the owner', async () => {
    prisma.address.findFirst.mockResolvedValue(null);
    expect((await expectRejection(service.update('u1', 'a1', { fullName: 'X' }))).code).toBe(
      'RESOURCE.NOT_FOUND',
    );
    expect((await expectRejection(service.remove('u1', 'a1'))).code).toBe('RESOURCE.NOT_FOUND');
  });

  it('sets a default address', async () => {
    prisma.address.findFirst.mockResolvedValue({ id: 'a1' });
    const address = await service.setDefault('u1', 'a1');
    expect(tx.address.updateMany).toHaveBeenCalled();
    expect(address).toMatchObject({ isDefault: true });
  });

  it('deletes an owned address', async () => {
    prisma.address.findFirst.mockResolvedValue({ id: 'a1' });
    await service.remove('u1', 'a1');
    expect(prisma.address.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
  });
});
