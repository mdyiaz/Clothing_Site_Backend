import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { postForm } from '../../common/http/post-form';
import { AppException } from '../../common/exceptions/app.exception';
import { DestroyMediaDto, SignUploadDto } from './dto/media.dto';

const API_BASE = 'https://api.cloudinary.com/v1_1';

export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId?: string;
  resourceType: 'image' | 'video';
  uploadUrl: string;
}

/**
 * Cloudinary signed uploads — the API secret never leaves the server.
 * The admin panel POSTs the signature payload straight to Cloudinary,
 * then persists the resulting `public_id`/URL on the record it is editing.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(private readonly config: ConfigService) {}

  get cloudName(): string {
    return this.config.get<string>('cloudinary.cloudName') ?? '';
  }

  /** Public-safe config for the storefront/admin URL builders. */
  getConfig(): { cloudName: string; configured: boolean } {
    return { cloudName: this.cloudName, configured: Boolean(this.cloudName) };
  }

  signUpload(dto: SignUploadDto): UploadSignature {
    const { cloudName, apiKey, apiSecret } = this.requireCredentials();
    const timestamp = Math.round(Date.now() / 1000);

    const params: Record<string, string | number> = { folder: dto.folder, timestamp };
    if (dto.publicId) params.public_id = `${dto.folder}/${dto.publicId}`;

    const signature = this.sign(params, apiSecret);
    const resourceType = dto.resourceType ?? 'image';

    return {
      cloudName,
      apiKey,
      timestamp,
      signature,
      folder: dto.folder,
      ...(dto.publicId ? { publicId: params.public_id as string } : {}),
      resourceType,
      uploadUrl: `${API_BASE}/${cloudName}/${resourceType}/upload`,
    };
  }

  /** Removes an asset from Cloudinary (used when media is discarded before save). */
  async destroy(dto: DestroyMediaDto): Promise<{ publicId: string; result: string }> {
    const { cloudName, apiKey, apiSecret } = this.requireCredentials();
    const timestamp = Math.round(Date.now() / 1000);
    const resourceType = dto.resourceType ?? 'image';

    const params = { public_id: dto.publicId, timestamp };
    const signature = this.sign(params, apiSecret);

    const response = await postForm(`${API_BASE}/${cloudName}/${resourceType}/destroy`, {
      api_key: apiKey,
      ...params,
      timestamp,
      signature,
    });

    if (response.status < 200 || response.status >= 300 || response.json.result !== 'ok') {
      this.logger.warn(`Cloudinary destroy failed for ${dto.publicId}: ${response.status}`);
      throw AppException.badRequest(
        'MEDIA.DESTROY_FAILED',
        'Could not delete that file from storage. It may already be gone.',
      );
    }

    return { publicId: dto.publicId, result: 'ok' };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Cloudinary signature: sorted `k=v` pairs joined with `&`, + secret, SHA-1. */
  private sign(params: Record<string, string | number>, apiSecret: string): string {
    const stringToSign = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&');
    return createHash('sha1').update(stringToSign + apiSecret).digest('hex');
  }

  private requireCredentials(): { cloudName: string; apiKey: string; apiSecret: string } {
    const cloudName = this.cloudName;
    const apiKey = this.config.get<string>('cloudinary.apiKey') ?? '';
    const apiSecret = this.config.get<string>('cloudinary.apiSecret') ?? '';

    if (!cloudName || !apiKey || !apiSecret) {
      throw AppException.badRequest(
        'MEDIA.NOT_CONFIGURED',
        'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.',
      );
    }
    return { cloudName, apiKey, apiSecret };
  }
}
