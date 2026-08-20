import { AiAgentService } from './ai-agent.service';
import type { AiAgent } from './entity/ai-agent.entity';

/**
 * Multi AI agents (PLN-260820). These cases guard the invariants routing rests
 * on: exactly one default per tenant, the default can never be deleted or
 * deactivated (it is the fallback every unpinned session answers as), and a
 * legacy tenant's existing persona survives into its lazily-created default.
 *
 * TypeORM hands bigint PKs back as STRINGS — fixtures use string ids on purpose
 * (memory: bigint-pk-string-test-fixtures).
 */

interface Fixture {
  service: AiAgentService;
  rows: AiAgent[];
  delKeys: string[];
}

function fixtureFor(rows: Partial<AiAgent>[], legacyPersona?: string): Fixture {
  const store = rows.map((r) => ({ active: 1, isDefault: 0, rules: null, persona: null, ...r })) as AiAgent[];
  let nextId = 100;
  const agentRepo = {
    find: async ({ where }: { where: { tenantId: number } }) =>
      store.filter((r) => r.tenantId === where.tenantId),
    findOne: async ({ where }: { where: Partial<AiAgent> }) =>
      store.find((r) =>
        Object.entries(where).every(([k, v]) => {
          const actual = r[k as keyof AiAgent];
          // Route ids arrive as numbers while the stored PK is a string.
          return k === 'id' ? Number(actual) === Number(v) : actual === v;
        }),
      ) ?? null,
    create: (v: Partial<AiAgent>) => v as AiAgent,
    save: async (r: AiAgent) => {
      if (!r.id) {
        if (store.some((x) => x.tenantId === r.tenantId && x.code === r.code)) {
          throw new Error('ER_DUP_ENTRY');
        }
        r.id = String(nextId++) as unknown as number;
        store.push(r);
      }
      return r;
    },
    update: async (where: Partial<AiAgent>, patch: Partial<AiAgent>) => {
      store
        .filter((r) => Object.entries(where).every(([k, v]) => String(r[k as keyof AiAgent]) === String(v)))
        .forEach((r) => Object.assign(r, patch));
    },
    delete: async (where: Partial<AiAgent>) => {
      const i = store.findIndex((r) => Number(r.id) === Number(where.id));
      if (i >= 0) store.splice(i, 1);
    },
  };
  const configRepo = {
    findOne: async () => (legacyPersona ? { persona: legacyPersona, rules: ['legacy rule'] } : null),
  };
  const dataSource = {
    transaction: async (fn: (em: unknown) => Promise<void>) =>
      fn({
        update: async (_e: unknown, where: Partial<AiAgent>, patch: Partial<AiAgent>) =>
          agentRepo.update(where, patch),
      }),
  };
  const delKeys: string[] = [];
  const redis = { del: async (k: string) => void delKeys.push(k) };
  return {
    service: new AiAgentService(
      agentRepo as never,
      configRepo as never,
      dataSource as never,
      redis as never,
    ),
    rows: store,
    delKeys,
  };
}

describe('AiAgentService.ensureDefault', () => {
  it('inherits the legacy tenant_ai_config persona so the cutover is invisible to shoppers', async () => {
    const { service } = fixtureFor([], 'legacy persona');
    const row = await service.ensureDefault(1);
    expect(row).toMatchObject({ code: 'default', isDefault: 1, persona: 'legacy persona' });
    expect(row.rules).toEqual(['legacy rule']);
  });

  it('returns the existing default instead of minting a second one', async () => {
    const { service, rows } = fixtureFor([{ id: '5' as never, tenantId: 1, code: 'default', isDefault: 1 }]);
    const row = await service.ensureDefault(1);
    expect(String(row.id)).toBe('5');
    expect(rows).toHaveLength(1);
  });
});

describe('AiAgentService guards', () => {
  const base = [
    { id: '1' as never, tenantId: 1, code: 'default', name: 'Default', isDefault: 1 },
    { id: '2' as never, tenantId: 1, code: 'hotel-partner', name: 'Hotel', isDefault: 0 },
  ];

  it('refuses to delete the default agent — it is the routing fallback', async () => {
    const { service } = fixtureFor(base);
    await expect(service.remove(1, 1)).rejects.toMatchObject({ errorCode: 'E5051' });
  });

  it('refuses to deactivate the default agent', async () => {
    const { service } = fixtureFor(base);
    await expect(service.update(1, 1, { active: false })).rejects.toMatchObject({
      errorCode: 'E5051',
    });
  });

  it('rejects a duplicate code with E5052', async () => {
    const { service } = fixtureFor(base);
    await expect(service.create(1, { code: 'hotel-partner', name: 'x' })).rejects.toMatchObject({
      errorCode: 'E5052',
    });
  });

  it('rejects a code the embed attribute could not carry', async () => {
    const { service } = fixtureFor(base);
    await expect(service.create(1, { code: 'Hotel Partner!', name: 'x' })).rejects.toMatchObject({
      errorCode: 'E5003',
    });
  });

  it('never returns another tenant\'s agent', async () => {
    const { service } = fixtureFor(base);
    await expect(service.require(2, 2)).rejects.toMatchObject({ errorCode: 'E5050' });
  });
});

describe('AiAgentService.setDefault', () => {
  it('moves the flag atomically and reactivates the new default', async () => {
    const { service, rows } = fixtureFor([
      { id: '1' as never, tenantId: 1, code: 'default', isDefault: 1 },
      { id: '2' as never, tenantId: 1, code: 'landing', isDefault: 0, active: 0 },
    ]);
    const row = await service.setDefault(1, 2);
    expect(row).toMatchObject({ isDefault: 1, active: 1 });
    expect(rows.filter((r) => r.isDefault === 1)).toHaveLength(1);
  });
});

describe('AiAgentService cache invalidation', () => {
  it('drops both the agent key and the default slot on update', async () => {
    const { service, delKeys } = fixtureFor([
      { id: '2' as never, tenantId: 1, code: 'landing', isDefault: 0 },
    ]);
    await service.update(1, 2, { persona: 'new voice' });
    expect(delKeys).toEqual(expect.arrayContaining(['aicfg:persona:1:2', 'aicfg:persona:1:default']));
  });
});
