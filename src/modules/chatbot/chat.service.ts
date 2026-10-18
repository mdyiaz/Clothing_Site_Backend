import { Injectable } from '@nestjs/common';
import { ChatRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { SendMessageDto } from './dto/chat.dto';
import { ChatTurn, GroqClient } from './groq.client';

const STORE_CONTEXT =
  'You are the Rangoli shopping assistant for a Bangladeshi clothing store. ' +
  'Answer briefly and helpfully in the customer language (Bangla or English). ' +
  'Recommend products from the CONTEXT when relevant, mention prices in ৳, and never invent products.';

interface RetrievedProduct {
  id: string;
  name: string;
  slug: string;
  basePrice: number;
  shortDescription: string | null;
}

/**
 * Three-layer chatbot: keyword product retrieval (RAG-lite) → Groq completion →
 * catalog-only fallback. Guest-friendly via an opaque session token, and every
 * turn is persisted for support review.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groq: GroqClient,
  ) {}

  start(userId?: string) {
    return this.prisma.chatSession.create({
      data: { userId: userId ?? null, sessionToken: randomUUID() },
    });
  }

  async send(dto: SendMessageDto, userId?: string) {
    let session = dto.sessionToken
      ? await this.prisma.chatSession.findUnique({ where: { sessionToken: dto.sessionToken } })
      : null;
    if (!session) session = await this.start(userId);

    await this.prisma.chatMessage.create({
      data: { sessionId: session.id, role: ChatRole.USER, content: dto.message },
    });

    const products = await this.retrieve(dto.message);
    const completion = await this.groq.complete(this.buildMessages(dto.message, products));

    const reply = completion
      ? { content: completion.content, provider: completion.provider, model: completion.model, tokensUsed: completion.tokensUsed, latencyMs: completion.latencyMs }
      : { content: this.fallback(products), provider: 'fallback', model: null, tokensUsed: null, latencyMs: null };

    await this.prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: ChatRole.ASSISTANT,
        content: reply.content,
        provider: reply.provider,
        model: reply.model,
        tokensUsed: reply.tokensUsed,
        latencyMs: reply.latencyMs,
      },
    });

    return {
      sessionToken: session.sessionToken,
      reply: reply.content,
      provider: reply.provider,
      products: products.map((p) => ({ id: p.id, name: p.name, slug: p.slug, basePrice: p.basePrice })),
    };
  }

  async history(sessionToken: string) {
    const session = await this.prisma.chatSession.findUnique({ where: { sessionToken } });
    if (!session) throw AppException.notFound('Chat session');
    return this.prisma.chatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
    });
  }

  // -------------------------------------------------------------------------

  private async retrieve(message: string): Promise<RetrievedProduct[]> {
    const keywords = message
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 3)
      .slice(0, 4);
    if (keywords.length === 0) return [];

    return this.prisma.product.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: keywords.flatMap((word) => [
          { name: { contains: word, mode: 'insensitive' as const } },
          { shortDescription: { contains: word, mode: 'insensitive' as const } },
        ]),
      },
      orderBy: { totalSold: 'desc' },
      take: 5,
      select: { id: true, name: true, slug: true, basePrice: true, shortDescription: true },
    });
  }

  private buildMessages(message: string, products: RetrievedProduct[]): ChatTurn[] {
    const context =
      products.length > 0
        ? products.map((p) => `- ${p.name} (৳${p.basePrice})${p.shortDescription ? `: ${p.shortDescription}` : ''}`).join('\n')
        : '(no matching products found)';
    return [
      { role: 'system', content: `${STORE_CONTEXT}\n\nCONTEXT:\n${context}` },
      { role: 'user', content: message },
    ];
  }

  private fallback(products: RetrievedProduct[]): string {
    if (products.length === 0) {
      return 'I could not find a matching product. Try the search bar or tell me a category (e.g. saree, panjabi, kurti).';
    }
    const list = products.map((p) => `• ${p.name} — ৳${p.basePrice}`).join('\n');
    return `Here are some items that might help:\n${list}`;
  }
}
