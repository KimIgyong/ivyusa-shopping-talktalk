import { Settings2, Store } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';

function fmtDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

/**
 * Compact summary card for one store integration (Shopify/cafe24/…).
 * All configuration lives in a modal opened by the Configure button.
 */
export function ProviderTile({
  title,
  subtitle,
  status,
  configured,
  lastTested,
  onConfigure,
}: {
  title: string;
  subtitle: string;
  status?: string | null;
  configured?: boolean;
  lastTested?: string | null;
  onConfigure: () => void;
}) {
  const { t } = useTranslation('settings');
  const statusTone = status === 'connected' ? 'success' : status === 'error' ? 'error' : undefined;

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-500/10 text-primary-600">
            <Store className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="font-semibold text-gray-900">{title}</p>
            <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>
          </div>
        </div>
        {statusTone ? (
          <Badge tone={statusTone}>{t(`integrations.state.${status}`)}</Badge>
        ) : (
          <Badge>{t('integrations.state.unknown')}</Badge>
        )}
      </div>

      <div className="mb-4 space-y-0.5 text-xs text-gray-500">
        <p>
          {t('integrations.credential')}: {configured ? t('connected') : t('notSet')}
        </p>
        <p className="text-gray-400">
          {t('integrations.lastTested')}: {fmtDate(lastTested)}
        </p>
      </div>

      <Button variant="secondary" size="sm" className="mt-auto self-start" onClick={onConfigure}>
        <Settings2 className="mr-1.5 h-4 w-4" />
        {t('configure')}
      </Button>
    </div>
  );
}
