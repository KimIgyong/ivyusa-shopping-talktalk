import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal } from '@ivy/types';
import { normalizePage, buildPagination } from '@ivy/common';
import { AnalyticsService } from './analytics.service';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { Paginated } from '../../global/interceptor/transform.interceptor';
import { ConversationSearchQuery } from './dto/request/analytics.request';

/** Tenant scope for analytics: tenant staff see their tenant; system admins see all. */
function tenantScope(user: Principal): number | null {
  return user.actorType === 'user' ? user.tenantId : null;
}

/** Analytics dashboards & conversation history (FN-038/039, SCR-104). */
@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @RequireCapability(CAPABILITY.ANALYTICS_READ)
  @ApiOperation({ summary: 'Dashboard KPIs (FN-038)' })
  async dashboard(@CurrentUser() user: Principal) {
    return this.analyticsService.dashboard(tenantScope(user));
  }

  @Get('conversations')
  @RequireCapability(CAPABILITY.ANALYTICS_READ)
  @ApiOperation({ summary: 'Conversation history search (FN-039, SCR-104)' })
  async conversations(@CurrentUser() user: Principal, @Query() query: ConversationSearchQuery) {
    const { page, size } = normalizePage(query.page, query.size);
    const escalated =
      query.escalated === undefined ? undefined : query.escalated === 'true' || query.escalated === '1';
    const { items, total } = await this.analyticsService.searchConversations(tenantScope(user), {
      status: query.status,
      escalated,
      page,
      size,
    });
    return new Paginated(items, buildPagination(page, size, total));
  }
}
