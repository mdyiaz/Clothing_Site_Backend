import { CacheService } from '../cache/cache.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { FooterService } from './footer.service';

type PrismaLike = Record<string, Record<string, jest.Mock>>;

describe('FooterService', () => {
  let prisma: PrismaLike;
  let cache: CacheService;
  let service: FooterService;

  beforeEach(() => {
    prisma = {
      footerColumn: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      footerLink: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      storeContactInfo: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      socialLink: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      newsletterSubscriber: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    };
    cache = new CacheService();
    service = new FooterService(prisma as any, cache);
  });

  afterEach(() => {
    cache.onModuleDestroy();
  });

  // ── storefront ────────────────────────────────────────────────────────────

  describe('getStorefront', () => {
    it('returns only active content in sortOrder', async () => {
      prisma.footerColumn.findMany.mockResolvedValue([{ id: 'col', title: 'SHOP', links: [] }]);
      prisma.storeContactInfo.findMany.mockResolvedValue([{ id: 'c1', type: 'HOTLINE' }]);
      prisma.socialLink.findMany.mockResolvedValue([{ id: 's1', platform: 'facebook' }]);

      const payload = await service.getStorefront();

      expect(payload.columns[0].title).toBe('SHOP');
      expect(payload.contact).toHaveLength(1);
      expect(payload.social).toHaveLength(1);

      expect(prisma.footerColumn.findMany.mock.calls[0][0]).toMatchObject({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
      expect(prisma.storeContactInfo.findMany.mock.calls[0][0].where).toEqual({ isActive: true });
      expect(prisma.socialLink.findMany.mock.calls[0][0].where).toEqual({ isActive: true });
    });

    it('caches the payload until an admin write invalidates it', async () => {
      prisma.footerColumn.findMany.mockResolvedValue([]);
      prisma.storeContactInfo.findMany.mockResolvedValue([]);
      prisma.socialLink.findMany.mockResolvedValue([]);

      await service.getStorefront();
      await service.getStorefront();
      expect(prisma.footerColumn.findMany).toHaveBeenCalledTimes(1);

      prisma.footerColumn.findUnique.mockResolvedValue({ id: 'col' });
      prisma.footerColumn.update.mockResolvedValue({});
      await service.updateColumn('col', { title: 'HELP' });

      await service.getStorefront();
      expect(prisma.footerColumn.findMany).toHaveBeenCalledTimes(2); // cache was dropped
    });
  });

  describe('getAdmin', () => {
    it('includes inactive rows for the admin screen', async () => {
      prisma.footerColumn.findMany.mockResolvedValue([]);
      prisma.storeContactInfo.findMany.mockResolvedValue([]);
      prisma.socialLink.findMany.mockResolvedValue([]);

      await service.getAdmin();

      expect(prisma.footerColumn.findMany.mock.calls[0][0].where).toBeUndefined();
      expect(prisma.footerColumn.findMany.mock.calls[0][0].include).toEqual({
        links: { orderBy: { sortOrder: 'asc' } },
      });
    });
  });

  // ── columns / links ───────────────────────────────────────────────────────

  describe('columns', () => {
    it('createColumn applies defaults and invalidates the cache', async () => {
      prisma.footerColumn.create.mockResolvedValue({ id: 'col' });

      await service.createColumn({ title: 'HELP' });

      expect(prisma.footerColumn.create.mock.calls[0][0].data).toMatchObject({
        title: 'HELP',
        sortOrder: 0,
        isActive: true,
      });
    });

    it('updateColumn 404s on a missing column', async () => {
      prisma.footerColumn.findUnique.mockResolvedValue(null);
      await expect(service.updateColumn('ghost', {})).rejects.toMatchObject({
        code: 'RESOURCE.NOT_FOUND',
      });
      expect(prisma.footerColumn.update).not.toHaveBeenCalled();
    });

    it('deleteColumn 404s on a missing column', async () => {
      prisma.footerColumn.findUnique.mockResolvedValue(null);
      await expect(service.deleteColumn('ghost')).rejects.toMatchObject({
        code: 'RESOURCE.NOT_FOUND',
      });
    });

    it('createLink requires its column and applies defaults', async () => {
      prisma.footerColumn.findUnique.mockResolvedValue(null);
      await expect(service.createLink('ghost', { label: 'X', url: '/y' })).rejects.toMatchObject({
        code: 'RESOURCE.NOT_FOUND',
      });

      prisma.footerColumn.findUnique.mockResolvedValue({ id: 'col' });
      prisma.footerLink.create.mockResolvedValue({ id: 'link' });

      await service.createLink('col', { label: 'Men', url: '/c/men' });

      expect(prisma.footerLink.create.mock.calls[0][0].data).toMatchObject({
        columnId: 'col',
        target: '_self',
        sortOrder: 0,
        isActive: true,
      });
    });

    it('updateLink / deleteLink 404 missing links', async () => {
      prisma.footerLink.findUnique.mockResolvedValue(null);
      await expect(service.updateLink('x', {})).rejects.toMatchObject({
        code: 'RESOURCE.NOT_FOUND',
      });
      await expect(service.deleteLink('x')).rejects.toMatchObject({
        code: 'RESOURCE.NOT_FOUND',
      });
    });
  });

  // ── contact + social ──────────────────────────────────────────────────────

  describe('contact + social', () => {
    it('creates contact entries with defaults', async () => {
      prisma.storeContactInfo.create.mockResolvedValue({ id: 'c1' });

      await service.createContact({ type: 'HOTLINE', label: 'Hotline', value: '16247' });

      expect(prisma.storeContactInfo.create.mock.calls[0][0].data).toMatchObject({
        sortOrder: 0,
        isActive: true,
      });
    });

    it('updateContact / deleteContact 404 missing entries', async () => {
      prisma.storeContactInfo.findUnique.mockResolvedValue(null);
      await expect(service.updateContact('x', {})).rejects.toMatchObject({
        code: 'RESOURCE.NOT_FOUND',
      });
      await expect(service.deleteContact('x')).rejects.toMatchObject({
        code: 'RESOURCE.NOT_FOUND',
      });
    });

    it('creates social links with defaults', async () => {
      prisma.socialLink.create.mockResolvedValue({ id: 's1' });

      await service.createSocial({ platform: 'facebook', url: 'https://facebook.com/x' });

      expect(prisma.socialLink.create.mock.calls[0][0].data).toMatchObject({
        sortOrder: 0,
        isActive: true,
      });
    });

    it('deleteSocial 404 missing links', async () => {
      prisma.socialLink.findUnique.mockResolvedValue(null);
      await expect(service.deleteSocial('x')).rejects.toMatchObject({
        code: 'RESOURCE.NOT_FOUND',
      });
    });
  });

  // ── newsletter ────────────────────────────────────────────────────────────

  describe('subscribe', () => {
    it('requires an email or a phone', async () => {
      await expect(service.subscribe({})).rejects.toMatchObject({
        code: 'NEWSLETTER.CONTACT_REQUIRED',
      });
      expect(prisma.newsletterSubscriber.findFirst).not.toHaveBeenCalled();
    });

    it('reactivates an existing subscriber instead of duplicating', async () => {
      prisma.newsletterSubscriber.findFirst.mockResolvedValue({ id: 'sub1', isActive: false });
      prisma.newsletterSubscriber.update.mockResolvedValue({ id: 'sub1', isActive: true });

      const result = await service.subscribe({ email: 'a@b.c' });

      expect(prisma.newsletterSubscriber.update).toHaveBeenCalledWith({
        where: { id: 'sub1' },
        data: { isActive: true },
      });
      expect(prisma.newsletterSubscriber.create).not.toHaveBeenCalled();
      expect(result.isActive).toBe(true);
    });

    it('creates a fresh subscriber with the attribution source', async () => {
      prisma.newsletterSubscriber.findFirst.mockResolvedValue(null);
      prisma.newsletterSubscriber.create.mockResolvedValue({ id: 'sub1' });

      await service.subscribe({ phone: '01711', source: 'footer' });

      expect(prisma.newsletterSubscriber.create).toHaveBeenCalledWith({
        data: { email: null, phone: '01711', source: 'footer' },
      });
    });

    it('finds existing subscribers by email OR phone', async () => {
      prisma.newsletterSubscriber.findFirst.mockResolvedValue(null);
      prisma.newsletterSubscriber.create.mockResolvedValue({ id: 'sub1' });

      await service.subscribe({ email: 'a@b.c', phone: '01711' });

      expect(prisma.newsletterSubscriber.findFirst.mock.calls[0][0].where.OR).toEqual([
        { email: 'a@b.c' },
        { phone: '01711' },
      ]);
    });
  });

  describe('listSubscribers', () => {
    it('paginates with a search filter', async () => {
      prisma.newsletterSubscriber.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
      prisma.newsletterSubscriber.count.mockResolvedValue(42);

      const query = Object.assign(new PaginationDto(), { page: 2, limit: 20, search: ' GMAIL ' });
      const result = await service.listSubscribers(query);

      expect(prisma.newsletterSubscriber.findMany.mock.calls[0][0]).toMatchObject({
        where: {
          OR: [
            { email: { contains: 'GMAIL', mode: 'insensitive' } },
            { phone: { contains: 'GMAIL' } },
          ],
        },
        skip: 20,
        take: 20,
      });
      expect(result.meta).toMatchObject({ total: 42, page: 2, hasNext: true });
      expect(result.items).toHaveLength(2);
    });

    it('lists everyone when no search term is given', async () => {
      prisma.newsletterSubscriber.findMany.mockResolvedValue([]);
      prisma.newsletterSubscriber.count.mockResolvedValue(0);

      const query = Object.assign(new PaginationDto(), { page: 1, limit: 20 });
      await service.listSubscribers(query);

      expect(prisma.newsletterSubscriber.findMany.mock.calls[0][0].where).toEqual({});
    });
  });
});
