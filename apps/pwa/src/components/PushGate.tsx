import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isIos, isStandalone, pushSupported, subscribeAndRegister } from '../lib/push';
import { useSession } from '../store/session-context';
import { useToast } from './Toast';
import { IosGuideSheet } from './InstallBanner';

/** PLN-PWA wireframe 3.3 states + a 'prompt' step to trigger the permission ask. */
type GateState = 'enabled' | 'prompt' | 'ios-needs-install' | 'denied' | 'unsupported';

function initialGateState(): GateState {
  // iOS Safari tab exposes no PushManager — check install status first (C2).
  if (isIos() && !isStandalone()) return 'ios-needs-install';
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'enabled';
  if (Notification.permission === 'denied') return 'denied';
  return 'prompt';
}

/**
 * Wraps the Settings notification toggles: children render only when push is
 * actually possible (installed + permission granted); otherwise shows the
 * state-specific hint from wireframe 3.3.
 */
export function PushGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { token, language } = useSession();
  const toast = useToast();
  const [state, setState] = useState<GateState>(initialGateState);
  const [busy, setBusy] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const enable = async () => {
    if (!token || busy) return;
    setBusy(true);
    const result = await subscribeAndRegister(token, language);
    setBusy(false);
    switch (result) {
      case 'ok':
        setState('enabled');
        toast.show(t('push.enabledOk'));
        break;
      case 'denied':
        setState('denied');
        break;
      case 'ios-needs-install':
        setState('ios-needs-install');
        break;
      case 'no-key':
        toast.show(t('push.noKey'), 'error');
        break;
      case 'unsupported':
        setState('unsupported');
        break;
      default:
        toast.show(t('push.setupFailed'), 'error');
    }
  };

  if (state === 'enabled') return <>{children}</>;

  if (state === 'ios-needs-install') {
    return (
      <div className="push-gate">
        <p className="hint">{t('push.iosNeedsInstall')}</p>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setGuideOpen(true)}>
          {t('push.showGuide')}
        </button>
        <IosGuideSheet open={guideOpen} onClose={() => setGuideOpen(false)} />
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className="push-gate">
        <p className="hint">{t('push.denied')}</p>
      </div>
    );
  }

  if (state === 'unsupported') {
    return (
      <div className="push-gate">
        <p className="hint">{t('push.unsupported')}</p>
      </div>
    );
  }

  return (
    <div className="push-gate">
      <p className="hint">{t('push.promptHint')}</p>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={busy || !token}
        onClick={() => void enable()}
      >
        {t('push.enable')}
      </button>
    </div>
  );
}
