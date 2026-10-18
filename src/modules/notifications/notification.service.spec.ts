import 'reflect-metadata';
import { MailService } from './mail.service';
import { NotificationService } from './notification.service';
import { SmsService } from './sms.service';

describe('NotificationService', () => {
  let mail: { send: jest.Mock; isEnabled: jest.Mock };
  let sms: { send: jest.Mock; isEnabled: jest.Mock };
  let service: NotificationService;

  beforeEach(() => {
    mail = { send: jest.fn().mockResolvedValue({ delivered: true, channel: 'api' }), isEnabled: jest.fn() };
    sms = { send: jest.fn().mockResolvedValue({ delivered: true, channel: 'api' }), isEnabled: jest.fn() };
    service = new NotificationService(mail as unknown as MailService, sms as unknown as SmsService);
  });

  it('sends both email and SMS for order placed', async () => {
    await service.notifyOrderPlaced({
      orderNumber: 'ORD-1',
      totalAmount: 1500,
      email: 'a@b.c',
      phone: '01711',
      customerName: 'Riaz',
    });

    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@b.c', subject: expect.stringContaining('ORD-1') }));
    expect(sms.send).toHaveBeenCalledWith(expect.objectContaining({ to: '01711', message: expect.stringContaining('ORD-1') }));
  });

  it('sends only SMS when no email is present', async () => {
    await service.notifyOrderStatus({ orderNumber: 'ORD-2', status: 'SHIPPED', phone: '01711' });

    expect(mail.send).not.toHaveBeenCalled();
    expect(sms.send).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('shipped') }),
    );
  });

  it('does nothing when there is no contact at all', async () => {
    await service.notifyOrderPlaced({ orderNumber: 'ORD-3' });
    expect(mail.send).not.toHaveBeenCalled();
    expect(sms.send).not.toHaveBeenCalled();
  });

  it('swallows a channel failure', async () => {
    mail.send.mockRejectedValue(new Error('smtp down'));
    await expect(
      service.notifyOrderPlaced({ orderNumber: 'ORD-4', email: 'a@b.c' }),
    ).resolves.toBeUndefined();
  });
});
