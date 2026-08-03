import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import {
  CJM_STAGE,
  CONSENT_STATE,
  CONVERSATION_STATUS,
  MODERATION_DECISION,
  SENDER_TYPE,
} from '@ivy/types';
import { Conversation } from './entity/conversation.entity';
import { Message } from './entity/message.entity';
import { Session } from '../session/entity/session.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { User } from '../user/entity/user.entity';
import { RagService } from './rag.service';
import { ModerationService } from '../moderation/moderation.service';
import type { ChatTurnResponse } from '@ivy/types';
import { OrderService } from '../order/order.service';
import { SessionService } from '../session/session.service';
import { EventBusService, EVENTS } from '../../infrastructure/infrastructure.module';
import { scrubPii } from '../../global/util/pii-scrub.util';

const ESCALATION_CONFIDENCE = 0.45;
/** Recent orders handed to the assistant as grounding for order questions. */
const ORDER_CONTEXT_LIMIT = 5;

/**
 * Localized backend-generated conversational strings (en/es/ko) keyed by
 * session.language. Backend ERROR messages stay English (localized by code on
 * the client); these are user-facing chat turns, so they honor the UI language.
 */
const SYSTEM_MESSAGES = {
  authRequired: {
    EN: 'To look up your order I need to verify your identity. Please sign in or use guest order lookup.',
    ES: 'Para consultar tu pedido necesito verificar tu identidad. Inicia sesión o usa la búsqueda de pedido como invitado.',
    KO: '주문을 조회하려면 본인 확인이 필요합니다. 로그인하거나 비회원 주문 조회를 이용해 주세요.',
  },
  connectingAgent: {
    EN: "I'm connecting you with a support agent who can help with this.",
    ES: 'Te estoy conectando con un agente de soporte que puede ayudarte con esto.',
    KO: '이 문제를 도와드릴 상담원에게 연결해 드리겠습니다.',
  },
  offerAgent: {
    EN: 'Would you like me to connect you with a support agent?',
    ES: '¿Quieres que te conecte con un agente de soporte?',
    KO: '상담원에게 연결해 드릴까요?',
  },
  handoff: {
    EN: "I couldn't find a confident answer in our help content, so I'm forwarding this to our support team to continue the conversation. An agent will reply here shortly.",
    ES: 'No encontré una respuesta segura en nuestro contenido de ayuda, así que lo estoy remitiendo a nuestro equipo de soporte para continuar la conversación. Un agente responderá aquí en breve.',
    KO: '관리자에게 전달하여 상담을 이어가겠습니다. 잠시만 기다려 주시면 상담사가 이 대화창에서 답변드릴게요.',
  },
  consentRequired: {
    EN: 'We cannot process chat messages until you accept the privacy notice. To use chat, please accept the privacy notice in the consent banner.',
    ES: 'No podemos procesar mensajes de chat hasta que aceptes el aviso de privacidad. Para usar el chat, acepta el aviso de privacidad en el banner de consentimiento.',
    KO: '개인정보 처리 안내에 동의하시기 전에는 채팅 메시지를 처리할 수 없습니다. 채팅을 이용하려면 동의 배너에서 개인정보 처리 안내에 동의해 주세요.',
  },
} as const;

/** Localized system-turn copy — shared with ScenarioService's consent gate. */
export function sysMsg(key: keyof typeof SYSTEM_MESSAGES, lang: string): string {
  const set = SYSTEM_MESSAGES[key];
  return (set as Record<string, string>)[lang] ?? set.EN;
}

/** Response shape lives in `@ivy/types` — the widget imports the same contract. */
export type ChatTurnResult = ChatTurnResponse;

export type EscalationReason = 'low_confidence' | 'moderation_blocked' | 'user_request';

/** Payload published on EVENTS.ESCALATION (consumed by AgentAlertService). */
export interface EscalationEvent {
  tenantId: number;
  conversationId: number;
  sessionId: number | null;
  reason: EscalationReason;
  preview: string;
}

