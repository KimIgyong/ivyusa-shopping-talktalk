import { AiConfigService } from './ai-config.service';
import type { ScenarioButton } from './entity/tenant-ai-config.entity';

/**
 * Scenario-button agent scoping (REQ-260825 R5): agentIds narrows VISIBILITY
 * only, an empty list means every agent, a NULL session pin matches the
 * tenant's default agent — and the save-path sanitizer must carry the field
 * (it rebuilds each button, so anything unlisted is silently dropped).
 */
describe('AiConfigService — scenario agent scope', () => {
  function build(opts: {
    buttons: ScenarioButton[];
    sessionAgentId?: number | null;
    defaultAgentId?: number;
  }) {
    const session = { id: 9, tenantId: 1, aiAgentId: opts.sessionAgentId ?? null };
    const sessionRepo = { findOne: jest.fn(async () => session) };
    const configRepo = {
      findOne: jest.fn(async () => ({ tenantId: 1, scenarioButtons: opts.buttons })),
    };
    const agentRepo = {
      findOne: jest.fn(async () =>
        opts.defaultAgentId != null ? { id: opts.defaultAgentId, isDefault: 1 } : null,
      ),
    };
    const svc = new AiConfigService(
      configRepo as never,
      agentRepo as never,
      sessionRepo as never,
      { findOne: jest.fn(async () => ({ id: 1 })) } as never,
      { available: () => false, get: jest.fn(), set: jest.fn(), del: jest.fn() } as never,
      { record: jest.fn() } as never,
      {} as never,
    );
    return { svc };
  }

  const btn = (id: string, agentIds?: number[]): ScenarioButton => ({
    id,
    label: id,
    action: 'message',
    enabled: true,
    ...(agentIds ? { agentIds } : {}),
  });

  it('unscoped buttons show for every agent (pre-R5 behaviour)', async () => {
    const h = build({ buttons: [btn('a'), btn('b')], sessionAgentId: 7 });

    const res = await h.svc.getScenarioForSession('tok');

    expect(res.scenarioButtons.map((b) => b.id)).toEqual(['a', 'b']);
  });

  it('a scoped button shows only for its agents', async () => {
    const h = build({ buttons: [btn('mine', [7]), btn('other', [8]), btn('all')], sessionAgentId: 7 });

    const res = await h.svc.getScenarioForSession('tok');

    expect(res.scenarioButtons.map((b) => b.id)).toEqual(['mine', 'all']);
  });

  it('a NULL pin matches buttons scoped to the tenant DEFAULT agent', async () => {
    const h = build({
      buttons: [btn('default-only', [3]), btn('other', [8])],
      sessionAgentId: null,
      defaultAgentId: 3,
    });

    const res = await h.svc.getScenarioForSession('tok');

    expect(res.scenarioButtons.map((b) => b.id)).toEqual(['default-only']);
  });

  it('sanitize keeps agentIds (deduped, numeric) and omits an empty list', () => {
    const h = build({ buttons: [] });
    const sanitized = (
      h.svc as unknown as { sanitize: (b: ScenarioButton[]) => ScenarioButton[] }
    ).sanitize([
      { id: 'x', label: 'X', action: 'message', enabled: true, agentIds: [7, 7, 0, NaN as never] },
      { id: 'y', label: 'Y', action: 'message', enabled: true, agentIds: [] },
    ]);

    expect(sanitized[0].agentIds).toEqual([7]);
    expect('agentIds' in sanitized[1]).toBe(false);
  });
});
