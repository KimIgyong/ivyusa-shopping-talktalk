import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { AI_FUNCTION, MODERATION_DECISION } from '@ivy/types';
import { AiGatewayService } from '../../infrastructure/external/ai/ai-gateway.service';
import { ModerationService } from '../moderation/moderation.service';
import { RagService } from '../chat/rag.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { Message } from '../chat/entity/message.entity';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { scrubPii } from '../../global/util/pii-scrub.util';
import { CoachingThread, COACHING_THREAD_STATUS } from './entity/coaching-thread.entity';
import { CoachingMessage, COACHING_ROLE, CoachingMessageMeta } from './entity/coaching-message.entity';
import { CoachingProposal } from './entity/coaching-proposal.entity';
import { CoachContextService } from './coach-context.service';
import { CoachProposalService } from './coach-proposal.service';

/** Retrieval depth for the coach's own KB lookup — matches the RAG default. */
const COACH_KB_LIMIT = 4;

export interface CoachTurnResult {
  message: CoachingMessage;
  proposals: CoachingProposal[];
}

/**
 * Admin↔agent coaching channel (FR-071). The agent runs here in a meta mode: it
 * sees its own configuration, explains past answers from stored retrieval
 * facts, and proposes config diffs that a human must approve.
 */
@Injectable()
export class AiCoachService {
  private readonly logger = new Logger(AiCoachService.name);

  constructor(
    @InjectRepository(CoachingThread) private readonly threadRepo: Repository<CoachingThread>,
    @InjectRepository(CoachingMessage) private readonly msgRepo: Repository<CoachingMessage>,
    @InjectRepository(Message) private readonly chatMsgRepo: Repository<Message>,
    private readonly ai: AiGatewayService,
    private readonly moderation: ModerationService,
    private readonly rag: RagService,
    private readonly knowledge: KnowledgeService,
    private readonly context: CoachContextService,
    private readonly proposals: CoachProposalService,
  ) {}

  // ---- threads ----

