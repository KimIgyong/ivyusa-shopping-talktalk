/** Response DTO — camelCase. */
export interface CustomerResponse {
  id: number;
  tenantId: number | null;
  shopifyCustomerId: string | null;
  email: string | null;
  name: string | null;
  phone: string | null;
  tier: string;
  shopifyTier: string | null;
  orders: number;
  totalSpent: number;
  currency: string | null;
  createdAt: Date;
  updatedAt: Date;
}
