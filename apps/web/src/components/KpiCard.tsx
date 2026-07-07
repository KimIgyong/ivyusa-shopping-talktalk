import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

interface KpiCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  hint?: string;
  /** When set, the card becomes a link to this route. */
  to?: string;
}

export function KpiCard({ label, value, icon: Icon, hint, to }: KpiCardProps) {
  const content = (
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
        {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
      </div>
      {Icon && (
        <div className="rounded-lg bg-primary-500/10 p-2 text-primary-600">
          <Icon className="h-5 w-5" />
        </div>
      )}
    </div>
  );

  const base = 'block rounded-lg border border-gray-200 bg-white p-5';
  if (to) {
    return (
      <Link
        to={to}
        className={`${base} transition-colors hover:border-primary-400 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500`}
      >
        {content}
      </Link>
    );
  }
  return <div className={base}>{content}</div>;
}
