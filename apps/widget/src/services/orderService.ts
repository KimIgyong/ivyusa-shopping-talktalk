import { apiClient } from '../lib/api-client';
import type {
  OrderDetail,
  OrderLookupResult,
  OrderSummary,
  Tracking,
} from '../lib/types';

export function guestLookup(
  sessionToken: string,
  orderNumber: string,
  email: string,
): Promise<OrderLookupResult> {
  return apiClient.post<OrderLookupResult>('/orders/guest-lookup', {
    session_token: sessionToken,
    order_number: orderNumber,
    email,
  });
}

// Inline "my orders" shows a bounded recent window; anything older/more lives on
// the storefront's own my-page (the list links out). PLN-260808 approved: 10/30.
export const INLINE_ORDER_LIMIT = 10;
export const INLINE_ORDER_DAYS = 30;

export function listOrders(sessionToken: string): Promise<OrderSummary[]> {
  return apiClient.get<OrderSummary[]>('/orders', {
    session_token: sessionToken,
    size: String(INLINE_ORDER_LIMIT),
    days: String(INLINE_ORDER_DAYS),
  });
}

export function getOrder(
  id: string,
  sessionToken: string,
): Promise<OrderDetail> {
  return apiClient.get<OrderDetail>(`/orders/${id}`, {
    session_token: sessionToken,
  });
}

export function getTracking(
  id: string,
  sessionToken: string,
): Promise<Tracking> {
  return apiClient.get<Tracking>(`/orders/${id}/tracking`, {
    session_token: sessionToken,
  });
}
