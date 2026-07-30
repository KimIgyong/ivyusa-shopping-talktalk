import { Injectable, Logger } from '@nestjs/common';
import {
  AiAdapter,
  AiCompletionRequest,
  AiCompletionResult,
  AiEmbeddingRequest,
  AiEmbeddingResult,
} from '../ai-adapter.interface';

/**
 * Voyage AI embedding adapter (PLAN-KB-VectorHybrid-Qdrant W2). voyage-4 is
 * multilingual/cross-lingual (ko/en/es share one vector space) and returns
 * normalized vectors, so dot product == cosine similarity. Embedding-only:
 * complete() is unsupported and the gateway never routes completions here.
 */
@Injectable()
export class VoyageAdapter implements AiAdapter {
  readonly provider = 'voyage';
  private readonly logger = new Logger(VoyageAdapter.name);

  async complete(_req: AiCompletionRequest): Promise<AiCompletionResult> {
    throw new Error('Voyage adapter is embedding-only');
  }

  /** Backoff for 429s — free-tier Voyage rate limits are low (RPM-scale). */
  private static readonly RETRY_429_MS = [15_000, 30_000, 60_000];

  async embed(req: AiEmbeddingRequest): Promise<AiEmbeddingResult> {
    const apiKey = req.apiKey ?? process.env.VOYAGE_API_KEY;
    if (!apiKey) throw new Error('Voyage API key not configured');
    const model = req.model || process.env.VOYAGE_MODEL || 'voyage-4';

    let res: Response | null = null;
    for (let attempt = 0; ; attempt++) {
      res = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          input: req.texts,
          model,
          input_type: req.inputType,
        }),
      });
      if (res.status === 429 && attempt < VoyageAdapter.RETRY_429_MS.length) {
        const wait = VoyageAdapter.RETRY_429_MS[attempt];
        this.logger.warn(`Voyage 429 (rate limit) — retrying in ${wait / 1000}s`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      break;
    }
    if (!res.ok) {
      this.logger.error(`Voyage error ${res.status}`);
      throw new Error(`Voyage API error ${res.status}`);
    }
    const data: any = await res.json();
    const byIndex = [...(data.data ?? [])].sort((a: any, b: any) => a.index - b.index);
    const vectors = byIndex.map((d: any) => d.embedding as number[]);
    return {
      vectors,
      tokensIn: data.usage?.total_tokens ?? 0,
      provider: this.provider,
      model: data.model ?? model,
      dimension: vectors[0]?.length ?? 0,
    };
  }
}
