import { OrderMapper } from './order.mapper';
import { OrderCache } from './entity/order-cache.entity';
import { OrderItem } from './entity/order-item.entity';

/**
 * Contract pin for the widget (FIX-Widget-OrderDetail-Shape-20260803): the
 * detail payload is FLAT — order fields at the top level, `items` inline with
 * string ids the widget echoes back for reviews. A nested `order` wrapper (or
 * id-less items) breaks OrderDetailView rendering / the review button.
 */
describe('OrderMapper.toDetail (widget contract)', () => {
  it('returns flat order fields with inline items carrying string ids', () => {
    const order = Object.assign(new OrderCache(), {
      id: 4,
      orderNumber: '#1001',
      statusInternal: 'paid',
      statusUi: null,
      total: 42.5,
      currency: 'USD',
      createdAt: new Date('2026-07-30T19:49:28Z'),
    });
    const item = Object.assign(new OrderItem(), {
      id: 11,
      title: 'Ampoule',
      optionText: null,
      qty: 2,
      price: 21.25,
    });

    const detail = OrderMapper.toDetail(order, [item]);

    expect(detail).not.toHaveProperty('order'); // flat — no nested wrapper
    expect(detail.orderNumber).toBe('#1001');
    expect(typeof detail.statusUi).toBe('string'); // derived from statusInternal
    expect(detail.items).toHaveLength(1);
    expect(detail.items[0]).toMatchObject({ id: '11', title: 'Ampoule', qty: 2 });
  });
});

/**
 * The widget's shipment cards read "<first item> + N more" (PLN-260817 W-2).
 * Before this, the list payload carried only `itemCount`, so the widget had to
 * choose between a detail fetch per row or showing no product name at all.
 */
describe('OrderMapper.toListItem (item summary)', () => {
  const order = () =>
    Object.assign(new OrderCache(), {
      id: 9,
      orderNumber: 'IVY-39891',
      statusInternal: 'paid',
      statusUi: null,
      total: 55,
      currency: 'USD',
      createdAt: new Date('2026-08-17T00:00:00Z'),
      orderedAt: null,
    });

  it('carries the first line item title alongside the count', () => {
    const row = OrderMapper.toListItem(order(), { count: 3, firstTitle: 'Vitamin C Serum Set' });
    expect(row).toMatchObject({ itemCount: 3, firstItemTitle: 'Vitamin C Serum Set' });
  });

  it('an order with no cached items yields a null title, not a crash', () => {
    const row = OrderMapper.toListItem(order(), { count: 0, firstTitle: null });
    expect(row.itemCount).toBe(0);
    expect(row.firstItemTitle).toBeNull();
  });
});
