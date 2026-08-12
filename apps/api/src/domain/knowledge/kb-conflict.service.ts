import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { AI_FUNCTION, MODERATION_DECISION } from '@ivy/types';
import { DOC_GROUP, KbDocument } from './entity/kb-document.entity';
import {
  CONFLICT_FAILURE,
  CONFLICT_RESOLUTION,
  CONFLICT_STATUS,
  CONFLICT_VERDICT,
  KbConflict,
  MAX_JUDGE_ATTEMPTS,
} from './entity/kb-conflict.entity';
import { QdrantService } from '../../infrastructure/external/vector/qdrant.service';
import { AiGatewayService } from '../../infrastructure/external/ai/ai-gateway.service';
import { ModerationService } from '../moderation/moderation.service';
import { AuditService } from '../audit/audit.service';
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
/** Embedding batch size, matching the KB reindex batching that fixed Voyage 429s. */
const EMBED_BATCH = 64;
/** Keep embedding input well inside voyage-4's context window. */
const EMBED_MAX_CHARS = 4000;

export interface ScanResult {
  scanned: number;
  candidates: number;
  judged: number;
  conflicts: number;
  /** Pairs stored without a verdict because the model never produced one. */
  failed: number;
  /** Judged pairs whose explanation the moderation gate suppressed. */
  withheld: number;
}

/**
 * Outcome of one judgement. A moderation block is a success with the rationale
 * withheld, not a failure — the verdict is an enum and cannot violate a rule.
 */
