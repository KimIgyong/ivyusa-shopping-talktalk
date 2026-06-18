import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

const base =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500';

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-sm font-medium text-gray-600">{children}</label>;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(base, 'bg-white', className)} {...props}>
      {children}
    </select>
  );
}

export function FormRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
