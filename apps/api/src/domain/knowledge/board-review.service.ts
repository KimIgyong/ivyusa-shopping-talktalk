import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MODERATION_DECISION } from '@ivy/types';
import { BOARD_DOC_STATUS, BoardDocument } from '../board/entity/board-document.entity';
import { DOC_GROUP, KbDocument } from './entity/kb-document.entity';
import { CATEGORY_ORIGIN } from './entity/kb-category.entity';
import { REVISION_KIND } from './entity/kb-document-revision.entity';
import { GoldenQuestion } from '../ai-coach/entity/golden-question.entity';
import { KbCategoryService } from './kb-category.service';
import { KbRevisionService } from './kb-revision.service';
import { KnowledgeService } from './knowledge.service';
import { RagService } from '../chat/rag.service';
import { ModerationService } from '../moderation/moderation.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Golden A/B is 2 LLM calls per question — cap what one click can spend. */
const GOLDEN_AB_MAX = 10;

/**
 * Board → KB adoption and pre-adoption simulation (PLN-260829 B2).
 *
 * Lives in the knowledge domain, not the board domain, on purpose: promotion
 * writes kb_documents and simulation runs retrieval — both are knowledge-side
 * capabilities that merely READ a board row, and keeping the dependency arrow
 * one-way (knowledge → board entities) avoids a module cycle.
 */
@Injectable()
export class BoardReviewService {
  private readonly logger = new Logger(BoardReviewService.name);

  constructor(
    @InjectRepository(BoardDocument) private readonly boardRepo: Repository<BoardDocument>,
    @InjectRepository(KbDocument) private readonly kbRepo: Repository<KbDocument>,
    @InjectRepository(GoldenQuestion) private readonly goldenRepo: Repository<GoldenQuestion>,
    private readonly categories: KbCategoryService,
    private readonly revisions: KbRevisionService,
    private readonly knowledge: KnowledgeService,
    private readonly rag: RagService,
    private readonly moderation: ModerationService,
  ) {}

  /**
   * Adopt a published board document into kb_documents (P4-1). Upsert keyed on
   * BRD-{id}, so re-promoting a revised document updates in place and
   * re-embeds — never duplicates.
   */
  async promote(
    tenantId: number,
    boardDocId: number,
    opts: { category?: string },
    actorUserId: number,
  ): Promise<Record<string, unknown>> {
    const doc = await this.boardDoc(tenantId, boardDocId);
    if (![BOARD_DOC_STATUS.PUBLISHED, BOARD_DOC_STATUS.PROMOTED].includes(doc.status as never)) {
      // Draft means the author is not done; rejected means a reviewer said no.
      // Both must pass through published first.
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }

    // KB category mapping: the finer board level wins (2nd, else 1st), unless
    // the reviewer chose one explicitly (P4-1).
    const category = (opts.category?.trim() || doc.category2 || doc.category1).slice(0, 64);
    await this.categories.ensure(tenantId, category, CATEGORY_ORIGIN.MANUAL, doc.docGroup);

    const externalKey = `BRD-${doc.id}`;
    const existing = await this.kbRepo.findOne({
      where: { tenantId, docGroup: doc.docGroup, externalKey },
    });
    let kbDoc: KbDocument;
    if (!existing) {
      kbDoc = await this.kbRepo.save(
        this.kbRepo.create({
          tenantId,
          docGroup: doc.docGroup,
          externalKey,
          source: 'board',
          category,
          title: doc.title,
          content: doc.content,
          sourceUrl: null,
          active: 1,
          status: 'pending',
          embeddingRef: null,
        }),
      );
      await this.revisions.record(tenantId, kbDoc, null, REVISION_KIND.CREATE, actorUserId);
    } else {
      const before = { ...existing } as KbDocument;
      existing.title = doc.title;
      existing.category = category;
      existing.content = doc.content;
      existing.status = 'pending';
      kbDoc = await this.kbRepo.save(existing);
      await this.revisions.record(tenantId, kbDoc, before, REVISION_KIND.UPDATE, actorUserId);
    }

    // Board row first, KB embed last: embedDocuments saves the KB row again,
    // so kb.updated_at ends newer than board.updated_at and the freshly
    // promoted pair does not read as "revision behind" (P4-3).
    doc.status = BOARD_DOC_STATUS.PROMOTED;
    doc.promotedDocumentId = Number(kbDoc.id);
    await this.boardRepo.save(doc);

    const { embedded, failed } = await this.knowledge.embedDocuments([kbDoc]);
    await this.revisions.recordAudit(tenantId, Number(kbDoc.id), 'board.document_promoted', actorUserId, {
      boardDocumentId: Number(doc.id),
      category,
      docGroup: doc.docGroup,
      embedded,
      embedFailed: failed,
    });
    this.logger.log(
      `board doc ${doc.id} promoted → kb ${kbDoc.id} (tenant ${tenantId}, ${doc.docGroup}/${category})`,
    );
    return { kbDocumentId: String(kbDoc.id), category, embedded, embedFailed: failed };
  }