  async listThreads(tenantId: number, page: number, size: number): Promise<{ items: CoachingThread[]; total: number }> {
    const [items, total] = await this.threadRepo.findAndCount({
      where: { tenantId, status: COACHING_THREAD_STATUS.OPEN },
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    return { items, total };
  }

  async createThread(tenantId: number, userId: number, title?: string): Promise<CoachingThread> {
    return this.threadRepo.save(
      this.threadRepo.create({
        tenantId,
        userId,
        title: title?.trim().slice(0, 200) || null,
        status: COACHING_THREAD_STATUS.OPEN,
      }),
    );
  }

  /**
   * Threads are visible to every AI_SETTINGS_MANAGE holder in the tenant, not
   * just their author: the configuration they change is shared, so the record
   * of why it changed has to be shared too.
   */
  private async findThread(tenantId: number, threadId: number): Promise<CoachingThread> {
    const thread = await this.threadRepo.findOne({ where: { id: threadId, tenantId } });
    if (!thread) {
      throw new BusinessException(ERROR_CODE.COACH_THREAD_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    return thread;
  }

  async getThread(
    tenantId: number,
    threadId: number,
  ): Promise<{ thread: CoachingThread; messages: CoachingMessage[]; proposals: CoachingProposal[] }> {
    const thread = await this.findThread(tenantId, threadId);
    const [messages, proposals] = await Promise.all([
      this.msgRepo.find({ where: { tenantId, threadId }, order: { id: 'ASC' } }),
      this.proposals.listForThread(tenantId, threadId),
    ]);
    return { thread, messages, proposals };
  }

  async archiveThread(tenantId: number, threadId: number): Promise<void> {
    const thread = await this.findThread(tenantId, threadId);
    thread.status = COACHING_THREAD_STATUS.ARCHIVED;
    await this.threadRepo.save(thread);
  }

  // ---- turns ----

  /**
   * The customer turn under discussion, resolved to plain facts. Everything
   * returned here comes out of the stored row — the confidence and citations
   * the pipeline actually recorded — so the coach explains the answer from
   * evidence rather than from introspection (REQ §3.5).
   */
  private async loadRefTurn(tenantId: number, messageId: number): Promise<CoachingMessageMeta['refTurn']> {
    const aiMsg = await this.chatMsgRepo.findOne({ where: { id: messageId, tenantId } });
    if (!aiMsg) return undefined;

    const question = await this.chatMsgRepo.findOne({
      where: { conversationId: aiMsg.conversationId, senderType: 'user', id: LessThan(aiMsg.id) },
      order: { id: 'DESC' },
    });

    const trace = (aiMsg.retrievalTrace ?? {}) as {
      confidence?: number;
      citations?: Array<{ id?: unknown; title?: unknown; similarity?: unknown }>;
    };

    return {
      messageId: Number(aiMsg.id),
      question: question?.body ?? '(question not found)',
      answer: aiMsg.body,
      confidence: typeof trace.confidence === 'number' ? trace.confidence : null,
      citations: (trace.citations ?? []).map((c) => ({
        id: Number(c.id ?? 0),
        title: String(c.title ?? ''),
        similarity: typeof c.similarity === 'number' ? c.similarity : null,
      })),
    };
  }

  async sendTurn(params: {
    tenantId: number;
    userId: number;
    threadId: number;
    text: string;
    refMessageId?: number;
  }): Promise<CoachTurnResult> {
    const thread = await this.findThread(params.tenantId, params.threadId);

    // Admins paste customer transcripts into coaching; masking on the way in
    // keeps this internal table out of scope for customer PII handling.
    const { text: cleanText } = scrubPii(params.text.trim());

    const refTurn = params.refMessageId
      ? await this.loadRefTurn(params.tenantId, params.refMessageId)
      : undefined;

    const userMsg = await this.msgRepo.save(
      this.msgRepo.create({
        tenantId: params.tenantId,
        threadId: thread.id,
        role: COACHING_ROLE.USER,
        body: cleanText,
        meta: refTurn ? { refTurn } : null,
      }),
    );

    // First message names the thread, so the picker is readable without the
    // admin having to title anything.
    if (!thread.title) {
      thread.title = cleanText.slice(0, 60);
    }
    thread.updatedAt = new Date();
    await this.threadRepo.save(thread);

    const history = await this.msgRepo.find({
      where: { tenantId: params.tenantId, threadId: thread.id, id: LessThan(userMsg.id) },
      order: { id: 'ASC' },
    });

    // Retrieval tells a knowledge gap ("no document covers this") apart from a
    // wording problem ("the document is right, the tone is not") — the two need
    // opposite fixes, and only one of them is a rule.
    const chunks = await this.rag.retrieve(params.tenantId, cleanText, COACH_KB_LIMIT);
    const citations = chunks.map((c) => ({
      id: Number(c.id),
      title: c.title,
      similarity: c.similarity,
    }));
    // The id is what makes a revision proposal possible — see kbBlock.
    const snippets = chunks.map(
      (c) => `- [docId=${Number(c.id)}] [${c.category ?? 'general'}] ${c.title}: ${c.snippet}`,
    );
    const categories = (await this.knowledge.categoryCounts(params.tenantId))
      .map((c) => c.category)
      .filter((c): c is string => !!c);

    const ctx = await this.context.build({
      tenantId: params.tenantId,
      history,
      question: cleanText,
      citations,
      snippets,
      categories,
      refTurn,
    });

    const completion = await this.ai.complete({
      tenantId: params.tenantId,
      function: AI_FUNCTION.COACH,
      system: ctx.system,
      messages: ctx.messages,
    });

    const { body, proposals: parsed } = this.proposals.extract(completion.text);

    // The moderation gate is non-bypassable for every AI output (FR-069 /
    // POL-020). A block is reported rather than hidden — following the
    // knowledge Ask console — because "this wording would be blocked" is itself
    // the diagnostic an admin came here for.
    const moderated = await this.moderation.moderate({
      tenantId: params.tenantId,
      scope: 'ai',
      authorType: 'ai',
      text: body,
    });
    const blocked = moderated.decision === MODERATION_DECISION.BLOCKED;

    const agentMsg = await this.msgRepo.save(
      this.msgRepo.create({
        tenantId: params.tenantId,
        threadId: thread.id,
        role: COACHING_ROLE.AGENT,
        body: blocked ? '' : moderated.text,
        meta: { citations, blocked, provider: completion.provider },
      }),
    );

    // A blocked reply keeps its proposals out of the review queue: they were
    // drafted in the same breath as text the moderation rules rejected.
    const saved = blocked
      ? []
      : await this.proposals.persist(params.tenantId, thread.id, Number(agentMsg.id), parsed);

    return { message: agentMsg, proposals: saved };
  }
}
