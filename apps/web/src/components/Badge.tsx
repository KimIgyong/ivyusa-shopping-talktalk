import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'gray' | 'primary' | 'success' | 'warning' | 'error' | 'info';

const tones: Record<Tone, string> = {
  gray: 'bg-gray-100 text-gray-600',
  primary: 'bg-primary-500/10 text-primary-600',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  error: 'bg-error/10 text-error',
  info: 'bg-info/10 text-info',
};

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