  /** Reviewed and deliberately not adopted (P4-2). */
  async reject(tenantId: number, boardDocId: number, actorUserId: number): Promise<void> {
    const doc = await this.boardDoc(tenantId, boardDocId);
    if (doc.status !== BOARD_DOC_STATUS.PUBLISHED) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }
    doc.status = BOARD_DOC_STATUS.REJECTED;
    await this.boardRepo.save(doc);
    await this.revisions.recordAudit(tenantId, 0, 'board.document_rejected', actorUserId, {
      boardDocumentId: Number(doc.id),
    });
  }

  /**
   * Back to published (P4-2). A promoted document's KB row survives — removing
   * knowledge is an explicit act on the KB screen, not a side effect here.
   */
  async reopen(tenantId: number, boardDocId: number, actorUserId: number): Promise<void> {
    const doc = await this.boardDoc(tenantId, boardDocId);
    if (![BOARD_DOC_STATUS.PROMOTED, BOARD_DOC_STATUS.REJECTED].includes(doc.status as never)) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }
    doc.status = BOARD_DOC_STATUS.PUBLISHED;
    await this.boardRepo.save(doc);
    await this.revisions.recordAudit(tenantId, 0, 'board.document_reopened', actorUserId, {
      boardDocumentId: Number(doc.id),
    });
  }

  /**
   * One-question preview (P4-4): the candidate rides retrieval in its honest
   * rank, the moderation gate still runs, and nothing touches Qdrant.
   */
  async simulate(
    tenantId: number,
    boardDocId: number,
    question: string,
    language = 'KO',
    aiAgentId: number | null = null,
  ): Promise<Record<string, unknown>> {
    const doc = await this.boardDoc(tenantId, boardDocId);
    const res = await this.rag.answer(
      tenantId,
      question,
      language.toUpperCase(),
      undefined,
      undefined,
      undefined,
      aiAgentId,
      [this.candidateOf(doc)],
    );
    const moderated = await this.moderation.moderate({
      tenantId,
      scope: 'ai',
      authorType: 'ai',
      text: res.text,
    });
    const blocked = moderated.decision === MODERATION_DECISION.BLOCKED;
    const candidate = res.candidateResults?.[0] ?? null;
    return {
      answer: blocked ? '' : moderated.text,
      confidence: res.confidence,
      blocked,
      candidateCited: res.citations.some((c) => c.candidate),
      candidateSimilarity: candidate?.similarity ?? null,
      sources: res.citations.map((c) => ({
        id: c.id,
        title: c.title,
        category: c.category,
        similarity: c.similarity,
        snippet: c.snippet,
        candidate: c.candidate === true,
      })),
    };
  }

  /**
   * Golden A/B (P4-5): every active golden question runs WITHOUT and WITH the
   * candidate; the deliverable is Δconfidence and whether the candidate got
   * cited — an improvement measure, not an absolute accuracy verdict.
   */
  async simulateGolden(
    tenantId: number,
    boardDocId: number,
  ): Promise<Record<string, unknown>> {
    const doc = await this.boardDoc(tenantId, boardDocId);
    const questions = await this.goldenRepo.find({
      where: { tenantId, active: 1 },
      order: { id: 'ASC' },
      take: GOLDEN_AB_MAX,
    });
    if (!questions.length) {
      throw new BusinessException(ERROR_CODE.GOLDEN_SET_EMPTY, HttpStatus.BAD_REQUEST);
    }

    const candidate = this.candidateOf(doc);
    const items: Array<Record<string, unknown>> = [];
    for (const q of questions) {
      try {
        const base = await this.rag.answer(tenantId, q.question, q.language);
        const withCand = await this.rag.answer(
          tenantId,
          q.question,
          q.language,
          undefined,
          undefined,
          undefined,
          null,
          [candidate],
        );
        items.push({
          question: q.question,
          language: q.language,
          baseConfidence: base.confidence,
          withConfidence: withCand.confidence,
          delta: Number((withCand.confidence - base.confidence).toFixed(3)),
          candidateCited: withCand.citations.some((c) => c.candidate),
          candidateSimilarity: withCand.candidateResults?.[0]?.similarity ?? null,
        });
      } catch (e) {
        // One bad question must not cost the run (same stance as golden runs).
        this.logger.warn(`golden A/B question failed (tenant ${tenantId}): ${(e as Error).message}`);
        items.push({ question: q.question, language: q.language, failed: true });
      }
    }
    const ok = items.filter((i) => !i.failed);
    const cited = ok.filter((i) => i.candidateCited === true).length;
    const avgDelta = ok.length
      ? Number((ok.reduce((s, i) => s + ((i.delta as number) ?? 0), 0) / ok.length).toFixed(3))
      : 0;
    return { items, summary: { questions: items.length, cited, avgDelta } };
  }

  // ---- internals ----------------------------------------------------------

  private candidateOf(doc: BoardDocument) {
    return {
      title: doc.title,
      content: doc.content ?? '',
      category: doc.category2 || doc.category1,
      group: doc.docGroup || DOC_GROUP.COUNSEL,
    };
  }

  private async boardDoc(tenantId: number, id: number): Promise<BoardDocument> {
    const doc = await this.boardRepo.findOne({ where: { id, tenantId } });
    if (!doc) throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    return doc;
  }
}
