import { Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { AppException } from '../../common/exceptions/app.exception';
import { postForm } from '../../common/http/post-form';
import { MediaService } from './media.service';

jest.mock('../../common/http/post-form', () => ({ postForm: jest.fn() }));

const mockedPostForm = postForm as jest.MockedFunction<typeof postForm>;

const CREDENTIALS: Record<string, string> = {
  'cloudinary.cloudName': 'rangoli-prod',
  'cloudinary.apiKey': 'api-key-123',
  'cloudinary.apiSecret': 'super-secret',
};

function makeService(values: Record<string, string | undefined> = CREDENTIALS) {
  const config = {
    get: jest.fn((key: string) => values[key]),
  };
  return { service: new MediaService(config as any), config };
}

/** Independent implementation of the Cloudinary signature algorithm. */
function expectedSignature(params: Record<string, string | number>, secret: string): string {
  const sorted = Object.keys(params).sort();
  const stringToSign = sorted.map((key) => `${key}=${params[key]}`).join('&');
  return createHash('sha1').update(stringToSign + secret).digest('hex');
}

describe('MediaService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('getConfig', () => {
    it('reports whether Cloudinary credentials are present', () => {
      const { service } = makeService();
      expect(service.getConfig()).toEqual({ cloudName: 'rangoli-prod', configured: true });

      const { service: unconfigured } = makeService({ 'cloudinary.cloudName': '' });
      expect(unconfigured.getConfig()).toEqual({ cloudName: '', configured: false });
    });
  });

  describe('signUpload', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    });

    it('produces a deterministic sha1 signature over sorted params + secret', () => {
      const { service } = makeService();
      const signature = service.signUpload({ folder: 'rangoli/products' } as any);

      const timestamp = Math.round(Date.now() / 1000);
      expect(signature).toEqual({
        cloudName: 'rangoli-prod',
        apiKey: 'api-key-123',
        timestamp,
        signature: expectedSignature({ folder: 'rangoli/products', timestamp }, 'super-secret'),
        folder: 'rangoli/products',
        resourceType: 'image',
        uploadUrl: 'https://api.cloudinary.com/v1_1/rangoli-prod/image/upload',
      });
    });

    it('includes public_id in the signed payload when provided', () => {
      const { service } = makeService();
      const signature = service.signUpload({
        folder: 'rangoli/banners',
        publicId: 'eid-hero',
        resourceType: 'video',
      } as any);

      const timestamp = Math.round(Date.now() / 1000);
      const publicId = 'rangoli/banners/eid-hero';
      expect(signature.publicId).toBe(publicId);
      expect(signature.resourceType).toBe('video');
      expect(signature.uploadUrl).toBe(
        'https://api.cloudinary.com/v1_1/rangoli-prod/video/upload',
      );
      expect(signature.signature).toBe(
        expectedSignature(
          { folder: 'rangoli/banners', public_id: publicId, timestamp },
          'super-secret',
        ),
      );
    });

    it('fails loudly when credentials are missing', () => {
      const { service } = makeService({ 'cloudinary.cloudName': 'rangoli-prod' });

      let error: AppException | undefined;
      try {
        service.signUpload({ folder: 'x' } as any);
      } catch (caught) {
        error = caught as AppException;
      }

      expect(error?.code).toBe('MEDIA.NOT_CONFIGURED');
      expect(error?.getStatus()).toBe(400);
    });
  });

  describe('destroy', () => {
    it('posts a signed form to the Cloudinary destroy endpoint', async () => {
      mockedPostForm.mockResolvedValue({ status: 200, json: { result: 'ok' } } as any);
      const { service } = makeService();

      const result = await service.destroy({ publicId: 'rangoli/tmp/old' } as any);

      expect(result).toEqual({ publicId: 'rangoli/tmp/old', result: 'ok' });

      const [url, body] = mockedPostForm.mock.calls[0];
      expect(url).toBe('https://api.cloudinary.com/v1_1/rangoli-prod/image/destroy');
      expect(body).toMatchObject({
        api_key: 'api-key-123',
        public_id: 'rangoli/tmp/old',
        timestamp: expect.any(Number),
        signature: expect.any(String),
      });
      expect(body.signature).toBe(
        expectedSignature(
          { public_id: 'rangoli/tmp/old', timestamp: body.timestamp as number },
          'super-secret',
        ),
      );
    });

    it('turns a Cloudinary rejection into MEDIA.DESTROY_FAILED', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      mockedPostForm.mockResolvedValue({ status: 404, json: { result: 'not found' } } as any);
      const { service } = makeService();

      await expect(service.destroy({ publicId: 'gone' } as any)).rejects.toMatchObject({
        code: 'MEDIA.DESTROY_FAILED',
      });
      warn.mockRestore();
    });

    it('rejects when Cloudinary is not configured', async () => {
      const { service } = makeService({});

      await expect(service.destroy({ publicId: 'x' } as any)).rejects.toMatchObject({
        code: 'MEDIA.NOT_CONFIGURED',
      });
      expect(mockedPostForm).not.toHaveBeenCalled();
    });
  });
});
