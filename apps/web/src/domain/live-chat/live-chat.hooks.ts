import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { liveChatService } from './live-chat.service';
import type { CustomerLead } from './live-chat.service';
import { useTenantKey } from '@/lib/use-tenant-key';

export const useSessions = (q = '', status = 'all', channel = 'all') => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['agent', tenantKey, 'sessions', q, status, channel],
    queryFn: () => liveChatService.sessions(q, status, channel),
    // 5s (was 15s): a new escalation should surface within a beat, not a
    // quarter-minute — the endpoint is a few ms (PLN-260804).
    refetchInterval: 5000,
  });
};

export const useConversation = (id: string | null) => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['agent', tenantKey, 'conversation', id],
    queryFn: () => liveChatService.conversation(id as string),
    enabled: !!id,
    // The customer keeps typing while the agent watches: without a poll their
    // new messages only appeared after the agent acted (PLN-260804).
    refetchInterval: 5000,
  });
};

/**
 * AI briefing, fetched apart from the transcript so a slow model call never
 * delays the messages (PLN-260807). No polling: it only changes with new turns.
 */
export const useBriefing = (id: string | null) => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['agent', tenantKey, 'briefing', id],
    queryFn: () => liveChatService.briefing(id as string),
    enabled: !!id,
    staleTime: 60_000,
  });
};

/** New escalation alerts for the alarm modal (FR-S3) — 10s poll. */
export const useAgentAlerts = (enabled = true) => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['agent', tenantKey, 'alerts'],
    queryFn: () => liveChatService.alerts('new'),
    refetchInterval: 10000,
    enabled,
  });
};

export const useAckAlert = () => {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (id: string) => liveChatService.ackAlert(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', tenantKey, 'alerts'] }),
  });
};

export function useConversationActions(id: string | null) {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['agent', tenantKey, 'conversation', id] });
    qc.invalidateQueries({ queryKey: ['agent', tenantKey, 'sessions'] });
  };

  const accept = useMutation({
    mutationFn: () => liveChatService.accept(id as string),
    onSuccess: invalidate,
  });

  const end = useMutation({
    mutationFn: () => liveChatService.end(id as string),
    onSuccess: invalidate,
  });

  const send = useMutation({
    mutationFn: (body: string) => liveChatService.sendMessage(id as string, body),
    onSuccess: invalidate,
  });

  const handBack = useMutation({
    mutationFn: () => liveChatService.handBack(id as string),
    onSuccess: invalidate,
  });

  return { accept, end, send, handBack };
}

/** Link an existing customer or create a new one for the current conversation. */
export function useCustomerActions(id: string | null) {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['agent', tenantKey, 'conversation', id] });
    qc.invalidateQueries({ queryKey: ['agent', tenantKey, 'sessions'] });
  };

  const link = useMutation({
    mutationFn: (customerId: number) => liveChatService.linkCustomer(id as string, customerId),
    onSuccess: invalidate,
  });

  const create = useMutation({
    mutationFn: (lead: CustomerLead) => liveChatService.createCustomer(id as string, lead),
    onSuccess: invalidate,
  });

  return { link, create };
}
