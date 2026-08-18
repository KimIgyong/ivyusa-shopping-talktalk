import {
  isOrderDelivered,
  isOrderInTransit,
  orderStatusKey,
  orderStatusLabel,
} from './order-status';

/** Stands in for i18next: returns the key so assertions read as intent. */
const t = (key: string) => `t:${key}`;

describe('orderStatusKey', () => {
  it('maps the statuses this app writes', () => {
    expect(orderStatusKey('paid')).toBe('paid');
    expect(orderStatusKey('shipping')).toBe('shipping');
    expect(orderStatusKey('delivered')).toBe('delivered');
    expect(orderStatusKey('refunded')).toBe('refunded');
    // Both of these exist in staging data and had no label before.
    expect(orderStatusKey('pending_payment')).toBe('pendingPayment');
    expect(orderStatusKey('cancel_requested')).toBe('cancelRequested');
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
  it('is true for orders that are moving', () => {
    expect(isOrderInTransit({ statusInternal: 'shipping', statusUi: null })).toBe(true);
    expect(isOrderInTransit({ statusInternal: 'shipped', statusUi: null })).toBe(true);
    expect(isOrderInTransit({ statusInternal: 'in_transit', statusUi: 'In Transit' })).toBe(true);
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

  it('is FALSE for Shopify\'s "Unfulfilled" — the word contains "fulfil"', () => {
    // A substring match read this as shipped, so the least-shipped orders drew a
    // progress bar and each fired a tracking request.
    expect(isOrderInTransit({ statusInternal: null, statusUi: 'Unfulfilled' })).toBe(false);
    expect(isOrderInTransit({ statusInternal: 'unfulfilled', statusUi: null })).toBe(false);
  });

  it('lets the internal status win when the two fields disagree', () => {
    // Staging really holds this pair: we say preparing, the platform says
    // In Transit. The value WE write is the one we can reason about.
    expect(isOrderInTransit({ statusInternal: 'preparing', statusUi: 'In Transit' })).toBe(false);
  });

  it('reads the platform wording only when no internal status exists', () => {
    expect(isOrderInTransit({ statusInternal: null, statusUi: 'In Transit' })).toBe(true);
    expect(isOrderInTransit({ statusInternal: '', statusUi: 'out for delivery' })).toBe(true);
    // Whole string only — "transit" inside a longer phrase is not a match.
    expect(isOrderInTransit({ statusInternal: null, statusUi: 'transit delay reported' })).toBe(
      false,
    );
  });

  it('does not assume an unmapped internal status is moving', () => {
    expect(isOrderInTransit({ statusInternal: 'awaiting_customs', statusUi: null })).toBe(false);
  });
});

describe('isOrderDelivered', () => {
  it('is true only once the order actually arrived', () => {
    expect(isOrderDelivered({ statusInternal: 'delivered', statusUi: 'Delivered' })).toBe(true);
    expect(isOrderDelivered({ statusInternal: 'shipping', statusUi: 'In Transit' })).toBe(false);
    expect(isOrderDelivered({ statusInternal: 'paid', statusUi: 'Confirmed' })).toBe(false);
  });

  it('does not read a failure as a success', () => {
    // `/deliver|complete/` as a substring said yes to both of these, and the
    // order-detail screen used it to print "this order has been delivered".
    expect(isOrderDelivered({ statusInternal: null, statusUi: 'Delivery failed' })).toBe(false);
    expect(isOrderDelivered({ statusInternal: null, statusUi: 'Incomplete' })).toBe(false);
  });

  it('falls back to platform wording only without an internal status', () => {
    expect(isOrderDelivered({ statusInternal: null, statusUi: 'Delivered' })).toBe(true);
    expect(isOrderDelivered({ statusInternal: 'preparing', statusUi: 'Delivered' })).toBe(false);
  });
});
