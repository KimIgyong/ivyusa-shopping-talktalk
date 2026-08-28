import { KnowledgeService } from './knowledge.service';

/**
 * Sync-failure reason persistence (REQ-260828 B1): a thrown sync must record
 * WHY on the source row, clamped, not just a red zeroed result — the actual
 * cause used to live only in the server log (the go2joy 404 case).
 */
describe('KnowledgeService — syncSource failure reason', () => {
  function build(err: Error) {
    const recorded: Array<[string, Record<string, unknown>]> = [];
    const sourceSync = {
      sync: jest.fn(async () => {
        throw err;
      }),
      recordSyncState: jest.fn(async (_s: unknown, status: string, result: Record<string, unknown>) => {
        recorded.push([status, result]);
      }),
      supportedTypes: jest.fn(() => ['gdrive', 'notion']),
    };
    const sourceRepo = {
      findOne: jest.fn(async () => ({ id: 7, tenantId: 4, type: 'notion', name: 'n' })),
    };
    const svc = new KnowledgeService(
      sourceRepo as never,
      {} as never, // docRepo
      {} as never, // fileRepo
      {} as never, // ai
      {} as never, // qdrant
      {} as never, // rag
      {} as never, // moderation
      {} as never, // conflicts
      {} as never, // revisions
      {} as never, // productImport
      {} as never, // catalogSync
      {} as never, // usageGuides
      sourceSync as never,
      {} as never, // credRepo
    );
    return { svc, recorded };
  }

  it('persists the thrown message on the failed row, clamped to 200 chars', async () => {
    const h = build(new Error('x'.repeat(300)));

    await expect(h.svc.syncSource(4, 7, 1)).rejects.toThrow();

    expect(h.recorded).toHaveLength(1);
    const [status, result] = h.recorded[0];
    expect(status).toBe('failed');
    expect((result.error as string).length).toBe(200);
    expect(result.fetched).toBe(0);
  });

  it('keeps the original error propagating to the caller', async () => {
    const h = build(new Error('Could not find page with ID: abc'));

    await expect(h.svc.syncSource(4, 7, 1)).rejects.toThrow('Could not find page');
    expect((h.recorded[0][1].error as string)).toContain('Could not find page');
  });
});
