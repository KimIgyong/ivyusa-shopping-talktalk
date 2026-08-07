import { apiClient, type ListResult } from '../lib/api-client';
import type { ProductDetail, ProductSummary } from '../lib/types';

export interface ProductListQuery {
  q?: string;
  category?: string;
  page?: number;
  size?: number;
}

export function listProducts(
  sessionToken: string,
  query: ProductListQuery = {},
): Promise<ListResult<ProductSummary>> {
  return apiClient.getList<ProductSummary>('/products', sessionToken, {
    q: query.q,
    category: query.category,
    page: query.page,
    size: query.size,
  });
}

export function listCategories(sessionToken: string): Promise<string[]> {
  return apiClient.get<string[]>('/products/categories', sessionToken);
}

export function getProduct(handle: string, sessionToken: string): Promise<ProductDetail> {
  return apiClient.get<ProductDetail>(`/products/${encodeURIComponent(handle)}`, sessionToken);
}

/** Restock alert (D4 wiring) — product_id carries the catalog handle. */
export function subscribeRestock(sessionToken: string, handle: string): Promise<unknown> {
  return apiClient.post<unknown>(
    '/restock/subscribe',
    { session_token: sessionToken, product_id: handle, channel: 'push' },
    sessionToken,
  );
}
