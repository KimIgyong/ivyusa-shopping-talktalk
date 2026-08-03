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
