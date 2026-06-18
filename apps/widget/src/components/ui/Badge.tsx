import type { ReactNode } from 'react';

const tones: Record<string, string> = {
  default: 'bg-gray-100 text-gray-600',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  error: 'bg-error/10 text-error',
  info: 'bg-info/10 text-info',
  primary: 'bg-primary-500/10 text-primary-600',
};

export function Badge({
  children,
  tone = 'default',
}: {
  children: ReactNode;
  tone?: keyof typeof tones | string;
}) {
  const cls = tones[tone] ?? tones.default;
  return (
    <span
      className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {children}
    </span>
  );
}

/** Maps an arbitrary status string to a tone heuristically. */
export function toneForStatus(status?: string | null): string {
  const s = (status ?? '').toLowerCase();
  if (/(deliver|complete|paid|approv|success|done)/.test(s)) return 'success';
  if (/(ship|transit|process|pending|review)/.test(s)) return 'info';
  if (/(cancel|refund|fail|reject|error)/.test(s)) return 'error';
  if (/(hold|wait|prepar)/.test(s)) return 'warning';
  return 'default';
}
