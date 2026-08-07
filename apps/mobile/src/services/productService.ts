import { apiClient } from '../lib/api-client';
import type { ProductDetail, ProductSummary } from '../lib/types';

export function listProducts(
  sessionToken: string,
  opts: { q?: string; category?: string; page?: number; size?: number } = {},
): Promise<ProductSummary[]> {
  // Paginated endpoint — the envelope unwrap yields the items array (data).
  return apiClient.get<ProductSummary[]>('/products', sessionToken, {
    q: opts.q,
    category: opts.category,
    page: opts.page,
    size: opts.size,
  });
}

/** AI 추천 v1 (A-10) — rule-based + KB RAG join; server falls back to new arrivals on cold start. */
export function listRecommendations(
  sessionToken: string,
  size?: number,
): Promise<ProductSummary[]> {
  return apiClient.get<ProductSummary[]>('/products/recommendations', sessionToken, { size });
}

export function listProductCategories(sessionToken: string): Promise<string[]> {
  return apiClient.get<string[]>('/products/categories', sessionToken);
}

export function getProduct(handle: string, sessionToken: string): Promise<ProductDetail> {
  return apiClient.get<ProductDetail>(`/products/${encodeURIComponent(handle)}`, sessionToken);
}

/** Restock alert subscription — product handle travels as product_id (restock API contract). */
export function subscribeRestock(sessionToken: string, productHandle: string): Promise<unknown> {
  return apiClient.post(
    '/restock/subscribe',
    { session_token: sessionToken, product_id: productHandle, channel: 'push' },
    sessionToken,
  );
}
