import { Customer } from './entity/customer.entity';
import { CustomerResponse } from './dto/response/customer.response';

/** Aggregated order stats per customer (from orders_cache). */
export interface CustomerOrderStats {
  orders: number;
  totalSpent: number;
  currency: string | null;
}

/** Entity -> response mapping. */
export class CustomerMapper {
  static toCustomer(c: Customer, stats?: CustomerOrderStats): CustomerResponse {
    return {
      id: c.id,
      tenantId: c.tenantId,
      shopifyCustomerId: c.shopifyCustomerId,
      email: c.email,
      name: c.name,
      tier: c.tier,
      shopifyTier: c.shopifyTier,
      orders: stats?.orders ?? 0,
      totalSpent: stats?.totalSpent ?? 0,
      currency: stats?.currency ?? null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  static toCustomerList(
    customers: Customer[],
    statsById?: Map<string, CustomerOrderStats>,
  ): CustomerResponse[] {
    // Keyed by String(id): bigint ids arrive as strings from the driver, so
    // normalize on both sides to avoid a number-vs-string Map miss.
    return customers.map((c) => this.toCustomer(c, statsById?.get(String(c.id))));
  }
}
