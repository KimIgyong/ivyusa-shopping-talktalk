import { apiClient } from '../lib/api-client';
import type { AffiliateStatus } from '../lib/types';

export function createReview(
  sessionToken: string,
  orderItemId: string,
  rating: number,
  body: string,
): Promise<unknown> {
  return apiClient.post('/reviews', {
    session_token: sessionToken,
    order_item_id: orderItemId,
    rating,
    body,
  });
}

export function affiliateApply(sessionToken: string): Promise<unknown> {
  return apiClient.post('/affiliate/apply', { session_token: sessionToken });
}

export function affiliateStatus(
  sessionToken: string,
): Promise<AffiliateStatus> {
  return apiClient.get<AffiliateStatus>('/affiliate/status', {
    session_token: sessionToken,
  });
}

export function restockSubscribe(
  sessionToken: string,
  productId: string,
): Promise<unknown> {
  return apiClient.post('/restock/subscribe', {
    session_token: sessionToken,
    product_id: productId,
  });
}
