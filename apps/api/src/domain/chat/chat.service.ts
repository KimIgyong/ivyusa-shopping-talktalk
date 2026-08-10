import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
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
import { DOC_GROUP } from '../knowledge/entity/kb-document.entity';
import { Session } from '../session/entity/session.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { User } from '../user/entity/user.entity';
import { Assignment } from '../agent/entity/assignment.entity';
import { RagService, RagAnswer } from './rag.service';
import { ModerationService } from '../moderation/moderation.service';
import { AnswerReuseService } from '../answer-reuse/answer-reuse.service';
import { IssueService } from '../issue/issue.service';
import type { ChatTurnResponse } from '@ivy/types';
import { OrderService } from '../order/order.service';
import { SessionService, sessionCacheKey } from '../session/session.service';
import { CustomerService } from '../customer/customer.service';
import { HandoffRouterService } from '../ai-engine/handoff-router.service';
import { EventBusService, EVENTS, RedisService } from '../../infrastructure/infrastructure.module';
import { scrubPii } from '../../global/util/pii-scrub.util';

const ESCALATION_CONFIDENCE = 0.45;
/** Recent orders handed to the assistant as grounding for order questions. */
const ORDER_CONTEXT_LIMIT = 5;
/** Earlier customer turns folded into the retrieval query (FIX-260806 A2). */
const RETRIEVAL_CONTEXT_TURNS = 2;
/** Per-turn cap on that borrowed context, so one long message can't drown the query. */
const RETRIEVAL_CONTEXT_CHARS = 200;

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
  offHoursNeedEmail: {
    EN: "We're outside our support hours right now. Leave the email address you'd like the answer sent to and our team will reply there as soon as they're back.",
    ES: 'Ahora mismo estamos fuera del horario de atención. Déjanos el correo al que quieres recibir la respuesta y nuestro equipo te escribirá en cuanto vuelva.',
    KO: '지금은 상담 가능 시간이 아니에요. 회신받으실 이메일을 남겨주시면 업무 시간에 담당자가 이메일로 답변드릴게요.',
  },
  contactEmailSaved: {
    EN: "Thanks — we'll send the answer to that address.",
    ES: 'Gracias, enviaremos la respuesta a esa dirección.',
    KO: '감사합니다. 해당 주소로 답변을 보내드릴게요.',
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

export type EscalationReason = 'low_confidence' | 'moderation_blocked' | 'user_request' | 'policy';

/** What a handoff tells the caller: the notice shown, and whether we still need an address. */
export interface HandoffOutcome {
  body: string;
  /** True off hours when we hold no email for this shopper — the widget asks. */
  needsContactEmail: boolean;
}

/** Payload published on EVENTS.ESCALATION (consumed by AgentAlertService). */
export interface EscalationEvent {
  tenantId: number;
  conversationId: number;
  sessionId: number | null;
  reason: EscalationReason;
  preview: string;
  /** Agents to address the alert to (PLN-AiSetting W3). Empty = broadcast. */
  targetUserIds?: number[];
  /** Off-hours: mail the summary here instead of paging the console. */
  offHoursEmail?: string;
  /** Issue type/label stamp from a deny rule (P2) — consumed by IssueService/alerts. */
  issueType?: string;
  issueLabel?: string;
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
    @InjectRepository(Assignment) private readonly assignmentRepo: Repository<Assignment>,
    private readonly rag: RagService,
    private readonly moderation: ModerationService,
    private readonly orderService: OrderService,
    private readonly sessionService: SessionService,
    private readonly handoffRouter: HandoffRouterService,
    private readonly bus: EventBusService,
    private readonly customerService: CustomerService,
    private readonly redis: RedisService,
    // Appended last so positional test doubles that predate it stay valid —
    // every use is `this.answerReuse?.` / `this.issueService?.`-guarded.
    private readonly answerReuse?: AnswerReuseService,
    private readonly issueService?: IssueService,
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
   * The session's newest conversation regardless of status. The widget's poll
   * needs this so an ENDED thread (customer or agent pressed "end") reports
   * status 'ended' with its history instead of collapsing to 'none' — that
   * status is what renders the "conversation ended" notice (PLN-260808 Track B).
   */
  async findLatestConversation(sessionId: number): Promise<Conversation | null> {
    return this.convRepo.findOne({ where: { sessionId }, order: { id: 'DESC' } });
  }

  /**
   * Customer-side end chat (요구 3, PLN-260808 Track B): end the session's open
   * conversation and release any active agent assignment — the same state
   * transition as the console's end. The session (and sign-in) stays alive; the
   * next message simply opens a fresh conversation (existing open-only lookup).
   * No-op success when nothing is open: pressing "end" twice must not error.
   */
  async endBySession(session: Session): Promise<{ ended: boolean; conversationId: string | null }> {
    const open = await this.findOpenConversation(session.id);
    if (!open) return { ended: false, conversationId: null };
    await this.convRepo.update(
      { id: open.id },
      { status: CONVERSATION_STATUS.ENDED, endedAt: new Date() },
    );
    await this.assignmentRepo.update(
      { conversationId: open.id, status: 'active' },
      { status: 'released', releasedAt: new Date() },
    );
    // Issue P1/B4: a settled issue closes; an untouched received issue may
    // auto-resolve by the last bot tier (customer chose to leave satisfied).
    void this.issueService?.onConversationEnded(open.id, true);
    this.logger.log(`conversation ${open.id} ended by customer (session=${session.id})`);
    return { ended: true, conversationId: String(open.id) };
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

    const userTurn = await this.persist(tenantId, conversation.id, SENDER_TYPE.USER, text, session.language);
    await this.bus.publish(EVENTS.CJM, {
      tenantId,
      sessionId: session.id,
      customerId: session.customerId,
      stage: CJM_STAGE.INQUIRY,
      eventType: 'chat_message',
    });

    // The customer answered the idle check, so the thread is alive again. This
    // must happen BEFORE the agent-mode return below: the threads most likely
    // to have been asked are exactly the ones a human owns, and clearing the
    // latch after that early return would never run for them (PLN-260810 P1).
    if (conversation.idlePromptAt) {
      conversation.idlePromptAt = null;
      await this.convRepo.update({ id: conversation.id }, { idlePromptAt: null });
    }

    // Agent mode (FR-S4): once a human owns the thread the bot stays silent —
    // the message is persisted for the agent console and the customer receives
    // agent replies via conversation polling.
    //
    // A merely QUEUED thread (waiting, nobody assigned) is different: it can sit
    // there for hours, and staying silent meant every further question vanished
    // without a word — the shopper watched an indicator and gave up
    // (FIX-260806 A1). So the bot keeps helping until an agent takes over; the
    // escalation, the alert and the WAITING state all stand.
    const humanOwnsThread =
      conversation.status === CONVERSATION_STATUS.AGENT ||
      (conversation.status === CONVERSATION_STATUS.WAITING && conversation.agentId != null);
    if (humanOwnsThread) {
      return { conversationId: String(conversation.id), reply: null, escalate: false, needsAuth: false };
    }
    const queued = conversation.status === CONVERSATION_STATUS.WAITING;
    // They are typing in the widget again — but that only means replies belong
    // here if somebody is actually on shift to write one. A shopper who follows
    // up five minutes later is still off hours, and clearing the channel then
    // quietly cancelled the email delivery their answer depends on (found in
    // staging verification, PLN-260806 S2).
    if (conversation.replyChannel === 'email') {
      const route = await this.handoffRouter.route(tenantId, session.language);
      if (route.mode !== 'email') {
        conversation.replyChannel = null;
        await this.convRepo.update({ id: conversation.id }, { replyChannel: null });
      }
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
    // Record the label on the turn that produced it. The classifier already
    // runs on every message and its result was discarded after the
    // needsOrderData check below, so the intent statistics lens costs no extra
    // model call — only this write.
    await this.msgRepo.update(
      { id: userTurn.id },
      { intent: intent.intent ?? null, intentConfidence: intent.confidence ?? null },
    );
    // Policy deny-list (P2, REQ §5.3): a matched topic goes to a human no matter
    // how confident the AI would be — the LLM is not even asked. A queued thread
    // stays silent (agents are already paged; see the blocked/low-conf branches).
    const deny = await this.handoffRouter.denyMatch(tenantId, egressText);
    if (deny) {
      if (queued) {
        return { conversationId: String(conversation.id), reply: null, escalate: false, needsAuth: false };
      }
      const handoff = await this.handoff(conversation.id, session, tenantId, 'policy', text, {
        issueType: deny.type,
        issueLabel: deny.label,
      });
      return {
        conversationId: String(conversation.id),
        reply: { senderType: 'system', body: handoff.body },
        escalate: true,
        needsAuth: false,
        needsContactEmail: handoff.needsContactEmail,
      };
    }

    if (intent.needsOrderData && session.customerId == null) {
      const body = sysMsg('authRequired', session.language);
      await this.persist(tenantId, conversation.id, SENDER_TYPE.SYSTEM, body, session.language);
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
    // Group preference (PLN-260804 D3): a product-ish intent nudges retrieval
    // toward the product catalogue. A fallback label carries no information —
    // the classifier's failure value happens to be 'product_inquiry' — so it
    // yields no preference at all.
    const preferGroup =
      !intent.fallback && /product/i.test(intent.intent ?? '') ? DOC_GROUP.PRODUCT : undefined;
    // Answer reuse (요구 5, PLN-260808 Track C): a near-duplicate of an already
    // answered question replays the stored verified answer — no LLM call. Sits
    // BEFORE rag.answer but upstream of the moderation gate below, so a replay
    // is still moderated (FR-069 non-bypassable). Never for order questions:
    // those answers are personal and the reuse store refuses them anyway.
    const reused =
      intent.needsOrderData || !this.answerReuse
        ? null
        : await this.answerReuse.lookup(tenantId, session.language, egressText);
    const answer = reused
      ? {
          text: reused.text,
          confidence: reused.confidence,
          citations: reused.citations as RagAnswer['citations'],
        }
      : await this.rag.answer(
          tenantId,
          egressText,
          session.language,
          orderContext,
          preferGroup,
          // Retrieval-only context (FIX-260806 A2): a follow-up like "and for my
          // young son?" carries none of the words its own topic is indexed under,
          // so searching on it alone scored off-topic and escalated a question the
          // knowledge base could answer.
          await this.retrievalQueryFor(conversation.id, userTurn.id, egressText),
        );

    // Mandatory moderation gate (FR-069).
    const moderated = await this.moderation.moderate({
      tenantId,
      scope: 'ai',
      authorType: 'ai',
      conversationId: conversation.id,
      text: answer.text,
    });

    // Already queued: the agents have been paged and the customer has seen the
    // handoff notice, so a second one per message would be noise and a duplicate
    // alert. Stay silent for this turn — the widget keeps showing the queued
    // state — rather than escalating what is already escalated.
    if (moderated.decision === MODERATION_DECISION.BLOCKED) {
      // A replay the moderator refuses must never be replayed again.
      if (reused) {
        void this.answerReuse
          ?.deactivate(reused.reuseId, tenantId)
          .catch((e: Error) => this.logger.warn(`reuse deactivate failed: ${e.message}`));
      }
      if (queued) {
        return { conversationId: String(conversation.id), reply: null, escalate: false, needsAuth: false };
      }
      const handoff = await this.handoff(conversation.id, session, tenantId, 'moderation_blocked', text);
      return {
        conversationId: String(conversation.id),
        reply: { senderType: 'system', body: handoff.body },
        escalate: true,
        needsAuth: false,
        needsContactEmail: handoff.needsContactEmail,
      };
    }

    // RAG fallback (FR-S3): no confident answer within the knowledge base →
    // hand off to a human instead of replying, and alert the agents.
    if (answer.confidence < ESCALATION_CONFIDENCE) {
      if (queued) {
        return { conversationId: String(conversation.id), reply: null, escalate: false, needsAuth: false };
      }
      const handoff = await this.handoff(conversation.id, session, tenantId, 'low_confidence', text);
      return {
        conversationId: String(conversation.id),
        reply: { senderType: 'system', body: handoff.body },
        escalate: true,
        needsAuth: false,
        needsContactEmail: handoff.needsContactEmail,
      };
    }

    const aiTurn = await this.persist(tenantId, conversation.id, SENDER_TYPE.AI, moderated.text, session.language, {
      citations: answer.citations,
      confidence: answer.confidence,
      // Console diagnostics: which answers came from the reuse store (D-C2:
      // the customer sees no marker; the trace always records it).
      ...(reused ? { answeredFrom: 'reuse', reuseId: reused.reuseId } : {}),
    });
    if (reused) {
      void this.answerReuse?.recordHit(reused.reuseId);
    } else {
      // A freshly generated, delivered answer becomes a reuse candidate (the
      // service applies the D-C1 filters: cited + confident, no order context).
      void this.answerReuse?.recordAiAnswer({
        tenantId,
        lang: session.language,
        question: egressText,
        answerText: moderated.text,
        confidence: answer.confidence,
        citations: answer.citations,
        sourceMessageId: aiTurn.id,
        needsOrderData: intent.needsOrderData ?? false,
      });
    }

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
   * Search text for this turn: the shopper's earlier questions prepended to the
   * current one (FIX-260806 A2). Retrieval only — the model is still asked the
   * current message alone. A follow-up carries none of the vocabulary its topic
   * is indexed under ("thanks, and recomend my young son." after a skincare
   * question), so searching on it alone scored off-topic and escalated a
   * question the catalogue could answer. PII is scrubbed here too: this text
   * reaches the embedding provider.
   */
  private async retrievalQueryFor(
    conversationId: number,
    currentTurnId: number,
    current: string,
  ): Promise<string> {
    const previous = await this.msgRepo.find({
      where: {
        conversationId,
        senderType: SENDER_TYPE.USER,
        id: LessThan(currentTurnId),
      },
      order: { id: 'DESC' },
      take: RETRIEVAL_CONTEXT_TURNS,
      select: { id: true, body: true },
    });
    if (previous.length === 0) return current;
    const history = previous
      .reverse()
      .map((m) => scrubPii(m.body).text.trim().slice(0, RETRIEVAL_CONTEXT_CHARS))
      .filter(Boolean);
    return [...history, current].join('\n');
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
    stamp?: { issueType?: string; issueLabel?: string },
  ): Promise<HandoffOutcome> {
    // Routing decides both who gets paged and what the customer is told:
    // outside business hours the message goes to a mailbox and the shopper is
    // told to expect an email reply instead of a live agent (PLN-AiSetting W3).
    const route = await this.handoffRouter.route(tenantId, session.language);
    // Off hours the answer travels by email, so we need somewhere to send it.
    // Without an address on file the widget asks for one (PLN-260806) and the
    // notice says so, instead of promising a reply we cannot deliver.
    const needsContactEmail =
      route.mode === 'email' && !(await this.hasContactEmail(tenantId, session));
    const body = needsContactEmail
      ? sysMsg('offHoursNeedEmail', session.language)
      : route.mode === 'email' && route.notice
        ? route.notice
        : sysMsg('handoff', session.language);
    await this.persist(tenantId, conversationId, SENDER_TYPE.SYSTEM, body, session.language, { reason });
    // Preview sandbox: show the real handoff notice but never page the agents —
    // no WAITING flip (the bot keeps answering for iterative testing), no alert
    // fan-out, no console-queue entry.
    if (session.channel === 'preview') return { body, needsContactEmail: false };
    await this.markWaiting(conversationId);
    // Remember how this thread must be answered: an agent replying tomorrow has
    // no one in the widget to read it (see AgentService.sendMessage).
    if (route.mode === 'email') {
      await this.convRepo.update({ id: conversationId }, { replyChannel: 'email' });
    }
    const event: EscalationEvent = {
      tenantId,
      conversationId,
      sessionId: session.id,
      reason,
      preview: preview.slice(0, 300),
      targetUserIds: route.targetUserIds,
      offHoursEmail: route.mode === 'email' ? route.email : undefined,
      issueType: stamp?.issueType,
      issueLabel: stamp?.issueLabel,
    };
    await this.bus.publish(EVENTS.ESCALATION, event);
    return { body, needsContactEmail };
  }

  /**
   * Store the address an off-hours shopper wants their answer sent to
   * (PLN-260806). Runs through the lead path so the erasure-suppression check
   * and encrypted storage apply exactly as they do for an agent-entered
   * address, and binds the session so the reply can find the customer.
   * Consent-gated: collecting an address is processing personal data.
   */
  async saveContactEmail(session: Session, email: string): Promise<{ body: string }> {
    const consent = await this.sessionService.effectiveConsentFor(session.id, session.tenantId);
    if (consent !== CONSENT_STATE.GRANTED) {
      throw new BusinessException(ERROR_CODE.CONSENT_REQUIRED, HttpStatus.FORBIDDEN);
    }
    const tenantId = session.tenantId ?? (await this.resolveTenantId());
    const customer = await this.customerService.createFromLead(tenantId, { email });
    if (session.customerId !== customer.id) {
      await this.sessionRepo.update({ id: session.id }, { customerId: customer.id });
      // The token→session cache would otherwise keep serving the unbound row.
      await this.redis.del(sessionCacheKey(session.sessionToken));
    }
    const conversation = await this.findOpenConversation(session.id);
    const body = sysMsg('contactEmailSaved', session.language);
    if (conversation) {
      await this.persist(tenantId, conversation.id, SENDER_TYPE.SYSTEM, body, session.language);
    }
    return { body };
  }

  /** Do we already hold an address to send this shopper's answer to? */
  private async hasContactEmail(tenantId: number, session: Session): Promise<boolean> {
    if (session.customerId == null) return false;
    return !!(await this.customerService.contactEmail(tenantId, session.customerId));
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
    const tenantId = session.tenantId ?? conversation.tenantId ?? 0;
    // Same routing as the automatic handoff (PLN-AiSetting W3). Off hours the
    // widget's local "connecting you" line would be a lie, so persist the
    // off-hours notice — the conversation poll shows it to the customer.
    const route = await this.handoffRouter.route(tenantId, session.language);
    if (route.mode === 'email' && route.notice) {
      await this.persist(tenantId, conversationId, SENDER_TYPE.SYSTEM, route.notice, session.language, {
        reason: 'user_request',
      });
    }
    await this.markWaiting(conversationId);
    const event: EscalationEvent = {
      tenantId,
      conversationId,
      sessionId: session.id,
      reason: 'user_request',
      preview: (lastUser?.body ?? '').slice(0, 300),
      targetUserIds: route.targetUserIds,
      offHoursEmail: route.mode === 'email' ? route.email : undefined,
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

  /**
   * `tenantId` is passed explicitly rather than left to `TenantSubscriber`'s
   * auto-stamp: the subscriber only fires inside a request's tenant context, so
   * a write from an event consumer — or a widget request whose session token
   * failed to resolve while more than one tenant exists — would land a row with
   * a null tenant_id and silently drop out of every tenant-scoped statistic.
   */
  private async persist(
    tenantId: number | null,
    conversationId: number,
    senderType: string,
    body: string,
    lang: string,
    trace?: unknown,
  ): Promise<Message> {
    return this.msgRepo.save(
      this.msgRepo.create({ tenantId, conversationId, senderType, body, lang, retrievalTrace: trace ?? null }),
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
