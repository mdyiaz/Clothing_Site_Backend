import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class UpdateSettingsDto {
  @ApiProperty({
    example: {
      'store.freeShippingThreshold': 8000,
      'store.codEnabled': true,
      'store.chatbotWelcomeMessage': 'Hi! How can I help you today?',
    },
    description: 'Key/value pairs to upsert (keys look like `store.currency`)',
  })
  @IsObject()
  settings!: Record<string, unknown>;
}
