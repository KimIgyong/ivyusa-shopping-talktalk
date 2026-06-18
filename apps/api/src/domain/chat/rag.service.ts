import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { AI_FUNCTION } from '@ivy/types';
import { KbDocument } from '../knowledge/entity/kb-document.entity';
import { AiGatewayService } from '../../infrastructure/external/ai/ai-gateway.service';

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
  ) {}

  async retrieve(tenantId: number, query: string, limit = 4): Promise<RetrievedChunk[]> {
    const terms = query
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2)
      .slice(0, 8);

    const qb = this.kbRepo
      .createQueryBuilder('kb')
      .where('kb.active = 1')
      .andWhere('(kb.tenantId = :tenantId OR kb.tenantId IS NULL)', { tenantId });

    if (terms.length) {
      qb.andWhere(
        new Brackets((b) => {
          terms.forEach((term, i) => {
            b.orWhere(`LOWER(kb.title) LIKE :t${i}`, { [`t${i}`]: `%${term}%` });
            b.orWhere(`LOWER(kb.content) LIKE :c${i}`, { [`c${i}`]: `%${term}%` });
          });
        }),
      );
    }
    // Knowledge Store ranked above Google Drive (POL-013).
    const docs = await qb
      .orderBy("CASE WHEN kb.source = 'knowledge_store' THEN 0 ELSE 1 END", 'ASC')
      .addOrderBy('kb.updatedAt', 'DESC')
      .take(limit)
      .getMany();

    return docs.map((d) => ({
      id: d.id,
      title: d.title,
      category: d.category,
      source: d.source,
      snippet: (d.content ?? '').slice(0, 400),
    }));
  }

  async answer(tenantId: number, query: string, language: string): Promise<RagAnswer> {
    const chunks = await this.retrieve(tenantId, query);
    const context = chunks.map((c) => `- [${c.category ?? 'general'}] ${c.title}: ${c.snippet}`).join('\n');
    const confidence = chunks.length ? Math.min(0.95, 0.5 + chunks.length * 0.12) : 0.2;

    const res = await this.ai.complete({
      tenantId,
      function: AI_FUNCTION.RAG,
      system:
        `You are IVY USA's support assistant. Answer ONLY from the context. If the context ` +
        `is insufficient, say you'll connect a human agent. Reply in language code: ${language}.\n` +
        `CONTEXT_START\n${context || '(no relevant documents found)'}\nCONTEXT_END`,
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
