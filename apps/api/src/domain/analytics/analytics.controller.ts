import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CAPABILITY } from '@ivy/types';
import { normalizePage, buildPagination } from '@ivy/common';
import { AnalyticsService } from './analytics.service';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { Paginated } from '../../global/interceptor/transform.interceptor';

class ConversationSearchQuery {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() escalated?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() size?: string;
}

/** Analytics dashboards & conversation history (FN-038/039, SCR-104). */
@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @RequireCapability(CAPABILITY.ANALYTICS_READ)
  @ApiOperation({ summary: 'Dashboard KPIs (FN-038)' })
  async dashboard() {
    return this.analyticsService.dashboard();
  }

  @Get('conversations')
  @RequireCapability(CAPABILITY.ANALYTICS_READ)
  @ApiOperation({ summary: 'Conversation history search (FN-039, SCR-104)' })
  async conversations(@Query() query: ConversationSearchQuery) {
    const { page, size } = normalizePage(query.page, query.size);
    const escalated =
      query.escalated === undefined ? undefined : query.escalated === 'true' || query.escalated === '1';
    const { items, total } = await this.analyticsService.searchConversations({
      status: query.status,
      escalated,
      page,
      size,
    });
    return new Paginated(items, buildPagination(page, size, total));
  }
}
