import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
  Lock,
  ShieldCheck,
  ShieldOff,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWidgetStore } from '../../store/widgetStore';
import { usePrefs, useSetPref } from '../../hooks/useNotifications';
import { useOptOutStatus, useSetOptOut } from '../../hooks/usePrivacy';
import { deleteMyData, exportMyData } from '../../services/privacyService';
import { AuthGate } from '../chat/AuthGate';
import { isAuthError } from '../../lib/errors';
import { setConsent } from '../../services/sessionService';
import { setStoredConsent } from '../../lib/consent';
import { formatDate } from '../../lib/format';
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

/**
 * Consent withdrawal / re-consent (wireframe 5.2). State comes from the
 * session/ensure snapshot in the store; changes are only reflected after the
 * server acknowledged them (fail-closed, same as the chat banner).
 */
function ConsentSection() {
  const { t } = useTranslation();
  const sessionToken = useWidgetStore((s) => s.sessionToken);
  const consent = useWidgetStore((s) => s.consent);
  const updateConsentState = useWidgetStore((s) => s.updateConsentState);

  const [busy, setBusy] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function changeConsent(granted: boolean) {
    if (!sessionToken || busy) return;
    // Withdrawing stops chat/AI — require an explicit second click.
    if (!granted && !confirmWithdraw) {
      setConfirmWithdraw(true);
      return;
    }
    setBusy(true);
    setNotice(null);
    if (successTimer.current) clearTimeout(successTimer.current);
    try {
      const res = await setConsent(sessionToken, granted);
      setStoredConsent(granted);
      updateConsentState(
        granted ? 'granted' : 'declined',
        new Date().toISOString(),
        res.consentVersion,
      );
      // Success notice auto-closes; error notices stay until dismissed.
      setNotice({ tone: 'success', text: t('privacy.consent.saved') });
      successTimer.current = setTimeout(() => setNotice(null), 4000);
    } catch {
      setNotice({ tone: 'error', text: t('privacy.consent.error') });
    } finally {
      setBusy(false);
      setConfirmWithdraw(false);
    }
  }

  return (
    <div className="mb-4 border-b border-gray-200 pb-4">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
        <ShieldCheck className="h-4 w-4 shrink-0 text-primary-500" />
        {t('privacy.consent.title')}
      </div>

      {!consent ? (
        <p className="text-[11px] text-gray-400">{t('privacy.consent.unavailable')}</p>
      ) : (
        <>
          <p className="text-xs font-medium text-gray-700">
            {t(`privacy.consent.state.${consent.state}`)}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-400">
            {consent.consentAt &&
              t('privacy.consent.grantedAt', { date: formatDate(consent.consentAt) })}
            {consent.consentAt && consent.noticeVersion && ' · '}
            {consent.noticeVersion &&
              t('privacy.consent.version', { version: consent.noticeVersion })}
          </p>

          {consent.state === 'pending' ? (
            <p className="mt-2 text-[11px] text-gray-500">
              {t('privacy.consent.pendingHint')}
            </p>
          ) : consent.state === 'granted' ? (
            <>
              <button
                onClick={() => void changeConsent(false)}
                disabled={!sessionToken || busy}
                className="mt-2 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-error hover:bg-gray-50 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {confirmWithdraw
                  ? t('privacy.consent.withdrawConfirm')
                  : t('privacy.consent.withdraw')}
              </button>
              <p className="mt-1 text-[11px] text-gray-400">
                {t('privacy.consent.withdrawHint')}
              </p>
            </>
          ) : (
            <button
              onClick={() => void changeConsent(true)}
              disabled={!sessionToken || busy}
              className="mt-2 flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t('privacy.consent.reconsent')}
            </button>
          )}
        </>
      )}

      {notice && (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`mt-2 flex items-center gap-1.5 text-[11px] ${
            notice.tone === 'error' ? 'text-error' : 'text-success'
          }`}
        >
          {notice.tone === 'error' ? (
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="flex-1">{notice.text}</span>
          {notice.tone === 'error' && (
            <button
              onClick={() => setNotice(null)}
              aria-label={t('common.close')}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function PreferencesPanel({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const sessionToken = useWidgetStore((s) => s.sessionToken);
  const setSessionToken = useWidgetStore((s) => s.setSessionToken);
  const setAuthenticated = useWidgetStore((s) => s.setAuthenticated);
  const setCustomerName = useWidgetStore((s) => s.setCustomerName);
  const queryClient = useQueryClient();
  const authenticated = useWidgetStore((s) => s.authenticated);
  const { data, isLoading, isError, error } = usePrefs(sessionToken);
  // The server is the authority: a 401 here means the session lost its customer.
  const authLost = isError && isAuthError(error);
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
      // Erasure unbinds the customer from every session server-side, so this token
      // is no longer authenticated. Reset the widget to a signed-out state, or it
      // keeps greeting the shopper by the name they just asked us to erase and
      // every read 401s. Sign-in is then offered again as usual.
      setCustomerName(null);
      setAuthenticated(false);
      setSessionToken(null);
      queryClient.clear();
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

  // Below the consent block everything is customer-scoped — preferences, the CCPA
  // opt-out and the DSAR actions all 401 without a bound customer. Rendering those
  // controls anyway was worse than an error: the toggles moved, the writes were
  // rejected, and nothing told the shopper. So offer the way in instead.
  //
  // Consent itself stays visible: it is scoped to the SESSION, not the customer, so
  // an anonymous visitor must still be able to withdraw or re-give it — that is the
  // entire point of a consent control. Returning early above it would have quietly
  // taken that away from exactly the visitors most likely to want it.
  if (!authenticated || authLost) {
    return (
      <div className="scroll-thin flex h-full flex-col overflow-y-auto p-3">
        <button
          onClick={onBack}
          className="mb-3 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('orders.back')}
        </button>
        <ConsentSection />
        <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-3 border-t border-gray-200 pt-4">
          <Lock className="h-6 w-6 text-gray-300" />
          <AuthGate
            sessionToken={sessionToken}
            onSuccess={() => setAuthenticated(true)}
            onCancel={onBack}
          />
        </div>
      </div>
    );
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

      {/* Consent withdrawal / re-consent — above notification prefs (5.2). */}
      <ConsentSection />

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
