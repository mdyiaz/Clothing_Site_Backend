import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedActor } from '../../types/express';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/chat.dto';

@ApiTags('Chatbot')
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post('start')
  @Public()
  @ApiOperation({ summary: 'Start a chat session (guest or signed-in)' })
  start(@CurrentUser() actor: AuthenticatedActor | undefined) {
    return this.chat.start(actor?.userId);
  }

  @Post('message')
  @Public()
  @ApiOperation({ summary: 'Send a message; returns the reply and matched products' })
  message(@CurrentUser() actor: AuthenticatedActor | undefined, @Body() dto: SendMessageDto) {
    return this.chat.send(dto, actor?.userId);
  }

  @Get('history/:sessionToken')
  @Public()
  @ApiOperation({ summary: 'Full transcript for a chat session' })
  history(@Param('sessionToken') sessionToken: string) {
    return this.chat.history(sessionToken);
  }
}
