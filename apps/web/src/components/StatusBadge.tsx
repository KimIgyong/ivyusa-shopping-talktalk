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
  // Live-chat conversation statuses (REQ-260824 R1) — previously fell through
  // to gray, which made "AI answering" and "agent handling" indistinguishable.
  ai_active: { tone: 'info' },
  agent: { tone: 'primary' },
  // Cafe24 order statuses (PLN-260807).
  'pending payment': { tone: 'warning' },
  pending_payment: { tone: 'warning', label: 'pending payment' },
  'cancel requested': { tone: 'error' },
  cancel_requested: { tone: 'error', label: 'cancel requested' },
};

export function StatusBadge({ status, label }: { status?: string | null; label?: string }) {
  if (!status) return <Badge tone="gray">-</Badge>;
  const key = status.toLowerCase();
  const meta = MAP[key] ?? { tone: 'gray' as const };
  // Callers that localize their statuses pass the display text; the tone map
  // stays keyed on the raw value.
  return <Badge tone={meta.tone}>{label ?? meta.label ?? status}</Badge>;
}
