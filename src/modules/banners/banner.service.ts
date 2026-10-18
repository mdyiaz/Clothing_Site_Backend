import { Injectable } from '@nestjs/common';
import { Banner, BannerMediaType, BannerPosition, Prisma } from '@prisma/client';
import { BaseService } from '../../common/base/base.service';
import { AppException } from '../../common/exceptions/app.exception';
import { liveNow } from '../../common/utils/schedule';
import { BannerRepository } from './banner.repository';

@Injectable()
export class BannerService extends BaseService<Banner> {
  protected readonly resourceName = 'Banner';
  protected readonly sortableFields = ['sortOrder', 'createdAt'];
  protected override readonly defaultSort: Prisma.BannerOrderByWithRelationInput = {
    sortOrder: 'asc',
  };

  constructor(repository: BannerRepository) {
    super(repository);
  }

  /** Banners live right now, optionally narrowed to one placement. */
  async findLive(position?: BannerPosition): Promise<Banner[]> {
    return this.repository.findMany({
      where: { isActive: true, ...(position ? { position } : {}), ...liveNow() },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  protected override async beforeCreate(data: Record<string, any>): Promise<void> {
    data.sortOrder ??= 0;
    data.isActive ??= true;
    data.mediaType ??= BannerMediaType.IMAGE;
    data.linkTarget ??= '_self';
    this.assertWindow(data);
    this.assertMedia(data);
  }

  protected override async beforeUpdate(id: string, data: Record<string, any>): Promise<void> {
    const current = await this.repository.findById(id);
    if (!current) throw AppException.notFound(this.resourceName);

    this.assertWindow({
      startsAt: 'startsAt' in data ? data.startsAt : current.startsAt,
      endsAt: 'endsAt' in data ? data.endsAt : current.endsAt,
    });
    this.assertMedia({ ...current, ...data });
  }

  private assertWindow(data: { startsAt?: Date | null; endsAt?: Date | null }): void {
    if (data.startsAt && data.endsAt && data.startsAt >= data.endsAt) {
      throw AppException.badRequest(
        'BANNER.BAD_WINDOW',
        'The end date must be after the start date.',
        { field: 'endsAt', action: 'focus' },
      );
    }
  }

  /** A banner without media would render as an empty box on the storefront. */
  private assertMedia(data: Record<string, any>): void {
    const type = (data.mediaType as BannerMediaType) ?? BannerMediaType.IMAGE;
    if (type === BannerMediaType.IMAGE && !data.imageUrl) {
      throw AppException.badRequest('BANNER.IMAGE_REQUIRED', 'Upload an image for this banner.', {
        field: 'imageUrl',
        action: 'focus',
      });
    }
    if (type === BannerMediaType.VIDEO && !data.videoUrl) {
      throw AppException.badRequest('BANNER.VIDEO_REQUIRED', 'Add a video for this banner.', {
        field: 'videoUrl',
        action: 'focus',
      });
    }
  }
}
