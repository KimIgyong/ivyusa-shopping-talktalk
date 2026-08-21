import { MAX_PAGES_PER_SYNC, NotionAdapter } from './notion.adapter';
import { NotionClient, NotionPageRef } from '../notion.client';
import { NotionCredentialService } from '../notion-credential.service';
import { KnowledgeSource } from '../entity/knowledge-source.entity';
import { SourceFetch } from '../source-adapter.interface';

const ID = '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d';

const source = (over: Partial<KnowledgeSource> = {}): KnowledgeSource =>
  ({
    id: 9,
    tenantId: 1,
    type: 'notion',
    name: 'Support Manual',
    configJson: { targetId: ID },
    ...over,
  }) as KnowledgeSource;

const ref = (n: number): NotionPageRef => ({
  id: `page-${n}`,
  title: `Page ${n}`,
  url: `https://www.notion.so/page-${n}`,
});

const paragraph = (text: string) => ({
  id: 'b1',
  type: 'paragraph',
  paragraph: { rich_text: [{ plain_text: text }] },
});

const build = (over: Partial<Record<string, unknown>> = {}) => {
  const client = {
    retrieveTarget: jest.fn(async () => ({ kind: 'database', ref: ref(0), archived: false })),
    listDatabasePages: jest.fn(async () => ({ pages: [ref(1)], hasMore: false })),
    listChildPages: jest.fn(async () => ({ pages: [], hasMore: false })),
    pageBlocks: jest.fn(async () => ({
      blocks: [paragraph('Refunds within 30 days.')],
      truncated: false,
    })),
    ...over,
  } as unknown as NotionClient;
  const credentials = { load: jest.fn(async () => 'ntn_token') } as unknown as NotionCredentialService;
  return { adapter: new NotionAdapter(client, credentials), client, credentials };
};

const fetched = (result: unknown) => result as SourceFetch;

describe('NotionAdapter.validateConfig', () => {
  it('accepts an id or the link it came from', () => {
    const { adapter } = build();
    expect(adapter.validateConfig({ targetId: ID })).toBeNull();
    expect(adapter.validateConfig({ targetId: `https://www.notion.so/Manual-${ID}` })).toBeNull();
  });

  it('says what was missing rather than which form to use', () => {
    const { adapter } = build();
    expect(adapter.validateConfig(null)).toMatch(/required/);
    expect(adapter.validateConfig({ targetId: 'https://www.notion.so/Manual' })).toMatch(
      /No Notion ID/,
    );
  });
});

