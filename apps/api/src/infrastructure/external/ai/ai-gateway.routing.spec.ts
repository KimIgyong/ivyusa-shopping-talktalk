import { AiGatewayService, ROUTING_SOURCE } from './ai-gateway.service';
import type { AiEngine } from '../../../domain/ai-engine/entity/ai-engine.entity';
import type { TenantAiSetting } from '../../../domain/ai-engine/entity/tenant-ai-setting.entity';

/**
 * Engine resolution (FR-070). This decides which provider actually answers a
 * customer, so a wrong fallback is invisible in the console and obvious in the
 * transcript — the exact failure the coaching channel hit on its first deploy.
 */

const STUB = { id: 1, provider: 'stub', name: 'Built-in Stub', status: 'enabled', isDefault: 1 } as AiEngine;
const CLAUDE = { id: 2, provider: 'anthropic', name: 'Anthropic', status: 'enabled', isDefault: 0 } as AiEngine;
const DISABLED = { id: 3, provider: 'anthropic', name: 'Old', status: 'disabled', isDefault: 0 } as AiEngine;

function gatewayWith(settings: Array<{ func: string; engineId: number }>, engines: AiEngine[]) {
  const settingRepo = {
    findOne: async ({ where }: { where: { tenantId: number; func: string } }) =>
      (settings.find((s) => s.func === where.func) as TenantAiSetting | undefined) ?? null,
  };
  const engineRepo = {
    findOne: async ({ where }: { where: Record<string, unknown> }) => {
      if (where.id !== undefined) return engines.find((e) => e.id === where.id) ?? null;
      // default lookups: tenant-scoped first, then platform-wide (tenantId absent)
      return (
        engines.find(
          (e) =>
            e.isDefault === 1 &&
            e.status === 'enabled' &&
            (where.tenantId === undefined || e.tenantId === where.tenantId),
        ) ?? null
      );
    },
  };
  const adapter = { provider: 'stub', complete: async () => ({}) } as never;
  return new AiGatewayService(
    engineRepo as never,
    settingRepo as never,
    adapter,
    adapter,
    adapter,
    adapter,
  );
}

describe('AiGatewayService.resolveRouting', () => {
  it('uses the engine a function is explicitly assigned', async () => {
    const g = gatewayWith([{ func: 'rag', engineId: 2 }], [STUB, CLAUDE]);
    const r = await g.resolveRouting(1, 'rag');
    expect(r.engine?.id).toBe(2);
    expect(r.source).toBe(ROUTING_SOURCE.EXPLICIT);
  });

  it('lets coach inherit the RAG engine when it has none of its own', async () => {
    // The deploy case: a tenant running Anthropic for customer conversations
    // must not get stub coaching just because 'coach' postdates its setup.
    const g = gatewayWith([{ func: 'rag', engineId: 2 }], [STUB, CLAUDE]);
    const r = await g.resolveRouting(1, 'coach');
    expect(r.engine?.id).toBe(2);
    expect(r.source).toBe(ROUTING_SOURCE.INHERITED);
    expect(r.inheritedFrom).toBe('rag');
  });

  it('falls back from rag to chat when only chat is configured', async () => {
    const g = gatewayWith([{ func: 'chat', engineId: 2 }], [STUB, CLAUDE]);
    const r = await g.resolveRouting(1, 'coach');
    expect(r.inheritedFrom).toBe('chat');
  });

  it('prefers an explicit coach engine over the inherited one', async () => {
    const g = gatewayWith(
      [
        { func: 'rag', engineId: 2 },
        { func: 'coach', engineId: 1 },
      ],
      [STUB, CLAUDE],
    );
    const r = await g.resolveRouting(1, 'coach');
    expect(r.engine?.id).toBe(1);
    expect(r.source).toBe(ROUTING_SOURCE.EXPLICIT);
  });

  it('skips a disabled engine and keeps looking', async () => {
    const g = gatewayWith([{ func: 'coach', engineId: 3 }], [STUB, CLAUDE, DISABLED]);
    const r = await g.resolveRouting(1, 'coach');
    expect(r.engine?.id).toBe(1);
    expect(r.source).toBe(ROUTING_SOURCE.PLATFORM_DEFAULT);
  });

  it('lands on the platform default when nothing is configured at all', async () => {
    const g = gatewayWith([], [STUB, CLAUDE]);
    const r = await g.resolveRouting(1, 'coach');
    expect(r.engine?.id).toBe(1);
    expect(r.source).toBe(ROUTING_SOURCE.PLATFORM_DEFAULT);
  });

  it('does not let other functions inherit', async () => {
    // Only coach declares an inheritance chain; summary must keep its old
    // behaviour of dropping straight to the defaults.
    const g = gatewayWith([{ func: 'rag', engineId: 2 }], [STUB, CLAUDE]);
    const r = await g.resolveRouting(1, 'summary');
    expect(r.source).toBe(ROUTING_SOURCE.PLATFORM_DEFAULT);
    expect(r.engine?.id).toBe(1);
  });

  it('reports no engine when the platform has none enabled', async () => {
    const g = gatewayWith([], []);
    const r = await g.resolveRouting(1, 'coach');
    expect(r.engine).toBeNull();
    expect(r.source).toBe(ROUTING_SOURCE.NONE);
  });
});
