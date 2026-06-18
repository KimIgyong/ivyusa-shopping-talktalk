/** Response DTO — camelCase. */
export interface CustomerResponse {
  id: number;
  tenantId: number | null;
  shopifyCustomerId: string | null;
  email: string | null;
  name: string | null;
  tier: string;
  shopifyTier: string | null;
  createdAt: Date;
  updatedAt: Date;
}
