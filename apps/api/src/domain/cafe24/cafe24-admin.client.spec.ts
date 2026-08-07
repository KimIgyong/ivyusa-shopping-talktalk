import { ORDER_STATUS_INTERNAL } from '@ivy/types';
import { Cafe24AdminClient } from './cafe24-admin.client';

/** Pure mapping logic — no HTTP. */
describe('Cafe24AdminClient — status & amount mapping', () => {
  const client = new Cafe24AdminClient();

  it('maps each Cafe24 status code to the internal status', () => {
    const cases: Array<[string, string]> = [
      ['N00', ORDER_STATUS_INTERNAL.PENDING_PAYMENT],
      ['N10', ORDER_STATUS_INTERNAL.PREPARING],
      ['N22', ORDER_STATUS_INTERNAL.PREPARING],
      ['N30', ORDER_STATUS_INTERNAL.SHIPPING],
      ['N40', ORDER_STATUS_INTERNAL.DELIVERED],
      ['C00', ORDER_STATUS_INTERNAL.CANCEL_REQUESTED],
    ];
    for (const [code, expected] of cases) {
      expect(client.deriveInternalStatus([{ order_status: code }])).toBe(expected);
    }
  });

  it('reports the LEAST-advanced stage for a mixed-item order (never over-claims delivered)', () => {
    expect(
      client.deriveInternalStatus([{ order_status: 'N40' }, { order_status: 'N10' }]),
    ).toBe(ORDER_STATUS_INTERNAL.PREPARING);
  });

  it('is case-insensitive and falls back to preparing on unknown/empty codes', () => {
    expect(client.deriveInternalStatus([{ order_status: 'n30' }])).toBe(ORDER_STATUS_INTERNAL.SHIPPING);
    expect(client.deriveInternalStatus([{ order_status: 'R99' }])).toBe(ORDER_STATUS_INTERNAL.PREPARING);
    expect(client.deriveInternalStatus([])).toBe(ORDER_STATUS_INTERNAL.PREPARING);
  });

  it('reads the total from the field that matches the payment state', () => {
    expect(client.orderTotal({ order_id: '1', paid: 'T', payment_amount: '32000' })).toBe(32000);
    expect(
      client.orderTotal({ order_id: '2', paid: 'F', actual_order_amount: { total_amount_due: '15000' } }),
    ).toBe(15000);
    expect(client.orderTotal({ order_id: '3', paid: 'T', payment_amount: '' })).toBeNull();
  });
});
