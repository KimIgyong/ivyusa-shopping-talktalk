import {
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
    expect(WIDGET_TABS_DEFAULT).toEqual([WIDGET_TAB.NOTIFICATIONS, WIDGET_TAB.CHAT]);
  });
});
