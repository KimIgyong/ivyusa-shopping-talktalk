import { RagService } from './rag.service';

/**
 * What an answer may be grounded in.
 *
 * These assert the predicates rather than the results: both retrieval legs pass
 * through `baseQuery`, so a rule dropped from it is bypassed everywhere at once
 * and nothing about the answer looks wrong — it just quietly cites something it
 * should not.
 */
describe('RagService retrieval scope', () => {
  function build() {
    const wheres: string[] = [];
    const qb: Record<string, unknown> = {};
    for (const m of ['where', 'andWhere', 'addSelect', 'setParameter', 'orderBy', 'addOrderBy', 'take']) {
      qb[m] = (arg: unknown) => {
        if (typeof arg === 'string') wheres.push(arg);
        return qb;
      };
    }
    qb.getMany = async () => [];
    const kbRepo = { createQueryBuilder: () => qb };
    const svc = new RagService(
      kbRepo as never,
      { findOne: async () => null } as never,
      { complete: jest.fn(), embed: jest.fn() } as never,
      { enabled: false, search: jest.fn() } as never,
      { getPersonaRules: jest.fn() } as never,
    );
    return { svc, wheres };
  }

  const scopeOf = async () => {
    const { svc, wheres } = build();
    // Empty query takes the no-terms path, which still builds the same scope.
    await (svc as unknown as { retrieveFulltext: (t: number, q: string, l: number) => Promise<unknown> })
      .retrieveFulltext(1, '', 5);
    return wheres.join(' | ');
  };

  it('only reads active documents', async () => {
    expect(await scopeOf()).toContain('kb.active = 1');
  });

  it('stays inside the tenant, plus the global set', async () => {
    expect(await scopeOf()).toContain('kb.tenantId = :tenantId OR kb.tenantId IS NULL');
  });

  it('drops documents from a source the operator un-designated', async () => {
    // Un-designating is how an operator says "stop answering from this". Before
    // this predicate the flag sat on the source while retrieval looked only at
    // the document, so everything already ingested kept being cited.
    const scope = await scopeOf();

    expect(scope).toContain('knowledge_sources');
    expect(scope).toContain('designated = 0');
  });

  it('keeps documents that have no source at all', async () => {
    // Hand-written, catalogue-generated and gap-promoted documents carry no
    // source id; an IN-the-designated-set test would have removed all of them.
    expect(await scopeOf()).toContain('kb.sourceId IS NULL OR');
  });
});
