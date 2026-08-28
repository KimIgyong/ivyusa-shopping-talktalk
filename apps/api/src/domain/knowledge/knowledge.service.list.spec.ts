import { KnowledgeService } from './knowledge.service';
import { ListDocumentsQuery } from './dto/request/knowledge.request';

/**
 * Document-list filters, sort whitelist and filter facets
 * (PLN-260826-KB-Documents-List-UI). The service is built with only the doc
 * repository — nothing else is touched by these paths.
 */
describe('KnowledgeService — document list filters/sort/facets', () => {
  function build() {
    const findAndCount = jest.fn(async () => [[], 0]);
    const raws: Array<Array<{ v: string }>> = [
      [{ v: 'google_drive' }, { v: 'knowledge_store' }],
      [{ v: 'embedded' }, { v: 'pending' }],
    ];
    const qbCalls: string[] = [];
    const makeQb = () => {
      const qb = {
        select: jest.fn(() => qb),
        where: jest.fn((sql: string, params: Record<string, unknown>) => {
          qbCalls.push(`${sql} ${JSON.stringify(params)}`);
          return qb;
        }),
        orderBy: jest.fn(() => qb),
        getRawMany: jest.fn(async () => raws.shift() ?? []),
      };
      return qb;
    };
    const docRepo = { findAndCount, createQueryBuilder: jest.fn(makeQb) };
    const svc = new KnowledgeService(
      {} as never, // sourceRepo
      docRepo as never,
      {} as never, // fileRepo
      {} as never, // ai
      {} as never, // qdrant
      {} as never, // rag
      {} as never, // moderation
      {} as never, // conflicts
      {} as never, // revisions
      {} as never, // productImport
      {} as never, // bulkImport
      {} as never, // catalogSync
      {} as never, // usageGuides
      {} as never, // sourceSync
      {} as never, // credRepo
    );
    return { svc, findAndCount, qbCalls };
  }

  const q = (extra: Partial<ListDocumentsQuery>): ListDocumentsQuery =>
    ({ page: '1', size: '20', ...extra }) as ListDocumentsQuery;

  it('filters land in where; numbers coerced; tenant always present', async () => {
    const h = build();

    await h.svc.listDocuments(3, q({ active: '0', source: 'google_drive', status: 'pending' }));

    const arg = h.findAndCount.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(arg.where).toEqual({
      tenantId: 3,
      active: 0,
      source: 'google_drive',
      status: 'pending',
    });
  });

  it('no filters/sort → identical default ordering (id DESC), bare tenant where', async () => {
    const h = build();

    await h.svc.listDocuments(3, q({}));

    const arg = h.findAndCount.mock.calls[0][0] as {
      where: Record<string, unknown>;
      order: Record<string, string>;
    };
    expect(arg.where).toEqual({ tenantId: 3 });
    expect(arg.order).toEqual({ id: 'DESC' });
  });

  it('title/updated sorts map to whitelisted columns with an id tiebreaker', async () => {
    const h = build();

    await h.svc.listDocuments(3, q({ sort: 'title', order: 'asc' }));
    await h.svc.listDocuments(3, q({ sort: 'updated', order: 'desc' }));

    const orders = h.findAndCount.mock.calls.map(
      (c) => (c[0] as { order: Record<string, string> }).order,
    );
    expect(orders[0]).toEqual({ title: 'ASC', id: 'DESC' });
    expect(orders[1]).toEqual({ updatedAt: 'DESC', id: 'DESC' });
  });

  it('an unwhitelisted sort value falls back to the default order', async () => {
    const h = build();

    // The DTO rejects this before the service in production; the service
    // still refuses to interpolate it if something else calls in directly.
    await h.svc.listDocuments(3, q({ sort: 'id; DROP TABLE kb_documents' as never }));

    const arg = h.findAndCount.mock.calls[0][0] as { order: Record<string, string> };
    expect(arg.order).toEqual({ id: 'DESC' });
  });

  it('facets return tenant-scoped distinct sources and statuses', async () => {
    const h = build();

    const res = await h.svc.listDocumentFacets(3);

    expect(res).toEqual({
      sources: ['google_drive', 'knowledge_store'],
      statuses: ['embedded', 'pending'],
    });
    expect(h.qbCalls).toHaveLength(2);
    for (const call of h.qbCalls) expect(call).toContain('"tenantId":3');
  });
});
