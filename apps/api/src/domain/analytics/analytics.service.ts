import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CONVERSATION_STATUS, SENDER_TYPE } from '@ivy/types';
import { Conversation } from '../chat/entity/conversation.entity';
import { Message } from '../chat/entity/message.entity';
import { Notification } from '../notification/entity/notification.entity';
import { CjmEvent } from '../cjm/entity/cjm-event.entity';
import { OrderCache } from '../order/entity/order-cache.entity';

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

/** Analytics & reporting (FN-038/039). Queries other domains' tables; owns none. */
@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Conversation) private readonly convRepo: Repository<Conversation>,
    @InjectRepository(Message) private readonly msgRepo: Repository<Message>,
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
    @InjectRepository(CjmEvent) private readonly cjmRepo: Repository<CjmEvent>,
    @InjectRepository(OrderCache) private readonly orderRepo: Repository<OrderCache>,
  ) {}

  async dashboard(): Promise<DashboardKpis> {
    const activeChats = await this.convRepo.count({
      where: {
        status: In([
          CONVERSATION_STATUS.AI_ACTIVE,
          CONVERSATION_STATUS.AGENT,
          CONVERSATION_STATUS.WAITING,
        ]),
      },
    });

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayNotifications = await this.notifRepo
      .createQueryBuilder('n')
      .where('n.created_at >= :start', { start: startOfToday })
      .getCount();

    const totalEnded = await this.convRepo.count({ where: { status: CONVERSATION_STATUS.ENDED } });
    const resolvedEnded = await this.convRepo.count({
      where: { status: CONVERSATION_STATUS.ENDED, escalated: 0 },
    });
    const aiResolutionRate = totalEnded > 0 ? Math.round((resolvedEnded / totalEnded) * 100) : 0;

    const recentUserMsgs = await this.msgRepo.find({
      where: { senderType: SENDER_TYPE.USER },
      order: { id: 'DESC' },
      take: 50,
    });
    const popularQuestions: string[] = [];
    for (const m of recentUserMsgs) {
      if (!popularQuestions.includes(m.body)) popularQuestions.push(m.body);
      if (popularQuestions.length >= 5) break;
    }

    const unresolvedTopN = await this.convRepo.count({
      where: { status: CONVERSATION_STATUS.WAITING },
    });

    const totalConversations = await this.convRepo.count();
    const totalOrders = await this.orderRepo.count();

    return {
      activeChats,
      todayNotifications,
      aiResolutionRate,
      popularQuestions,
      unresolvedTopN,
      totalConversations,
      totalOrders,
    };
  }

  async searchConversations(
    params: ConversationSearchParams,
  ): Promise<{ items: Array<Record<string, unknown>>; total: number }> {
    const qb = this.convRepo.createQueryBuilder('c');
    if (params.status) qb.andWhere('c.status = :status', { status: params.status });
    if (params.escalated !== undefined) {
      qb.andWhere('c.escalated = :escalated', { escalated: params.escalated ? 1 : 0 });
    }
    qb.orderBy('c.id', 'DESC')
      .skip((params.page - 1) * params.size)
      .take(params.size);
    const [conversations, total] = await qb.getManyAndCount();

    const items = await Promise.all(
      conversations.map(async (c) => ({
        id: c.id,
        status: c.status,
        escalated: c.escalated === 1,
        messageCount: await this.msgRepo.count({ where: { conversationId: c.id } }),
        createdAt: c.createdAt,
        endedAt: c.endedAt,
      })),
    );
    return { items, total };
  }
}
