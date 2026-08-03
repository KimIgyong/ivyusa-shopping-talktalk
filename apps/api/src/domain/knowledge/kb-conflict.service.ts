import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AI_FUNCTION, MODERATION_DECISION } from '@ivy/types';
import { KbDocument } from './entity/kb-document.entity';
import {
  CONFLICT_RESOLUTION,
  CONFLICT_STATUS,
  CONFLICT_VERDICT,
  KbConflict,
} from './entity/kb-conflict.entity';
import { QdrantService } from '../../infrastructure/external/vector/qdrant.service';
import { AiGatewayService } from '../../infrastructure/external/ai/ai-gateway.service';
import { ModerationService } from '../moderation/moderation.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/**
 * Similarity at or above which two documents are worth judging. Below this they
 * are simply about different things; embeddings alone cannot tell agreement
 * from contradiction, which is what the model pass is for.
 */
const CANDIDATE_THRESHOLD = 0.85;
/** Neighbours fetched per document — the pair is near-duplicate or it is not. */
const NEIGHBOURS = 5;
/** Excerpt length per side sent to the judge. Enough for figures and conditions. */
const EXCERPT_CHARS = 1200;
/** Ceiling on model calls per scan, so a large KB cannot run away. */
const MAX_JUDGEMENTS_PER_SCAN = 40;

export interface ScanResult {
  scanned: number;
  candidates: number;
  judged: number;
  conflicts: number;
}

/**
 * Knowledge conflict detection (PLN D5), in three stages:
 *   1. vector similarity narrows the field to near-duplicate pairs,
 *   2. the model judges whether they actually contradict each other,
 *   3. a person decides which one to follow.
 *
 * Stage 2 exists because similarity cannot distinguish "says the same thing"
 * from "says the opposite": "free shipping over $29.99" and "free shipping over
 * $19.99" are near-identical vectors and mutually exclusive facts.
 */
@Injectable()
export class KbConflictService {
  private readonly logger = new Logger(KbConflictService.name);

  constructor(
    @InjectRepository(KbDocument) private readonly docRepo: Repository<KbDocument>,
    @InjectRepository(KbConflict) private readonly conflictRepo: Repository<KbConflict>,
    private readonly qdrant: QdrantService,
    private readonly ai: AiGatewayService,
    private readonly moderation: ModerationService,
  ) {}

  /**
   * Scan this tenant's active documents for contradicting pairs. Pairs already
   * recorded — in any state, including dismissed — are skipped, so re-running
   * costs nothing and a reviewer's "not a conflict" decision sticks.
   */
  async scan(tenantId: number): Promise<ScanResult> {
    const result: ScanResult = { scanned: 0, candidates: 0, judged: 0, conflicts: 0 };
    if (!this.qdrant.enabled) {
      this.logger.warn('conflict scan skipped: vector search unavailable');
      return result;
    }

    const docs = await this.docRepo.find({ where: { tenantId, active: 1 } });
    result.scanned = docs.length;
    if (docs.length < 2) return result;

    const known = await this.knownPairs(tenantId);
    const byId = new Map(docs.map((d) => [Number(d.id), d]));
    const pairs = new Map<string, { a: KbDocument; b: KbDocument; score: number }>();

    for (const doc of docs) {
      let vector: number[];
      try {
        const emb = await this.ai.embed([`${doc.title}\n${doc.content ?? ''}`.slice(0, 4000)], 'document');
        vector = emb.vectors[0];
      } catch (e) {
        this.logger.warn(`conflict scan: embed failed for doc ${doc.id}: ${(e as Error).message}`);
        continue;
      }

      const hits = await this.qdrant.search(tenantId, vector, NEIGHBOURS);
      for (const hit of hits) {
        const otherId = Number(hit.id);
        if (otherId === Number(doc.id) || hit.score < CANDIDATE_THRESHOLD) continue;
        const other = byId.get(otherId);
        if (!other) continue; // inactive or another tenant's global doc

        // Lower id first so a pair is considered once, not once per direction.
        const [a, b] = Number(doc.id) < otherId ? [doc, other] : [other, doc];
        const key = `${a.id}:${b.id}`;
        if (known.has(key) || pairs.has(key)) continue;
        pairs.set(key, { a, b, score: hit.score });
      }
    }
    result.candidates = pairs.size;

    for (const { a, b, score } of [...pairs.values()].slice(0, MAX_JUDGEMENTS_PER_SCAN)) {
      const judgement = await this.judge(tenantId, a, b);
      if (!judgement) continue;
      result.judged += 1;
      if (judgement.verdict === CONFLICT_VERDICT.CONFLICT) result.conflicts += 1;

      await this.conflictRepo.save(
        this.conflictRepo.create({
          tenantId,
          docAId: Number(a.id),
          docBId: Number(b.id),
          similarity: score,
          verdict: judgement.verdict,
          rationale: judgement.rationale,
          status: CONFLICT_STATUS.PENDING,
        }),
      );
    }
    return result;
  }

