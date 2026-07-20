import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CONVERSATION_STATUS, SENDER_TYPE } from '@ivy/types';
import { Conversation } from '../chat/entity/conversation.entity';
import { Message } from '../chat/entity/message.entity';
import { Notification } from '../notification/entity/notification.entity';
import { CjmEvent } from '../cjm/entity/cjm-event.entity';
import { OrderCache } from '../order/entity/order-cache.entity';
import { RedisService } from '../../infrastructure/cache/redis.service';

export interface DashboardKpis {
  activeChats: number;
  todayNotifications: number;
  aiResolutionRate: number;
  popularQuestions: string[];
  unresolvedTopN: number;
  totalConversations: number;
  totalOrders: number;
}

export interface ConversationSearchParams {
  status?: string;
  escalated?: boolean;
  page: number;
  size: number;
}

/** Short cache so a busy console doesn't recompute the KPI set per pageview (PERF-8). */
const DASHBOARD_CACHE_TTL_SEC = 30;

/** Analytics & reporting (FN-038/039). Queries other domains' tables; owns none. */
@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Conversation) private readonly convRepo: Repository<Conversation>,
    @InjectRepository(Message) private readonly msgRepo: Repository<Message>,
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
    @InjectRepository(CjmEvent) private readonly cjmRepo: Repository<CjmEvent>,
    @InjectRepository(OrderCache) private readonly orderRepo: Repository<OrderCache>,
    private readonly redis: RedisService,
  ) {}

  /**
   * Dashboard KPIs (PERF-8). Tenant-scoped (`tenantId` null = system admin,
   * all tenants), counts run in parallel, and the whole payload is cached for
   * 30s — it was previously 7 sequential COUNTs + 50 full message rows,
   * tenant-UNscoped, on every console pageview.
   */
  async dashboard(tenantId: number | null): Promise<DashboardKpis> {
    const cacheKey = `dash:${tenantId ?? 'all'}`;
    if (this.redis.available()) {
      const hit = await this.redis.get(cacheKey);
      if (hit) return JSON.parse(hit) as DashboardKpis;
    }

    const tenantWhere = tenantId != null ? { tenantId } : {};
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const notifQb = this.notifRepo
      .createQueryBuilder('n')
      .where('n.created_at >= :start', { start: startOfToday });
    if (tenantId != null) notifQb.andWhere('n.tenant_id = :tenantId', { tenantId });

    // Popular questions: only the body column of the last 50 user messages —
    // never the full rows (retrieval_trace JSON etc.).
    const msgQb = this.msgRepo
      .createQueryBuilder('m')
      .select('m.body', 'body')
      .where('m.sender_type = :st', { st: SENDER_TYPE.USER })
      .orderBy('m.id', 'DESC')
      .take(50);
    if (tenantId != null) msgQb.andWhere('m.tenant_id = :tenantId', { tenantId });

    const [
      activeChats,
      todayNotifications,
      totalEnded,
      resolvedEnded,
      recentBodies,
      unresolvedTopN,
      totalConversations,
      totalOrders,
    ] = await Promise.all([
      this.convRepo.count({
        where: {
          ...tenantWhere,
          status: In([
            CONVERSATION_STATUS.AI_ACTIVE,
            CONVERSATION_STATUS.AGENT,
            CONVERSATION_STATUS.WAITING,
          ]),
        },
      }),
      notifQb.getCount(),
      this.convRepo.count({ where: { ...tenantWhere, status: CONVERSATION_STATUS.ENDED } }),
      this.convRepo.count({
        where: { ...tenantWhere, status: CONVERSATION_STATUS.ENDED, escalated: 0 },
      }),
      msgQb.getRawMany<{ body: string }>(),
      this.convRepo.count({ where: { ...tenantWhere, status: CONVERSATION_STATUS.WAITING } }),
      this.convRepo.count({ where: tenantWhere }),
      this.orderRepo.count({ where: tenantWhere }),
    ]);

    const popularQuestions: string[] = [];
    for (const m of recentBodies) {
      if (!popularQuestions.includes(m.body)) popularQuestions.push(m.body);
      if (popularQuestions.length >= 5) break;
    }

    const kpis: DashboardKpis = {
      activeChats,
      todayNotifications,
      aiResolutionRate: totalEnded > 0 ? Math.round((resolvedEnded / totalEnded) * 100) : 0,
      popularQuestions,
      unresolvedTopN,
      totalConversations,
      totalOrders,
    };
    await this.redis.set(cacheKey, JSON.stringify(kpis), DASHBOARD_CACHE_TTL_SEC);
    return kpis;
  }

  /** Conversation history search — tenant-scoped, message counts batched (PERF-7). */
  async searchConversations(
    tenantId: number | null,
    params: ConversationSearchParams,
  ): Promise<{ items: Array<Record<string, unknown>>; total: number }> {
    const qb = this.convRepo.createQueryBuilder('c');
    if (tenantId != null) qb.andWhere('c.tenant_id = :tenantId', { tenantId });
    if (params.status) qb.andWhere('c.status = :status', { status: params.status });
    if (params.escalated !== undefined) {
      qb.andWhere('c.escalated = :escalated', { escalated: params.escalated ? 1 : 0 });
    }
    qb.orderBy('c.id', 'DESC')
      .skip((params.page - 1) * params.size)
      .take(params.size);
    const [conversations, total] = await qb.getManyAndCount();

    const countByConv = await this.messageCounts(conversations.map((c) => c.id));
    const items = conversations.map((c) => ({
      id: c.id,
      status: c.status,
      escalated: c.escalated === 1,
      messageCount: countByConv.get(String(c.id)) ?? 0,
      createdAt: c.createdAt,
      endedAt: c.endedAt,
    }));
    return { items, total };
  }

  /** conversation id → message count in one GROUP BY query (PERF-7). */
  private async messageCounts(ids: number[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows = await this.msgRepo
      .createQueryBuilder('m')
      .select('m.conversation_id', 'cid')
      .addSelect('COUNT(*)', 'cnt')
      .where('m.conversation_id IN (:...ids)', { ids })
      .groupBy('m.conversation_id')
      .getRawMany<{ cid: string; cnt: string }>();
    return new Map(rows.map((r) => [String(r.cid), Number(r.cnt)]));
  }
}
