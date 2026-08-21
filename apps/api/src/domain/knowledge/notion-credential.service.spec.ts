import { NotionCredentialService } from './notion-credential.service';
import { NotionAuthError, NotionClient, NotionRequestError } from './notion.client';
import { IntegrationCredential } from '../tenant/entity/integration-credential.entity';
import { Repository } from 'typeorm';
import { BusinessException } from '../../global/exception/business.exception';
import { decryptSecret } from '../../global/util/crypto.util';

const OLD_ENV = process.env;
beforeAll(() => {
  // Real encryption, not a stub: the point of these tests is that what `save`
  // writes is what `load` can read back.
  process.env = { ...OLD_ENV, CRED_ENC_KEY: Buffer.alloc(32, 21).toString('base64') };
});
afterAll(() => {
  process.env = OLD_ENV;
});

const TOKEN = `ntn_${'a'.repeat(46)}`;
const ID = '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d';

const build = (over: Partial<Record<string, unknown>> = {}, stored?: IntegrationCredential) => {
  const rows: IntegrationCredential[] = stored ? [stored] : [];
  const repo = {
    findOne: jest.fn(async () => rows[0] ?? null),
    create: (d: Partial<IntegrationCredential>) => d as IntegrationCredential,
    save: jest.fn(async (r: IntegrationCredential) => {
      rows[0] = r;
      return r;
    }),
    delete: jest.fn(async () => ({ affected: 1 })),
  } as unknown as Repository<IntegrationCredential>;
  const client = {
    me: jest.fn(async () => ({ name: 'IVY USA' })),
    retrieveTarget: jest.fn(async () => ({
      kind: 'database',
      ref: { id: ID, title: 'FAQ', url: null },
      archived: false,
    })),
    listDatabasePages: jest.fn(async () => ({ pages: [{ id: 'p1', title: 'x', url: null }], hasMore: true })),
    listChildPages: jest.fn(async () => ({ pages: [], hasMore: false })),
    ...over,
  } as unknown as NotionClient;
  return { svc: new NotionCredentialService(repo, client), repo, rows, client };
};

describe('NotionCredentialService.save', () => {
  it('stores the token encrypted and echoes only a hint', async () => {
    const { svc, rows } = build();
    const saved = await svc.save(1, `  ${TOKEN}  `);
    expect(saved.hint).toBe(`…${TOKEN.slice(-4)}`);
    // The stored bytes must not be the token, and must decrypt back to it.
    expect(rows[0].secretEnc?.toString()).not.toContain(TOKEN);
    expect(decryptSecret(rows[0].secretEnc as Buffer)).toBe(TOKEN);
    expect(rows[0].status).toBe('connected');
  });

  it('rejects a wrong paste with the reason', async () => {
    const { svc } = build();
    await expect(svc.save(1, 'https://www.notion.so/my-integrations')).rejects.toBeInstanceOf(
      BusinessException,
    );
    await expect(svc.save(1, 'nope')).rejects.toBeInstanceOf(BusinessException);
  });
});

describe('NotionCredentialService.status', () => {
  it('shows only the last four characters', async () => {
    const { svc } = build();
    await svc.save(1, TOKEN);
    expect(await svc.status(1)).toEqual({ connected: true, tokenHint: `…${TOKEN.slice(-4)}` });
  });

  it('reports nothing registered when the row is absent', async () => {
    const { svc } = build();
    expect(await svc.status(1)).toEqual({ connected: false, tokenHint: null });
  });
});

describe('NotionCredentialService.test', () => {
  const withToken = async (over: Partial<Record<string, unknown>> = {}) => {
    const ctx = build(over);
    await ctx.svc.save(1, TOKEN);
    return ctx;
  };

  it('asks for a token before anything else', async () => {
    const { svc } = build();
    expect(await svc.test(1)).toEqual({
      ok: false,
      message: 'No Notion integration token is registered.',
    });
  });

  it('accepts a token on its own and names the workspace', async () => {
    const { svc } = await withToken();
    expect(await svc.test(1)).toEqual({ ok: true, message: 'Token accepted for IVY USA.' });
  });

  it('separates a rejected token from an unshared target', async () => {
    const rejected = await withToken({
      me: jest.fn(async () => {
        throw new NotionAuthError('API token is invalid.');
      }),
    });
    expect(await rejected.svc.test(1, ID)).toMatchObject({ ok: false });
    expect((await rejected.svc.test(1, ID)).message).toMatch(/rejected the token/);

    const unshared = await withToken({
      retrieveTarget: jest.fn(async () => {
        throw new NotionRequestError('Could not find page', 404, 'object_not_found');
      }),
    });
    const result = await unshared.svc.test(1, ID);
    expect(result.ok).toBe(false);
    // Notion answers object_not_found for both a typo and a page nobody
    // connected, and only one of those is fixed in the Connections menu.
    expect(result.message).toMatch(/Connections/);
  });

  it('reports how much of a readable database it can see', async () => {
    const { svc } = await withToken();
    const result = await svc.test(1, ID);
    expect(result).toMatchObject({ ok: true, kind: 'database', pages: 1 });
    // The listing stopped at the probe limit, so the count is shown as a floor.
    expect(result.message).toContain('1+');
  });

  it('counts a page target as itself plus its children', async () => {
    const { svc } = await withToken({
      retrieveTarget: jest.fn(async () => ({
        kind: 'page',
        ref: { id: ID, title: 'Manual', url: null },
        archived: false,
      })),
      listChildPages: jest.fn(async () => ({
        pages: [{ id: 'c1', title: 'Shipping', url: null }],
        hasMore: false,
      })),
    });
    expect(await svc.test(1, ID)).toMatchObject({ ok: true, kind: 'page', pages: 2 });
  });

  it('names a trashed target instead of reporting it missing', async () => {
    const { svc } = await withToken({
      retrieveTarget: jest.fn(async () => ({
        kind: 'page',
        ref: { id: ID, title: 'Old Manual', url: null },
        archived: true,
      })),
    });
    expect((await svc.test(1, ID)).message).toMatch(/trash/);
  });

  it('rejects a target that carries no id before calling Notion', async () => {
    const { svc, client } = await withToken();
    expect(await svc.test(1, 'https://www.notion.so/Manual')).toMatchObject({ ok: false });
    expect(client.retrieveTarget).not.toHaveBeenCalled();
  });
});
