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
