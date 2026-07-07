import { Customer } from './entity/customer.entity';
import { CustomerResponse } from './dto/response/customer.response';

/** Aggregated order stats per customer (from orders_cache). */
export interface CustomerOrderStats {
  orders: number;
  totalSpent: number;
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
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  static toCustomerList(
    customers: Customer[],
    statsById?: Map<number, CustomerOrderStats>,
  ): CustomerResponse[] {
    return customers.map((c) => this.toCustomer(c, statsById?.get(c.id)));
  }
}
