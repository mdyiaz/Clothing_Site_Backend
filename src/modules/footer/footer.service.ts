import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginatedResult, buildMeta } from '../../common/base/paginated-result';
import { AppException } from '../../common/exceptions/app.exception';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';

const CACHE_TTL = 300;
const CACHE_KEY = 'footer:storefront';

/**
 * The footer is one grouped payload for the storefront:
 * columns + links, contact strip, social icons — plus the newsletter signup.
 * All five resources live here because the admin edits them as one screen.
 */
@Injectable()
export class FooterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  // -------------------------------------------------------------------------
  // Storefront (public)
  // -------------------------------------------------------------------------

  getStorefront() {
    return this.cache.getOrSet(CACHE_KEY, CACHE_TTL, async () => {
      const [columns, contact, social] = await Promise.all([
        this.prisma.footerColumn.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: {
            links: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
          },
        }),
        this.prisma.storeContactInfo.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        }),
        this.prisma.socialLink.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        }),
      ]);
      return { columns, contact, social };
    });
  }

  // -------------------------------------------------------------------------
  // Admin (everything, including inactive)
  // -------------------------------------------------------------------------

  async getAdmin() {
    const [columns, contact, social] = await Promise.all([
      this.prisma.footerColumn.findMany({
        orderBy: { sortOrder: 'asc' },
        include: { links: { orderBy: { sortOrder: 'asc' } } },
      }),
      this.prisma.storeContactInfo.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.prisma.socialLink.findMany({ orderBy: { sortOrder: 'asc' } }),
    ]);
    return { columns, contact, social };
  }

  // -------------------------------------------------------------------------
  // Columns
  // -------------------------------------------------------------------------

  async createColumn(dto: Record<string, any>) {
    const column = await this.prisma.footerColumn.create({
      data: { ...dto, sortOrder: dto.sortOrder ?? 0, isActive: dto.isActive ?? true } as Prisma.FooterColumnCreateInput,
    });
    await this.invalidate();
    return column;
  }

  async updateColumn(id: string, dto: Record<string, any>) {
    await this.require(this.prisma.footerColumn, id, 'Footer column');
    const column = await this.prisma.footerColumn.update({ where: { id }, data: dto });
    await this.invalidate();
    return column;
  }

  async deleteColumn(id: string) {
    await this.require(this.prisma.footerColumn, id, 'Footer column');
    await this.prisma.footerColumn.delete({ where: { id } }); // links cascade
    await this.invalidate();
    return { id };
  }

  // -------------------------------------------------------------------------
  // Links
  // -------------------------------------------------------------------------

  async createLink(columnId: string, dto: Record<string, any>) {
    await this.require(this.prisma.footerColumn, columnId, 'Footer column');
    const link = await this.prisma.footerLink.create({
      data: {
        ...dto,
        columnId,
        target: dto.target ?? '_self',
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      } as unknown as Prisma.FooterLinkCreateInput,
    });
    await this.invalidate();
    return link;
  }

  async updateLink(id: string, dto: Record<string, any>) {
    await this.require(this.prisma.footerLink, id, 'Footer link');
    const link = await this.prisma.footerLink.update({ where: { id }, data: dto });
    await this.invalidate();
    return link;
  }

  async deleteLink(id: string) {
    await this.require(this.prisma.footerLink, id, 'Footer link');
    await this.prisma.footerLink.delete({ where: { id } });
    await this.invalidate();
    return { id };
  }

  // -------------------------------------------------------------------------
  // Contact info
  // -------------------------------------------------------------------------

  async createContact(dto: Record<string, any>) {
    const entry = await this.prisma.storeContactInfo.create({
      data: { ...dto, sortOrder: dto.sortOrder ?? 0, isActive: dto.isActive ?? true } as Prisma.StoreContactInfoCreateInput,
    });
    await this.invalidate();
    return entry;
  }

  async updateContact(id: string, dto: Record<string, any>) {
    await this.require(this.prisma.storeContactInfo, id, 'Contact entry');
    const entry = await this.prisma.storeContactInfo.update({ where: { id }, data: dto });
    await this.invalidate();
    return entry;
  }

  async deleteContact(id: string) {
    await this.require(this.prisma.storeContactInfo, id, 'Contact entry');
    await this.prisma.storeContactInfo.delete({ where: { id } });
    await this.invalidate();
    return { id };
  }

  // -------------------------------------------------------------------------
  // Social links
  // -------------------------------------------------------------------------

  async createSocial(dto: Record<string, any>) {
    const link = await this.prisma.socialLink.create({
      data: { ...dto, sortOrder: dto.sortOrder ?? 0, isActive: dto.isActive ?? true } as Prisma.SocialLinkCreateInput,
    });
    await this.invalidate();
    return link;
  }

  async updateSocial(id: string, dto: Record<string, any>) {
    await this.require(this.prisma.socialLink, id, 'Social link');
    const link = await this.prisma.socialLink.update({ where: { id }, data: dto });
    await this.invalidate();
    return link;
  }

  async deleteSocial(id: string) {
    await this.require(this.prisma.socialLink, id, 'Social link');
    await this.prisma.socialLink.delete({ where: { id } });
    await this.invalidate();
    return { id };
  }

  // -------------------------------------------------------------------------
  // Newsletter
  // -------------------------------------------------------------------------

  async subscribe(dto: { email?: string; phone?: string; source?: string }) {
    if (!dto.email && !dto.phone) {
      throw AppException.badRequest(
        'NEWSLETTER.CONTACT_REQUIRED',
        'Enter an email address or a phone number.',
        { field: 'email', action: 'focus' },
      );
    }

    const existing = await this.prisma.newsletterSubscriber.findFirst({
      where: {
        OR: [
          ...(dto.email ? [{ email: dto.email }] : []),
          ...(dto.phone ? [{ phone: dto.phone }] : []),
        ],
      },
    });

    if (existing) {
      // already subscribed → make sure the record stays active
      return this.prisma.newsletterSubscriber.update({
        where: { id: existing.id },
        data: { isActive: true },
      });
    }

    return this.prisma.newsletterSubscriber.create({
      data: {
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        source: dto.source ?? null,
      },
    });
  }

  async listSubscribers(query: PaginationDto) {
    const search = query.search?.trim();
    const where: Prisma.NewsletterSubscriberWhereInput = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
          ],
        }
      : {};

    const [rows, total] = await Promise.all([
      this.prisma.newsletterSubscriber.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.newsletterSubscriber.count({ where }),
    ]);

    return new PaginatedResult(rows, buildMeta(total, query.page, query.limit));
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async require(
    delegate: { findUnique(args: any): Promise<any> },
    id: string,
    label: string,
  ): Promise<void> {
    const found = await delegate.findUnique({ where: { id } });
    if (!found) throw AppException.notFound(label);
  }

  private async invalidate(): Promise<void> {
    await this.cache.deletePrefix('footer:');
  }
}
