import { Body, Controller, Get, Post, Query, Sse, UseGuards } from '@nestjs/common';
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
  @Throttle({ default: { ttl: 3_600_000, limit: 10 } })
  weekly(@CurrentUser() user: AuthenticatedUser, @Query() q: WeeklyInsightsQueryDto) {
    return this.ai.getWeeklyInsights(user, q.branch_id, q.week_start);
  }

  @Get('chat/history')
  history(@CurrentUser() user: AuthenticatedUser, @Query() q: ChatHistoryQueryDto) {
    return this.ai.getChatHistory(user, q.limit ?? 50);
  }

  @Post('chat')
  @Throttle({ default: { ttl: 3_600_000, limit: 20 } })
  @Sse()
  chat(@CurrentUser() user: AuthenticatedUser, @Body() body: ChatMessageDto) {
    return this.ai.chatStream(user, body.message);
  }
}
