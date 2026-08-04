import { Repository } from 'typeorm';
import { SourceSyncService } from './source-sync.service';
import { KbDocument } from './entity/kb-document.entity';
import { KnowledgeSource } from './entity/knowledge-source.entity';
import { KbRevisionService } from './kb-revision.service';
import { BoardAdapter } from './adapters/board.adapter';
import { SourceItem } from './source-adapter.interface';

const source = (over: Partial<KnowledgeSource> = {}) =>
  ({ id: 5, tenantId: 1, type: 'board', name: 'IVY Help Center', ...over }) as KnowledgeSource;

const item = (over: Partial<SourceItem> = {}): SourceItem => ({
  externalKey: 'post:1',
  title: 'Return policy',
  content: 'Returns accepted within 30 days.',
  sourceUrl: null,
  category: 'IVY Help Center',
  ...over,
});

describe('SourceSyncService.sync', () => {
  let saved: KbDocument[];
  let recorded: string[];

  const build = (opts: { items?: SourceItem[]; existing?: Partial<KbDocument>[] } = {}) => {
    saved = [];
    recorded = [];
    let nextId = 700;

    const docRepo = {
      find: jest.fn(async () => (opts.existing ?? []) as KbDocument[]),
      create: (d: Partial<KbDocument>) => d as KbDocument,
      save: jest.fn(async (d: KbDocument) => {
        const withId = { ...d, id: d.id ?? nextId++ } as KbDocument;
        saved.push(withId);
        return withId;
      }),
    } as unknown as Repository<KbDocument>;

    const sourceRepo = { save: jest.fn(async (s: KnowledgeSource) => s) } as unknown as Repository<KnowledgeSource>;
    const revisions = {
      record: jest.fn(async (_t: number, _d: unknown, _b: unknown, kind: string) => {
        recorded.push(kind);
        return null;
      }),
    } as unknown as KbRevisionService;

    const board = {
      type: 'board',
      validateConfig: () => null,
      fetchAll: jest.fn(async () => opts.items ?? [item()]),
    } as unknown as BoardAdapter;

    return new SourceSyncService(docRepo, sourceRepo, revisions, board);
  };

  it('creates a document for a new source item', async () => {
    const svc = build();
    const { result, touchedIds } = await svc.sync(1, source(), 7);
    expect(result).toMatchObject({ fetched: 1, created: 1, updated: 0, skipped: 0, hidden: 0 });
    expect(touchedIds).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      sourceId: 5,
      docGroup: 'counsel',
      externalKey: 'post:1',
      status: 'pending',
    });
  });

  it('leaves an unchanged, already-indexed item alone', async () => {
    const svc = build({
      existing: [
        {
          id: 10,
          tenantId: 1,
          sourceId: 5,
          externalKey: 'post:1',
          title: 'Return policy',
          content: 'Returns accepted within 30 days.',
          category: 'IVY Help Center',
          sourceUrl: null,
          active: 1,
          status: 'embedded',
        },
      ],
    });
    const { result, touchedIds } = await svc.sync(1, source(), 7);
    expect(result).toMatchObject({ created: 0, updated: 0, skipped: 1 });
    expect(touchedIds).toHaveLength(0);
    expect(saved).toHaveLength(0);
    expect(recorded).toHaveLength(0);
  });

  it('re-indexes an unchanged item that was never embedded', async () => {
    // "Unchanged" is not the same as "searchable" — a row left at pending by an
    // earlier partial run would otherwise stay invisible forever (PR #104).
    const svc = build({
      existing: [
        {
          id: 10,
          tenantId: 1,
          sourceId: 5,
          externalKey: 'post:1',
          title: 'Return policy',
          content: 'Returns accepted within 30 days.',
          category: 'IVY Help Center',
          sourceUrl: null,
          active: 1,
          status: 'pending',
        },
      ],
    });
    const { result, touchedIds } = await svc.sync(1, source(), 7);
    expect(result.skipped).toBe(1);
    expect(touchedIds).toEqual([10]);
    expect(recorded).toHaveLength(0); // no revision for a body that did not move
  });

  it('updates an item whose content moved', async () => {
    const svc = build({
      existing: [
        {
          id: 10,
          tenantId: 1,
          sourceId: 5,
          externalKey: 'post:1',
          title: 'Old title',
          content: 'stale',
          category: 'IVY Help Center',
          sourceUrl: null,
          active: 1,
          status: 'embedded',
        },
      ],
    });
    const { result } = await svc.sync(1, source(), 7);
    expect(result).toMatchObject({ created: 0, updated: 1 });
    expect(saved[0]).toMatchObject({ id: 10, title: 'Return policy', status: 'pending' });
    expect(recorded).toEqual(['update']);
  });

  it('hides a document whose source item disappeared, never deletes it', async () => {
    // Hiding is reversible and is what retrieval honours; a hard delete would
    // destroy the revision history's subject (D7).
    const svc = build({
      items: [],
      existing: [
        { id: 10, tenantId: 1, sourceId: 5, externalKey: 'post:1', title: 'Gone', active: 1 },
      ],
    });
    const { result } = await svc.sync(1, source(), 7);
    expect(result).toMatchObject({ fetched: 0, hidden: 1 });
    expect(saved[0]).toMatchObject({ id: 10, active: 0 });
  });

  it('does not re-hide something already hidden', async () => {
    const svc = build({
      items: [],
      existing: [
        { id: 10, tenantId: 1, sourceId: 5, externalKey: 'post:1', title: 'Gone', active: 0 },
      ],
    });
    expect((await svc.sync(1, source(), 7)).result.hidden).toBe(0);
    expect(saved).toHaveLength(0);
  });

  it('brings a hidden item back to life when it reappears', async () => {
    const svc = build({
      existing: [
        {
          id: 10,
          tenantId: 1,
          sourceId: 5,
          externalKey: 'post:1',
          title: 'Return policy',
          content: 'Returns accepted within 30 days.',
          category: 'IVY Help Center',
          sourceUrl: null,
          active: 0,
          status: 'embedded',
        },
      ],
    });
    const { result } = await svc.sync(1, source(), 7);
    expect(result.updated).toBe(1);
    expect(saved[0]).toMatchObject({ id: 10, active: 1, status: 'pending' });
  });

  it('reports a duplicate key from the adapter rather than letting the last one win', async () => {
    const svc = build({ items: [item(), item({ title: 'Different' })] });
    const { result } = await svc.sync(1, source(), 7);
    expect(result).toMatchObject({ created: 1, failed: 1 });
  });

  it('rejects a sync for a source type with no adapter, loudly', async () => {
    // Registering a gdrive source and seeing nothing happen is the confusion
    // this work exists to remove.
    const svc = build();
    await expect(svc.sync(1, source({ type: 'gdrive' }), 7)).rejects.toThrow();
  });

  it('reports which source types can actually ingest', async () => {
    expect(build().supportedTypes()).toEqual(['board']);
  });

  it('never embeds inline — it hands ids back for batching', async () => {
    const svc = build({ items: [item(), item({ externalKey: 'post:2', title: 'Second' })] });
    const { touchedIds } = await svc.sync(1, source(), 7);
    expect(touchedIds).toHaveLength(2);
    expect(saved.every((d) => d.status === 'pending')).toBe(true);
  });
});
