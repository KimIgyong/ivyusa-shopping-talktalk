import { GdriveAdapter } from './gdrive.adapter';
import { GdriveClient, GOOGLE_DOC } from '../gdrive.client';
import { GdriveCredentialService } from '../gdrive-credential.service';
import { KnowledgeSource } from '../entity/knowledge-source.entity';

const source = (config: Record<string, unknown> | null = { folderId: 'folder-abc123' }) =>
  ({ id: 9, tenantId: 1, type: 'gdrive', name: '정책 문서', configJson: config }) as KnowledgeSource;

const build = (opts: { files?: unknown[]; text?: Record<string, string>; sa?: unknown } = {}) => {
  const client = {
    getAccessToken: jest.fn(async () => 'tok'),
    listFolder: jest.fn(async () => opts.files ?? []),
    readFile: jest.fn(async (_t: string, f: { id: string }) => opts.text?.[f.id] ?? null),
  } as unknown as GdriveClient;
  const credentials = {
    load: jest.fn(async () =>
      opts.sa === undefined ? { clientEmail: 'kb@p.iam.gserviceaccount.com', privateKey: 'pem' } : opts.sa,
    ),
  } as unknown as GdriveCredentialService;
  return { adapter: new GdriveAdapter(client, credentials), client };
};

describe('GdriveAdapter.validateConfig', () => {
  it('requires a folder id', () => {
    expect(build().adapter.validateConfig(null)).toMatch(/folder ID is required/);
    expect(build().adapter.validateConfig({ folderId: '  ' })).toMatch(/folder ID is required/);
  });

  it('tells an operator who pasted the whole URL what to do', () => {
    // The likeliest mistake, and "invalid" alone does not help.
    const msg = build().adapter.validateConfig({
      folderId: 'https://drive.google.com/drive/folders/1a2B3c4D5e6F7g8H9i',
    });
    expect(msg).toMatch(/only the folder ID/);
  });

  it('accepts a real-looking id', () => {
    expect(build().adapter.validateConfig({ folderId: '1a2B3c4D5e6F7g8H9i_JkLmNoPq' })).toBeNull();
  });
});

describe('GdriveAdapter.fetchAll', () => {
  it('turns supported files into source items keyed by file id', async () => {
    const { adapter } = build({
      files: [{ id: 'f1', name: 'Return policy', mimeType: GOOGLE_DOC }],
      text: { f1: 'Returns within 30 days.' },
    });
    const [item] = await adapter.fetchAll(1, source());
    expect(item).toEqual({
      externalKey: 'file:f1',
      title: 'Return policy',
      content: 'Returns within 30 days.',
      sourceUrl: 'https://drive.google.com/file/d/f1/view',
      category: '정책 문서',
    });
  });

  it('keeps the key stable when a document is renamed', async () => {
    const first = (
      await build({ files: [{ id: 'f1', name: 'Old', mimeType: GOOGLE_DOC }], text: { f1: 'x' } }).adapter.fetchAll(
        1,
        source(),
      )
    )[0];
    const second = (
      await build({ files: [{ id: 'f1', name: 'New', mimeType: GOOGLE_DOC }], text: { f1: 'x' } }).adapter.fetchAll(
        1,
        source(),
      )
    )[0];
    expect(second.externalKey).toBe(first.externalKey);
  });

  it('skips unsupported types and empty documents', async () => {
    const { adapter } = build({
      files: [
        { id: 'f1', name: 'Scan.pdf', mimeType: 'application/pdf' },
        { id: 'f2', name: 'Empty doc', mimeType: GOOGLE_DOC },
        { id: 'f3', name: 'Whitespace', mimeType: 'text/plain' },
        { id: 'f4', name: 'Real', mimeType: GOOGLE_DOC },
      ],
      text: { f2: '', f3: '   \n ', f4: 'content' },
    });
    const items = await adapter.fetchAll(1, source());
    expect(items.map((i) => i.externalKey)).toEqual(['file:f4']);
  });

  it('fails loudly when no credential is registered', async () => {
    // Silently returning [] would look like an emptied folder and, without the
    // pipeline guard, hide every document from this source.
    const { adapter } = build({ sa: null });
    await expect(adapter.fetchAll(1, source())).rejects.toThrow(/no Google service account key/);
  });

  it('fails when the source has no folder configured', async () => {
    const { adapter } = build();
    await expect(adapter.fetchAll(1, source(null))).rejects.toThrow(/no folderId/);
  });

  it('does not treat an empty listing as authoritative', () => {
    // Drive answers "no files" for a folder whose sharing was revoked exactly
    // as it does for one that is genuinely empty.
    expect(build().adapter.trustEmptyListing).toBe(false);
  });
});
