import {
  MAX_REQUESTS_PER_PAGE,
  NotionAuthError,
  NotionClient,
  NotionRequestError,
  NOTION_VERSION,
} from './notion.client';

const ID = '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d';
const DASHED = '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d';

const res = (body: unknown, ok = true, status = 200, headers: Record<string, string> = {}) =>
  ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: (k: string) => headers[k] ?? null },
  }) as unknown as Response;

const errRes = (status: number, code: string, message: string) =>
  res({ object: 'error', status, code, message }, false, status);

/** Records the pacing instead of living through it. */
class TestClient extends NotionClient {
  waits: number[] = [];
  clock = 0;
  protected now(): number {
    return this.clock;
  }
  protected async wait(ms: number): Promise<void> {
    this.waits.push(ms);
    this.clock += ms;
  }
}

describe('NotionClient', () => {
  let fetchMock: jest.Mock;
  let client: TestClient;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    client = new TestClient();
  });

  it('sends the bearer token and the pinned API version', async () => {
    fetchMock.mockResolvedValue(res({ bot: { workspace_name: 'IVY USA' } }));
    const me = await client.me('ntn_secret');
    expect(me.name).toBe('IVY USA');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.notion.com/v1/users/me');
    expect(init.headers.Authorization).toBe('Bearer ntn_secret');
    // Notion refuses a request with no version header, and an unpinned one
    // would let a future release reshape the block payloads unnoticed.
    expect(init.headers['Notion-Version']).toBe(NOTION_VERSION);
  });

  it('paces requests instead of spending the rate budget at once', async () => {
    fetchMock.mockResolvedValue(res({ results: [], has_more: false }));
    await client.pageBlocks('t', ID);
    await client.pageBlocks('t', ID);
    await client.pageBlocks('t', ID);
    // The first goes straight through; the rest are held back.
    expect(client.waits).toEqual([350, 350]);
  });

  it('asks the database endpoint first and falls through to the page one', async () => {
    fetchMock
      .mockResolvedValueOnce(errRes(404, 'object_not_found', 'Could not find database'))
      .mockResolvedValueOnce(
        res({
          id: DASHED,
          url: 'https://www.notion.so/Manual-abc',
          properties: { Name: { type: 'title', title: [{ plain_text: 'Manual' }] } },
        }),
      );
    const target = await client.retrieveTarget('t', ID);
    expect(target.kind).toBe('page');
    expect(target.ref.title).toBe('Manual');
    expect(target.ref.url).toBe('https://www.notion.so/Manual-abc');
    expect(fetchMock.mock.calls[0][0]).toBe(`https://api.notion.com/v1/databases/${DASHED}`);
    expect(fetchMock.mock.calls[1][0]).toBe(`https://api.notion.com/v1/pages/${DASHED}`);
  });

  it('reads a database title from the top level', async () => {
    fetchMock.mockResolvedValueOnce(res({ id: DASHED, title: [{ plain_text: 'FAQ' }] }));
    const target = await client.retrieveTarget('t', ID);
    expect(target).toMatchObject({ kind: 'database', ref: { title: 'FAQ' } });
  });

  it('follows the cursor and leaves archived rows behind', async () => {
    fetchMock
      .mockResolvedValueOnce(
        res({
          results: [
            { id: 'p1', properties: { Name: { type: 'title', title: [{ plain_text: 'One' }] } } },
            { id: 'p2', archived: true, properties: {} },
          ],
          has_more: true,
          next_cursor: 'c2',
        }),
      )
      .mockResolvedValueOnce(
        res({
          results: [{ id: 'p3', properties: { Name: { type: 'title', title: [{ plain_text: 'Three' }] } } }],
          has_more: false,
        }),
      );
    const listing = await client.listDatabasePages('t', ID);
    expect(listing.pages.map((p) => p.id)).toEqual(['p1', 'p3']);
    expect(listing.hasMore).toBe(false);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).start_cursor).toBe('c2');
  });

  it('stops at the ceiling and says the count is a floor', async () => {
    fetchMock.mockResolvedValue(
      res({ results: [{ id: 'p1', properties: {} }], has_more: true, next_cursor: 'c2' }),
    );
    const listing = await client.listDatabasePages('t', ID, 1);
    expect(listing.pages).toHaveLength(1);
    expect(listing.hasMore).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('lists only the direct child pages of a page', async () => {
    fetchMock.mockResolvedValueOnce(
      res({
        results: [
          { id: 'c-1', type: 'child_page', child_page: { title: 'Shipping' } },
          { id: 'b-1', type: 'paragraph', paragraph: { rich_text: [] } },
          { id: 'c-2', type: 'child_database', child_database: { title: 'Rates' } },
        ],
        has_more: false,
      }),
    );
    const listing = await client.listChildPages('t', ID);
    expect(listing.pages).toEqual([
      { id: 'c1', title: 'Shipping', url: 'https://www.notion.so/c1' },
    ]);
  });

  it('resolves nested blocks down to the depth cap and no further', async () => {
    const withChild = (id: string) =>
      res({ results: [{ id, type: 'paragraph', has_children: true, paragraph: {} }], has_more: false });
    fetchMock
      .mockResolvedValueOnce(withChild('lvl1'))
      .mockResolvedValueOnce(withChild('lvl2'))
      .mockResolvedValueOnce(withChild('lvl3'));
    const { blocks, truncated } = await client.pageBlocks('t', ID);
    // One request for the page, then one per parent block until the cap.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(blocks[0].children?.[0].children?.[0].children).toBeUndefined();
    expect(truncated).toBe(false);
  });

  it('stops a page that would cost more requests than it is worth', async () => {
    // Depth alone does not bound this: one page of many toggles is one request
    // each, and at 350ms apiece a single document could run for minutes.
    fetchMock.mockResolvedValue(
      res({
        results: Array.from({ length: 5 }, (_, i) => ({
          id: `b${i}`,
          type: 'paragraph',
          has_children: true,
          paragraph: {},
        })),
        has_more: false,
      }),
    );
    const { truncated } = await client.pageBlocks('t', ID);
    expect(truncated).toBe(true);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(MAX_REQUESTS_PER_PAGE);
  });

  it('caps how long a Retry-After can park the sync', async () => {
    fetchMock
      .mockResolvedValueOnce(res({ code: 'rate_limited' }, false, 429, { 'Retry-After': '86400' }))
      .mockResolvedValueOnce(res({ bot: { workspace_name: 'IVY' } }));
    await client.me('t');
    // Honouring a day-long wait verbatim is worse than failing the run.
    expect(Math.max(...client.waits)).toBeLessThanOrEqual(30_000);
  });

  it('gives every request a timeout so a stalled one cannot hold the sync', async () => {
    fetchMock.mockResolvedValue(res({ bot: {} }));
    await client.me('t');
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('honours Retry-After once, then gives up', async () => {
    fetchMock
      .mockResolvedValueOnce(res({ code: 'rate_limited' }, false, 429, { 'Retry-After': '2' }))
      .mockResolvedValueOnce(res({ bot: { workspace_name: 'IVY' } }));
    await client.me('t');
    expect(client.waits).toContain(2000);

    fetchMock.mockResolvedValue(res({ code: 'rate_limited' }, false, 429, { 'Retry-After': '1' }));
    // A 429 that survives its own Retry-After is a signal to stop, not to keep
    // spending a budget the tenant's other integrations share.
    await expect(client.me('t')).rejects.toBeInstanceOf(NotionRequestError);
  });

  it('separates a rejected token from a refused object', async () => {
    fetchMock.mockResolvedValueOnce(errRes(401, 'unauthorized', 'API token is invalid.'));
    await expect(client.me('bad')).rejects.toBeInstanceOf(NotionAuthError);

    fetchMock.mockResolvedValueOnce(errRes(404, 'object_not_found', 'Could not find page'));
    fetchMock.mockResolvedValueOnce(errRes(404, 'object_not_found', 'Could not find page'));
    await expect(client.retrieveTarget('t', ID)).rejects.toMatchObject({
      status: 404,
      code: 'object_not_found',
    });
  });

  it('passes Notion’s own wording through rather than inventing one', async () => {
    fetchMock.mockResolvedValueOnce(errRes(400, 'validation_error', 'body.page_size should be ≤ 100'));
    await expect(client.me('t')).rejects.toThrow('body.page_size should be ≤ 100');
  });
});
