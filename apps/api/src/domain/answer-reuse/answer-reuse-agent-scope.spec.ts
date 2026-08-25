import { Repository } from 'typeorm';
import { AnswerReuseService } from './answer-reuse.service';
import { AnswerReuse } from './entity/answer-reuse.entity';
import { AiGatewayService } from '../../infrastructure/external/ai/ai-gateway.service';
import { ReuseQdrantService } from '../../infrastructure/external/vector/reuse-qdrant.service';
import { KbCategory } from '../knowledge/entity/kb-category.entity';

/**
 * Reuse honours per-agent knowledge scope (REQ-260826 D4).
 *
 * This lookup runs BEFORE retrieval, so a scope applied only to RAG is bypassed
 * by every question that has been asked once already — the feature would look
 * finished and leak on the second shopper.
 */
describe('AnswerReuseService — per-agent replay', () => {
  const build = (row: Partial<AnswerReuse> | null, categories: Array<Partial<KbCategory>>) => {
    const repo = {
      findOne: jest.fn(async () => row),
      update: jest.fn(async () => undefined),
      increment: jest.fn(async () => undefined),
    } as unknown as Repository<AnswerReuse>;
    const categoryRepo = {
      find: jest.fn(async () => categories),
    } as unknown as Repository<KbCategory>;
    const ai = {
      embed: jest.fn(async () => ({
        vectors: [[0.1, 0.2]],
        provider: 'voyage',
        model: 'voyage-4',
        tokensIn: 1,
        dimension: 2,
      })),
    } as unknown as AiGatewayService;
    const vector = {
      enabled: true,
      search: jest.fn(async () => [{ id: 7, score: 0.99 }]),
    } as unknown as ReuseQdrantService;
    return new AnswerReuseService(repo, categoryRepo, ai, vector);
  };

  const row = (over: Partial<AnswerReuse> = {}): Partial<AnswerReuse> => ({
    id: 7,
    tenantId: 1,
    lang: 'KO',
    questionText: '배송 얼마나 걸려요',
    answerText: 'x'.repeat(40),
    source: 'ai',
    active: 1,
    confidence: 0.9,
    citations: [],
    updatedAt: new Date(),
    aiAgentId: null,
    ...over,
  });

  const scoped = [{ name: 'policy_payment', agentIds: [3] }] as Array<Partial<KbCategory>>;
  const unscoped = [{ name: 'policy_payment', agentIds: null }] as Array<Partial<KbCategory>>;

  it('replays to the agent the answer was written for', async () => {
    const svc = build(row({ aiAgentId: 3 }), scoped);

    expect(await svc.lookup(1, 'KO', '배송 얼마나 걸려요', 3)).not.toBeNull();
  });

  it('refuses to replay one agent’s answer to another', async () => {
    // The whole point: a partner-only answer must not reach a landing guest
    // just because someone asked the same question first.
    const svc = build(row({ aiAgentId: 3 }), scoped);

    expect(await svc.lookup(1, 'KO', '배송 얼마나 걸려요', 5)).toBeNull();
  });

  it('keeps replaying rows written before agents were recorded — if nothing is scoped', async () => {
    // Refusing these outright would silently switch reuse off for every tenant
    // that never opens the category screen.
    const svc = build(row({ aiAgentId: null }), unscoped);

    expect(await svc.lookup(1, 'KO', '배송 얼마나 걸려요', 5)).not.toBeNull();
  });

  it('stops replaying agent-less rows once the tenant scopes a category', async () => {
    // From that moment the row's origin is unknowable, and an unknowable origin
    // is exactly what the scope exists to rule out. Reuse resumes as new rows
    // accumulate; until then the LLM path answers.
    const svc = build(row({ aiAgentId: null }), scoped);

    expect(await svc.lookup(1, 'KO', '배송 얼마나 걸려요', 5)).toBeNull();
  });

  it('does not replay an agent-bound row to a session with no agent at all', async () => {
    const svc = build(row({ aiAgentId: 3 }), scoped);

    expect(await svc.lookup(1, 'KO', '배송 얼마나 걸려요', null)).toBeNull();
  });
});
