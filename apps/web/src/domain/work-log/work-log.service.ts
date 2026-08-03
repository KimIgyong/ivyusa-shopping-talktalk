import { apiGetList } from '@/lib/api-client';

export interface WorkLogEntry {
  id: string;
  actorName?: string | null;
  actorType?: string;
  actorId?: string;
  action: string;
  target?: string | null;
  ip?: string | null;
  result?: string;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
}

export interface WorkLogParams {
  page: number;
  pageSize: number;
  action?: string;
  actorId?: string;
  from?: string;
  to?: string;
}

/**
 * The agent work log is the audit trail filtered to `agent.*` actions. It is
 * the same store the platform audit page reads — one trail, two lenses — so a
 * new action added to the console shows up here without further wiring.
 */
export const workLogService = {
  list: (params: WorkLogParams) =>
    apiGetList<WorkLogEntry>('/audit', {
      page: params.page,
      size: params.pageSize,
      action: params.action,
      action_prefix: params.action ? undefined : 'agent.',
      actor_id: params.actorId,
      from: params.from,
      to: params.to,
    }),
};

/** Console actions an agent can take, in the order they occur in a shift. */
export const AGENT_ACTIONS = [
  'agent.conversation_accepted',
  'agent.message_sent',
  'agent.customer_linked',
  'agent.customer_created',
  'agent.conversation_ended',
  'agent.conversation_viewed',
  'agent.transcript_viewed',
] as const;
