import { Loader2 } from 'lucide-react';

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-gray-400">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}
