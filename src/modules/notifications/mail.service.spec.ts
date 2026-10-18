import 'reflect-metadata';
import { postJson } from '../../common/http/post-json';
import { MailService } from './mail.service';

jest.mock('../../common/http/post-json', () => ({ postJson: jest.fn() }));

const mockedPostJson = postJson as jest.MockedFunction<typeof postJson>;

function configWith(mail: Record<string, unknown>) {
  return { get: jest.fn((key: string) => (key === 'mail' ? mail : undefined)) } as any;
}

describe('MailService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reports disabled when not configured', () => {
    const service = new MailService(configWith({ enabled: false, apiUrl: '', apiKey: '' }));
    expect(service.isEnabled()).toBe(false);
  });

  it('logs instead of sending when disabled', async () => {
    const service = new MailService(configWith({ enabled: false, apiUrl: '', apiKey: '' }));
    const result = await service.send({ to: 'a@b.c', subject: 'Hi', html: '<p>Hi</p>' });
    expect(result).toEqual({ delivered: false, channel: 'log' });
    expect(mockedPostJson).not.toHaveBeenCalled();
  });

  it('POSTs to the provider when enabled', async () => {
    mockedPostJson.mockResolvedValue({ status: 200, json: { id: 'm1' } });
    const service = new MailService(
      configWith({
        enabled: true,
        apiUrl: 'https://api.resend.com/emails',
        apiKey: 'key',
        from: 'no-reply@rangoli.com.bd',
        fromName: 'Rangoli',
      }),
    );

    const result = await service.send({ to: 'a@b.c', subject: 'Hi', html: '<p>Hi</p>' });

    expect(mockedPostJson).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ to: ['a@b.c'], subject: 'Hi' }),
      { Authorization: 'Bearer key' },
    );
    expect(result).toEqual({ delivered: true, channel: 'api', status: 200 });
  });

  it('never throws when the provider fails', async () => {
    mockedPostJson.mockRejectedValue(new Error('network down'));
    const service = new MailService(
      configWith({ enabled: true, apiUrl: 'https://x', apiKey: 'k', from: 'a@b.c', fromName: 'R' }),
    );

    await expect(service.send({ to: 'a@b.c', subject: 'Hi', html: '<p>Hi</p>' })).resolves.toEqual({
      delivered: false,
      channel: 'api',
    });
  });
});
