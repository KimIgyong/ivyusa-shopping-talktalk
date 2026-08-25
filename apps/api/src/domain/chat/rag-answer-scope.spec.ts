import { RagService } from './rag.service';

/**
 * What `aiAgentId = null` means at the answer() seam.
 *
 * Two callers pass null for opposite reasons: the console means "no scope, show
 * me everything I manage", and a widget turn means "this session is unpinned".
 * Resolving null to the default agent inside RAG collapsed the two, and the
 * console's own knowledge lookup lost every scoped category — a staging smoke
 * (T9) caught it after the unit tests passed. RAG now applies what it is given;
 * chat.service resolves before calling.
 */
describe('RagService.answer — agent scope is applied, not inferred', () => {
  function build() {
    const scopeArgs: Array<number | null | undefined> = [];
    const svc = new RagService(
      { createQueryBuilder: () => ({}) } as never,
      { findOne: async () => null } as never,
      {
        complete: jest.fn(async () => ({ text: 'ok', tokensIn: 1, tokensOut: 1, provider: 'stub' })),
        embed: jest.fn(),
      } as never,
      { enabled: false, search: jest.fn() } as never,
      {
        getPersonaRules: jest.fn(async () => ({ persona: 'P', rules: [] })),
        effectiveAgentId: jest.fn(async () => 1),
      } as never,
    );
    // Retrieval itself is covered by rag-retrieval-scope.spec.ts; here only the
    // value that reaches it matters.
    (svc as unknown as { retrieveHybrid: unknown }).retrieveHybrid = async (
      _t: number,
      _q: string,
      _l: number,
      _g: string | undefined,
      agentId: number | null | undefined,
    ) => {
      scopeArgs.push(agentId);
      return { chunks: [], vectorProvider: null };
    };
    return { svc, scopeArgs };
  }

  it('passes null straight through — no scope for the operator view', async () => {
    const { svc, scopeArgs } = build();

    await svc.answer(1, 'q', 'EN', undefined, undefined, undefined, null);

    expect(scopeArgs).toEqual([null]);
  });

  it('passes the agent it was handed, without re-resolving it', async () => {
    const { svc, scopeArgs } = build();

    await svc.answer(1, 'q', 'EN', undefined, undefined, undefined, 15);

    expect(scopeArgs).toEqual([15]);
  });
});
