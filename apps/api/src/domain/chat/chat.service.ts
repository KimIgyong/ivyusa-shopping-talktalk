import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

export interface ChatTurnResult {
  conversationId: number;
  reply: { senderType: string; body: string; citations?: unknown };
  escalate: boolean;
  needsAuth: boolean;
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
    const open = await this.convRepo.findOne({
      where: { sessionId, status: CONVERSATION_STATUS.AI_ACTIVE },
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
    const tenantId = await this.resolveTenantId();
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

    // Intent + scope check (FN-015): order data requires authentication first.
    const intent = await this.rag.classifyIntent(tenantId, text);
    if (intent.needsOrderData && session.customerId == null) {
      const body =
        'To look up your order I need to verify your identity. Please sign in or use guest order lookup.';
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

    const escalate =
      answer.confidence < ESCALATION_CONFIDENCE || moderated.decision === MODERATION_DECISION.BLOCKED;

    if (moderated.decision === MODERATION_DECISION.BLOCKED) {
      const body = "I'm connecting you with a support agent who can help with this.";
      await this.persist(conversation.id, SENDER_TYPE.SYSTEM, body, session.language);
      await this.markWaiting(conversation.id);
      return { conversationId: conversation.id, reply: { senderType: 'system', body }, escalate: true, needsAuth: false };
    }

    const finalText = escalate
      ? `${moderated.text}\n\nWould you like me to connect you with a support agent?`
      : moderated.text;

    await this.persist(conversation.id, SENDER_TYPE.AI, finalText, session.language, {
      citations: answer.citations,
      confidence: answer.confidence,
    });
    await this.bus.publish(EVENTS.CONVERSATION_LOG, { conversationId: conversation.id, senderType: 'ai' });

    if (escalate) await this.markWaiting(conversation.id);

    return {
      conversationId: conversation.id,
      reply: { senderType: 'ai', body: finalText, citations: answer.citations },
      escalate,
      needsAuth: false,
    };
  }

  async escalate(conversationId: number): Promise<void> {
    await this.markWaiting(conversationId);
    await this.bus.publish(EVENTS.ESCALATION, { conversationId });
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
