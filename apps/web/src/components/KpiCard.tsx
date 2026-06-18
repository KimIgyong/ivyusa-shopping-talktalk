import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  hint?: string;
}

export function KpiCard({ label, value, icon: Icon, hint }: KpiCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
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
    </div>
  );
}
