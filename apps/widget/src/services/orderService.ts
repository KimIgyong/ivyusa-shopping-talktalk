import { apiClient } from '../lib/api-client';
import type {
  OrderDetail,
  OrderSummary,
  Tracking,
} from '../lib/types';

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
  return apiClient.get<OrderSummary[]>('/orders', {
    session_token: sessionToken,
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
