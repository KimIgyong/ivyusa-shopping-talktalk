import { useState } from 'react';
import { ArrowLeft, Download, ShieldOff, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWidgetStore } from '../../store/widgetStore';
import { usePrefs, useSetPref } from '../../hooks/useNotifications';
import { useOptOutStatus, useSetOptOut } from '../../hooks/usePrivacy';
import { deleteMyData, exportMyData } from '../../services/privacyService';
import { Spinner } from '../ui/Spinner';
import type {
  NotifChannel,
  NotificationCategory,
  NotifPref,
} from '../../lib/types';

const CHANNELS: NotifChannel[] = ['in_app', 'email', 'sms', 'web_push'];
const CATEGORIES: NotificationCategory[] = [
  'payment',
  'shipping',
  'event',
  'review',
];

function Toggle({
  on,
  disabled,
  onChange,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 rounded-full transition-colors ${
        on ? 'bg-primary-500' : 'bg-gray-200'
      } ${disabled ? 'opacity-50' : ''}`}
      aria-pressed={on}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
          on ? 'left-[18px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

export function PreferencesPanel({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const sessionToken = useWidgetStore((s) => s.sessionToken);
  const { data, isLoading } = usePrefs(sessionToken);
  const setPref = useSetPref(sessionToken);
  const optOutStatus = useOptOutStatus(sessionToken);
  const setOptOut = useSetOptOut(sessionToken);
  const [dsarBusy, setDsarBusy] = useState<'export' | 'delete' | null>(null);
  const [dsarNotice, setDsarNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Export/erasure require a Shopify-verified session — 401/403 means "sign in".
  function dsarErrorText(e: unknown): string {
    const status = (e as { status?: number }).status;
    return status === 401 || status === 403 ? t('privacy.needVerified') : t('common.error');
  }

  async function handleExport() {
    if (!sessionToken || dsarBusy) return;
    setDsarBusy('export');
    setDsarNotice(null);
    try {
      const payload = await exportMyData(sessionToken);
      // Hand the export over as a JSON download (DSAR portability).
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'my-data-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDsarNotice(dsarErrorText(e));
    } finally {
      setDsarBusy(null);
    }
  }

  async function handleDelete() {
    if (!sessionToken || dsarBusy) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDsarBusy('delete');
    setDsarNotice(null);
    try {
      await deleteMyData(sessionToken);
      setDsarNotice(t('privacy.deleteDone'));
    } catch (e) {
      setDsarNotice(dsarErrorText(e));
    } finally {
      setDsarBusy(null);
      setConfirmDelete(false);
    }
  }

  function isEnabled(
    prefs: NotifPref[] | undefined,
    channel: NotifChannel,
    category: NotificationCategory,
  ): boolean {
    if (channel === 'in_app') return true; // always on
    const p = prefs?.find(
      (x) => x.channel === channel && x.category === category,
    );
    return p?.enabled ?? false;
  }

  return (
    <div className="scroll-thin flex h-full flex-col overflow-y-auto p-3">
      <button
        onClick={onBack}
        className="mb-3 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t('orders.back')}
      </button>
      <div className="mb-3 text-sm font-semibold text-gray-900">
        {t('prefs.title')}
      </div>

      {isLoading ? (
        <Spinner label={t('common.loading')} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="p-2 text-left font-medium">Category</th>
                {CHANNELS.map((c) => (
                  <th key={c} className="p-2 text-center font-medium">
                    {t(`prefs.channels.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((cat) => (
                <tr key={cat} className="border-t border-gray-100">
                  <td className="p-2 font-medium text-gray-700">
                    {t(`prefs.categories.${cat}`)}
                  </td>
                  {CHANNELS.map((ch) => {
                    const alwaysOn = ch === 'in_app';
                    return (
                      <td key={ch} className="p-2 text-center">
                        <div className="flex justify-center">
                          <Toggle
                            on={isEnabled(data, ch, cat)}
                            disabled={alwaysOn}
                            onChange={(v) =>
                              setPref.mutate({
                                channel: ch,
                                category: cat,
                                enabled: v,
                              })
                            }
                          />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-2 text-[11px] text-gray-400">
        {t('prefs.channels.in_app')}: {t('prefs.alwaysOn')}
      </p>

      {/* CCPA/CPRA + DSAR consumer rights (PRV-M3) */}
      <div className="mt-4 border-t border-gray-200 pt-3">
        <div className="mb-2 text-sm font-semibold text-gray-900">{t('privacy.title')}</div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
            <ShieldOff className="h-3.5 w-3.5 shrink-0" />
            {t('prefs.ccpa')}
          </div>
          <Toggle
            on={optOutStatus.data?.optOut ?? false}
            disabled={!sessionToken || setOptOut.isPending}
            onChange={(v) => setOptOut.mutate(v)}
          />
        </div>
        <p className="mt-1 text-[11px] text-gray-400">{t('privacy.optOutHint')}</p>

        <div className="mt-3 flex flex-col gap-2">
          <button
            onClick={handleExport}
            disabled={!sessionToken || dsarBusy !== null}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 underline hover:text-gray-700 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {dsarBusy === 'export' ? t('privacy.exporting') : t('privacy.export')}
          </button>
          <button
            onClick={handleDelete}
            disabled={!sessionToken || dsarBusy !== null}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 underline hover:text-error disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {confirmDelete ? t('privacy.deleteConfirm') : t('privacy.delete')}
          </button>
        </div>

        {dsarNotice && <p className="mt-2 text-[11px] text-gray-500">{dsarNotice}</p>}
      </div>
    </div>
  );
}
