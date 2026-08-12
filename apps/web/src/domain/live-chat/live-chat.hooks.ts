import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { liveChatService } from './live-chat.service';
import type { CustomerLead } from './live-chat.service';
import { useTenantKey } from '@/lib/use-tenant-key';
import { toast } from '@/store/toast-store';

/**
 * Set or clear the operator's name for a session (PLN-260812).
 *
 * Keyed by conversation because that is what a queue row holds; the server
 * resolves the session. The row, the open conversation and the issue board all
 * re-read after, so the new name appears everywhere it is shown.
 */
export function useSetSessionAlias() {
  const { t } = useTranslation('livechat');
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: ({ id, alias }: { id: string; alias: string | null }) =>
      liveChatService.setAlias(id, alias),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['agent', tenantKey, 'sessions'] });
      qc.invalidateQueries({ queryKey: ['agent', tenantKey, 'conversation', variables.id] });
      // The board prints the alias on its cards too.
      qc.invalidateQueries({ queryKey: ['issue-board', tenantKey] });
      toast.success(variables.alias ? t('alias.saved') : t('alias.cleared'));
    },
    onError: (e: Error) => toast.error(e.message || t('alias.saveError'), { sticky: true }),
  });
}

/**
 * Turn the AI on or off for one session (PLN-260812).
 *
 * Only applies to messages received from here on — nothing already in the
 * thread is answered retroactively, and the control says so.
 */
export function useSetSessionAutoReply() {
  const { t } = useTranslation('livechat');
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: ({ id, mode }: { id: string; mode: string }) =>
      liveChatService.setAutoReply(id, mode),
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ['agent', tenantKey, 'sessions'] });
      qc.invalidateQueries({ queryKey: ['agent', tenantKey, 'conversation', variables.id] });
      toast.success(
        data.autoReplyEffective ? t('autoReply.savedOn') : t('autoReply.savedOff'),
      );
    },
    onError: (e: Error) => toast.error(e.message || t('autoReply.saveError'), { sticky: true }),
  });
}

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

/**
 * Ask the knowledge base from the chat screen (PLN-260810 S2).
 *
 * A mutation, not a query: the agent decides when to spend an LLM call, and
 * nothing should re-fire it on a window focus or a cache miss.
 */
export function useAskKnowledge() {
  return useMutation({
    mutationFn: (v: { question: string; language: string }) =>
      liveChatService.askKnowledge(v.question, v.language),
    onError: (err: Error) => toast.error(err.message),
  });
}

/** Send an answer to the knowledge owners for review (PLN-260810 S4). */
export function useProposeAnswer() {
  return useMutation({
    mutationFn: (v: { conversationId?: number; question: string; answer: string }) =>
      liveChatService.proposeAnswer({
        conversation_id: v.conversationId,
        question: v.question,
        answer: v.answer,
      }),
    onSuccess: () => toast.success('Sent for review'),
    onError: (err: Error) => toast.error(err.message),
  });
}

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
