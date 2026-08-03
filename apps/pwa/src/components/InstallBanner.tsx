import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isIos, isStandalone } from '../lib/push';
import { isInstallDismissed, setInstallDismissed } from '../lib/storage';

/** Chrome's non-standard install prompt event (Android/desktop). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** iOS A2HS guide sheet (PLN-PWA wireframe 3.2) — also opened from PushGate. */
export function IosGuideSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <div className="sheet-overlay" role="dialog" aria-modal="true">
      <div className="sheet">
        <h2 className="sheet-title">{t('install.iosTitle')}</h2>
        <ol className="sheet-steps">
          <li>{t('install.iosStep1')}</li>
          <li>{t('install.iosStep2')}</li>
          <li>{t('install.iosStep3')}</li>
        </ol>
        <button type="button" className="btn btn-primary btn-block" onClick={onClose}>
          {t('common.ok')}
        </button>
      </div>
    </div>
  );
}

/**
 * Install prompt banner (PLN-PWA W-8 / wireframe 3.1):
 * - standalone → hidden entirely
 * - Android/desktop → beforeinstallprompt capture, [Install]/[Later]
 * - iOS Safari tab → button opens the Share → Add to Home Screen guide sheet
 */
export function InstallBanner() {
  const { t } = useTranslation();
  const [bip, setBip] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(isInstallDismissed());
  const [installed, setInstalled] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setBip(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (isStandalone() || dismissed || installed) return null;

  const ios = isIos();
  if (!bip && !ios) return null; // no install path on this browser

  const install = async () => {
    if (bip) {
      await bip.prompt();
      const choice = await bip.userChoice;
      if (choice.outcome === 'accepted') setInstalled(true);
      setBip(null);
    } else {
      setGuideOpen(true);
    }
  };

  const later = () => {
    setInstallDismissed();
    setDismissed(true);
  };

  return (
    <div className="install-banner">
      <span className="install-text">{t('install.banner')}</span>
      <div className="install-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void install()}>
          {bip ? t('install.install') : t('install.howTo')}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={later}>
          {t('install.later')}
        </button>
      </div>
      <IosGuideSheet open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}
