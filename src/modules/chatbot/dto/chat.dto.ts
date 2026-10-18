import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty()
  @IsString()
  @MaxLength(500)
  message!: string;

  @ApiPropertyOptional({ description: 'Omit to start a new conversation' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(80)
  sessionToken?: string;
}
