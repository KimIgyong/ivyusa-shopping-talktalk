import { Customer } from './entity/customer.entity';
import { CustomerResponse } from './dto/response/customer.response';

/** Entity -> response mapping. */
export class CustomerMapper {
  static toCustomer(c: Customer): CustomerResponse {
    return {
      id: c.id,
      tenantId: c.tenantId,
      shopifyCustomerId: c.shopifyCustomerId,
      email: c.email,
      name: c.name,
      tier: c.tier,
      shopifyTier: c.shopifyTier,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  static toCustomerList(customers: Customer[]): CustomerResponse[] {
    return customers.map((c) => this.toCustomer(c));
  }
}
