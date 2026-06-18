import { useQuery } from '@tanstack/react-query';
import {
  getOrder,
  getTracking,
  listOrders,
} from '../services/orderService';

export function useOrders(sessionToken: string | null, enabled = true) {
  return useQuery({
    queryKey: ['orders', sessionToken],
    queryFn: () => listOrders(sessionToken!),
    enabled: !!sessionToken && enabled,
  });
}

export function useOrder(id: string | null, sessionToken: string | null) {
  return useQuery({
    queryKey: ['order', id, sessionToken],
    queryFn: () => getOrder(id!, sessionToken!),
    enabled: !!id && !!sessionToken,
  });
}

export function useTracking(id: string | null, sessionToken: string | null) {
  return useQuery({
    queryKey: ['tracking', id, sessionToken],
    queryFn: () => getTracking(id!, sessionToken!),
    enabled: !!id && !!sessionToken,
  });
}