  /**
   * Ask the model whether two near-identical documents actually disagree.
   * Returns null when the answer is unusable — an unparseable reply or one the
   * moderation gate blocks — rather than queueing a pair with no explanation.
   */
  private async judge(
    tenantId: number,
    a: KbDocument,
    b: KbDocument,
  ): Promise<{ verdict: string; rationale: string } | null> {
    const excerpt = (d: KbDocument) => `${d.title}\n${(d.content ?? '').slice(0, EXCERPT_CHARS)}`;
    let raw: string;
    try {
      const res = await this.ai.complete({
        tenantId,
        function: AI_FUNCTION.CHAT,
        system:
          'JSON_MODE:kb_conflict. Two knowledge base documents are given. Decide whether they ' +
          'contradict each other on any fact, figure, threshold or condition. Return ' +
          '{"verdict":"conflict"|"duplicate"|"complementary","rationale":string}. ' +
          '"conflict" = they state incompatible facts. "duplicate" = same meaning, redundant. ' +
          '"complementary" = related but not contradictory. Keep rationale to one sentence ' +
          'and name the specific difference.',
        messages: [{ role: 'user', content: `[A]\n${excerpt(a)}\n\n[B]\n${excerpt(b)}` }],
        temperature: 0,
      });
      raw = res.text;
    } catch (e) {
      this.logger.warn(`conflict judge failed for ${a.id}/${b.id}: ${(e as Error).message}`);
      return null;
    }

    let parsed: { verdict?: string; rationale?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      // The stub adapter and a rate-limited provider both land here; a pair
      // with no verdict is worse than no row at all.
      return null;
    }
    const allowed: string[] = Object.values(CONFLICT_VERDICT);
    if (!parsed.verdict || !allowed.includes(parsed.verdict)) return null;

    // The rationale is model-generated text shown in the console, so it goes
    // through the same non-bypassable gate as any other AI output (POL-020).
    const rationale = (parsed.rationale ?? '').slice(0, 1000);
    const moderated = await this.moderation.moderate({
      tenantId,
      scope: 'ai',
      authorType: 'ai',
      text: rationale,
    });
    if (moderated.decision === MODERATION_DECISION.BLOCKED) return null;

    return { verdict: parsed.verdict, rationale: moderated.text };
  }

  /** Pending/resolved pairs with both documents hydrated for the review screen. */
  async list(
    tenantId: number,
    status: string | undefined,
    page: number,
    size: number,
  ): Promise<{ items: Array<Record<string, unknown>>; total: number }> {
    const qb = this.conflictRepo
      .createQueryBuilder('c')
      .where('c.tenant_id = :tenantId', { tenantId });
    if (status) qb.andWhere('c.status = :status', { status });
    qb.orderBy('c.similarity', 'DESC')
      .addOrderBy('c.id', 'DESC')
      .skip((page - 1) * size)
      .take(size);
    const [rows, total] = await qb.getManyAndCount();

    const ids = rows.flatMap((r) => [Number(r.docAId), Number(r.docBId)]);
    const docs = ids.length
      ? await this.docRepo.find({ where: { id: In([...new Set(ids)]) } })
      : [];
    const byId = new Map(docs.map((d) => [String(d.id), d]));

    return {
      items: rows.map((r) => ({
        id: r.id,
        similarity: r.similarity,
        verdict: r.verdict,
        rationale: r.rationale,
        status: r.status,
        resolution: r.resolution,
        detectedAt: r.detectedAt,
        resolvedAt: r.resolvedAt,
        docA: this.summarize(byId.get(String(r.docAId))),
        docB: this.summarize(byId.get(String(r.docBId))),
      })),
      total,
    };
  }

