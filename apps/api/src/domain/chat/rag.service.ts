import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { AI_FUNCTION } from '@ivy/types';
import { KbDocument } from '../knowledge/entity/kb-document.entity';
import { AiGatewayService } from '../../infrastructure/external/ai/ai-gateway.service';
import { QdrantService } from '../../infrastructure/external/vector/qdrant.service';
import { AiConfigService } from '../ai-engine/ai-config.service';

export interface RetrievedChunk {
  id: number;
  title: string;
  category: string | null;
  source: string;
  snippet: string;
  /** Dense similarity (dot, normalized vectors) when the vector leg saw this doc. */
  similarity: number | null;
}

export interface RagAnswer {
  text: string;
  confidence: number;
  citations: RetrievedChunk[];
  tokensIn: number;
  tokensOut: number;
}

/**
 * Confidence floor when the answer is grounded in the customer's own order data.
 * Must stay above ChatService's escalation threshold so a factual order answer is
 * delivered rather than handed off for lack of a matching help article.
 */
const ORDER_CONTEXT_CONFIDENCE = 0.6;

/**
 * Retrieval-Augmented answering (FN-016/017, POL-011/013,
 * PLAN-KB-VectorHybrid-Qdrant W4). Hybrid retrieval: MySQL FULLTEXT (exact
 * keyword leg) + Qdrant dense vectors (semantic leg, cross-lingual ko/en/es),
 * merged with Reciprocal Rank Fusion. Only designated + active KB documents
 * scoped to the tenant are retrieved (Knowledge Store wins; Google Drive
 * supplements). The vector leg degrades silently — Qdrant/embedder failures
 * fall back to FULLTEXT-only, which is the pre-hybrid behavior.
 *
 * An answer may additionally be grounded in the signed-in customer's own order
 * facts, which no KB document can contain — see `answer`'s `orderContext`.
 */
