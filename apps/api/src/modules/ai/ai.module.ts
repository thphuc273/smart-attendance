import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { GeminiClient } from './gemini.client';
import { InsightPromptBuilder } from './insight-prompt.builder';
import { ChatContextBuilder } from './chat-context.builder';

@Module({
  controllers: [AiController],
  providers: [AiService, GeminiClient, InsightPromptBuilder, ChatContextBuilder],
  exports: [AiService],
})
export class AiModule {}
