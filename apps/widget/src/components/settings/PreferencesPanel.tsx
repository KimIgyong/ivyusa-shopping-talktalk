import { ArrowLeft, ShieldOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWidgetStore } from '../../store/widgetStore';
import { usePrefs, useSetPref } from '../../hooks/useNotifications';
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

      <a
        href="#ccpa"
        onClick={(e) => {
          e.preventDefault();
          if (sessionToken) {
            // opt-out flips all non-in_app channels off
            for (const ch of CHANNELS) {
              if (ch === 'in_app') continue;
              for (const cat of CATEGORIES) {
                setPref.mutate({ channel: ch, category: cat, enabled: false });
              }
            }
          }
        }}
        className="mt-4 flex items-center gap-1.5 text-xs font-medium text-gray-500 underline hover:text-error"
      >
        <ShieldOff className="h-3.5 w-3.5" />
        {t('prefs.ccpa')}
      </a>
    </div>
  );
}
