/** Response DTOs — camelCase (PLN-260807-IvyusaApp-Revamp F1). */

/** Compact card for grids / recommendation rails. */
export interface ProductCardResponse {
  handle: string;
  title: string;
  vendor: string | null;
  price: number | null;
  currency: string;
  imageUrl: string | null;
  productUrl: string | null;
  category: string | null;
}

/** Full detail view (product screen). */
export interface ProductDetailResponse extends ProductCardResponse {
  /** Storefront SKU — agents match a chat against stock/order lines (PLN-260807 P0). */
  sku: string | null;
  description: string | null;
  tags: string | null;
  publishedAt: string | null;
  status: string;
}

/**
 * Console row (PLN-260808-Console-Product-List). Not the customer card: it adds
 * what an operator judges the sync by — whether the row is still sold, when it
 * was last seen on the storefront, and whether it reached the knowledge base.
 */
export interface AdminProductResponse extends ProductDetailResponse {
  syncedAt: string | null;
  /** A product knowledge document exists for this handle. */
  inKnowledge: boolean;
}

/** Header counters above the console list. */
export interface AdminProductSummaryResponse {
  total: number;
  active: number;
  archived: number;
  /** Rows that reached the knowledge base (whole catalogue, not just this page). */
  inKnowledge: number;
  lastSyncedAt: string | null;
}
