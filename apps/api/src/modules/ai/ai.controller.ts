import { Body, Controller, Delete, Get, HttpCode, Post, Query, Sse, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { AiService } from './ai.service';
import { ChatHistoryQueryDto, ChatMessageDto, WeeklyInsightsQueryDto } from './dto/chat.dto';

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('insights/weekly')
  @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
  weekly(@CurrentUser() user: AuthenticatedUser, @Query() q: WeeklyInsightsQueryDto) {
    return this.ai.getWeeklyInsights(user, q.branch_id, q.week_start);
  }

  @Get('chat/history')
  history(@CurrentUser() user: AuthenticatedUser, @Query() q: ChatHistoryQueryDto) {
    return this.ai.getChatHistory(user, q.limit ?? 50);
  }

  @Delete('chat/history')
  @HttpCode(204)
  async clearHistory(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.ai.clearChatHistory(user);
  }

  @Post('chat')
  @Throttle({ default: { ttl: 3_600_000, limit: 20 } })
  @Sse()
  chat(@CurrentUser() user: AuthenticatedUser, @Body() body: ChatMessageDto) {
    return this.ai.chatStream(user, body.message);
  }
}
