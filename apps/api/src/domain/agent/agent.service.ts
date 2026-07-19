import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  AI_FUNCTION,
  CONVERSATION_STATUS,
  MODERATION_DECISION,
  SENDER_TYPE,
} from '@ivy/types';
import { Conversation } from '../chat/entity/conversation.entity';
import { Message } from '../chat/entity/message.entity';
import { User } from '../user/entity/user.entity';
import { Session } from '../session/entity/session.entity';
import { AgentProfile } from './entity/agent-profile.entity';
import { Assignment } from './entity/assignment.entity';
import { AgentDailyStat } from './entity/agent-daily-stat.entity';
import { ModerationService } from '../moderation/moderation.service';
import {
  CustomerContext,
  CustomerLead,
  CustomerService,
} from '../customer/customer.service';
import { AiGatewayService } from '../../infrastructure/external/ai/ai-gateway.service';
import { AuditService } from '../audit/audit.service';
import { RedisService } from '../../infrastructure/cache/redis.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { UpsertProfileRequest } from './dto/request/agent.request';

/**
 * Agent console orchestration (FR-066/067, FR-045). Manages the human-agent
 * session queue, conversation takeover, moderated agent replies, AI briefings,
 * agent profiles, and performance stats.
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    @InjectRepository(Conversation) private readonly convRepo: Repository<Conversation>,
    @InjectRepository(Message) private readonly msgRepo: Repository<Message>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(AgentProfile) private readonly profileRepo: Repository<AgentProfile>,
    @InjectRepository(Assignment) private readonly assignmentRepo: Repository<Assignment>,
    @InjectRepository(AgentDailyStat) private readonly statRepo: Repository<AgentDailyStat>,
    private readonly moderation: ModerationService,
    private readonly customerService: CustomerService,
    private readonly aiGateway: AiGatewayService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Audit an agent opening a conversation (transcript + customer PII — PRV-H4/
   * PRV-040). The console re-fetches the open thread, so writes are deduped per
   * agent+conversation for an hour via Redis; without Redis every view audits.
   */
  async auditConversationView(agentUserId: number, tenantId: number, conversationId: number): Promise<void> {
    try {
      const dedupKey = `audit:agent:${agentUserId}:conv:${conversationId}`;
      if (this.redis.available()) {
        if (await this.redis.get(dedupKey)) return;
        await this.redis.set(dedupKey, '1', 3600);
      }
      await this.audit.write({
        tenantId,
        actorType: 'user',
        actorId: agentUserId,
        action: 'agent.conversation_viewed',
        target: `conversation:${conversationId}`,
      });
    } catch (err) {
      this.logger.warn(`conversation-view audit failed: ${String(err)}`);
    }
  }

  /**
   * Load a conversation and assert it belongs to the caller's tenant (SEC-H1).
   * Every agent-console action keys off a raw conversation id, so this is the
   * single choke point that prevents cross-tenant read/takeover/end.
   */
  private async requireConversation(conversationId: number, tenantId: number): Promise<Conversation> {
    const conversation = await this.convRepo.findOne({
      where: { id: conversationId, tenantId },
    });
    if (!conversation) {
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    return conversation;
  }

  /** Session queue: conversations awaiting/handled by an agent (tenant-scoped). */
  async listSessions(
    tenantId: number,
    page: number,
    size: number,
  ): Promise<{
    items: Array<{
      conversation: Conversation;
      lastMessage: Message | null;
      customerName: string | null;
    }>;
    total: number;
  }> {
    const [conversations, total] = await this.convRepo.findAndCount({
      where: { tenantId, status: In([CONVERSATION_STATUS.WAITING, CONVERSATION_STATUS.AGENT]) },
      order: { id: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    const customerNameByConv = await this.customerNamesByConversation(conversations);
    const items = await Promise.all(
      conversations.map(async (conversation) => ({
        conversation,
        lastMessage: await this.msgRepo.findOne({
          where: { conversationId: conversation.id },
          order: { id: 'DESC' },
        }),
        customerName: customerNameByConv.get(String(conversation.id)) ?? null,
      })),
    );
    return { items, total };
  }

  /** Map conversation id -> linked customer name (via session.customer_id). */
  private async customerNamesByConversation(
    conversations: Conversation[],
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (conversations.length === 0) return result;
    const sessions = await this.sessionRepo.find({
      where: { id: In(conversations.map((c) => c.sessionId)) },
    });
    const custBySession = new Map(sessions.map((s) => [String(s.id), s.customerId]));
    const tenantId = conversations.find((c) => c.tenantId != null)?.tenantId ?? null;
    const customerIds = sessions
      .map((s) => s.customerId)
      .filter((id): id is number => id != null);
    if (tenantId == null || customerIds.length === 0) return result;
    const names = await this.customerService.namesByIds(tenantId, customerIds);
    for (const c of conversations) {
      const custId = custBySession.get(String(c.sessionId));
      const name = custId != null ? names.get(String(custId)) : undefined;
      if (name) result.set(String(c.id), name);
    }
    return result;
  }

  async listMessages(conversationId: number, tenantId: number): Promise<Message[]> {
    await this.requireConversation(conversationId, tenantId);
    return this.msgRepo.find({ where: { conversationId }, order: { id: 'ASC' } });
  }

  /** AI briefing for an agent picking up a conversation (FR-045). */
  async briefing(tenantId: number, messages: Message[]): Promise<string> {
    if (messages.length === 0) return '';
    const transcript = messages.map((m) => `${m.senderType}: ${m.body}`).join('\n');
    try {
      const res = await this.aiGateway.complete({
        tenantId,
        function: AI_FUNCTION.ASSIST,
        system:
          'Summarize the conversation: summary, intent, sentiment, recommended action. Reply concisely.',
        messages: [{ role: 'user', content: transcript }],
      });
      return res.text ?? '';
    } catch (e) {
      this.logger.warn(`Briefing failed: ${(e as Error).message}`);
      return '';
    }
  }

  /** Agent accepts/takes over a conversation. */
  async accept(conversationId: number, agentId: number, tenantId: number): Promise<Conversation> {
    await this.requireConversation(conversationId, tenantId);
    await this.assignmentRepo.save(
      this.assignmentRepo.create({
        tenantId,
        conversationId,
        agentId,
        assignedBy: agentId,
        type: 'manual',
        status: 'active',
      }),
    );
    await this.convRepo.update(
      { id: conversationId },
      { status: CONVERSATION_STATUS.AGENT, agentId },
    );
    return this.convRepo.findOneOrFail({ where: { id: conversationId } });
  }

  /** Send a moderated agent message (FR-069). */
  async sendMessage(
    conversationId: number,
    agentId: number,
    tenantId: number,
    body: string,
  ): Promise<Message> {
    await this.requireConversation(conversationId, tenantId);
    const moderated = await this.moderation.moderate({
      tenantId,
      scope: 'agent',
      authorType: 'agent',
      authorId: agentId,
      conversationId,
      text: body,
    });
    if (moderated.decision === MODERATION_DECISION.BLOCKED) {
      throw new BusinessException(ERROR_CODE.MODERATION_BLOCKED, HttpStatus.UNPROCESSABLE_ENTITY);
    }
    return this.msgRepo.save(
      this.msgRepo.create({
        conversationId,
        senderType: SENDER_TYPE.AGENT,
        senderId: agentId,
        body: moderated.text,
        lang: null,
        retrievalTrace: null,
      }),
    );
  }

  /** Resolve agent display names for a set of messages (agent messages only). */
  async resolveSenderNames(messages: Message[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const ids = [
      ...new Set(
        messages
          .filter((m) => m.senderType === SENDER_TYPE.AGENT && m.senderId != null)
          .map((m) => m.senderId as number),
      ),
    ];
    if (ids.length === 0) return map;
    const users = await this.userRepo.find({ where: { id: In(ids) } });
    for (const u of users) {
      if (u.name) map.set(String(u.id), u.name);
    }
    return map;
  }

  /** Single agent's display name (for the just-sent message response). */
  async agentName(userId: number): Promise<string | null> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    return user?.name ?? null;
  }

  /** Customer context for the console panel, via conversation -> session -> customer. */
  async customerContext(conversationId: number, tenantId: number): Promise<CustomerContext | null> {
    const conversation = await this.convRepo.findOne({ where: { id: conversationId, tenantId } });
    if (!conversation) return null;
    const session = await this.sessionRepo.findOne({ where: { id: conversation.sessionId } });
    if (!session?.customerId) return null;
    return this.customerService.getContext(tenantId, session.customerId);
  }

  /** Suggest existing customers to link to the current chat. */
  async searchCustomers(tenantId: number, query: string): Promise<CustomerContext[]> {
    const customers = await this.customerService.searchByEmailOrName(tenantId, query);
    return customers.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      tier: c.tier,
      recentOrders: [],
    }));
  }

  /** Link the conversation's session to an existing customer (tenant-checked). */
  async linkCustomer(
    conversationId: number,
    tenantId: number,
    customerId: number,
  ): Promise<CustomerContext> {
    const conversation = await this.requireConversation(conversationId, tenantId);
    // Verifies tenant ownership (throws if the customer is not in this tenant).
    await this.customerService.findById(tenantId, customerId);
    await this.sessionRepo.update({ id: conversation.sessionId }, { customerId });
    return this.customerService.getContext(tenantId, customerId);
  }

  /** Create a new customer from chat-collected fields and link it to the session. */
  async createAndLinkCustomer(
    conversationId: number,
    tenantId: number,
    lead: CustomerLead,
  ): Promise<CustomerContext> {
    const conversation = await this.requireConversation(conversationId, tenantId);
    const customer = await this.customerService.createFromLead(tenantId, lead);
    await this.sessionRepo.update({ id: conversation.sessionId }, { customerId: customer.id });
    return this.customerService.getContext(tenantId, customer.id);
  }

  /** End a conversation and release the active assignment. */
  async end(conversationId: number, tenantId: number): Promise<Conversation> {
    await this.requireConversation(conversationId, tenantId);
    await this.convRepo.update(
      { id: conversationId },
      { status: CONVERSATION_STATUS.ENDED, endedAt: new Date() },
    );
    await this.assignmentRepo.update(
      { conversationId, status: 'active' },
      { status: 'released', releasedAt: new Date() },
    );
    return this.convRepo.findOneOrFail({ where: { id: conversationId } });
  }

  async getProfile(userId: number): Promise<AgentProfile | null> {
    return this.profileRepo.findOne({ where: { userId } });
  }

  async upsertProfile(
    userId: number,
    tenantId: number,
    input: UpsertProfileRequest,
  ): Promise<AgentProfile> {
    const existing = await this.profileRepo.findOne({ where: { userId } });
    if (existing) {
      if (input.languages !== undefined) existing.languages = input.languages;
      if (input.skills !== undefined) existing.skills = input.skills;
      if (input.max_concurrent !== undefined) existing.maxConcurrent = input.max_concurrent;
      if (input.status !== undefined) existing.status = input.status;
      return this.profileRepo.save(existing);
    }
    return this.profileRepo.save(
      this.profileRepo.create({
        tenantId,
        userId,
        languages: input.languages ?? null,
        skills: input.skills ?? null,
        maxConcurrent: input.max_concurrent ?? 3,
        status: input.status ?? 'offline',
      }),
    );
  }

  async listStats(
    tenantId: number,
    page: number,
    size: number,
  ): Promise<{ items: AgentDailyStat[]; total: number }> {
    const [items, total] = await this.statRepo.findAndCount({
      where: { tenantId },
      order: { statDate: 'DESC', id: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    return { items, total };
  }
}