type Judgement =
  | { ok: true; verdict: string; rationale: string | null; withheld: boolean }
  | { ok: false; reason: string };

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
    private readonly audit: AuditService,
  ) {}

  /**
   * Scan this tenant's active documents for contradicting pairs. Pairs already
   * recorded — in any state, including dismissed — are skipped, so re-running
   * costs nothing and a reviewer's "not a conflict" decision sticks.
   */
  async scan(tenantId: number): Promise<ScanResult> {
    const result: ScanResult = { scanned: 0, candidates: 0, judged: 0, conflicts: 0, failed: 0, withheld: 0 };
    if (!this.qdrant.enabled) {
      this.logger.warn('conflict scan skipped: vector search unavailable');
      return result;
    }

    // Counsel knowledge only. Product documents are near-duplicates by
    // construction — a nail polish in 41 shades sits at ~1.0 similarity with
    // itself, well past CANDIDATE_THRESHOLD — so including them spends the
    // whole per-scan judgement budget on "the same product in another colour"
    // and starves the contradictions this scan exists to find
    // (PLN-260807 P1, measured: 1,038 of 2,275 catalogue rows are variants).
    const docs = await this.docRepo.find({
      where: { tenantId, active: 1, docGroup: Not(DOC_GROUP.PRODUCT) },
    });
    result.scanned = docs.length;
    if (docs.length < 2) return result;

    // Pairs already recorded are skipped — except failed ones still inside the
    // retry budget, which are re-judged and updated in place. Without storing
    // failures at all, the same pairs were re-judged on every scan forever
    // (11 wasted model calls per run, measured on staging).
    const { skip, retryable } = await this.knownPairs(tenantId);
    const byId = new Map(docs.map((d) => [Number(d.id), d]));
    const pairs = new Map<
      string,
      { a: KbDocument; b: KbDocument; score: number; existing?: KbConflict }
    >();

    // Embed in batches, not one call per document: a 230-document knowledge
    // base is 230 requests otherwise, and the adapter deliberately does not
    // retry single-text requests (that guard keeps live chat from stalling
    // behind a rate-limit backoff), so a per-document loop fails en masse the
    // moment the provider throttles.
    let vectors: number[][];
    try {
      vectors = await this.embedDocuments(docs);
    } catch (e) {
      this.logger.warn(`conflict scan aborted: ${(e as Error).message}`);
      return result;
    }

    for (const [index, doc] of docs.entries()) {
      const vector = vectors[index];
      if (!vector) continue;

      const hits = await this.qdrant.search(tenantId, vector, NEIGHBOURS);
      for (const hit of hits) {
        const otherId = Number(hit.id);
        if (otherId === Number(doc.id) || hit.score < CANDIDATE_THRESHOLD) continue;
        const other = byId.get(otherId);
        if (!other) continue; // inactive or another tenant's global doc
        // Only compare within a group. A product description and a refund
        // policy are never the same claim, and letting them pair up floods the
        // review queue the moment a catalogue is imported (PLN-260804 §5).
        if (other.docGroup !== doc.docGroup) continue;

        // Lower id first so a pair is considered once, not once per direction.
        const [a, b] = Number(doc.id) < otherId ? [doc, other] : [other, doc];
        const key = `${a.id}:${b.id}`;
        if (skip.has(key) || pairs.has(key)) continue;
        pairs.set(key, { a, b, score: hit.score, existing: retryable.get(key) });
      }
    }
    result.candidates = pairs.size;

    for (const { a, b, score, existing } of [...pairs.values()].slice(0, MAX_JUDGEMENTS_PER_SCAN)) {
      const judgement = await this.judge(tenantId, a, b);
      const attempts = (existing?.attempts ?? 0) + 1;
      const base = {
        ...(existing ? { id: existing.id } : {}),
        tenantId,
        docAId: Number(a.id),
        docBId: Number(b.id),
        similarity: score,
        attempts,
        lastAttemptAt: new Date(),
      };

      if (!judgement.ok) {
        result.failed += 1;
        await this.conflictRepo.save(
          this.conflictRepo.create({
            ...base,
            verdict: null,
            rationale: null,
            rationaleWithheld: 0,
            status: CONFLICT_STATUS.FAILED,
            failureReason: judgement.reason,
          }),
        );
        continue;
      }

      result.judged += 1;
      if (judgement.verdict === CONFLICT_VERDICT.CONFLICT) result.conflicts += 1;
      if (judgement.withheld) result.withheld += 1;

      await this.conflictRepo.save(
        this.conflictRepo.create({
          ...base,
          verdict: judgement.verdict,
          rationale: judgement.rationale,
          rationaleWithheld: judgement.withheld ? 1 : 0,
          status: CONFLICT_STATUS.PENDING,
          failureReason: null,
        }),
      );
    }
    return result;
  }

  /**
   * Embed every document in batches. A stub-provider result while a real key is
   * configured is a failure, not a usable vector — stub vectors share no space
   * with real ones, so scanning against them would produce meaningless
   * neighbours (same guard as the knowledge index and the statistics job).
   */
  private async embedDocuments(docs: KbDocument[]): Promise<number[][]> {
    const realKeySet = !!process.env.VOYAGE_API_KEY;
    const out: number[][] = [];
    for (let i = 0; i < docs.length; i += EMBED_BATCH) {
      const batch = docs
        .slice(i, i + EMBED_BATCH)
        .map((d) => `${d.title}\n${d.content ?? ''}`.slice(0, EMBED_MAX_CHARS));
      const res = await this.ai.embed(batch, 'document');
      if (realKeySet && res.provider === 'stub') {
        throw new Error('embedder degraded to stub while VOYAGE_API_KEY is set');
      }
      out.push(...res.vectors);
    }
    return out;
  }

  /**
   * Ask the model whether two near-identical documents actually disagree.
   * Returns null when the answer is unusable — an unparseable reply or one the
   * moderation gate blocks — rather than queueing a pair with no explanation.
   */
  private async judge(tenantId: number, a: KbDocument, b: KbDocument): Promise<Judgement> {
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
      this.logger.warn(`conflict judge: model call failed for ${a.id}/${b.id}: ${(e as Error).message}`);
      return { ok: false, reason: CONFLICT_FAILURE.MODEL_ERROR };
    }

    let parsed: { verdict?: string; rationale?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.logger.warn(
        `conflict judge: unparseable response for ${a.id}/${b.id}: "${String(raw).slice(0, 120)}"`,
      );
      return { ok: false, reason: CONFLICT_FAILURE.PARSE_FAIL };
    }
    const allowed: string[] = Object.values(CONFLICT_VERDICT);
    if (!parsed.verdict || !allowed.includes(parsed.verdict)) {
      this.logger.warn(
        `conflict judge: verdict outside the allowed set for ${a.id}/${b.id}: ${JSON.stringify(parsed.verdict)}`,
      );
      return { ok: false, reason: CONFLICT_FAILURE.BAD_VERDICT };
    }

    // The rationale is model-generated text shown in the console, so it still
    // goes through the gate (POL-020). A block withholds the sentence — it does
    // NOT discard the verdict, which is an enum and cannot violate a rule.
    // Doing so lost 11 of 121 judgements on staging over ordinary analytical
    // prose (REQ-260804 §1-1).
    const rationale = (parsed.rationale ?? '').slice(0, 1000);
    const moderated = await this.moderation.moderate({
      tenantId,
      scope: 'ai',
      authorType: 'ai',
      text: rationale,
    });
    if (moderated.decision === MODERATION_DECISION.BLOCKED) {
      this.logger.warn(`conflict judge: rationale withheld by moderation for ${a.id}/${b.id}`);
      return { ok: true, verdict: parsed.verdict, rationale: null, withheld: true };
    }

    return { ok: true, verdict: parsed.verdict, rationale: moderated.text, withheld: false };
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
        rationaleWithheld: r.rationaleWithheld === 1,
        failureReason: r.failureReason,
        attempts: r.attempts,
        retriesLeft: Math.max(MAX_JUDGE_ATTEMPTS - r.attempts, 0),
        lastAttemptAt: r.lastAttemptAt,
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
      // Full text, not a 400-character excerpt: the point of this screen is
      // comparing the two documents, and a contradiction past the cut was
      // invisible. Average is 242 chars, longest 914 — the client collapses
      // anything tall rather than the server truncating it.
      content: doc.content ?? '',
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
    const saved = await this.conflictRepo.save(conflict);
    await this.auditConflict(tenantId, conflict, 'knowledge.conflict_resolved', userId, {
      resolution,
    });
    return saved;
  }

  /** "Not actually a conflict" — kept so the scan does not re-raise the pair. */
  async dismiss(tenantId: number, conflictId: number, userId: number): Promise<KbConflict> {
    const conflict = await this.conflictRepo.findOne({ where: { id: conflictId, tenantId } });
    if (!conflict) throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    conflict.status = CONFLICT_STATUS.DISMISSED;
    conflict.resolvedBy = userId;
    conflict.resolvedAt = new Date();
    const saved = await this.conflictRepo.save(conflict);
    await this.auditConflict(tenantId, conflict, 'knowledge.conflict_dismissed', userId);
    return saved;
  }

  /** Hiding a document because of a conflict is a knowledge change like any
   * other, so it belongs in the same trail as an edit. Best-effort: a logging
   * failure must not undo a decision already written. */
  private async auditConflict(
    tenantId: number,
    conflict: KbConflict,
    action: string,
    userId: number,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      await this.audit.write({
        tenantId,
        actorType: 'user',
        actorId: userId,
        action,
        target: `kb_conflict:${conflict.id}`,
        metadata: { docAId: conflict.docAId, docBId: conflict.docBId, ...metadata },
      });
    } catch (e) {
      this.logger.warn(`conflict audit failed (${action}): ${(e as Error).message}`);
    }
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

  /**
   * Split recorded pairs into "never look at these again" and "failed but still
   * within the retry budget". A reviewer's dismissal must stick, and a pair the
   * model keeps choking on must stop consuming a call on every scan (PLN E5).
   */
  private async knownPairs(
    tenantId: number,
  ): Promise<{ skip: Set<string>; retryable: Map<string, KbConflict> }> {
    const rows = await this.conflictRepo.find({ where: { tenantId } });
    const skip = new Set<string>();
    const retryable = new Map<string, KbConflict>();
    for (const r of rows) {
      const key = `${r.docAId}:${r.docBId}`;
      if (r.status === CONFLICT_STATUS.FAILED && r.attempts < MAX_JUDGE_ATTEMPTS) {
        retryable.set(key, r);
      } else {
        skip.add(key);
      }
    }
    return { skip, retryable };
  }

  /**
   * Re-judge a pair against the documents' current contents, after an edit.
   * Without this a corrected document still showed the old verdict, and the
   * only way to refresh it was a full scan — which re-embeds every document
   * and skips already-recorded pairs anyway.
   */
  async rejudge(tenantId: number, conflictId: number): Promise<KbConflict> {
    return this.retry(tenantId, conflictId);
  }

  /**
   * Re-judge one pair regardless of its attempt budget — the operator asked for
   * it, having presumably fixed whatever caused the failure.
   */
  async retry(tenantId: number, conflictId: number): Promise<KbConflict> {
    const conflict = await this.conflictRepo.findOne({ where: { id: conflictId, tenantId } });
    if (!conflict) throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);

    const [a, b] = await Promise.all([
      this.docRepo.findOne({ where: { id: conflict.docAId, tenantId } }),
      this.docRepo.findOne({ where: { id: conflict.docBId, tenantId } }),
    ]);
    if (!a || !b) throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);

    const judgement = await this.judge(tenantId, a, b);
    conflict.attempts += 1;
    conflict.lastAttemptAt = new Date();
    if (judgement.ok) {
      conflict.verdict = judgement.verdict;
      conflict.rationale = judgement.rationale;
      conflict.rationaleWithheld = judgement.withheld ? 1 : 0;
      conflict.status = CONFLICT_STATUS.PENDING;
      conflict.failureReason = null;
    } else {
      conflict.status = CONFLICT_STATUS.FAILED;
      conflict.failureReason = judgement.reason;
    }
    return this.conflictRepo.save(conflict);
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
