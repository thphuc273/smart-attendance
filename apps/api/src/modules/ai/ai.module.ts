import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { GeminiClient } from './gemini.client';
import { InsightPromptBuilder } from './insight-prompt.builder';
import { ChatContextBuilder } from './chat-context.builder';
import { ToolExecutor } from './tools/tool-executor';

@Module({
  controllers: [AiController],
  providers: [AiService, GeminiClient, InsightPromptBuilder, ChatContextBuilder, ToolExecutor],
  exports: [AiService],
})
export class AiModule {}
