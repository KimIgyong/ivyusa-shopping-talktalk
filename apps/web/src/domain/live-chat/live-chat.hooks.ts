import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { liveChatService } from './live-chat.service';
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
