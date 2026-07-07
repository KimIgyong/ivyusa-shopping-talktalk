import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { liveChatService } from './live-chat.service';
import type { CustomerLead } from './live-chat.service';
import { useTenantKey } from '@/lib/use-tenant-key';

export const useSessions = () => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['agent', tenantKey, 'sessions'],
    queryFn: liveChatService.sessions,
    refetchInterval: 15000,
  });
};

export const useConversation = (id: string | null) => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['agent', tenantKey, 'conversation', id],
    queryFn: () => liveChatService.conversation(id as string),
    enabled: !!id,
  });
};

/** New escalation alerts for the alarm modal (FR-S3) — 10s poll. */
export const useAgentAlerts = () => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['agent', tenantKey, 'alerts'],
    queryFn: () => liveChatService.alerts('new'),
    refetchInterval: 10000,
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

  return { accept, end, send };
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
