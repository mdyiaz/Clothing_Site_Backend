import 'reflect-metadata';
import { ChatRole } from '@prisma/client';
import { ChatService } from './chat.service';

describe('ChatService', () => {
  let prisma: Record<string, any>;
  let groq: { isConfigured: jest.Mock; complete: jest.Mock };
  let service: ChatService;

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
      chatSession: { create: jest.fn(), findUnique: jest.fn() },
      chatMessage: { create: jest.fn(), findMany: jest.fn() },
      product: { findMany: jest.fn().mockResolvedValue([]) },
    };
    groq = { isConfigured: jest.fn().mockReturnValue(false), complete: jest.fn().mockResolvedValue(null) };
    service = new ChatService(prisma as any, groq as any);
  });

  it('starts a new session when no token is provided', async () => {
    prisma.chatSession.create.mockResolvedValue({ id: 's1', sessionToken: 'tok-1' });
    groq.complete.mockResolvedValue(null);

    const result = await service.send({ message: 'show me a saree' });

    expect(prisma.chatSession.create).toHaveBeenCalled();
    expect(result).toMatchObject({ sessionToken: 'tok-1', provider: 'fallback' });
    expect(prisma.chatMessage.create).toHaveBeenCalledTimes(2);
    expect(prisma.chatMessage.create.mock.calls[0][0].data).toMatchObject({ role: ChatRole.USER });
  });

  it('reuses an existing session token', async () => {
    prisma.chatSession.findUnique.mockResolvedValue({ id: 's1', sessionToken: 'tok-1' });
    await service.send({ message: 'hello there', sessionToken: 'tok-1' });
    expect(prisma.chatSession.create).not.toHaveBeenCalled();
  });

  it('uses the Groq completion when available', async () => {
    prisma.chatSession.create.mockResolvedValue({ id: 's1', sessionToken: 'tok-1' });
    groq.complete.mockResolvedValue({
      content: 'Yes, we have cotton sarees.',
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      tokensUsed: 120,
      latencyMs: 300,
    });

    const result = await service.send({ message: 'do you have sarees' });
    expect(result.provider).toBe('groq');
    expect(result.reply).toContain('cotton sarees');
  });

  it('retrieves products by keyword and lists them in the fallback', async () => {
    prisma.chatSession.create.mockResolvedValue({ id: 's1', sessionToken: 'tok-1' });
    prisma.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'Cotton Saree', slug: 'cotton-saree', basePrice: 1800, shortDescription: null },
    ]);

    const result = await service.send({ message: 'saree please' });
    expect(prisma.product.findMany).toHaveBeenCalled();
    expect(result.products).toEqual([{ id: 'p1', name: 'Cotton Saree', slug: 'cotton-saree', basePrice: 1800 }]);
    expect(result.reply).toContain('Cotton Saree');
  });

  it('throws when reading history for an unknown session', async () => {
    prisma.chatSession.findUnique.mockResolvedValue(null);
    const error = await expectRejection(service.history('missing'));
    expect(error.code).toBe('RESOURCE.NOT_FOUND');
  });
});
