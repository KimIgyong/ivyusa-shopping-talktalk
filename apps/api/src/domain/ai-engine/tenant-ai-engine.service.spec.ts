import { randomBytes } from 'node:crypto';
import { encryptSecret } from '../../global/util/crypto.util';
import {
  TenantAiEngineService,
  classifyTestFailure,
  ENGINE_TEST_REASON,
} from './tenant-ai-engine.service';

describe('classifyTestFailure', () => {
  // The fixes differ — a key to replace, a name to correct, a wait — so
  // collapsing these into "connection failed" sends people to check a server
  // that is fine.
  it.each([
    ['401 Unauthorized', ENGINE_TEST_REASON.AUTH],
    ['invalid_api_key: incorrect API key provided', ENGINE_TEST_REASON.AUTH],
    ['404 model not_found', ENGINE_TEST_REASON.MODEL],
    ['unknown model claude-opus-9', ENGINE_TEST_REASON.MODEL],
    ['429 rate_limit_error', ENGINE_TEST_REASON.RATE_LIMIT],
    ['Overloaded', ENGINE_TEST_REASON.RATE_LIMIT],
    ['getaddrinfo ENOTFOUND api.example.com', ENGINE_TEST_REASON.UNREACHABLE],
  ])('%s → %s', (message, expected) => {
    expect(classifyTestFailure(message)).toBe(expected);
  });
});

