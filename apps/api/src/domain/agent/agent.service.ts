import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import {
  AI_FUNCTION,
  CONSENT_STATE,
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
import { EventBusService, EVENTS, MailerService } from '../../infrastructure/infrastructure.module';
import { RedisService } from '../../infrastructure/cache/redis.service';
import { SessionService, sessionCacheKey } from '../session/session.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { UpsertProfileRequest } from './dto/request/agent.request';

/** Identical agent reply inside this window counts as a double submission. */
const DUPLICATE_REPLY_WINDOW_MS = 10_000;

/** How long a generated briefing is reused for the same newest message. */
const BRIEFING_CACHE_TTL_SEC = 900;

/** Localized generic copy for the agent-reply push (session.language EN/ES/KO). */
const AGENT_REPLY_COPY = {
  EN: { title: 'New reply from support', body: 'You have a new reply from support.' },
  ES: { title: 'Nueva respuesta de soporte', body: 'Tienes una nueva respuesta de soporte.' },
  KO: { title: '상담 답변 도착', body: '상담원 답변이 도착했습니다.' },
} as const;

/**
 * Localized wrapper for an agent reply mailed to a shopper whose thread was
 * handed off outside business hours (PLN-260806). `note` is written back into
 * the transcript so agents can see the answer already went out by email.
 */
const REPLY_EMAIL_COPY = {
  EN: {
    subject: '[IVY USA] A reply to your question',
    footer: 'You can continue the conversation any time in the chat on our store.',
    note: 'This reply was emailed to the customer.',
  },
  ES: {
    subject: '[IVY USA] Respuesta a tu consulta',
    footer: 'Puedes continuar la conversación cuando quieras en el chat de nuestra tienda.',
    note: 'Esta respuesta se envió por correo al cliente.',
  },
  KO: {
    subject: '[IVY USA] 문의하신 내용에 대한 답변',
    footer: '추가 문의는 스토어의 채팅에서 언제든 이어가실 수 있어요.',
    note: '이 답변은 고객 이메일로 발송되었습니다.',
  },
} as const;

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
    private readonly sessionService: SessionService,
    private readonly bus: EventBusService,
    private readonly mailer: MailerService,
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
   * Work-log entry for an agent action (PLN D4). Only reads were audited
   * before, so the trail could show that someone opened a conversation but not
   * that they accepted it, replied, or ended it — the actual work.
   *
   * Never carries message bodies: the transcript already holds those, and the
   * audit log has a different retention life. Failures are swallowed for the
   * same reason as the view audit — a logging outage must not block agent work.
   */
  async auditAgentAction(
    agentUserId: number,
    tenantId: number,
    action: string,
    target: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.audit.write({
        tenantId,
        actorType: 'user',
        actorId: agentUserId,
        action,
        target,
        metadata: metadata ?? null,
      });
    } catch (err) {
      this.logger.warn(`agent action audit failed (${action}): ${String(err)}`);
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

  /**
   * Conversation list for the console (tenant-scoped).
   *
   * `scope` decides what a conversation list even means here. It used to be the
   * agent queue only — waiting/agent — which meant the thread a shopper was
   * having *right now* with the bot never appeared, and "the newest
   * conversation is missing" was the correct reading of it (PLN-260807).
   * Ordering follows the last message, not the conversation id, so an old
   * thread that is still active sorts above a newer idle one.
   */
  async listSessions(
    tenantId: number,
    page: number,
    size: number,
    q?: string,
    scope: 'all' | 'queue' | 'ended' = 'all',
  ): Promise<{
    items: Array<{
      conversation: Conversation;
      lastMessage: Message | null;
      contact: { name: string | null; email: string | null };
    }>;
    total: number;
  }> {
    const statuses =
      scope === 'queue'
        ? [CONVERSATION_STATUS.WAITING, CONVERSATION_STATUS.AGENT]
        : scope === 'ended'
          ? [CONVERSATION_STATUS.ENDED]
          : [
              CONVERSATION_STATUS.AI_ACTIVE,
              CONVERSATION_STATUS.WAITING,
              CONVERSATION_STATUS.AGENT,
            ];

    const qb = this.convRepo
      .createQueryBuilder('c')
      .where('c.tenant_id = :tenantId', { tenantId })
      .andWhere('c.status IN (:...statuses)', { statuses });

    if (q?.trim()) {
      // Customer name/email filter. Names are encrypted at rest, so matching
      // reuses the bounded decrypt-then-filter search (PRV-M6 — recent-customer
      // window; same reach and limits as the agent "link customer" search).
      const matches = await this.customerService.searchByEmailOrName(tenantId, q, 20);
      if (matches.length === 0) return { items: [], total: 0 };
      const sessions = await this.sessionRepo.find({
        where: { tenantId, customerId: In(matches.map((c) => c.id)) },
        select: { id: true },
      });
      if (sessions.length === 0) return { items: [], total: 0 };
      qb.andWhere('c.session_id IN (:...sessionIds)', {
        sessionIds: sessions.map((sn) => sn.id),
      });
    }

    // Correlated MAX(id) rather than a grouped derived table: idx_msg_conv makes
    // it an index lookup per candidate row, and the whole messages table never
    // has to be aggregated to sort a page of conversations.
    const [conversations, total] = await qb
      .orderBy('(SELECT MAX(m.id) FROM messages m WHERE m.conversation_id = c.id)', 'DESC')
      .addOrderBy('c.id', 'DESC')
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();

    const contactByConv = await this.contactsByConversation(conversations);
    // Batched last-message lookup (PERF-7) — one query instead of one per row.
    const lastByConv = await this.lastMessagesByConversation(conversations.map((c) => c.id));
    const items = conversations.map((conversation) => ({
      conversation,
      lastMessage: lastByConv.get(String(conversation.id)) ?? null,
      contact: contactByConv.get(String(conversation.id)) ?? { name: null, email: null },
    }));
    return { items, total };
  }

  /** conversation id → its newest message, in a single grouped query (PERF-7). */
  private async lastMessagesByConversation(ids: number[]): Promise<Map<string, Message>> {
    if (ids.length === 0) return new Map();
    const rows = await this.msgRepo
      .createQueryBuilder('m')
      // Only what the queue row shows — skips the retrieval_trace JSON payload.
      .select(['m.id', 'm.conversationId', 'm.body', 'm.createdAt'])
      .where(
        'm.id IN (SELECT MAX(id) FROM messages WHERE conversation_id IN (:...ids) GROUP BY conversation_id)',
        { ids },
      )
      .getMany();
    return new Map(rows.map((m) => [String(m.conversationId), m]));
  }

  /**
   * Map conversation id -> the linked customer's contact fields (via
   * session.customer_id). The email is carried too: a shopper who only left an
   * address for an off-hours reply has no name, and "Session 93" tells the
   * agent nothing about who is waiting (PLN-260807 D3).
   */
  private async contactsByConversation(
    conversations: Conversation[],
  ): Promise<Map<string, { name: string | null; email: string | null }>> {
    const result = new Map<string, { name: string | null; email: string | null }>();
    if (conversations.length === 0) return result;
    const sessions = await this.sessionRepo.find({
      where: { id: In(conversations.map((c) => c.sessionId)) },
      select: { id: true, customerId: true },
    });
    const custBySession = new Map(sessions.map((s) => [String(s.id), s.customerId]));
    const tenantId = conversations.find((c) => c.tenantId != null)?.tenantId ?? null;
    const customerIds = sessions
      .map((s) => s.customerId)
      .filter((id): id is number => id != null);
    if (tenantId == null || customerIds.length === 0) return result;
    const contacts = await this.customerService.contactsByIds(tenantId, customerIds);
    for (const c of conversations) {
      const custId = custBySession.get(String(c.sessionId));
      const contact = custId != null ? contacts.get(String(custId)) : undefined;
      if (contact) result.set(String(c.id), contact);
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
    // The console re-reads the open thread every few seconds, and this used to
    // run a fresh model call each time — seconds of latency per poll and a bill
    // for summarizing an unchanged transcript. Keyed by the newest message id,
    // so a real new turn (and only that) regenerates it (FIX-260806-Console).
    const cacheKey = `agent:briefing:${messages[0]?.conversationId}:${messages[messages.length - 1]?.id}`;
    if (this.redis.available()) {
      const hit = await this.redis.get(cacheKey);
      if (hit != null) return hit;
    }
    const transcript = messages.map((m) => `${m.senderType}: ${m.body}`).join('\n');
    try {
      const res = await this.aiGateway.complete({
        tenantId,
        function: AI_FUNCTION.ASSIST,
        system:
          'Summarize the conversation: summary, intent, sentiment, recommended action. Reply concisely.',
        messages: [{ role: 'user', content: transcript }],
      });
      const text = res.text ?? '';
      if (this.redis.available()) await this.redis.set(cacheKey, text, BRIEFING_CACHE_TTL_SEC);
      return text;
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
    const conversation = await this.requireConversation(conversationId, tenantId);
    // Consent gate (PLN-Privacy-Control-Gap D-1, fail-closed): an agent reply is
    // processing of the visitor's conversation, so it too requires an effective
    // GRANTED (fresh read, current notice version). 4xx rejections are not
    // server-logged by default — warn explicitly so the block is traceable.
    const consent = await this.sessionService.effectiveConsentFor(
      conversation.sessionId,
      tenantId,
    );
    if (consent !== CONSENT_STATE.GRANTED) {
      this.logger.warn(
        `agent reply blocked: effective consent '${consent}' for session=${conversation.sessionId} conversation=${conversationId} agent=${agentId}`,
      );
      throw new BusinessException(ERROR_CODE.CONSENT_REQUIRED, HttpStatus.FORBIDDEN);
    }
    // Idempotency net (FIX-260806-Console): the console's own guards are the
    // first defence, but a duplicate here is not just a repeated bubble — for an
    // off-hours thread it mails the customer the same answer twice. Re-sending
    // the identical text within a few seconds returns the message already
    // stored instead of creating a second one.
    const recent = await this.msgRepo.findOne({
      where: { conversationId, senderType: SENDER_TYPE.AGENT, senderId: agentId, body },
      order: { id: 'DESC' },
    });
    if (recent && Date.now() - new Date(recent.createdAt).getTime() < DUPLICATE_REPLY_WINDOW_MS) {
      this.logger.warn(
        `duplicate agent reply suppressed: conversation=${conversationId} agent=${agentId}`,
      );
      return recent;
    }

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
    const saved = await this.msgRepo.save(
      this.msgRepo.create({
        // Explicit tenant stamp — see ChatService.persist.
        tenantId,
        conversationId,
        senderType: SENDER_TYPE.AGENT,
        senderId: agentId,
        body: moderated.text,
        lang: null,
        retrievalTrace: null,
      }),
    );
    await this.notifyCustomerOfReply(conversation.sessionId, tenantId);
    await this.mailReplyIfOffHoursThread(conversation, tenantId, moderated.text);
    return saved;
  }

  /**
   * Off-hours threads are answered by email (PLN-260806). The shopper was told
   * so when they wrote — nobody is sitting in the widget hours later — so the
   * agent's (already moderated) reply goes to their address as well, and the
   * conversation keeps a note so the next agent can see it left the building.
   * Best-effort throughout: a mail problem must not fail the reply.
   */
  private async mailReplyIfOffHoursThread(
    conversation: Conversation,
    tenantId: number,
    body: string,
  ): Promise<void> {
    if (conversation.replyChannel !== 'email') return;
    try {
      const session = await this.sessionRepo.findOne({ where: { id: conversation.sessionId } });
      if (!session?.customerId) return;
      const to = await this.customerService.contactEmail(tenantId, session.customerId);
      if (!to) return;
      const copy =
        REPLY_EMAIL_COPY[session.language as keyof typeof REPLY_EMAIL_COPY] ?? REPLY_EMAIL_COPY.EN;
      const sent = await this.mailer.send({
        to,
        subject: copy.subject,
        text: `${body}\n\n---\n${copy.footer}`,
      });
      if (!sent) return;
      await this.msgRepo.save(
        this.msgRepo.create({
          tenantId,
          conversationId: conversation.id,
          senderType: SENDER_TYPE.SYSTEM,
          body: copy.note,
          lang: session.language,
          retrievalTrace: null,
        }),
      );
    } catch (e) {
      this.logger.warn(`Off-hours reply email skipped: ${(e as Error).message}`);
    }
  }

  /**
   * Mobile push for an agent reply (REQ-MobileApp): the app polls only while
   * the chat screen is foregrounded, so push is the backgrounded delivery path.
   * Generic localized copy only — never message content in a lock-screen
   * preview. channel 'push' keeps email/sms out of the per-message fan-out.
   */
  private async notifyCustomerOfReply(sessionId: number, tenantId: number): Promise<void> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session || session.customerId == null) return; // anonymous: polling only
    const copy =
      AGENT_REPLY_COPY[session.language as keyof typeof AGENT_REPLY_COPY] ?? AGENT_REPLY_COPY.EN;
    await this.bus.publish(EVENTS.NOTIFICATION, {
      tenantId,
      customerId: session.customerId,
      sessionId,
      category: 'chat',
      title: copy.title,
      body: copy.body,
      channel: 'push',
    });
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

  /** Drop the widget's token→session cache after a customer (re)binding (PERF-11). */
  private async invalidateSessionCache(sessionId: number): Promise<void> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (session) await this.redis.del(sessionCacheKey(session.sessionToken));
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
    await this.invalidateSessionCache(conversation.sessionId);
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
    await this.invalidateSessionCache(conversation.sessionId);
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
