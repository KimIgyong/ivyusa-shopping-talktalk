import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  action?: ReactNode;
}

export function Card({ children, className, title, action }: CardProps) {
  return (
    <div className={cn('bg-white rounded-lg border border-gray-200', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          {title && <h3 className="text-sm font-semibold text-gray-800">{title}</h3>}
          {action}
        </div>
      )}
      <div className={cn(title || action ? 'p-5' : 'p-5')}>{children}</div>
    </div>
  );
}
