import { AiConfigService, DEFAULT_SCENARIO_BUTTONS } from './ai-config.service';
import { resolveScenarioLabel } from './scenario-label.util';
import type { ScenarioButton } from './entity/tenant-ai-config.entity';

/**
 * Per-language scenario labels (PLN-260903 S3).
 *
 * The label used to be one string, so a tenant serving six languages showed
 * whichever language its operator happened to type — on all of them. The wire
 * contract stays a plain string: the server resolves per session language, so
 * a widget build already cached in a shopper's browser keeps working.
 */
describe('AiConfigService — scenario button labels', () => {
  function build(buttons?: ScenarioButton[], sessionLanguage = 'KO') {
    const session = { id: 9, tenantId: 1, aiAgentId: null, language: sessionLanguage, sessionToken: 'tok' };
    const configRepo = {
      findOne: jest.fn(async () => (buttons ? { tenantId: 1, scenarioButtons: buttons } : null)),
      create: jest.fn((v: Record<string, unknown>) => v),
      save: jest.fn(async (v: Record<string, unknown>) => v),
    };
    const svc = new AiConfigService(
      configRepo as never,
      { findOne: jest.fn(async () => null) } as never,
      { findOne: jest.fn(async () => session) } as never,
      { findOne: jest.fn(async () => ({ id: 1 })) } as never,
      { available: () => false, get: jest.fn(), set: jest.fn(), del: jest.fn() } as never,
      { record: jest.fn() } as never,
      {} as never,
    );
    return { svc, configRepo };
  }

  it('resolves a label English-first, then any language that has text', () => {
    expect(resolveScenarioLabel({ EN: 'Orders', KO: '내 주문' }, 'KO')).toBe('내 주문');
    // The shopper's language is blank — better English than an empty pill.
    expect(resolveScenarioLabel({ EN: 'Orders' }, 'VI')).toBe('Orders');
    expect(resolveScenarioLabel({ VI: 'Đơn hàng' }, 'JA')).toBe('Đơn hàng');
    // The pre-S3 shape means "the same in every language".
    expect(resolveScenarioLabel('Orders', 'KO')).toBe('Orders');
    expect(resolveScenarioLabel(undefined, 'KO')).toBe('');
  });

  it('serves the widget one string per button, in the session language', async () => {
    const { svc } = build([
      { id: 'a', action: 'my_orders', enabled: true, label: { EN: 'My Orders', KO: '내 주문' } },
      { id: 'b', action: 'message', enabled: true, label: 'Same everywhere' },
    ]);
    const res = await svc.getScenarioForSession('tok');
    expect(res.scenarioButtons.map((b) => b.label)).toEqual(['내 주문', 'Same everywhere']);
    // The contract is a string — a map would render as [object Object].
    for (const b of res.scenarioButtons) expect(typeof b.label).toBe('string');
  });

  it('ships localized defaults, so an unconfigured tenant is not English-only', async () => {
    for (const b of DEFAULT_SCENARIO_BUTTONS) {
      expect(Object.keys(b.label as Record<string, string>).sort()).toEqual([
        'EN', 'ES', 'JA', 'KO', 'VI', 'ZH',
      ]);
    }
    const { svc } = build(undefined, 'VI');
    const res = await svc.getScenarioForSession('tok');
    expect(res.scenarioButtons[0].label).toBe('Tình trạng giao hàng');
  });

  it('keeps a one-language-everywhere label as a plain string on save', async () => {
    const { svc, configRepo } = build();
    await svc.upsertConfig(1, {
      scenarioButtons: [
        {
          id: 'a',
          action: 'message',
          enabled: true,
          // Six identical values mean "one label" — storing six copies of it
          // would make a later edit look like five stale translations.
          label: { EN: 'Book', ES: 'Book', KO: 'Book', VI: 'Book', JA: 'Book', ZH: 'Book' },
        },
        { id: 'b', action: 'message', enabled: true, label: { EN: 'Rooms', KO: '객실' } },
        { id: 'c', action: 'message', enabled: true, label: { KO: '   ' } }, // blank → dropped
      ],
    });
    const saved = (configRepo.save.mock.calls[0][0] as { scenarioButtons: ScenarioButton[] })
      .scenarioButtons;
    expect(saved).toHaveLength(2);
    expect(saved[0].label).toBe('Book');
    expect(saved[1].label).toEqual({ EN: 'Rooms', KO: '객실' });
  });
});
