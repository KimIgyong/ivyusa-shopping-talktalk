import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, LessThan, Repository } from 'typeorm';
import {
  AI_FUNCTION,
  CONSENT_STATE,
  CONVERSATION_STATUS,
  MODERATION_DECISION,
  SENDER_TYPE,
} from '@ivy/types';
import { Conversation } from '../chat/entity/conversation.entity';
import { Message } from '../chat/entity/message.entity';
import { AnswerReuseService } from '../answer-reuse/answer-reuse.service';
import { IssueService } from '../issue/issue.service';
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
import { TenantAiConfig } from '../ai-engine/entity/tenant-ai-config.entity';
import { EventBusService, EVENTS, MailerService } from '../../infrastructure/infrastructure.module';
import { RedisService } from '../../infrastructure/cache/redis.service';
import { SessionService, sessionCacheKey } from '../session/session.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { UpsertProfileRequest } from './dto/request/agent.request';
import { ChannelThread } from '../messenger/entity/channel-thread.entity';
import { MessengerChannel } from '../messenger/entity/messenger-channel.entity';
import { ReplyDraft } from '../chat/entity/reply-draft.entity';
import {
  AUTO_REPLY_MODE,
  isAutoReplyMode,
  resolveAutoReply,
} from '../messenger/auto-reply.util';

/** Transcript page size for the console (PLN-260807 D2). */
const MESSAGE_PAGE_SIZE = 30;
/** Operator alias length — matches sessions.alias (PLN-260812). */
export const SESSION_ALIAS_MAX = 60;
/** Messages the briefing summarises — the tail is what an agent needs oriented. */
const BRIEFING_WINDOW = 50;

/** Identical agent reply inside this window counts as a double submission. */
const DUPLICATE_REPLY_WINDOW_MS = 10_000;

/** How long a generated briefing is reused for the same newest message. */
const BRIEFING_CACHE_TTL_SEC = 900;

/**
 * Built-in wording when an agent hands the thread back to the AI, used unless
 * the tenant set `handoffConfig.handbackNotice` (PLN-260810 S1 / D1).
 *
 * The customer is told, deliberately. Switching back in silence reads as the
 * person who was just talking to them walking off mid-sentence.
 */
