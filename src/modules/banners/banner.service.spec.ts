import { Banner, BannerMediaType } from '@prisma/client';
import { BannerService } from './banner.service';
import { BannerRepository } from './banner.repository';

interface MockRepository {
  findById: jest.Mock;
  findOne: jest.Mock;
  findMany: jest.Mock;
  findAndCount: jest.Mock;
  findCursor: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  softDelete: jest.Mock;
  count: jest.Mock;
  supportsSoftDelete: boolean;
}

function banner(overrides: Partial<Banner> = {}): Banner {
  return {
    id: 'b1',
    title: 'Eid Sale',
    imageUrl: 'https://cdn/x.jpg',
    videoUrl: null,
    mobileImageUrl: null,
    mediaType: 'IMAGE',
    linkUrl: '/collections/eid',
    linkType: 'CUSTOM_URL',
    linkTarget: '_self',
    position: 'HOME_TOP',
    sortOrder: 0,
    isActive: true,
    startsAt: null,
    endsAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Banner;
}

describe('BannerService', () => {
  let repository: MockRepository;
  let service: BannerService;

  beforeEach(() => {
    repository = {
      supportsSoftDelete: true,
      findById: jest.fn(),
      findOne: jest.fn(),
      findMany: jest.fn(),
      findAndCount: jest.fn(),
      findCursor: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      count: jest.fn(),
    };
    service = new BannerService(repository as unknown as BannerRepository);
  });

  async function expectRejection(promise: Promise<unknown>): Promise<any> {
    return promise.then(
      () => {
        throw new Error('expected promise to reject');
      },
      (error) => error,
    );
  }

  describe('findLive', () => {
    it('filters by placement when given', async () => {
      repository.findMany.mockResolvedValue([]);

      await service.findLive('HOME_TOP' as any);

      const args = repository.findMany.mock.calls[0][0];
      expect(args.where).toMatchObject({ isActive: true, position: 'HOME_TOP' });
      expect(args.where.AND).toHaveLength(2);
      expect(args.orderBy).toEqual([{ sortOrder: 'asc' }, { createdAt: 'asc' }]);
    });

    it('returns every live banner when no placement is given', async () => {
      repository.findMany.mockResolvedValue([]);

      await service.findLive();

      const where = repository.findMany.mock.calls[0][0].where;
      expect(where.position).toBeUndefined();
      expect(where.isActive).toBe(true);
    });
  });

  describe('create (hooks)', () => {
    it('applies defaults for an image banner', async () => {
      repository.create.mockResolvedValue(banner({ id: 'new' }));

      await service.create({ title: 'Eid Sale', imageUrl: 'https://cdn/x.jpg' });

      const persisted = repository.create.mock.calls[0][0];
      expect(persisted.sortOrder).toBe(0);
      expect(persisted.isActive).toBe(true);
      expect(persisted.mediaType).toBe('IMAGE');
      expect(persisted.linkTarget).toBe('_self');
    });

    it('requires an image for IMAGE banners', async () => {
      const error = await expectRejection(service.create({ title: 'Empty' }));
      expect(error.code).toBe('BANNER.IMAGE_REQUIRED');
      expect(error.getStatus()).toBe(400);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('requires a video for VIDEO banners', async () => {
      const error = await expectRejection(
        service.create({ title: 'Clip', mediaType: 'VIDEO', imageUrl: 'https://cdn/x.jpg' }),
      );
      expect(error.code).toBe('BANNER.VIDEO_REQUIRED');
    });

    it('accepts a VIDEO banner that has a videoUrl', async () => {
      repository.create.mockResolvedValue(banner({ id: 'new' }));

      await service.create({
        title: 'Clip',
        mediaType: BannerMediaType.VIDEO,
        videoUrl: 'https://cdn/x.mp4',
      });

      expect(repository.create).toHaveBeenCalled();
    });

    it('rejects an inverted schedule window', async () => {
      const error = await expectRejection(
        service.create({
          title: 'X',
          imageUrl: 'x.jpg',
          startsAt: new Date('2026-06-10'),
          endsAt: new Date('2026-06-01'),
        }),
      );
      expect(error.code).toBe('BANNER.BAD_WINDOW');
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('update (hooks)', () => {
    it('404s for a missing banner', async () => {
      repository.findById.mockResolvedValue(null);

      const error = await expectRejection(service.update('missing', { title: 'x' }));
      expect(error.code).toBe('RESOURCE.NOT_FOUND');
    });

    it('merges stored values so a silent window still validates', async () => {
      repository.findById.mockResolvedValue(
        banner({ startsAt: new Date('2026-06-10'), endsAt: null }),
      );
      repository.update.mockResolvedValue(banner());

      const error = await expectRejection(
        service.update('b1', { endsAt: new Date('2026-06-01') }),
      );
      expect(error.code).toBe('BANNER.BAD_WINDOW');
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('keeps an existing image when only the title changes', async () => {
      repository.findById.mockResolvedValue(banner());
      repository.update.mockResolvedValue(banner());

      await service.update('b1', { title: 'New Title' });

      expect(repository.update).toHaveBeenCalledWith('b1', expect.objectContaining({ title: 'New Title' }));
    });

    it('rejects switching an existing image banner to VIDEO without a video', async () => {
      repository.findById.mockResolvedValue(banner());
      repository.update.mockResolvedValue(banner());

      const error = await expectRejection(
        service.update('b1', { mediaType: 'VIDEO', videoUrl: null }),
      );
      expect(error.code).toBe('BANNER.VIDEO_REQUIRED');
      expect(repository.update).not.toHaveBeenCalled();
    });
  });
});