/**
 * Chat orchestration (SEQ-03/05, S5). Persists turns, classifies intent, runs
 * RAG, applies the mandatory moderation gate, and decides escalation. Every turn
 * is logged (FN-046) and emits a CJM Inquiry event (FN-047).
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(Conversation) private readonly convRepo: Repository<Conversation>,
    @InjectRepository(Message) private readonly msgRepo: Repository<Message>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly rag: RagService,
    private readonly moderation: ModerationService,
    private readonly orderService: OrderService,
    private readonly sessionService: SessionService,
    private readonly bus: EventBusService,
  ) {}

  async getOrCreateConversation(sessionId: number): Promise<Conversation> {
    // Reuse waiting/agent conversations too — a customer replying during or
    // after a handoff must stay in the same thread (FR-S4), not fork a new one.
    const open = await this.convRepo.findOne({
      where: {
        sessionId,
        status: In([
          CONVERSATION_STATUS.AI_ACTIVE,
          CONVERSATION_STATUS.WAITING,
          CONVERSATION_STATUS.AGENT,
        ]),
      },
      order: { id: 'DESC' },
    });
    if (open) return open;
    return this.convRepo.save(
      this.convRepo.create({
        sessionId,
        channel: 'widget',
        status: CONVERSATION_STATUS.AI_ACTIVE,
        escalated: 0,
        agentId: null,
      }),
    );
  }

  /**
   * Read-only lookup of the session's current open conversation (PERF-1).
   * Unlike getOrCreateConversation this NEVER inserts — the widget's 5s poll
   * must not create rows; conversations come into being on the first message.
   */
  async findOpenConversation(sessionId: number): Promise<Conversation | null> {
    return this.convRepo.findOne({
      where: {
        sessionId,
        status: In([
          CONVERSATION_STATUS.AI_ACTIVE,
          CONVERSATION_STATUS.WAITING,
          CONVERSATION_STATUS.AGENT,
        ]),
      },
      order: { id: 'DESC' },
    });
  }

  /**
   * Bounded message read (PERF-1). With `afterId` only newer rows return
   * (delta poll); without it, the LAST `limit` messages in ascending order.
   */
  async listMessages(
    conversationId: number,
    opts?: { afterId?: number; limit?: number },
  ): Promise<Message[]> {
    const limit = opts?.limit ?? 200;
    if (opts?.afterId != null) {
      return this.msgRepo
        .createQueryBuilder('m')
        .where('m.conversation_id = :cid', { cid: conversationId })
        .andWhere('m.id > :after', { after: opts.afterId })
        .orderBy('m.id', 'ASC')
        .take(limit)
        .getMany();
    }
    const latest = await this.msgRepo.find({
      where: { conversationId },
      order: { id: 'DESC' },
      take: limit,
    });
    return latest.reverse();
  }

  /** Agent display names for the given messages, so the widget can show who replied. */
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

  async handleUserMessage(session: Session, text: string): Promise<ChatTurnResult> {
    // Consent gate (PRV-M4, PLN-Privacy-Control-Gap D-1: fail-closed). Only an
    // effective GRANTED — fresh (uncached) read, current notice version — lets
    // the turn proceed; PENDING, DECLINED, and an outdated grant all soft-block:
    // the message is neither persisted nor sent to the AI, no CJM event fires,
    // and the customer gets a localized pointer back to the consent banner.
    // Preview sandbox (/ai-setting) skips the gate: the admin is not a data
    // subject and the session is isolated from alerts/queues/analytics.
    const isPreview = session.channel === 'preview';
    const consent = isPreview
      ? CONSENT_STATE.GRANTED
      : await this.sessionService.effectiveConsentFor(session.id, session.tenantId);
    if (consent !== CONSENT_STATE.GRANTED) {
      return {
        conversationId: null,
        reply: { senderType: 'system', body: sysMsg('consentRequired', session.language) },
        escalate: false,
        needsAuth: false,
      };
    }

    const tenantId = session.tenantId ?? (await this.resolveTenantId());
    const conversation = await this.getOrCreateConversation(session.id);

    await this.persist(conversation.id, SENDER_TYPE.USER, text, session.language);
    await this.bus.publish(EVENTS.CONVERSATION_LOG, { conversationId: conversation.id, senderType: 'user' });
    await this.bus.publish(EVENTS.CJM, {
      tenantId,
      sessionId: session.id,
      customerId: session.customerId,
      stage: CJM_STAGE.INQUIRY,
      eventType: 'chat_message',
    });

    // Agent mode (FR-S4): once the thread is waiting for / handled by a human,
    // the bot stays silent — the message is persisted for the agent console and
    // the customer receives agent replies via conversation polling.
    if (
      conversation.status === CONVERSATION_STATUS.WAITING ||
      conversation.status === CONVERSATION_STATUS.AGENT
    ) {
      return { conversationId: String(conversation.id), reply: null, escalate: false, needsAuth: false };
    }

    // PII minimization (PRV Stage 5): the AI provider gets a scrubbed COPY of
    // the message; the persisted original stays intact (agents need it). Only
    // match counts are logged — never the original text.
    const { text: egressText, counts: piiCounts } = scrubPii(text);
    if (Object.keys(piiCounts).length > 0) {
      this.logger.warn(
        `PII scrubbed from AI egress (conversation ${conversation.id}): ${JSON.stringify(piiCounts)}`,
      );
    }

    // Intent + scope check (FN-015): order data requires authentication first.
    const intent = await this.rag.classifyIntent(tenantId, egressText);
    if (intent.needsOrderData && session.customerId == null) {
      const body = sysMsg('authRequired', session.language);
      await this.persist(conversation.id, SENDER_TYPE.SYSTEM, body, session.language);
      return { conversationId: String(conversation.id), reply: { senderType: 'system', body }, escalate: false, needsAuth: true };
    }

    // Order questions from a signed-in shopper are answered from their real
    // orders, not guessed from the knowledge base. Only reached once the gate
    // above proved the session is bound to a customer.
    const orderContext =
      intent.needsOrderData && session.customerId != null
        ? await this.buildOrderContext(tenantId, session.customerId)
        : undefined;

    // RAG answer (FN-016/017). The shopper's own words go out scrubbed (Stage 5);
    // `orderContext` does not, on purpose — we build it ourselves from our own
    // database, it already excludes every contact field (see buildOrderContext), and
    // scrubPii would mask the order refs and totals that are the whole point of the
    // grounding. Minimisation happens at construction here, not by redaction after.
    const answer = await this.rag.answer(tenantId, egressText, session.language, orderContext);

    // Mandatory moderation gate (FR-069).
    const moderated = await this.moderation.moderate({
      tenantId,
      scope: 'ai',
      authorType: 'ai',
      conversationId: conversation.id,
      text: answer.text,
    });

    if (moderated.decision === MODERATION_DECISION.BLOCKED) {
      const body = await this.handoff(conversation.id, session, tenantId, 'moderation_blocked', text);
      return { conversationId: String(conversation.id), reply: { senderType: 'system', body }, escalate: true, needsAuth: false };
    }

    // RAG fallback (FR-S3): no confident answer within the knowledge base →
    // hand off to a human instead of replying, and alert the agents.
    if (answer.confidence < ESCALATION_CONFIDENCE) {
      const body = await this.handoff(conversation.id, session, tenantId, 'low_confidence', text);
      return { conversationId: String(conversation.id), reply: { senderType: 'system', body }, escalate: true, needsAuth: false };
    }

    await this.persist(conversation.id, SENDER_TYPE.AI, moderated.text, session.language, {
      citations: answer.citations,
      confidence: answer.confidence,
    });
    await this.bus.publish(EVENTS.CONVERSATION_LOG, { conversationId: conversation.id, senderType: 'ai' });

    return {
      conversationId: String(conversation.id),
      // confidence rides along for the admin preview diagnostics; widget ignores it.
      reply: {
        senderType: 'ai',
        body: moderated.text,
        citations: answer.citations,
        confidence: answer.confidence,
      },
      escalate: false,
      needsAuth: false,
    };
  }

  /**
   * Hand the conversation to humans (FR-S3/S4): persist the localized handoff
   * notice, mark the thread waiting, and publish the escalation event that
   * fans out to console modal / email / Slack alerts.
   */
  async handoff(
    conversationId: number,
    session: Session,
    tenantId: number,
    reason: EscalationReason,
    preview: string,
  ): Promise<string> {
    const body = sysMsg('handoff', session.language);
    await this.persist(conversationId, SENDER_TYPE.SYSTEM, body, session.language, { reason });
    // Preview sandbox: show the real handoff notice but never page the agents —
    // no WAITING flip (the bot keeps answering for iterative testing), no alert
    // fan-out, no console-queue entry.
    if (session.channel === 'preview') return body;
    await this.markWaiting(conversationId);
    const event: EscalationEvent = {
      tenantId,
      conversationId,
      sessionId: session.id,
      reason,
      preview: preview.slice(0, 300),
    };
    await this.bus.publish(EVENTS.ESCALATION, event);
    return body;
  }

  /** Explicit "talk to an agent" request from the widget (FR-015). */
  /**
   * Escalate to a human (FR-015). SEC-L3: the conversation must belong to the
   * caller's own session — a `@Public()` endpoint keyed on a raw, enumerable
   * conversation id must not let anyone force-escalate another visitor's chat.
   */
  async escalate(session: Session, conversationId: number): Promise<void> {
    const conversation = await this.convRepo.findOne({ where: { id: conversationId } });
    // Number() both sides: session.id is a bare bigint PK (hydrates as a string)
    // while conversation.sessionId goes through bigintTransformer (number).
    if (!conversation || Number(conversation.sessionId) !== Number(session.id)) {
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    if (session.channel === 'preview') return; // sandbox: never page the agents
    const lastUser = await this.msgRepo.findOne({
      where: { conversationId, senderType: SENDER_TYPE.USER },
      order: { id: 'DESC' },
    });
    await this.markWaiting(conversationId);
    const event: EscalationEvent = {
      tenantId: session.tenantId ?? conversation.tenantId ?? 0,
      conversationId,
      sessionId: session.id,
      reason: 'user_request',
      preview: (lastUser?.body ?? '').slice(0, 300),
    };
    await this.bus.publish(EVENTS.ESCALATION, event);
  }

  // ---- helpers ----
  /**
   * Compact, factual summary of the customer's recent orders for the RAG prompt.
   * Deliberately order-only: no email, phone or address is sent to the AI provider
   * (PRV — minimise PII leaving the system); the shopper is asking about orders,
   * so order number, dates, status, totals and item titles are what's needed.
   * Never throws — losing the enrichment must not break the reply.
   */
  private async buildOrderContext(
    tenantId: number,
    customerId: number,
  ): Promise<string | undefined> {
    try {
      const recent = await this.orderService.recentForCustomer(
        tenantId,
        customerId,
        ORDER_CONTEXT_LIMIT,
      );
      if (!recent.length) return undefined;
      return recent
        .map(({ order, items }) => {
          const placed = order.createdAt ? order.createdAt.toISOString().slice(0, 10) : 'unknown';
          const total =
            order.total != null ? `${order.total} ${order.currency ?? ''}`.trim() : 'unknown';
          const lines = items.length
            ? items
                .map((i) => `${i.title}${i.optionText ? ` (${i.optionText})` : ''} x${i.qty}`)
                .join(', ')
            : 'no item details cached';
          return (
            `- Order ${order.orderNumber}: status ${order.statusUi ?? order.statusInternal ?? 'unknown'}` +
            `, placed ${placed}, total ${total}, items: ${lines}`
          );
        })
        .join('\n');
    } catch (e) {
      this.logger.warn(`Order context unavailable for customer ${customerId}: ${(e as Error).message}`);
      return undefined;
    }
  }

  private async persist(
    conversationId: number,
    senderType: string,
    body: string,
    lang: string,
    trace?: unknown,
  ): Promise<Message> {
    return this.msgRepo.save(
      this.msgRepo.create({ conversationId, senderType, body, lang, retrievalTrace: trace ?? null }),
    );
  }

  private async markWaiting(conversationId: number): Promise<void> {
    await this.convRepo.update({ id: conversationId }, { status: CONVERSATION_STATUS.WAITING, escalated: 1 });
  }

  private async resolveTenantId(): Promise<number> {
    const tenant = await this.tenantRepo.findOne({ where: {}, order: { id: 'ASC' } });
    return tenant?.id ?? 0;
  }
}
