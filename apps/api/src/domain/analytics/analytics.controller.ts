import { Controller, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal, USER_RANK } from '@ivy/types';
import { normalizePage, buildPagination } from '@ivy/common';
import { AnalyticsService } from './analytics.service';
import { QuestionStatsService } from './question-stats.service';
import { AuditService } from '../audit/audit.service';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { Paginated } from '../../global/interceptor/transform.interceptor';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { ConversationSearchQuery, QuestionStatsQuery } from './dto/request/analytics.request';
import { STAT_DIMENSION } from './entity/question-stat-daily.entity';
import { parseFrom, parseTo, toDateKey } from '../../global/util/date-range.util';

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
    private readonly questionStatsService: QuestionStatsService,
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

  @Get('questions')
  @RequireCapability(CAPABILITY.ANALYTICS_READ)
  @ApiOperation({ summary: 'Customer question statistics by lens (SCR-104 §4)' })
  async questions(@CurrentUser() user: Principal, @Query() query: QuestionStatsQuery) {
    const dimension = (query.dimension ?? STAT_DIMENSION.INTENT) as string;
    const allowed: string[] = Object.values(STAT_DIMENSION);
    if (!allowed.includes(dimension)) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }
    // Default window: the last 30 complete days.
    const to = parseTo(query.to) ?? new Date();
    const from = parseFrom(query.from) ?? new Date(to.getTime() - 30 * 86_400_000);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    return this.analyticsService.questionStats(tenantScope(user), { dimension, from, to, limit });
  }

  @Post('questions/aggregate')
  // A write, so it is not gated by the read capability the rest of this
  // controller uses. Normal operation is the scheduler; this is for backfill
  // and for re-running a day after a fix.
  @RequireCapability(CAPABILITY.TENANT_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Recompute the daily question snapshot for a date (idempotent)' })
  async aggregate(@Query('date') date?: string) {
    // Upserts on (tenant, date, dimension, key), so running this repeatedly —
    // or alongside the scheduler — overwrites rather than double-counts.
    const target = date ?? toDateKey(new Date(Date.now() - 86_400_000));
    return this.questionStatsService.aggregateDay(target);
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
      // Named for what the actor did, not the route it came through: the agent
      // work log filters on the `agent.` prefix, and a transcript read from the
      // history screen is the same act as one from the agent console.
      action: 'agent.transcript_viewed',
      target: `conversation:${id}`,
      metadata: { messageCount: (detail.messages as unknown[]).length },
    });
    return detail;
  }
}
