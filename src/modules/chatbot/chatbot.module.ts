import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { GroqClient } from './groq.client';

@Module({
  controllers: [ChatController],
  providers: [ChatService, GroqClient],
  exports: [ChatService],
})
export class ChatbotModule {}
