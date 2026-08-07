import { apiClient } from '../lib/api-client';
import type { ReviewCreated } from '../lib/types';

/**
 * Submit a product review for an owned order item (F2, A-8).
 * Server replies 403 when the item is not the customer's (D1) and
 * 422 when moderation blocks the body (D2).
 */
export function submitReview(
  sessionToken: string,
  orderItemId: string,
  rating: number,
  body?: string,
): Promise<ReviewCreated> {
  return apiClient.post<ReviewCreated>(
    '/reviews',
    {
      session_token: sessionToken,
      order_item_id: orderItemId,
      rating,
      ...(body ? { body } : {}),
    },
    sessionToken,
  );
}
