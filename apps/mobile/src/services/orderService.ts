import { apiClient } from '../lib/api-client';
import type { OrderDetail, OrderSummary, Tracking } from '../lib/types';

export function guestLookup(
  sessionToken: string,
  orderNumber: string,
  email: string,
): Promise<OrderSummary> {
  return apiClient.post<OrderSummary>('/orders/guest-lookup', {
    session_token: sessionToken,
    order_number: orderNumber,
    email,
  });
}

export function listOrders(sessionToken: string): Promise<OrderSummary[]> {
  return apiClient.get<OrderSummary[]>('/orders', sessionToken);
}

export function getOrder(id: string, sessionToken: string): Promise<OrderDetail> {
  return apiClient.get<OrderDetail>(`/orders/${id}`, sessionToken);
}

export function getTracking(id: string, sessionToken: string): Promise<Tracking> {
  return apiClient.get<Tracking>(`/orders/${id}/tracking`, sessionToken);
}

/**
 * Review submission (F2/A-8) — order_item_id is numeric on the API side
 * (OrderDetail.items[].id). 403 = not your item, 422 = blocked by moderation.
 */
export function submitReview(
  sessionToken: string,
  orderItemId: number,
  rating: number,
  body?: string,
): Promise<unknown> {
  return apiClient.post(
    '/reviews',
    { session_token: sessionToken, order_item_id: orderItemId, rating, body },
    sessionToken,
  );
}
