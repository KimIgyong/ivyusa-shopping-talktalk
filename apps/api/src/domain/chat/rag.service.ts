import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { AI_FUNCTION } from '@ivy/types';
import { KbDocument } from '../knowledge/entity/kb-document.entity';
import { AiGatewayService } from '../../infrastructure/external/ai/ai-gateway.service';
import { AiConfigService } from '../ai-engine/ai-config.service';

export interface RetrievedChunk {
  id: number;
  title: string;
  category: string | null;
  source: string;
  snippet: string;
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
 * Retrieval-Augmented answering (FN-016/017, POL-011/013). Retrieves only
 * designated + active KB documents scoped to the tenant (Knowledge Store wins;
 * Google Drive supplements). A lightweight keyword retriever stands in for the
 * vector store; the answer is generated through the AI gateway.
 */
@Injectable()
export class RagService {
  constructor(
    @InjectRepository(KbDocument) private readonly kbRepo: Repository<KbDocument>,
    private readonly ai: AiGatewayService,
    private readonly aiConfig: AiConfigService,
  ) {}

  async retrieve(tenantId: number, query: string, limit = 4): Promise<RetrievedChunk[]> {
    const terms = query
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1)
      .slice(0, 8);

    let docs: KbDocument[];
    if (!terms.length) {
      docs = await this.baseQuery(tenantId)
        .orderBy("CASE WHEN kb.source = 'knowledge_store' THEN 0 ELSE 1 END", 'ASC')
        .addOrderBy('kb.updatedAt', 'DESC')
        .take(limit)
        .getMany();
    } else {
      // FULLTEXT MATCH (PERF-2) — index-backed relevance search instead of
      // up-to-16 leading-wildcard LIKEs over LONGTEXT. Knowledge Store still
      // outranks Google Drive (POL-013); relevance breaks ties.
      try {
        docs = await this.baseQuery(tenantId)
          .addSelect('MATCH(kb.title, kb.content) AGAINST (:ftq IN NATURAL LANGUAGE MODE)', 'relevance')
          .andWhere('MATCH(kb.title, kb.content) AGAINST (:ftq IN NATURAL LANGUAGE MODE)')
          .setParameter('ftq', terms.join(' '))
          .orderBy("CASE WHEN kb.source = 'knowledge_store' THEN 0 ELSE 1 END", 'ASC')
          .addOrderBy('relevance', 'DESC')
          .take(limit)
          .getMany();
      } catch {
        // FULLTEXT index not present yet (pre-migration DB) — legacy LIKE scan.
        docs = await this.retrieveLike(tenantId, terms, limit);
      }
    }

    return docs.map((d) => ({
      id: d.id,
      title: d.title,
      category: d.category,
      source: d.source,
      snippet: (d.content ?? '').slice(0, 400),
    }));
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
    const chunks = await this.retrieve(tenantId, query);
    const context = chunks.map((c) => `- [${c.category ?? 'general'}] ${c.title}: ${c.snippet}`).join('\n');
    const hasOrderContext = !!orderContext?.trim();
    // KB-hit count drives confidence, but order facts are authoritative on their
    // own: an order question answered from the customer's real orders must not be
    // escalated just because no help article matched.
    const confidence = Math.max(
      chunks.length ? Math.min(0.95, 0.5 + chunks.length * 0.12) : 0.2,
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
