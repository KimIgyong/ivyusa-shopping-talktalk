import { AiConfigService } from './ai-config.service';
import { SCENARIOS } from '../chat/scenario-scripts';

/**
 * The shipped scenario copy (PLN-260903).
 *
 * The bug this pins: the console saved a button's reply edits under the BUTTON
 * action (`delivery_status`) while the runtime asked for the SCRIPT that button
 * runs (`shipping_policy`), so the edit was stored, acknowledged with a success
 * toast, and never spoken. `product_help` went further — the console offered an
 * editor for an action that has no script at all.
 */
describe('AiConfigService — scenario copy defaults & override keys', () => {
  function build(stored?: Record<string, unknown> | null) {
    const row: Record<string, unknown> = { tenantId: 1, scenarioOverrides: stored ?? null };
    const configRepo = {
      findOne: jest.fn(async () => row),
      create: jest.fn((v: Record<string, unknown>) => v),
      save: jest.fn(async (v: Record<string, unknown>) => v),
    };
    const svc = new AiConfigService(
      configRepo as never,
      { findOne: jest.fn(async () => null) } as never,
      { findOne: jest.fn(async () => null) } as never,
      { findOne: jest.fn(async () => ({ id: 1 })) } as never,
      { available: () => false, get: jest.fn(), set: jest.fn(), del: jest.fn() } as never,
      { record: jest.fn() } as never,
      {} as never,
    );
    return { svc, configRepo, row };
  }

  it('serves every shipped script in every language, with how it is reached', () => {
    const { svc } = build();
    const defaults = svc.getDefaults();

    expect(defaults.scripts).toHaveLength(Object.keys(SCENARIOS).length);
    for (const s of defaults.scripts) {
      // Six languages, no blanks — a language added to the registry must not
      // reach the console as an empty field.
      expect(Object.keys(s.reply).sort()).toEqual(['EN', 'ES', 'JA', 'KO', 'VI', 'ZH']);
      expect(Object.values(s.utterance).every((t) => t.trim().length > 0)).toBe(true);
    }
    // The delivery button and its script are two different names; the console
    // needs the mapping to label the row.
    expect(defaults.scriptByButtonAction.delivery_status).toBe('shipping_policy');
    const shipping = defaults.scripts.find((s) => s.action === 'shipping_policy');
    expect(shipping).toMatchObject({ via: 'button', buttonAction: 'delivery_status' });
    // Follow-up-only scripts are listed too — invisible copy cannot be fixed.
    expect(defaults.scripts.find((s) => s.action === 'refund_policy')?.via).toBe('follow_up');
  });

  it('stores an edit made on the delivery button under the script the runtime reads', async () => {
    const { svc, configRepo } = build();
    await svc.upsertConfig(1, {
      scenarioOverrides: { delivery_status: { reply: { EN: 'We deliver by drone.' } } },
    });
    const saved = (configRepo.save.mock.calls[0][0] as { scenarioOverrides: Record<string, unknown> })
      .scenarioOverrides;
    expect(saved.shipping_policy).toEqual({ reply: { EN: 'We deliver by drone.' } });
    expect(saved.delivery_status).toBeUndefined();
  });

  it('reads back an override an older console saved under the button action', async () => {
    const { svc } = build({ delivery_status: { reply: { EN: 'Legacy copy.' } } });
    // No migration ran; the value stored under the old key must still apply.
    await expect(svc.getScenarioOverride(1, 'shipping_policy')).resolves.toEqual({
      reply: { EN: 'Legacy copy.' },
    });
  });

  it('drops an action that has no shipped script instead of storing dead config', async () => {
    const { svc, configRepo } = build();
    await svc.upsertConfig(1, {
      scenarioOverrides: {
        product_help: { reply: { EN: 'Never spoken.' } },
        cancel_refund: { reply: { EN: 'Real edit.' } },
      },
    });
    const saved = (configRepo.save.mock.calls[0][0] as { scenarioOverrides: Record<string, unknown> })
      .scenarioOverrides;
    expect(saved.product_help).toBeUndefined();
    expect(saved.cancel_refund).toEqual({ reply: { EN: 'Real edit.' } });
  });

  it('refuses a follow-up chip whose id leads nowhere', async () => {
    const { svc, configRepo } = build();
    await svc.upsertConfig(1, {
      scenarioOverrides: {
        cancel_refund: {
          followUps: [
            { id: '주문확인', label: { KO: '주문확인' } }, // free text — a dead chip
            { id: 'my_orders', label: { KO: '내 주문' } }, // control action
            { id: 'refund_policy', label: { KO: '환불 규정' } }, // another script
          ],
        },
      },
    });
    const saved = (configRepo.save.mock.calls[0][0] as {
      scenarioOverrides: Record<string, { followUps: Array<{ id: string }> }>;
    }).scenarioOverrides;
    expect(saved.cancel_refund.followUps.map((f) => f.id)).toEqual(['my_orders', 'refund_policy']);
  });

  it('does not freeze the shipped copy into the tenant row when it was not changed', async () => {
    const { svc, configRepo } = build();
    // The console now shows the defaults as values, so a plain Save round-trips
    // them all back. Identical text is not an edit.
    await svc.upsertConfig(1, {
      scenarioOverrides: {
        cancel_refund: {
          reply: { ...SCENARIOS.cancel_refund.reply },
          utterance: { ...SCENARIOS.cancel_refund.utterance, KO: '환불 문의드립니다.' },
        },
      },
    });
    const saved = (configRepo.save.mock.calls[0][0] as {
      scenarioOverrides: Record<string, { reply?: unknown; utterance?: unknown }>;
    }).scenarioOverrides;
    expect(saved.cancel_refund.reply).toBeUndefined();
    expect(saved.cancel_refund.utterance).toEqual({ KO: '환불 문의드립니다.' });
  });
});