const DEFAULT_HANDBACK_NOTICE: Record<string, string> = {
  EN: "Our agent has finished looking into this, so the AI assistant will take it from here. Just ask if you need a person again.",
  ES: 'Nuestro agente ha terminado de revisarlo, así que el asistente de IA continuará desde aquí. Solo dilo si necesitas hablar con una persona de nuevo.',
  KO: '상담사 확인이 끝나 이후 문의는 AI 상담원이 도와드립니다. 다시 상담사 연결이 필요하시면 말씀해 주세요.',
};

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
    // Appended last so positional test doubles stay valid; all uses `?.`-guarded.
    private readonly answerReuse?: AnswerReuseService,
    private readonly issueService?: IssueService,
    @InjectRepository(TenantAiConfig)
    private readonly aiConfigRepo?: Repository<TenantAiConfig>,
    // Entity-only reads: the console shows whether the AI is answering a
    // channel thread, which needs the channel's default (PLN-260812 S4).
    @InjectRepository(ChannelThread)
    private readonly threadRepo?: Repository<ChannelThread>,
    @InjectRepository(MessengerChannel)
    private readonly channelRepo?: Repository<MessengerChannel>,
    @InjectRepository(ReplyDraft)
    private readonly draftRepo?: Repository<ReplyDraft>,
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
  /** Public read of one conversation row (channel/status) for the console header. */
  async findConversation(conversationId: number, tenantId: number): Promise<Conversation> {
    return this.requireConversation(conversationId, tenantId);
  }

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
    channel?: string,
  ): Promise<{
    items: Array<{
      conversation: Conversation;
      lastMessage: Message | null;
      contact: { name: string | null; email: string | null };
      /** Operator-set session name (PLN-260812); null when unset. */
      alias: string | null;
      /** Session auto-reply choice: inherit | on | off. */
      autoReplyMode: string;
      /** That choice resolved against the channel default. */
      autoReplyEffective: boolean;
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

    // Channel filter (PLN-260810 PR-M4). 'widget' also covers the pre-channel
    // rows: conversations created before external channels existed default to
    // 'widget', and NULL would otherwise vanish from the widget view.
    const channelFilter = channel?.trim();
    if (channelFilter && channelFilter !== 'all') {
      if (channelFilter === 'widget') {
        qb.andWhere("(c.channel = 'widget' OR c.channel IS NULL)");
      } else {
        qb.andWhere('c.channel = :channel', { channel: channelFilter });
      }
    }

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
    // One query for the whole page, same reason (PLN-260812).
    const stateBySession = await this.sessionStates(conversations.map((c) => c.sessionId));
    const channelDefaults = await this.channelDefaults(conversations.map((c) => c.id));
    const items = conversations.map((conversation) => {
      const state = stateBySession.get(String(conversation.sessionId));
      return {
        conversation,
        lastMessage: lastByConv.get(String(conversation.id)) ?? null,
        contact: contactByConv.get(String(conversation.id)) ?? { name: null, email: null },
        alias: state?.alias ?? null,
        autoReplyMode: state?.autoReplyMode ?? AUTO_REPLY_MODE.INHERIT,
        autoReplyEffective: resolveAutoReply(
          channelDefaults.get(String(conversation.id)) ?? null,
          state?.autoReplyMode,
        ),
      };
    });
    return { items, total };
  }

  /**
   * Set this session's auto-reply choice (PLN-260812 FR-2).
   *
   * Only affects messages received from now on — answering a question the
   * shopper asked half an hour ago is worse than not answering it, so nothing
   * is replayed. The console says as much next to the control.
   */
  async setSessionAutoReply(
    conversationId: number,
    tenantId: number,
    actorUserId: number,
    mode: string,
  ): Promise<{ sessionId: string; autoReplyMode: string; autoReplyEffective: boolean }> {
    if (!isAutoReplyMode(mode)) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }
    const conversation = await this.requireConversation(conversationId, tenantId);
    await this.sessionRepo.update({ id: conversation.sessionId }, { autoReplyMode: mode });

    const session = await this.sessionRepo.findOne({
      where: { id: conversation.sessionId },
      select: { id: true, sessionToken: true },
    });
    if (session?.sessionToken) await this.redis.del(sessionCacheKey(session.sessionToken));

    await this.auditAgentAction(
      actorUserId,
      tenantId,
      'agent.session.auto_reply',
      `session:${conversation.sessionId}`,
      { conversationId: String(conversationId), mode },
    );

    const defaults = await this.channelDefaults([conversationId]);
    return {
      sessionId: String(conversation.sessionId),
      autoReplyMode: mode,
      autoReplyEffective: resolveAutoReply(defaults.get(String(conversationId)) ?? null, mode),
    };
  }

  /** The AI answer waiting for approval on this conversation, if any. */
  async pendingDraft(conversationId: number, tenantId: number): Promise<ReplyDraft | null> {
    if (!this.draftRepo) return null;
    return this.draftRepo.findOne({
      where: { conversationId, tenantId, status: 'pending' },
      order: { id: 'DESC' },
    });
  }

  /**
   * Send the pending draft (optionally edited) as the agent's own reply.
   *
   * Deliberately routed through `sendMessage`: moderation, duplicate
   * suppression and the channel outbox already live there, and a second
   * delivery path would be a second set of those rules to keep in step.
   */
  async approveDraft(
    conversationId: number,
    tenantId: number,
    agentId: number,
    body?: string,
  ): Promise<{ approved: boolean }> {
    const draft = await this.pendingDraft(conversationId, tenantId);
    if (!draft) throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);

    const text = (body ?? draft.body).trim();
    if (!text) throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);

    await this.sendMessage(conversationId, agentId, tenantId, text);
    await this.draftRepo!.update(
      { id: draft.id },
      { status: 'sent', resolvedBy: agentId, resolvedAt: new Date() },
    );
    await this.auditAgentAction(agentId, tenantId, 'agent.draft.approve', `conversation:${conversationId}`, {
      edited: body != null && body.trim() !== draft.body,
    });
    return { approved: true };
  }

  /** Drop the pending draft without sending anything. */
  async discardDraft(
    conversationId: number,
    tenantId: number,
    agentId: number,
  ): Promise<{ discarded: boolean }> {
    const draft = await this.pendingDraft(conversationId, tenantId);
    if (!draft) throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    await this.draftRepo!.update(
      { id: draft.id },
      { status: 'discarded', resolvedBy: agentId, resolvedAt: new Date() },
    );
    await this.auditAgentAction(agentId, tenantId, 'agent.draft.discard', `conversation:${conversationId}`);
    return { discarded: true };
  }

  /**
   * Alias + auto-reply state for one conversation (console header).
   *
   * The header showed neither before: an alias set from the queue row did not
   * appear above the transcript, and nothing said whether the AI was answering.
   */
  async sessionStateFor(
    conversationId: number,
    sessionId: number,
  ): Promise<{ alias: string | null; autoReplyMode: string; autoReplyEffective: boolean }> {
    const state = (await this.sessionStates([sessionId])).get(String(sessionId));
    const mode = state?.autoReplyMode ?? AUTO_REPLY_MODE.INHERIT;
    const defaults = await this.channelDefaults([conversationId]);
    return {
      alias: state?.alias ?? null,
      autoReplyMode: mode,
      autoReplyEffective: resolveAutoReply(defaults.get(String(conversationId)) ?? null, mode),
    };
  }

  /** session id → alias + auto-reply mode, for a whole page in one query. */
  private async sessionStates(
    sessionIds: number[],
  ): Promise<Map<string, { alias: string | null; autoReplyMode: string }>> {
    if (sessionIds.length === 0) return new Map();
    const rows = await this.sessionRepo.find({
      where: { id: In(sessionIds) },
      select: { id: true, alias: true, autoReplyMode: true },
    });
    return new Map(
      rows.map((s) => [
        String(s.id),
        { alias: s.alias ?? null, autoReplyMode: s.autoReplyMode || AUTO_REPLY_MODE.INHERIT },
      ]),
    );
  }

  /**
   * conversation id → its channel's auto-reply default, for the whole page.
   *
   * Only messenger-backed conversations have one; a widget thread answers by
   * default, which `resolveAutoReply` expresses as a null default.
   */
  private async channelDefaults(conversationIds: number[]): Promise<Map<string, boolean>> {
    const defaults = new Map<string, boolean>();
    if (conversationIds.length === 0 || !this.threadRepo || !this.channelRepo) return defaults;

    const threads = await this.threadRepo.find({
      where: { conversationId: In(conversationIds) },
      select: { conversationId: true, channelId: true },
    });
    if (threads.length === 0) return defaults;

    const channels = await this.channelRepo.find({
      where: { id: In([...new Set(threads.map((t) => Number(t.channelId)))]) },
      select: { id: true, autoReply: true },
    });
    const byChannel = new Map(channels.map((c) => [String(c.id), c.autoReply === 1]));
    for (const thread of threads) {
      const value = byChannel.get(String(thread.channelId));
      if (value !== undefined) defaults.set(String(thread.conversationId), value);
    }
    return defaults;
  }

  /**
   * Set (or clear) the operator's name for the session behind a conversation.
   *
   * Keyed by conversation because that is all the console holds — its "session"
   * rows are conversation ids. Blank clears, restoring the derived name.
   */
  async setSessionAlias(
    conversationId: number,
    tenantId: number,
    actorUserId: number,
    alias: string | null,
  ): Promise<{ sessionId: string; alias: string | null }> {
    const conversation = await this.requireConversation(conversationId, tenantId);
    const clean = (alias ?? '').trim().slice(0, SESSION_ALIAS_MAX);
    const value = clean.length > 0 ? clean : null;

    await this.sessionRepo.update({ id: conversation.sessionId }, { alias: value });
    // The token→session cache would otherwise serve the old alias for 30s.
    const session = await this.sessionRepo.findOne({
      where: { id: conversation.sessionId },
      select: { id: true, sessionToken: true },
    });
    if (session?.sessionToken) await this.redis.del(sessionCacheKey(session.sessionToken));

    // An alias can be a real person's name — record THAT it changed, never what to.
    await this.auditAgentAction(
      actorUserId,
      tenantId,
      'agent.session.alias',
      `session:${conversation.sessionId}`,
      { conversationId: String(conversationId), set: value != null },
    );
    return { sessionId: String(conversation.sessionId), alias: value };
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

  /**
   * A page of the transcript, newest-anchored (PLN-260807). The console used to
   * receive every message a conversation ever had; it asks for the recent tail
   * and walks backwards with `beforeId` when the agent scrolls.
   * Returned ascending (oldest → newest) so the caller renders it directly.
   */
  async listMessages(
    conversationId: number,
    tenantId: number,
    opts: { limit?: number; beforeId?: number } = {},
  ): Promise<{ messages: Message[]; hasMore: boolean }> {
    await this.requireConversation(conversationId, tenantId);
    const limit = Math.min(Math.max(opts.limit ?? MESSAGE_PAGE_SIZE, 1), 200);
    const where: FindOptionsWhere<Message> = { conversationId };
    if (opts.beforeId != null) where.id = LessThan(opts.beforeId);
    // limit + 1 is the cheapest "is there another page" probe.
    const rows = await this.msgRepo.find({
      where,
      order: { id: 'DESC' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    return { messages: rows.slice(0, limit).reverse(), hasMore };
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
    // maxConcurrent enforcement (P2, REQ §7-P2). A profile row opts an agent in;
    // without one the pre-P2 behavior (unlimited) stands. 409, warn-logged.
    const profile = await this.profileRepo.findOne({ where: { userId: agentId } });
    if (profile) {
      const active = await this.assignmentRepo.count({
        where: { tenantId, agentId, status: 'active' },
      });
      if (active >= profile.maxConcurrent) {
        this.logger.warn(
          `accept rejected: agent=${agentId} at capacity (${active}/${profile.maxConcurrent})`,
        );
        throw new BusinessException(ERROR_CODE.AGENT_AT_CAPACITY, HttpStatus.CONFLICT);
      }
    }
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
    // Issue P1: a native-mode tenant's ticket follows the acceptance (assign +
    // in_progress + tier stamp). Best-effort — never blocks the accept.
    void this.issueService?.onAgentAccept(conversationId, tenantId, agentId);
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
    // Answer reuse ingest (PLN-260808 Track C, D-C1): a human's moderated reply
    // paired with the question it answered is the highest-trust reuse source.
    // Fire-and-forget — a reuse hiccup must never fail the reply.
    void this.ingestReplyForReuse(conversationId, tenantId, saved);
    return saved;
  }

  /** Pair the agent reply with the customer question right before it. */
  private async ingestReplyForReuse(
    conversationId: number,
    tenantId: number,
    reply: Message,
  ): Promise<void> {
    try {
      if (!this.answerReuse) return;
      const question = await this.msgRepo.findOne({
        where: { conversationId, senderType: SENDER_TYPE.USER },
        order: { id: 'DESC' },
      });
      if (!question) return;
      await this.answerReuse.recordAgentAnswer({
        tenantId,
        lang: question.lang ?? 'EN',
        question: question.body,
        answerText: reply.body,
        sourceMessageId: reply.id,
      });
    } catch (e) {
      this.logger.debug(`reuse agent-ingest skipped: ${(e as Error).message}`);
    }
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
  /**
   * Hand the thread back to the AI (PLN-260810 S1).
   *
   * Until now `agent` was a one-way door: the bot goes silent the moment
   * somebody takes over (chat.service, FIX-260806 A1) and the only exit was
   * ending the conversation. Measured on staging before this shipped — all
   * seven `agent` threads had been idle for over a day and three of them held
   * ten customer messages that nobody and nothing had answered.
   *
   * Clearing `agent_id` is not cosmetic. The silence rule also fires on
   * `waiting && agentId != null`, so a thread handed back with the id still on
   * it would go mute again the next time it queued for a person.
   */
  async handBack(
    conversationId: number,
    tenantId: number,
    actorUserId: number,
  ): Promise<Conversation> {
    const conversation = await this.requireConversation(conversationId, tenantId);
    if (conversation.status !== CONVERSATION_STATUS.AGENT) {
      // 4xx is not server-logged by default; say why the button did nothing.
      this.logger.warn(
        `handback rejected: conversation=${conversationId} status='${conversation.status}' (expected 'agent')`,
      );
      throw new BusinessException(ERROR_CODE.CONVERSATION_NOT_WITH_AGENT, HttpStatus.CONFLICT);
    }

    await this.assignmentRepo.update(
      { conversationId, status: 'active' },
      { status: 'released', releasedAt: new Date() },
    );
    await this.convRepo.update(
      { id: conversationId },
      { status: CONVERSATION_STATUS.AI_ACTIVE, agentId: null },
    );

    const session = await this.sessionRepo.findOne({ where: { id: conversation.sessionId } });
    const language = session?.language ?? 'EN';
    await this.msgRepo.save(
      this.msgRepo.create({
        tenantId,
        conversationId,
        senderType: SENDER_TYPE.SYSTEM,
        body: await this.handbackNotice(tenantId, language),
        lang: language,
        retrievalTrace: null,
      }),
    );

    await this.audit
      .write({
        tenantId,
        actorType: 'user',
        actorId: actorUserId,
        action: 'agent.handed_back',
        target: `conversation:${conversationId}`,
        metadata: { previousAgentId: conversation.agentId ?? null },
      })
      .catch((e) => this.logger.warn(`handback audit failed: ${(e as Error).message}`));

    this.logger.log(`conversation ${conversationId} handed back to AI by user ${actorUserId}`);
    return this.convRepo.findOneOrFail({ where: { id: conversationId } });
  }

  /** Tenant wording for the handback, falling back to the built-in text. */
  private async handbackNotice(tenantId: number, language: string): Promise<string> {
    const lang = (language || 'EN').toUpperCase();
    const fallback = DEFAULT_HANDBACK_NOTICE[lang] ?? DEFAULT_HANDBACK_NOTICE.EN;
    try {
      const config = await this.aiConfigRepo?.findOne({ where: { tenantId } });
      const custom = config?.handoffConfig?.handbackNotice as Record<string, string> | undefined;
      return custom?.[lang]?.trim() || custom?.EN?.trim() || fallback;
    } catch (e) {
      // Wording is not worth failing a state transition over.
      this.logger.warn(`handback notice lookup failed: ${(e as Error).message}`);
      return fallback;
    }
  }

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
    // Issue P1: a settled (resolved/rejected) issue closes with the conversation.
    void this.issueService?.onConversationEnded(conversationId);
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