describe('NotionAdapter.fetchAll', () => {
  it('turns each database row into one document', async () => {
    const { adapter, client } = build({
      listDatabasePages: jest.fn(async () => ({ pages: [ref(1), ref(2)], hasMore: false })),
    });
    const { items } = fetched(await adapter.fetchAll(1, source()));
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      externalKey: 'page:page1',
      title: 'Page 1',
      content: 'Refunds within 30 days.',
      sourceUrl: 'https://www.notion.so/page-1',
      category: 'Support Manual',
    });
    expect(client.listChildPages).not.toHaveBeenCalled();
  });

  it('includes a page target itself alongside its children', async () => {
    const { adapter } = build({
      retrieveTarget: jest.fn(async () => ({ kind: 'page', ref: ref(0), archived: false })),
      listChildPages: jest.fn(async () => ({ pages: [ref(1)], hasMore: false })),
    });
    const { items } = fetched(await adapter.fetchAll(1, source()));
    // The page an operator pointed at is a document, not just a container.
    expect(items.map((i) => i.externalKey)).toEqual(['page:page0', 'page:page1']);
  });

  it('keys by page id so a retitled page updates rather than forks', async () => {
    const { adapter } = build({
      listDatabasePages: jest.fn(async () => ({
        pages: [{ ...ref(1), title: 'Renamed entirely' }],
        hasMore: false,
      })),
    });
    const { items } = fetched(await adapter.fetchAll(1, source()));
    expect(items[0].externalKey).toBe('page:page1');
  });

  it('drops empty pages instead of embedding nothing', async () => {
    const { adapter } = build({
      listDatabasePages: jest.fn(async () => ({ pages: [ref(1), ref(2)], hasMore: false })),
      pageBlocks: jest
        .fn()
        .mockResolvedValueOnce({ blocks: [paragraph('Real content')], truncated: false })
        .mockResolvedValueOnce({ blocks: [{ id: 'x', type: 'image', image: {} }], truncated: false }),
    });
    const result = fetched(await adapter.fetchAll(1, source()));
    expect(result.items).toHaveLength(1);
    // An empty page is not withheld work, so it is not counted as dropped.
    expect(result.dropped).toBe(0);
  });

  it('reports what the per-sync cap left out', async () => {
    const pages = Array.from({ length: MAX_PAGES_PER_SYNC + 5 }, (_, i) => ref(i + 1));
    const { adapter, client } = build({
      listDatabasePages: jest.fn(async () => ({ pages, hasMore: false })),
    });
    const result = fetched(await adapter.fetchAll(1, source()));
    expect(result.items).toHaveLength(MAX_PAGES_PER_SYNC);
    // A truncated sync that reports like a complete one is the failure mode
    // this count exists to prevent.
    expect(result.dropped).toBe(5);
    expect(client.pageBlocks).toHaveBeenCalledTimes(MAX_PAGES_PER_SYNC);
  });

  it('still reports a drop when the listing itself stopped early', async () => {
    const { adapter } = build({
      listDatabasePages: jest.fn(async () => ({ pages: [ref(1)], hasMore: true })),
    });
    const result = fetched(await adapter.fetchAll(1, source()));
    expect(result.dropped).toBeGreaterThan(0);
  });

  it('cuts fields to what the columns hold', async () => {
    const { adapter } = build({
      listDatabasePages: jest.fn(async () => ({
        pages: [{ id: 'p1', title: 'T'.repeat(400), url: `https://www.notion.so/${'u'.repeat(600)}` }],
        hasMore: false,
      })),
    });
    const { items } = fetched(await adapter.fetchAll(1, source({ name: 'C'.repeat(100) })));
    expect(items[0].title).toHaveLength(255);
    expect(items[0].category).toHaveLength(64);
    expect(items[0].sourceUrl).toHaveLength(512);
  });

  it('refuses to run without a token or on a trashed target', async () => {
    const { adapter } = build();
    (adapter as unknown as { credentials: { load: jest.Mock } }).credentials.load = jest.fn(
      async () => null,
    );
    await expect(adapter.fetchAll(1, source())).rejects.toThrow(/no Notion integration token/);

    const trashed = build({
      retrieveTarget: jest.fn(async () => ({ kind: 'page', ref: ref(0), archived: true })),
    });
    await expect(trashed.adapter.fetchAll(1, source())).rejects.toThrow(/trash/);
  });

  it('reports no drop when the count lands exactly on the cap', async () => {
    const pages = Array.from({ length: MAX_PAGES_PER_SYNC }, (_, i) => ref(i + 1));
    const { adapter } = build({ listDatabasePages: jest.fn(async () => ({ pages, hasMore: false })) });
    const result = fetched(await adapter.fetchAll(1, source()));
    expect(result.items).toHaveLength(MAX_PAGES_PER_SYNC);
    expect(result.dropped).toBe(0);
  });

  it('counts the page target itself against the cap', async () => {
    // A page target prepends itself, so the boundary sits one child earlier
    // than it does for a database.
    const pages = Array.from({ length: MAX_PAGES_PER_SYNC }, (_, i) => ref(i + 1));
    const { adapter } = build({
      retrieveTarget: jest.fn(async () => ({ kind: 'page', ref: ref(0), archived: false })),
      listChildPages: jest.fn(async () => ({ pages, hasMore: false })),
    });
    const result = fetched(await adapter.fetchAll(1, source()));
    expect(result.items).toHaveLength(MAX_PAGES_PER_SYNC);
    expect(result.dropped).toBe(1);
  });

  it('reports a page whose content was cut, from either cause', async () => {
    // A document stored half-read is in the corpus and wrong; the console has
    // to be able to say so, and the log alone cannot.
    const long = {
      id: 'b1',
      type: 'paragraph',
      paragraph: { rich_text: [{ plain_text: 'x'.repeat(40_000) }] },
    };
    const charCapped = build({
      pageBlocks: jest.fn(async () => ({ blocks: [long, long], truncated: false })),
    });
    expect(fetched(await charCapped.adapter.fetchAll(1, source())).truncated).toBe(1);

    const budgetCapped = build({
      pageBlocks: jest.fn(async () => ({ blocks: [paragraph('short')], truncated: true })),
    });
    expect(fetched(await budgetCapped.adapter.fetchAll(1, source())).truncated).toBe(1);
  });

  it('does not count a page it discarded as a partly-stored document', async () => {
    // A page that was cut short AND had no usable text is not in the corpus at
    // all; calling it "stored incomplete" would point at a document that does
    // not exist.
    const { adapter } = build({
      pageBlocks: jest.fn(async () => ({ blocks: [], truncated: true })),
    });
    const result = fetched(await adapter.fetchAll(1, source()));
    expect(result.items).toHaveLength(0);
    expect(result.truncated).toBe(0);
  });

  it('does not let an empty listing stand as proof the source is empty', () => {
    const { adapter } = build();
    // Disconnecting an integration looks exactly like an empty page.
    expect(adapter.trustEmptyListing).toBe(false);
    expect(adapter.credential).toEqual({ provider: 'notion', label: 'Notion integration token' });
  });
});
