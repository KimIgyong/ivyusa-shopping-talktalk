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

describe('Cafe24AdminClient — catalogue requests', () => {
  const client = new Cafe24AdminClient();

  function mockFetch(body: unknown, status = 200) {
    const fn = jest.fn(async () => ({
      ok: status === 200,
      status,
      headers: { get: () => null },
      json: async () => body,
      text: async () => JSON.stringify(body),
    }));
    global.fetch = fn as unknown as typeof fetch;
    return fn;
  }

  afterEach(() => {
    delete (global as { fetch?: unknown }).fetch;
  });

  it('pages by offset, and by since_product_no once the caller crosses the cap', async () => {
    const fn = mockFetch({ products: [] });
    await client.pullProducts('amoebaorder', 'tok', { limit: 100, offset: 200 });
    expect(fn.mock.calls[0][0]).toContain('/products?limit=100&offset=200');

    await client.pullProducts('amoebaorder', 'tok', { limit: 100, offset: 0, sinceProductNo: 8123 });
    expect(fn.mock.calls[1][0]).toContain('/products?limit=100&since_product_no=8123');
    expect(fn.mock.calls[1][0]).not.toContain('offset');
  });

  it('accepts either shape the options resource is served in', async () => {
    mockFetch({ option: { options: [{ option_name: '색상' }] } });
    expect(await client.fetchProductOptions('m', 't', 1)).toEqual([{ option_name: '색상' }]);
    mockFetch({ options: [{ option_name: '사이즈' }] });
    expect(await client.fetchProductOptions('m', 't', 1)).toEqual([{ option_name: '사이즈' }]);
  });

  it('maps category_no → category_name', async () => {
    mockFetch({ categories: [{ category_no: 24, category_name: '클렌징' }] });
    await expect(client.listCategoryNames('amoebaorder', 'tok')).resolves.toEqual(
      new Map([[24, '클렌징']]),
    );
  });

  it('warns when rows come back but nothing maps (a shape change must not read as "no categories")', async () => {
    const warn = jest.spyOn(client['logger'], 'warn').mockImplementation(() => undefined);
    mockFetch({ categories: [{ no: 24, name: '클렌징' }] });
    await expect(client.listCategoryNames('amoebaorder', 'tok')).resolves.toEqual(new Map());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unexpected shape'));
    warn.mockRestore();
  });

  it('returns an empty category map when the scope is missing, rather than failing the sync', async () => {
    // Categories sit behind mall.read_category, which this app never requested.
    mockFetch({ error: 'forbidden' }, 403);
    await expect(client.listCategoryNames('amoebaorder', 'tok')).resolves.toEqual(new Map());
  });
});
