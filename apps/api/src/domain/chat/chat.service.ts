import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  CJM_STAGE,
  CONVERSATION_STATUS,
  MODERATION_DECISION,
  SENDER_TYPE,
} from '@ivy/types';
import { Conversation } from './entity/conversation.entity';
import { Message } from './entity/message.entity';
import { Session } from '../session/entity/session.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { RagService } from './rag.service';
import { ModerationService } from '../moderation/moderation.service';
import { EventBusService, EVENTS } from '../../infrastructure/infrastructure.module';

const ESCALATION_CONFIDENCE = 0.45;

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
} as const;

function sysMsg(key: keyof typeof SYSTEM_MESSAGES, lang: string): string {
  const set = SYSTEM_MESSAGES[key];
  return (set as Record<string, string>)[lang] ?? set.EN;
}

export interface ChatTurnResult {
  conversationId: number;
  /** Null when the conversation is in agent mode (no bot reply; agent answers). */
  reply: { senderType: string; body: string; citations?: unknown } | null;
  escalate: boolean;
  needsAuth: boolean;
}

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
  constructor(
    @InjectRepository(Conversation) private readonly convRepo: Repository<Conversation>,
    @InjectRepository(Message) private readonly msgRepo: Repository<Message>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly rag: RagService,
    private readonly moderation: ModerationService,
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

  async listMessages(conversationId: number): Promise<Message[]> {
    return this.msgRepo.find({ where: { conversationId }, order: { id: 'ASC' } });
  }

  async handleUserMessage(session: Session, text: string): Promise<ChatTurnResult> {
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
      return { conversationId: conversation.id, reply: null, escalate: false, needsAuth: false };
    }

    // Intent + scope check (FN-015): order data requires authentication first.
    const intent = await this.rag.classifyIntent(tenantId, text);
    if (intent.needsOrderData && session.customerId == null) {
      const body = sysMsg('authRequired', session.language);
      await this.persist(conversation.id, SENDER_TYPE.SYSTEM, body, session.language);
      return { conversationId: conversation.id, reply: { senderType: 'system', body }, escalate: false, needsAuth: true };
    }

    // RAG answer (FN-016/017).
    const answer = await this.rag.answer(tenantId, text, session.language);

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
      return { conversationId: conversation.id, reply: { senderType: 'system', body }, escalate: true, needsAuth: false };
    }

    // RAG fallback (FR-S3): no confident answer within the knowledge base →
    // hand off to a human instead of replying, and alert the agents.
    if (answer.confidence < ESCALATION_CONFIDENCE) {
      const body = await this.handoff(conversation.id, session, tenantId, 'low_confidence', text);
      return { conversationId: conversation.id, reply: { senderType: 'system', body }, escalate: true, needsAuth: false };
    }

    await this.persist(conversation.id, SENDER_TYPE.AI, moderated.text, session.language, {
      citations: answer.citations,
      confidence: answer.confidence,
    });
    await this.bus.publish(EVENTS.CONVERSATION_LOG, { conversationId: conversation.id, senderType: 'ai' });

    return {
      conversationId: conversation.id,
      reply: { senderType: 'ai', body: moderated.text, citations: answer.citations },
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
  async escalate(conversationId: number): Promise<void> {
    const conversation = await this.convRepo.findOne({ where: { id: conversationId } });
    const session = conversation
      ? await this.sessionRepo.findOne({ where: { id: conversation.sessionId } })
      : null;
    const lastUser = await this.msgRepo.findOne({
      where: { conversationId, senderType: SENDER_TYPE.USER },
      order: { id: 'DESC' },
    });
    await this.markWaiting(conversationId);
    const event: EscalationEvent = {
      tenantId: session?.tenantId ?? conversation?.tenantId ?? 0,
      conversationId,
      sessionId: session?.id ?? null,
      reason: 'user_request',
      preview: (lastUser?.body ?? '').slice(0, 300),
    };
    await this.bus.publish(EVENTS.ESCALATION, event);
  }

  // ---- helpers ----
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
