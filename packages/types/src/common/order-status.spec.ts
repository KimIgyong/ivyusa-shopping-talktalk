import { isOrderInTransit, orderStatusKey, orderStatusLabel } from './order-status';

/** Stands in for i18next: returns the key so assertions read as intent. */
const t = (key: string) => `t:${key}`;

describe('orderStatusKey', () => {
  it('maps the statuses this app writes', () => {
    expect(orderStatusKey('paid')).toBe('paid');
    expect(orderStatusKey('shipping')).toBe('shipping');
    expect(orderStatusKey('delivered')).toBe('delivered');
    expect(orderStatusKey('refunded')).toBe('refunded');
  });

  it('folds the synonyms platforms actually send', () => {
    expect(orderStatusKey('Confirmed')).toBe('paid');
    expect(orderStatusKey('CANCELED')).toBe('cancelled'); // one L, US spelling
    expect(orderStatusKey('  processing  ')).toBe('preparing');
  });

  it('returns null rather than guessing at an unknown status', () => {
    expect(orderStatusKey('awaiting_customs')).toBeNull();
    expect(orderStatusKey(null)).toBeNull();
    expect(orderStatusKey('')).toBeNull();
  });
});

describe('orderStatusLabel', () => {
  it('translates a status it knows', () => {
    expect(orderStatusLabel({ statusInternal: 'paid', statusUi: 'Confirmed' }, t)).toBe('t:paid');
  });

  it('falls back to the platform wording rather than rendering an empty badge', () => {
    // A mall-specific status is guaranteed to turn up. Showing English to a
    // Korean shopper beats showing a badge with nothing in it.
    expect(orderStatusLabel({ statusInternal: 'awaiting_customs', statusUi: 'At customs' }, t)).toBe(
      'At customs',
    );
  });

  it('falls back to the internal code when the platform string is blank', () => {
    expect(orderStatusLabel({ statusInternal: 'weird_state', statusUi: '   ' }, t)).toBe(
      'weird_state',
    );
  });

  it('is null only when the order carries no status at all', () => {
    expect(orderStatusLabel({ statusInternal: null, statusUi: null }, t)).toBeNull();
  });
});

describe('isOrderInTransit', () => {
  it('is true for orders that are moving, on either field', () => {
    expect(isOrderInTransit({ statusInternal: 'shipping', statusUi: null })).toBe(true);
    expect(isOrderInTransit({ statusInternal: null, statusUi: 'In Transit' })).toBe(true);
    expect(isOrderInTransit({ statusInternal: 'fulfilled', statusUi: null })).toBe(true);
  });

  it('is false for a paid order — which must still be LISTED', () => {
    // The regression this whole change undoes: `Confirmed` failed a shipment
    // filter, and the filter decided visibility, so the order rendered nowhere.
    // Here it only decides whether the row draws a progress bar.
    const paid = { statusInternal: 'paid', statusUi: 'Confirmed' };
    expect(isOrderInTransit(paid)).toBe(false);
    expect(orderStatusLabel(paid, t)).toBe('t:paid');
  });

  it('is false for a cancelled order', () => {
    expect(isOrderInTransit({ statusInternal: 'cancelled', statusUi: 'Cancelled' })).toBe(false);
  });
});
