import { Badge } from './Badge';

const MAP: Record<string, { tone: 'gray' | 'success' | 'warning' | 'error' | 'info' | 'primary'; label?: string }> = {
  active: { tone: 'success' },
  enabled: { tone: 'success' },
  online: { tone: 'success' },
  connected: { tone: 'success' },
  ok: { tone: 'success' },
  resolved: { tone: 'success' },
  completed: { tone: 'success' },
  sent: { tone: 'success' },
  pending: { tone: 'warning' },
  waiting: { tone: 'warning' },
  draft: { tone: 'gray' },
  inactive: { tone: 'gray' },
  disabled: { tone: 'gray' },
  ended: { tone: 'gray' },
  closed: { tone: 'gray' },
  suspended: { tone: 'error' },
  error: { tone: 'error' },
  failed: { tone: 'error' },
  escalated: { tone: 'error' },
  disconnected: { tone: 'error' },
  open: { tone: 'info' },
  in_progress: { tone: 'info', label: 'in progress' },
  live: { tone: 'primary' },
};

export function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return <Badge tone="gray">-</Badge>;
  const key = status.toLowerCase();
  const meta = MAP[key] ?? { tone: 'gray' as const };
  return <Badge tone={meta.tone}>{meta.label ?? status}</Badge>;
}
