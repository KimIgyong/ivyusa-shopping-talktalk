import {
  channelAllowedByTenant,
  isMarketingCategory,
  WIDGET_TAB,
  WIDGET_TABS_DEFAULT,
  WIDGET_TAB_ORDER,
  normalizeWidgetTabs,
} from './enum.types';

/**
 * `widget_tabs` is a JSON column a console writes into and a widget renders from,
 * with no schema between them. Everything the widget is allowed to assume about
 * that value — known keys, no duplicates, fixed order, never empty — is enforced
 * here and nowhere else.
 */
describe('normalizeWidgetTabs', () => {
  it('keeps known tabs and drops everything else', () => {
    expect(normalizeWidgetTabs(['chat', 'nope', 'orders'])).toEqual(['orders', 'chat']);
  });

  it('imposes the canonical order regardless of input order', () => {
    // The console emits tabs in whatever order its checkboxes were ticked; the
    // tab bar must not reorder itself because of that.
    expect(normalizeWidgetTabs(['chat', 'notifications', 'orders'])).toEqual([...WIDGET_TAB_ORDER]);
    expect(normalizeWidgetTabs(['orders', 'notifications'])).toEqual(['notifications', 'orders']);
  });

  it('collapses duplicates', () => {
    expect(normalizeWidgetTabs(['chat', 'chat', 'chat'])).toEqual(['chat']);
  });

  it('returns null when nothing renderable survives', () => {
    // Null is the signal for "caller decides": a 400 on write, the default on read.
    expect(normalizeWidgetTabs([])).toBeNull();
    expect(normalizeWidgetTabs(['ghost-tab'])).toBeNull();
  });

  it('returns null for values that are not arrays at all', () => {
    // A JSON column can hold anything a bad write put there.
    for (const bad of [null, undefined, 'chat', 42, {}, { chat: true }]) {
      expect(normalizeWidgetTabs(bad)).toBeNull();
    }
  });

  it('ignores non-string members instead of throwing on them', () => {
    expect(normalizeWidgetTabs(['chat', 7, null, { orders: 1 }])).toEqual(['chat']);
  });

  it('never returns the caller a reference into the shared order constant', () => {
    // Callers spread this into component state; handing back the module-level
    // array would let one tenant's mutation leak into every other read.
    const tabs = normalizeWidgetTabs(['notifications', 'orders', 'chat'])!;
    tabs.pop();
    expect(WIDGET_TAB_ORDER).toHaveLength(3);
  });

  it('the built-in default is itself valid and unchanged by normalization', () => {
    expect(normalizeWidgetTabs([...WIDGET_TABS_DEFAULT])).toEqual([...WIDGET_TABS_DEFAULT]);
    // Pinned deliberately: this array is what every unconfigured tenant renders,
    // so a change here is a change to live widgets and should be a visible diff.
    expect(WIDGET_TABS_DEFAULT).toEqual([
      WIDGET_TAB.NOTIFICATIONS,
      WIDGET_TAB.ORDERS,
      WIDGET_TAB.CHAT,
    ]);
  });
});

/**
 * The tenant channel policy is a ceiling on delivery. Its whole safety property
 * is that "unconfigured" must be indistinguishable from the behaviour before the
 * setting existed — otherwise adding the column silently changes what every
 * existing shop sends.
 */
describe('channelAllowedByTenant', () => {
  it('allows everything when the tenant never configured a policy', () => {
    for (const policy of [null, undefined, {}]) {
      expect(channelAllowedByTenant(policy, 'payment', 'email')).toBe(true);
      expect(channelAllowedByTenant(policy, 'event', 'sms')).toBe(true);
    }
  });

  it('allows categories the policy does not mention', () => {
    // Partial configuration must not become an implicit deny for the rest.
    const policy = { event: ['email'] };
    expect(channelAllowedByTenant(policy, 'shipping', 'sms')).toBe(true);
  });

  it('restricts a configured category to exactly its listed channels', () => {
    const policy = { shipping: ['email'] };
    expect(channelAllowedByTenant(policy, 'shipping', 'email')).toBe(true);
    expect(channelAllowedByTenant(policy, 'shipping', 'sms')).toBe(false);
  });

  it('an empty list is a real "send nothing", not "unconfigured"', () => {
    expect(channelAllowedByTenant({ event: [] }, 'event', 'email')).toBe(false);
  });

  it('survives a malformed stored value rather than throwing on the send path', () => {
    // This is read on every delivery; a bad JSON write must not take sending down.
    expect(channelAllowedByTenant({ event: 'email' } as never, 'event', 'email')).toBe(true);
    expect(channelAllowedByTenant('nope' as never, 'event', 'email')).toBe(true);
  });
});

describe('isMarketingCategory', () => {
  it('treats order and conversation categories as transactional', () => {
    for (const c of ['payment', 'shipping', 'chat']) expect(isMarketingCategory(c)).toBe(false);
  });

  it('treats everything else as marketing, including categories added later', () => {
    // Derived, not listed: a new category is marketing by default, which is the
    // safe direction — it inherits default-deny and the opt-out covers it.
    for (const c of ['event', 'review', 'some_future_campaign_kind']) {
      expect(isMarketingCategory(c)).toBe(true);
    }
  });
});