describe('TenantAiEngineService', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, CRED_ENC_KEY: randomBytes(32).toString('base64') };
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });

  const engine = (over: Record<string, unknown> = {}) => ({
    id: 5,
    tenantId: 1,
    provider: 'anthropic',
    name: 'Mine',
    model: 'claude-opus-4-8',
    endpoint: null,
    // A real ciphertext: the service decrypts it to call the provider, so a
    // placeholder buffer would fail inside the try and be classified as an
    // adapter error rather than exercising the path under test.
    apiKeyEncrypted: encryptSecret('sk-test'),
    status: 'enabled',
    isDefault: 0,
    ...over,
  });

  const build = (rows: any[] = [], settings: any[] = [], complete?: () => Promise<unknown>) => {
    const saved: any[] = [];
    const updates: any[] = [];
    const deletes: any[] = [];
    const engineRepo = {
      find: jest.fn(async () => rows),
      findOne: jest.fn(async ({ where }: any) =>
        rows.find(
          (r) => String(r.id) === String(where.id) && String(r.tenantId) === String(where.tenantId),
        ) ?? null,
      ),
      create: (d: any) => ({ ...d }),
      save: jest.fn(async (d: any) => {
        saved.push(d);
        return { id: d.id ?? 77, ...d };
      }),
      update: jest.fn(async (w: any, set: any) => updates.push({ w, set })),
      delete: jest.fn(async (w: any) => deletes.push(w)),
    };
    const settingRepo = { find: jest.fn(async () => settings) };
    // A real provider is always present for the whitelisted set, so the double
    // supplies one; `complete` decides what the provider says back.
    const adapter = {
      provider: 'anthropic',
      complete: complete ?? (async () => ({ text: 'pong' })),
    };
    const gateway = { adapterFor: jest.fn(() => adapter) };
    return {
      svc: new TenantAiEngineService(engineRepo as never, settingRepo as never, gateway as never),
      saved,
      updates,
      deletes,
    };
  };

  describe('create', () => {
    it('takes the tenant from the caller, never from the body', async () => {
      // The admin DTO carries tenant_id; if this path did too, a tenant could
      // plant an engine inside another tenant.
      const { svc, saved } = build();

      await svc.create(42, {
        name: 'Mine',
        provider: 'anthropic',
        model: 'm',
        apiKey: 'sk-live',
        ...({ tenantId: 999, tenant_id: 999 } as never),
      });

      expect(saved[0].tenantId).toBe(42);
    });

    it('parks a key-less engine as disabled instead of letting it fall through', async () => {
      // An enabled engine with no key cannot answer, and the gateway would drop
      // to the stub without saying so.
      const { svc, saved } = build();

      await svc.create(1, { name: 'No key', provider: 'openai', model: 'gpt-5' });

      expect(saved[0]).toMatchObject({ status: 'disabled', apiKeyEncrypted: null });
    });

    it('refuses a provider nothing can call', async () => {
      const { svc } = build();

      await expect(
        svc.create(1, { name: 'x', provider: 'custom', model: 'm', apiKey: 'k' }),
      ).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('keeps the stored key when the field is left empty', async () => {
      // The form cannot show the key, so blank is its resting state — treating
      // that as "delete" would wipe a working engine on a rename.
      const existing = engine();
      const { svc, saved } = build([existing]);

      await svc.update(1, 5, { name: 'Renamed' });

      expect(saved[0].apiKeyEncrypted).toBe(existing.apiKeyEncrypted);
      expect(saved[0].name).toBe('Renamed');
    });

    it('re-enables once a key is supplied', async () => {
      const { svc, saved } = build([engine({ status: 'disabled', apiKeyEncrypted: null })]);

      await svc.update(1, 5, { apiKey: 'sk-new' });

      expect(saved[0].status).toBe('enabled');
      expect(saved[0].apiKeyEncrypted).not.toBeNull();
    });

    it("404s on another tenant's engine", async () => {
      const { svc } = build([engine({ tenantId: 2 })]);

      await expect(svc.update(1, 5, { name: 'theirs' })).rejects.toThrow();
    });
  });

  describe('setDefault', () => {
    it('clears the other defaults in the same tenant', async () => {
      // Two defaults resolve by whichever row the database returns first.
      const { svc, updates, saved } = build([engine()]);

      await svc.setDefault(1, 5);

      expect(updates[0].w).toMatchObject({ tenantId: 1 });
      expect(updates[0].set).toEqual({ isDefault: 0 });
      expect(saved[0].isDefault).toBe(1);
    });

    it('refuses a disabled engine', async () => {
      const { svc } = build([engine({ status: 'disabled' })]);

      await expect(svc.setDefault(1, 5)).rejects.toThrow();
    });
  });

  describe('remove', () => {
    it('refuses while a function still points at it', async () => {
      // Deleting is not an error the operator would see: the function falls
      // back to the platform engine and the answers change quietly.
      const { svc, deletes } = build([engine()], [{ func: 'chat', engineId: 5 }]);

      await expect(svc.remove(1, 5)).rejects.toThrow();
      expect(deletes).toHaveLength(0);
    });

    it('names the functions holding it', async () => {
      const { svc } = build([engine()], [{ func: 'chat' }, { func: 'rag' }]);

      expect(await svc.usedBy(1, 5)).toEqual(['chat', 'rag']);
    });

    it('deletes an unused one, scoped by tenant', async () => {
      const { svc, deletes } = build([engine()], []);

      await svc.remove(1, 5);

      expect(deletes[0]).toEqual({ id: 5, tenantId: 1 });
    });
  });

  describe('test', () => {
    it('reports a missing key as an auth problem without calling out', async () => {
      const called = jest.fn();
      const { svc } = build([engine({ apiKeyEncrypted: null })], [], called as never);

      const res = await svc.test(1, 5);

      expect(res).toMatchObject({ ok: false, reason: ENGINE_TEST_REASON.AUTH });
      expect(called).not.toHaveBeenCalled();
    });

    it('classifies what the provider refused with, not just that it refused', async () => {
      const { svc } = build([engine()], [], async () => {
        throw new Error('404 model not_found: claude-opus-9');
      });

      const res = await svc.test(1, 5);

      expect(res).toMatchObject({ ok: false, reason: ENGINE_TEST_REASON.MODEL });
      expect(res.detail).toContain('claude-opus-9');
    });
  });
});
