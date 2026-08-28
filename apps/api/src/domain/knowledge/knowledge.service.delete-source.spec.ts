import { KnowledgeService } from './knowledge.service';

/**
 * deleteSource must deactivate the source's documents before dropping the row
 * (PLN-260829 P1-1) — a bare delete used to leave them active and permanently
 * un-excludable by the designated filter.
 */
describe('KnowledgeService.deleteSource', () => {
  function build(opts: { source?: unknown; docs?: Array<{ id: number }>; qdrantEnabled?: boolean } = {}) {
    const source = opts.source ?? { id: 5, name: 'policy', type: 'gdrive' };
    const docs = opts.docs ?? [];
    const updates: unknown[] = [];
    const deleted: unknown[] = [];
    const audited: Array<{ action: string; meta: Record<string, unknown> }> = [];
    const setActiveCalls: Array<[number, boolean]> = [];

    const sourceRepo = {
      findOne: jest.fn(async () => source),
      delete: jest.fn(async (w: unknown) => {
        deleted.push(w);
      }),
    };
    const docRepo = {
      find: jest.fn(async () => docs),
      update: jest.fn(async (w: unknown, v: unknown) => {
        updates.push([w, v]);
      }),
    };
    const qdrant = {
      enabled: opts.qdrantEnabled ?? true,
      setActive: jest.fn(async (id: number, active: boolean) => {
        setActiveCalls.push([id, active]);
      }),
    };
    const revisions = {
      recordAudit: jest.fn(
        async (_t: number, _d: number, action: string, _u: unknown, meta: Record<string, unknown>) => {
          audited.push({ action, meta });
        },
      ),
    };
    const svc = new KnowledgeService(
      sourceRepo as never,
      docRepo as never,
      {} as never, // fileRepo
      {} as never, // ai
      qdrant as never,
      {} as never, // rag
      {} as never, // moderation
      {} as never, // conflicts
      revisions as never,
      {} as never, // productImport
      {} as never, // bulkImport
      {} as never, // catalogSync
      {} as never, // usageGuides
      {} as never, // sourceSync
      {} as never, // credRepo
    );
    return { svc, sourceRepo, docRepo, qdrant, updates, deleted, audited, setActiveCalls };
  }

  it('deactivates active documents, flips qdrant, audits, then deletes the row', async () => {
    const h = build({ docs: [{ id: 10 }, { id: 11 }] });
    const res = await h.svc.deleteSource(1, 5, 7);

    expect(res).toEqual({ deactivatedDocuments: 2 });
    expect(h.docRepo.find).toHaveBeenCalledWith({ where: { tenantId: 1, sourceId: 5, active: 1 } });
    expect(h.updates).toEqual([[{ tenantId: 1, sourceId: 5, active: 1 }, { active: 0 }]]);
    expect(h.setActiveCalls.sort()).toEqual([
      [10, false],
      [11, false],
    ]);
    expect(h.deleted).toEqual([{ id: 5, tenantId: 1 }]);
    expect(h.audited).toHaveLength(1);
    expect(h.audited[0].action).toBe('knowledge.source_deleted');
    expect(h.audited[0].meta).toMatchObject({ sourceId: 5, sourceName: 'policy', deactivatedDocuments: 2 });
  });

  it('a source with no active documents skips the update but still audits', async () => {
    const h = build({ docs: [] });
    const res = await h.svc.deleteSource(1, 5, 7);

    expect(res).toEqual({ deactivatedDocuments: 0 });
    expect(h.updates).toHaveLength(0);
    expect(h.deleted).toHaveLength(1);
    expect(h.audited[0].meta).toMatchObject({ deactivatedDocuments: 0 });
  });

  it('a qdrant flip failure does not fail the delete', async () => {
    const h = build({ docs: [{ id: 10 }] });
    (h.qdrant.setActive as jest.Mock).mockRejectedValue(new Error('qdrant down'));
    const res = await h.svc.deleteSource(1, 5, 7);
    expect(res).toEqual({ deactivatedDocuments: 1 });
    expect(h.deleted).toHaveLength(1);
  });

  it('an unknown source throws and touches nothing', async () => {
    const h = build();
    (h.sourceRepo.findOne as jest.Mock).mockResolvedValue(null);
    await expect(h.svc.deleteSource(1, 999, 7)).rejects.toThrow();
    expect(h.deleted).toHaveLength(0);
    expect(h.audited).toHaveLength(0);
  });
});
