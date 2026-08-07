import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { AI_FUNCTION } from '@ivy/types';
import { KbDocument } from '../knowledge/entity/kb-document.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { normalizeStorefrontUrl, productLinkFor } from '../../global/util/storefront-url.util';
import { AiGatewayService } from '../../infrastructure/external/ai/ai-gateway.service';
import { QdrantService } from '../../infrastructure/external/vector/qdrant.service';
import { AiConfigService } from '../ai-engine/ai-config.service';

export interface RetrievedChunk {
  id: number;
  title: string;
  category: string | null;
  source: string;
  /** counsel | product — lets the widget label product recommendations. */
  group: string;
  /**
   * Customer-facing link, or null. Only set for product documents whose
   * source_url is on the tenant's own storefront: the value arrives in an
   * operator-uploaded CSV and the widget turns it into a clickable link inside
   * a shopper's conversation.
   */
  url: string | null;
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
 * The model's bookkeeping line naming the context items it used ("CITED: 1,3").
 * Deliberately forgiving — a stray bullet, bold marker or trailing period must
 * still be recognised, because a marker we fail to match is a marker the
 * customer would read in the chat bubble.
 */
const CITED_LINE = /^[\s>*_`-]*cited\s*:?\s*([\d,\s]*)[\s.*_`-]*$/gim;

/**
 * Split the answer text from that marker. Returns the customer-facing text and
 * the 1-based item numbers, or `cited: null` when the model wrote no marker at
 * all — the caller then keeps every citation rather than dropping them.
 */
export function splitCitedMarker(raw: string): { text: string; cited: number[] | null } {
  let found = false;
  const cited = new Set<number>();
  const text = raw
    .replace(CITED_LINE, (_match, list: string) => {
      found = true;
      for (const part of list.split(',')) {
        const n = Number(part.trim());
        if (Number.isInteger(n) && n > 0) cited.add(n);
      }
      return '';
    })
    .trim();
  return { text, cited: found ? [...cited] : null };
}

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
  /**
   * Nudge toward the caller's preferred document group (PLN-260804 D3).
   * Deliberately a bonus, not a filter: a product question can still need the
   * return policy, so the other group must stay reachable. Larger than
   * SOURCE_BONUS so group preference outranks provenance, small enough that it
   * cannot invert a clear RRF gap.
   */
  private static readonly GROUP_BONUS = 0.002;
  private static readonly SNIPPET_CHARS = 800;
  /**
   * Documents handed to the model per answer. Was 4, which is too few for this
   * KB: the policy import splits one topic across several short sections
   * (`2.1.3 Shipping Rates`, `2.2.4 Return Shipment Deadline`, …), so a
   * multi-part question ("how do I return an item and get a refund?") retrieved
   * one fragment, answered partially, and offered a human agent for the rest —
   * measured on staging 2026-08-07. Six covers those fan-outs while staying
   * under LEG_LIMIT, so fusion still has candidates to rank.
   */
  private static readonly TOP_K = 6;
  /**
   * Vector hits below this dot score are discarded. Qdrant always returns the
   * nearest neighbors, so without a floor an off-topic query pads the context
   * with irrelevant docs and suppresses escalation. Near-zero cutoff is safe
   * for both voyage (unrelated ≈ 0.3+) and the stub (zero-overlap = 0).
   */
  private static readonly VECTOR_SCORE_FLOOR = 0.01;

  constructor(
    @InjectRepository(KbDocument) private readonly kbRepo: Repository<KbDocument>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly ai: AiGatewayService,
    private readonly qdrant: QdrantService,
    private readonly aiConfig: AiConfigService,
  ) {}

  /** The tenant's storefront origin, or null when nobody has configured one. */
  private async storefrontFor(tenantId: number): Promise<string | null> {
    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId },
      select: ['id', 'storefrontUrl'],
    });
    return normalizeStorefrontUrl(tenant?.storefrontUrl);
  }

  async retrieve(
    tenantId: number,
    query: string,
    limit = RagService.TOP_K,
  ): Promise<RetrievedChunk[]> {
    return (await this.retrieveHybrid(tenantId, query, limit)).chunks;
  }

  private async retrieveHybrid(
    tenantId: number,
    query: string,
    limit = 4,
    preferGroup?: string,
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
        rrf:
          e.rrf +
          (e.doc.source === 'knowledge_store' ? RagService.SOURCE_BONUS : 0) +
          (preferGroup && e.doc.docGroup === preferGroup ? RagService.GROUP_BONUS : 0),
      }))
      .sort((a, b) => b.rrf - a.rrf)
      .slice(0, limit);

    const storefront = await this.storefrontFor(tenantId);
    const chunks = ranked.map(({ doc, similarity }) => ({
      id: Number(doc.id),
      title: doc.title,
      category: doc.category,
      source: doc.source,
      group: doc.docGroup,
      url: productLinkFor(doc.docGroup, doc.sourceUrl, storefront),
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
    preferGroup?: string,
    retrievalQuery?: string,
  ): Promise<RagAnswer> {
    // The caller decides the group preference; RAG only applies it. Keeping the
    // judgement out of here means the chat path can use its intent label and
    // the console can pass an explicit choice, without RAG knowing about either.
    //
    // `retrievalQuery` lets the caller search with more words than the model is
    // asked to answer — chat passes the previous turns so a follow-up that only
    // makes sense in context ("and for my young son?") still retrieves the topic
    // it refers to. The model still sees just `query` (FIX-260806 A2).
    const { chunks, vectorProvider } = await this.retrieveHybrid(
      tenantId,
      retrievalQuery?.trim() || query,
      RagService.TOP_K,
      preferGroup,
    );
    // Numbered so the model can name the items it actually used (see CITED_LINE).
    const context = chunks
      .map((c, i) => `[${i + 1}] [${c.category ?? 'general'}] ${c.title}: ${c.snippet}`)
      .join('\n');
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
        `${sourceRule} If the information is insufficient, apologize briefly and ` +
        `offer to connect a human agent. Reply in language code: ${language}.\n` +
        `The context items are numbered. After your reply, on its own final line, ` +
        `write "CITED:" followed by the numbers of the items your answer actually ` +
        `used, comma separated (write "CITED:" with nothing after it if you used ` +
        `none). That line is internal bookkeeping: never mention it, never number ` +
        `or refer to the context items in the visible reply.\n` +
        `CONTEXT_START\n${context || '(no relevant documents found)'}\nCONTEXT_END` +
        orderBlock,
      messages: [{ role: 'user', content: query }],
    });

    // Show only what the answer stands on. The retrieved set is the top matches,
    // so recommending one cleanser used to surface a concealer and a night cream
    // next to it as "referenced" products (FIX-260806 §7-1). Matching the answer
    // text against titles cannot do this — replies are localized while the
    // catalogue titles are English — so the model reports which items it used.
    const { text, cited } = splitCitedMarker(res.text);
    return {
      text,
      confidence,
      // No marker (older/odd model output) → keep every citation, i.e. exactly
      // the previous behavior, rather than silently dropping all the links.
      citations: cited ? chunks.filter((_, i) => cited.includes(i + 1)) : chunks,
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
  ): Promise<{ intent: string; needsOrderData: boolean; confidence: number; fallback?: boolean }> {
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
      // The fallback label is 'product_inquiry', so an unparseable response
      // would otherwise read as a confident product question and bias
      // retrieval toward the product group. Mark it so callers can tell the
      // difference between "classified as product" and "classification failed".
      return { intent: 'product_inquiry', needsOrderData: false, confidence: 0.5, fallback: true };
    }
  }
}
