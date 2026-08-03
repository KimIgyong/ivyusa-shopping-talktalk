import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';

process.env.CRED_ENC_KEY = randomBytes(32).toString('base64');

import { CustomerService } from './customer.service';
import { Customer } from './entity/customer.entity';
import { OrderCache } from '../order/entity/order-cache.entity';

/**
 * Regression for FIX-Customer-Duplicate-ShopifyId-20260803: the app-proxy
 * identity path creates an email-less row keyed by shopify_customer_id; the
 * order-sync path looks up by email hash only and used to create a DUPLICATE
 * row for the same Shopify customer — leaving sessions bound to one row and
 * orders linked to the other, so the widget listed no orders.
 */
describe('CustomerService.findOrCreateByEmail (duplicate prevention)', () => {
  let svc: CustomerService;
  let rows: Customer[];
  let customerRepo: Repository<Customer>;

  function makeRepo(): Repository<Customer> {
    return {
      findOne: jest.fn(async ({ where }: { where: Partial<Customer> }) => {
        return (
          rows.find((r) =>
            Object.entries(where).every(([k, v]) => (r as never)[k] === v),
          ) ?? null
        );
      }),
      create: jest.fn((e: Partial<Customer>) => Object.assign(new Customer(), e)),
      save: jest.fn(async (e: Customer) => {
        if (!rows.includes(e)) {
          e.id = rows.length + 1;
          rows.push(e);
        }
        return e;
      }),
    } as unknown as Repository<Customer>;
  }

  beforeEach(() => {
    rows = [];
    customerRepo = makeRepo();
    svc = new CustomerService(customerRepo, {} as Repository<OrderCache>);
  });

  it('adopts the email-less proxy-created row instead of creating a duplicate', async () => {
    // Step 1: app-proxy identity created a row with the Shopify id but no email.
    const proxyRow = Object.assign(new Customer(), {
      id: 1,
      tenantId: 1,
      shopifyCustomerId: '7817610756176',
      email: null,
      emailHash: null,
      name: null,
    });
    rows.push(proxyRow);

    // Step 2: order sync arrives with the email for the same Shopify customer.
    const result = await svc.findOrCreateByEmail(
      1,
      'customer@example.com',
      'Test User',
      '7817610756176',
    );

    expect(result.id).toBe(1); // same row adopted, no duplicate
    expect(result.email).toBe('customer@example.com');
    expect(result.name).toBe('Test User');
    expect(rows).toHaveLength(1);
  });

  it('still creates a fresh row when neither email nor shopify id matches', async () => {
    const result = await svc.findOrCreateByEmail(1, 'new@example.com', 'New', '999');
    expect(result.email).toBe('new@example.com');
    expect(rows).toHaveLength(1);
  });

  it('email match still wins and backfills the shopify id', async () => {
    const emailRow = Object.assign(new Customer(), {
      id: 1,
      tenantId: 1,
      shopifyCustomerId: null,
      email: 'known@example.com',
      emailHash: null,
      name: null,
    });
    emailRow.syncEmailHash();
    rows.push(emailRow);

    const result = await svc.findOrCreateByEmail(1, 'known@example.com', undefined, '777');
    expect(result.id).toBe(1);
    expect(result.shopifyCustomerId).toBe('777');
    expect(rows).toHaveLength(1);
  });
});