@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  /** Per-leg candidate depth before fusion; the merged top-`limit` is returned. */
  private static readonly LEG_LIMIT = 8;
  /** RRF constant (standard k=60). */
  private static readonly RRF_K = 60;
  /** POL-013 nudge: knowledge_store outranks google_drive on near-ties. */
  private static readonly SOURCE_BONUS = 0.0005;
  private static readonly SNIPPET_CHARS = 800;
  /**
   * Vector hits below this dot score are discarded. Qdrant always returns the
   * nearest neighbors, so without a floor an off-topic query pads the context
   * with irrelevant docs and suppresses escalation. Near-zero cutoff is safe
   * for both voyage (unrelated ≈ 0.3+) and the stub (zero-overlap = 0).
   */
  private static readonly VECTOR_SCORE_FLOOR = 0.01;

  constructor(
    @InjectRepository(KbDocument) private readonly kbRepo: Repository<KbDocument>,
    private readonly ai: AiGatewayService,
    private readonly qdrant: QdrantService,
    private readonly aiConfig: AiConfigService,
  ) {}

  async retrieve(tenantId: number, query: string, limit = 4): Promise<RetrievedChunk[]> {
    return (await this.retrieveHybrid(tenantId, query, limit)).chunks;
  }

  private async retrieveHybrid(
    tenantId: number,
    query: string,
    limit = 4,
  ): Promise<{ chunks: RetrievedChunk[]; vectorProvider: string | null }> {
    const [ftDocs, vec] = await Promise.all([
      this.retrieveFulltext(tenantId, query, RagService.LEG_LIMIT),
      this.retrieveVector(tenantId, query, RagService.LEG_LIMIT),
    ]);
    // Uncalibrated (stub) vector scores may RANK docs but never ADMIT them:
    // hash-collision noise would otherwise pad off-topic queries with random
    // documents and suppress escalation. Real embeddings (voyage) admit freely —
    // that cross-lingual/semantic admission is the point of the vector leg.
    const ftIds = new Set(ftDocs.map((d) => Number(d.id)));
    const vecHits =
      vec.provider === 'voyage' ? vec.hits : vec.hits.filter((h) => ftIds.has(h.id));

    // RRF over the two legs; similarity rides along from the vector hits.
    // Number() on every doc id: MySQL bigint PKs are strings at runtime, and a
    // string-keyed map entry would never fuse with the numeric Qdrant ids.
    const fused = new Map<number, { rrf: number; similarity: number | null }>();
    ftDocs.forEach((d, rank) => {
      const id = Number(d.id);
      const e = fused.get(id) ?? { rrf: 0, similarity: null };
      e.rrf += 1 / (RagService.RRF_K + rank + 1);
      fused.set(id, e);
    });
    vecHits.forEach((h, rank) => {
      const e = fused.get(h.id) ?? { rrf: 0, similarity: null };
      e.rrf += 1 / (RagService.RRF_K + rank + 1);
      e.similarity = h.score;
      fused.set(h.id, e);
    });

    // Hydrate vector-only ids from MySQL (tenant scope re-checked — defense in depth).
    const ftById = new Map(ftDocs.map((d) => [Number(d.id), d]));
    const missingIds = [...fused.keys()].filter((id) => !ftById.has(id));
    if (missingIds.length) {
      const rows = await this.baseQuery(tenantId)
        .andWhere({ id: In(missingIds) })
        .getMany();
      rows.forEach((d) => ftById.set(Number(d.id), d));
    }

    const ranked = [...fused.entries()]
      .map(([id, e]) => ({ doc: ftById.get(id), ...e }))
      .filter((e): e is { doc: KbDocument; rrf: number; similarity: number | null } => !!e.doc)
      .map((e) => ({
        ...e,
        rrf: e.rrf + (e.doc.source === 'knowledge_store' ? RagService.SOURCE_BONUS : 0),
      }))
      .sort((a, b) => b.rrf - a.rrf)
      .slice(0, limit);

    const chunks = ranked.map(({ doc, similarity }) => ({
      id: Number(doc.id),
      title: doc.title,
      category: doc.category,
      source: doc.source,
      snippet: (doc.content ?? '').slice(0, RagService.SNIPPET_CHARS),
      similarity,
    }));
    return { chunks, vectorProvider: vec.provider };
  }

  /** Keyword leg — FULLTEXT MATCH (PERF-2), LIKE scan when the index is absent. */
  private async retrieveFulltext(
    tenantId: number,
    query: string,
    limit: number,
  ): Promise<KbDocument[]> {
    const terms = query
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1)
      .slice(0, 8);

    if (!terms.length) {
      return this.baseQuery(tenantId)
        .orderBy("CASE WHEN kb.source = 'knowledge_store' THEN 0 ELSE 1 END", 'ASC')
        .addOrderBy('kb.updatedAt', 'DESC')
        .take(limit)
        .getMany();
    }
    try {
      return await this.baseQuery(tenantId)
        .addSelect('MATCH(kb.title, kb.content) AGAINST (:ftq IN NATURAL LANGUAGE MODE)', 'relevance')
        .andWhere('MATCH(kb.title, kb.content) AGAINST (:ftq IN NATURAL LANGUAGE MODE)')
        .setParameter('ftq', terms.join(' '))
        .orderBy("CASE WHEN kb.source = 'knowledge_store' THEN 0 ELSE 1 END", 'ASC')
        .addOrderBy('relevance', 'DESC')
        .take(limit)
        .getMany();
    } catch {
      // FULLTEXT index not present yet (pre-migration DB) — legacy LIKE scan.
      return this.retrieveLike(tenantId, terms, limit);
    }
  }

  /** Semantic leg — embed the query, dense-search Qdrant. Failures return no hits. */
  private async retrieveVector(
    tenantId: number,
    query: string,
    limit: number,
  ): Promise<{ hits: { id: number; score: number }[]; provider: string | null }> {
    if (!this.qdrant.enabled) return { hits: [], provider: null };
    try {
      const emb = await this.ai.embed([query], 'query');
      const hits = await this.qdrant.search(tenantId, emb.vectors[0], limit);
      return {
        hits: hits.filter((h) => h.score >= RagService.VECTOR_SCORE_FLOOR),
        provider: emb.provider,
      };
    } catch (e) {
      this.logger.warn(`vector leg failed, FULLTEXT only: ${(e as Error).message}`);
      return { hits: [], provider: null };
    }
  }

  private baseQuery(tenantId: number) {
    return this.kbRepo
      .createQueryBuilder('kb')
      .where('kb.active = 1')
      .andWhere('(kb.tenantId = :tenantId OR kb.tenantId IS NULL)', { tenantId });
  }

  /** Legacy keyword scan — only used when the FULLTEXT index is unavailable. */
  private async retrieveLike(tenantId: number, terms: string[], limit: number): Promise<KbDocument[]> {
    const qb = this.baseQuery(tenantId).andWhere(
      new Brackets((b) => {
        terms.forEach((term, i) => {
          b.orWhere(`LOWER(kb.title) LIKE :t${i}`, { [`t${i}`]: `%${term}%` });
          b.orWhere(`LOWER(kb.content) LIKE :c${i}`, { [`c${i}`]: `%${term}%` });
        });
      }),
    );
    return qb
      .orderBy("CASE WHEN kb.source = 'knowledge_store' THEN 0 ELSE 1 END", 'ASC')
      .addOrderBy('kb.updatedAt', 'DESC')
      .take(limit)
      .getMany();
  }

  /**
   * Answer a shopper question from the tenant's knowledge base, optionally
   * grounded in `orderContext` — the signed-in customer's own order facts, which
   * the knowledge base cannot contain. Callers must only pass order data for an
   * authenticated session (see ChatService's auth gate).
   */
  async answer(
    tenantId: number,
    query: string,
    language: string,
    orderContext?: string,
  ): Promise<RagAnswer> {
    const { chunks, vectorProvider } = await this.retrieveHybrid(tenantId, query);
    const context = chunks.map((c) => `- [${c.category ?? 'general'}] ${c.title}: ${c.snippet}`).join('\n');
    const hasOrderContext = !!orderContext?.trim();
    // Retrieval quality drives confidence, but order facts are authoritative on
    // their own: an order question answered from the customer's real orders must
    // not be escalated just because no help article matched.
    const confidence = Math.max(
      this.confidence(chunks, vectorProvider),
      hasOrderContext ? ORDER_CONTEXT_CONFIDENCE : 0,
    );

    // Persona + response rules from the tenant's AI config (FR-047 / FN-040).
    const { persona, rules } = await this.aiConfig.getPersonaRules(tenantId);
    const rulesBlock = rules.length ? `\nResponse rules:\n${rules.map((r) => `- ${r}`).join('\n')}` : '';
    const orderBlock = hasOrderContext
      ? `\nCUSTOMER_ORDERS_START\n${orderContext!.trim()}\nCUSTOMER_ORDERS_END`
      : '';
    const sourceRule = hasOrderContext
      ? "Answer ONLY from the context and the customer's own order data below. " +
        'The order data is authoritative for their order status, items and totals; ' +
        'never invent order numbers, dates or tracking details that are not listed.'
      : 'Answer ONLY from the context.';

    const res = await this.ai.complete({
      tenantId,
      function: AI_FUNCTION.RAG,
      system:
        `${persona}${rulesBlock}\n` +
        `${sourceRule} If the information is insufficient, say you'll connect a ` +
        `human agent. Reply in language code: ${language}.\n` +
        `CONTEXT_START\n${context || '(no relevant documents found)'}\nCONTEXT_END` +
        orderBlock,
      messages: [{ role: 'user', content: query }],
    });

    return {
      text: res.text,
      confidence,
      citations: chunks,
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
    };
  }

  /**
   * Similarity-based confidence (replaces the hit-count formula). The best
   * dense similarity IS the grounding signal: below RAG_MIN_SIMILARITY the
   * retrieval is judged off-topic and confidence drops to 0.2, which is under
   * the chat escalation threshold — "don't know → hand off" (policy §0.4).
   * Applied only for calibrated real embeddings (voyage): stub pseudo-vector
   * scores live on a different scale, and when the vector leg didn't run at
   * all (Qdrant disabled/down) there is no similarity — both cases fall back
   * to the legacy count-based estimate, i.e. the pre-hybrid behavior.
   */
  private confidence(chunks: RetrievedChunk[], vectorProvider: string | null): number {
    const best = chunks.reduce<number | null>(
      (m, c) => (c.similarity !== null && (m === null || c.similarity > m) ? c.similarity : m),
      null,
    );
    if (vectorProvider === 'voyage' && best !== null) {
      const minSim = Number(process.env.RAG_MIN_SIMILARITY ?? '0.5');
      return best >= minSim ? Math.min(0.95, Math.max(0.5, best)) : 0.2;
    }
    return chunks.length ? Math.min(0.95, 0.5 + chunks.length * 0.12) : 0.2;
  }

  async classifyIntent(
    tenantId: number,
    query: string,
  ): Promise<{ intent: string; needsOrderData: boolean; confidence: number }> {
    const res = await this.ai.complete({
      tenantId,
      function: AI_FUNCTION.CHAT,
      system:
        'JSON_MODE:intent. Classify the shopper message. Return ' +
        '{"intent":string,"needsOrderData":boolean,"confidence":number}.',
      messages: [{ role: 'user', content: query }],
    });
    try {
      return JSON.parse(res.text);
    } catch {
      return { intent: 'product_inquiry', needsOrderData: false, confidence: 0.5 };
    }
  }
}
