import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/permissions';
import { MailService } from './mail.service';
import { SmsService } from './sms.service';

class TestNotificationDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly mail: MailService,
    private readonly sms: SmsService,
  ) {}

  @Get('status')
  @RequirePermissions(PERMISSIONS.SETTINGS_VIEW)
  @ApiOperation({ summary: 'Which outbound channels are configured' })
  status() {
    return { mail: { enabled: this.mail.isEnabled() }, sms: { enabled: this.sms.isEnabled() } };
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.SETTINGS_UPDATE)
  @ApiOperation({ summary: 'Send a test email/SMS to verify provider credentials' })
  async test(@Body() dto: TestNotificationDto) {
    const results: Record<string, unknown> = {};
    if (dto.email) {
      results.mail = await this.mail.send({
        to: dto.email,
        subject: 'Rangoli test email',
        html: '<p>This is a test email from Rangoli.</p>',
        text: 'This is a test email from Rangoli.',
      });
    }
    if (dto.phone) {
      results.sms = await this.sms.send({ to: dto.phone, message: 'Rangoli test SMS.' });
    }
    return results;
  }
}
