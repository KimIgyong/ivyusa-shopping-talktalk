import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, CheckCircle2 } from 'lucide-react';
import { strings } from '../../i18n/strings';
import {
  affiliateApply,
  affiliateStatus,
} from '../../services/miscService';
import type { AffiliateStatus } from '../../lib/types';

export function AffiliateCard({
  sessionToken,
}: {
  sessionToken: string | null;
}) {
  const a = strings.affiliate;
  const [applying, setApplying] = useState(false);
  const [localStatus, setLocalStatus] = useState<string | null>(null);

  const { data } = useQuery<AffiliateStatus>({
    queryKey: ['affiliate-status', sessionToken],
    queryFn: () => affiliateStatus(sessionToken!),
    enabled: !!sessionToken,
    retry: false,
  });

  const status = localStatus ?? data?.status ?? 'none';

  async function apply() {
    if (!sessionToken) return;
    setApplying(true);
    try {
      await affiliateApply(sessionToken);
      setLocalStatus('pending');
    } catch {
      /* surfaced via disabled state */
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-800">
        <Users className="h-4 w-4 text-primary-500" />
        {a.title}
      </div>
      <ol className="mb-3 space-y-1.5">
        {a.steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
            <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-primary-500/10 text-[10px] font-semibold text-primary-600">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      {status === 'approved' ? (
        <div className="flex items-center gap-1.5 text-sm font-medium text-success">
          <CheckCircle2 className="h-4 w-4" />
          {a.approved}
        </div>
      ) : status === 'pending' ? (
        <p className="text-sm font-medium text-warning">{a.pending}</p>
      ) : (
        <button
          disabled={applying}
          onClick={apply}
          className="w-full rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
        >
          {applying ? strings.common.loading : a.apply}
        </button>
      )}
    </div>
  );
}
