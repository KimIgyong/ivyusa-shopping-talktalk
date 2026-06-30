import { useEffect, useId, useRef, useState } from 'react';
import { LogIn, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { guestLookup } from '../../services/orderService';

export function AuthGate({
  sessionToken,
  onSuccess,
  onCancel,
}: {
  sessionToken: string | null;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'choice' | 'guest'>('choice');
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const titleId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  // Esc cancels; focus the dialog on open.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    containerRef.current?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  async function submit() {
    if (!sessionToken) return;
    setError(null);
    setLoading(true);
    try {
      await guestLookup(sessionToken, orderNumber.trim(), email.trim());
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="rounded-lg border border-gray-200 bg-white p-3 focus:outline-none"
    >
      <div id={titleId} className="mb-1 text-sm font-semibold text-gray-800">
        {t('auth.title')}
      </div>
      <p className="mb-3 text-xs text-gray-600">{t('auth.body')}</p>

      {mode === 'choice' ? (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => alert('Sign-in flow opens the storefront account page.')}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600"
          >
            <LogIn className="h-4 w-4" />
            {t('auth.signIn')}
          </button>
          <button
            onClick={() => setMode('guest')}
            className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Search className="h-4 w-4" />
            {t('auth.guestLookup')}
          </button>
          <button
            onClick={onCancel}
            className="py-1 text-xs text-gray-400 hover:text-gray-600"
          >
            {t('auth.cancel')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <input
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder={t('auth.orderNumber')}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.email')}
            type="email"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          {error && <p className="text-xs text-error">{error}</p>}
          <button
            disabled={loading || !orderNumber || !email}
            onClick={submit}
            className="rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
          >
            {loading ? t('common.loading') : t('auth.submit')}
          </button>
          <button
            onClick={() => setMode('choice')}
            className="py-1 text-xs text-gray-400 hover:text-gray-600"
          >
            {t('auth.cancel')}
          </button>
        </div>
      )}
    </div>
  );
}
