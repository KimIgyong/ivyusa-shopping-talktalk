import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getPrefs, setPref } from '../services/notificationService';
import { getOptOutStatus, setOptOut } from '../services/privacyService';
import { useSession } from '../store/session-context';
import { useToast } from '../components/Toast';
import { PushGate } from '../components/PushGate';
import { ApiError } from '../lib/api-client';
import { LANGUAGE_OPTIONS } from '../lib/config';
import type { NotifPref } from '../lib/types';


/** UI toggle -> underlying (push channel) categories it controls (RN parity). */
const TOGGLE_GROUPS = [
  { key: 'notifOrders', categories: ['payment', 'shipping'] as const, defaultOn: true },
  { key: 'notifChat', categories: ['chat'] as const, defaultOn: true },
  { key: 'notifEvent', categories: ['event', 'review'] as const, defaultOn: false },
] as const;

type ToggleGroup = (typeof TOGGLE_GROUPS)[number];

export default function SettingsPage() {
  const { t } = useTranslation();
  const { token, language, changeLanguage } = useSession();
  const toast = useToast();
  const qc = useQueryClient();

  // Pref rows exist only for a customer-bound session (401 = anonymous/unbound).
  const prefsQuery = useQuery({
    queryKey: ['prefs', token],
    enabled: !!token,
    queryFn: async () => {
      try {
        return { bound: true, prefs: await getPrefs(token!) };
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          return { bound: false, prefs: [] as NotifPref[] };
        }
        throw e;
      }
    },
  });

  const optOutQuery = useQuery({
    queryKey: ['optout', token],
    enabled: !!token && prefsQuery.data?.bound === true,
    queryFn: () => getOptOutStatus(token!),
  });

  const bound = prefsQuery.data?.bound === true;
  const prefs = prefsQuery.data?.prefs ?? [];

  const groupEnabled = (group: ToggleGroup): boolean => {
    const rows = prefs.filter(
      (p) => p.channel === 'push' && (group.categories as readonly string[]).includes(p.category),
    );
    if (rows.length === 0) return group.defaultOn; // server default (RN D-4 parity)
    return rows.some((p) => p.enabled);
  };

  const toggleGroup = async (group: ToggleGroup, enabled: boolean) => {
    if (!token) return;
    try {
      for (const category of group.categories) {
        await setPref(token, 'push', category, enabled);
      }
      toast.show(t('settings.prefSaved'));
      await qc.invalidateQueries({ queryKey: ['prefs', token] });
    } catch {
      toast.show(t('settings.prefFailed'), 'error');
    }
  };

  const onToggleOptOut = async (optOut: boolean) => {
    if (!token) return;
    try {
      await setOptOut(token, optOut);
      toast.show(t('settings.optOutSaved'));
      await qc.invalidateQueries({ queryKey: ['optout', token] });
      await qc.invalidateQueries({ queryKey: ['prefs', token] });
    } catch {
      toast.show(t('settings.prefFailed'), 'error');
    }
  };

  return (
    <div className="page">
      <h2 className="section-heading">{t('settings.language')}</h2>
      <div className="card">
        <div className="lang-row">
          {LANGUAGE_OPTIONS.map((option) => (
            <button
              key={option.code}
              type="button"
              className={`chip lang-chip ${language === option.code ? 'lang-chip-active' : ''}`}
              onClick={() => void changeLanguage(option.code)}
            >
              {option.nativeLabel}
            </button>
          ))}
        </div>
      </div>

      <h2 className="section-heading">{t('settings.notifSection')}</h2>
      <div className="card">
        <PushGate>
          {!bound && <p className="hint">{t('settings.notifNeedAccount')}</p>}
          {TOGGLE_GROUPS.map((group) => (
            <div key={group.key} className="toggle-row">
              <span className={`toggle-label ${bound ? '' : 'disabled-text'}`}>
                {t(`settings.${group.key}`)}
              </span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={groupEnabled(group)}
                  disabled={!bound}
                  onChange={(e) => void toggleGroup(group, e.target.checked)}
                />
                <span className="slider" />
              </label>
            </div>
          ))}
        </PushGate>
      </div>

      <h2 className="section-heading">{t('settings.privacySection')}</h2>
      <div className="card">
        <div className="toggle-row">
          <span className={`toggle-label ${bound ? '' : 'disabled-text'}`}>
            {t('settings.optOut')}
          </span>
          <label className="switch">
            <input
              type="checkbox"
              checked={optOutQuery.data?.optOut ?? false}
              disabled={!bound}
              onChange={(e) => void onToggleOptOut(e.target.checked)}
            />
            <span className="slider" />
          </label>
        </div>
        {/* DSAR export/delete need a verified identity — unavailable on the PWA (C4/W-6). */}
        <p className="hint dsar-info">{t('settings.dsarInfo')}</p>
      </div>
    </div>
  );
}