  /** The side-by-side card's view of a document: identity, provenance, age. */
  private summarize(doc?: KbDocument): Record<string, unknown> | null {
    if (!doc) return null;
    return {
      id: doc.id,
      title: doc.title,
      category: doc.category,
      source: doc.source,
      sourceUrl: doc.sourceUrl,
      excerpt: (doc.content ?? '').slice(0, 400),
      effectiveFrom: doc.effectiveFrom,
      updatedAt: doc.updatedAt,
      reviewedAt: doc.reviewedAt,
      active: doc.active === 1,
      stale: isStale(doc),
    };
  }

  /**
   * Record the reviewer's decision. Choosing a side hides the other and marks
   * it superseded — visibility is what the retriever already honours, so the
   * decision changes answers rather than only the console (PLN D6).
   */
  async resolve(
    tenantId: number,
    conflictId: number,
    resolution: string,
    userId: number,
  ): Promise<KbConflict> {
    const conflict = await this.conflictRepo.findOne({ where: { id: conflictId, tenantId } });
    if (!conflict) throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);

    const allowed: string[] = Object.values(CONFLICT_RESOLUTION);
    if (!allowed.includes(resolution)) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }

    if (resolution !== CONFLICT_RESOLUTION.KEPT_BOTH) {
      const keptId = resolution === CONFLICT_RESOLUTION.KEPT_A ? conflict.docAId : conflict.docBId;
      const hiddenId = resolution === CONFLICT_RESOLUTION.KEPT_A ? conflict.docBId : conflict.docAId;
      await this.docRepo.update({ id: hiddenId, tenantId }, { active: 0, supersededBy: keptId });
    }

    conflict.status = CONFLICT_STATUS.RESOLVED;
    conflict.resolution = resolution;
    conflict.resolvedBy = userId;
    conflict.resolvedAt = new Date();
    return this.conflictRepo.save(conflict);
  }

  /** "Not actually a conflict" — kept so the scan does not re-raise the pair. */
  async dismiss(tenantId: number, conflictId: number, userId: number): Promise<KbConflict> {
    const conflict = await this.conflictRepo.findOne({ where: { id: conflictId, tenantId } });
    if (!conflict) throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    conflict.status = CONFLICT_STATUS.DISMISSED;
    conflict.resolvedBy = userId;
    conflict.resolvedAt = new Date();
    return this.conflictRepo.save(conflict);
  }

  /** Conflicts touching any of these documents — used to flag QA answer sources. */
  async forDocuments(tenantId: number, documentIds: number[]): Promise<Set<number>> {
    if (documentIds.length === 0) return new Set();
    const rows = await this.conflictRepo.find({
      where: [
        { tenantId, status: CONFLICT_STATUS.PENDING, docAId: In(documentIds) },
        { tenantId, status: CONFLICT_STATUS.PENDING, docBId: In(documentIds) },
      ],
    });
    const flagged = new Set<number>();
    for (const r of rows) {
      flagged.add(Number(r.docAId));
      flagged.add(Number(r.docBId));
    }
    return flagged;
  }

  private async knownPairs(tenantId: number): Promise<Set<string>> {
    const rows = await this.conflictRepo.find({
      where: { tenantId },
      select: ['docAId', 'docBId'],
    });
    return new Set(rows.map((r) => `${r.docAId}:${r.docBId}`));
  }
}

/**
 * Whether a document is past its review date. Falls back to `updatedAt` when
 * the document has never been reviewed — a document nobody has revisited since
 * it was written is exactly the case worth flagging.
 */
export function isStale(doc: KbDocument, now: Date = new Date()): boolean {
  if (!doc.reviewIntervalDays || doc.reviewIntervalDays <= 0) return false;
  const anchor = doc.reviewedAt ?? doc.updatedAt;
  if (!anchor) return false;
  const due = new Date(anchor);
  due.setDate(due.getDate() + doc.reviewIntervalDays);
  return due.getTime() < now.getTime();
}
