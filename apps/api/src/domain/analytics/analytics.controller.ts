import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal, USER_RANK } from '@ivy/types';
import { normalizePage, buildPagination } from '@ivy/common';
import { AnalyticsService } from './analytics.service';
import { AuditService } from '../audit/audit.service';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { Paginated } from '../../global/interceptor/transform.interceptor';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { ConversationSearchQuery } from './dto/request/analytics.request';
import { parseFrom, parseTo } from '../../global/util/date-range.util';

/** Tenant scope for analytics: tenant staff see their tenant; system admins see all. */
function tenantScope(user: Principal): number | null {
  return user.actorType === 'user' ? user.tenantId : null;
}

/**
 * Conversation visibility (PLN D1). Master and director see every conversation
 * in the tenant; anyone below that sees only the ones they personally handled.
 * Returns the agent id to pin the query to, or undefined for unrestricted.
 */
function visibilityScope(user: Principal): number | undefined {
  if (user.actorType !== 'user') return undefined; // platform admin: cross-tenant
  const unrestricted: string[] = [USER_RANK.MASTER, USER_RANK.DIRECTOR];
  return unrestricted.includes(user.rank) ? undefined : user.userId;
}

/** Audit actor identity for either principal shape. */
function actorOf(user: Principal): { actorType: 'user' | 'admin'; actorId: number } {
  return user.actorType === 'user'
    ? { actorType: 'user', actorId: user.userId }
    : { actorType: 'admin', actorId: user.adminId };
}

/** Analytics dashboards & conversation history (FN-038/039, SCR-104). */
@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly auditService: AuditService,
  ) {}

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
      from: parseFrom(query.from),
      to: parseTo(query.to),
      agentId: query.agent_id ? Number(query.agent_id) : undefined,
      q: query.q,
      includePreview: query.include_preview === 'true' || query.include_preview === '1',
      restrictToAgentId: visibilityScope(user),
      page,
      size,
    });
    return new Paginated(items, buildPagination(page, size, total));
  }

  @Get('conversations/:id')
  @RequireCapability(CAPABILITY.ANALYTICS_READ)
  @ApiOperation({ summary: 'Conversation transcript with AI grounding (SCR-104)' })
  async conversationDetail(@CurrentUser() user: Principal, @Param('id') id: string) {
    const tenantId = tenantScope(user);
    const detail = await this.analyticsService.conversationDetail(
      tenantId,
      Number(id),
      visibilityScope(user),
    );
    // Same response for "not yours" and "does not exist": a distinguishable
    // 403 would confirm that a conversation exists in another agent's queue.
    if (!detail) throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);

    // Reading a transcript is a PII access (PRV-H4) — audited exactly like the
    // agent console's conversation view, which is the other way in.
    await this.auditService.write({
      tenantId,
      ...actorOf(user),
      action: 'analytics.conversation_viewed',
      target: `conversation:${id}`,
      metadata: { messageCount: (detail.messages as unknown[]).length },
    });
    return detail;
  }
}
