import { useState } from 'react';
import { LogIn, Search } from 'lucide-react';
import { strings } from '../../i18n/strings';
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
  const [mode, setMode] = useState<'choice' | 'guest'>('choice');
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!sessionToken) return;
    setError(null);
    setLoading(true);
    try {
      await guestLookup(sessionToken, orderNumber.trim(), email.trim());
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-1 text-sm font-semibold text-gray-800">
        {strings.auth.title}
      </div>
      <p className="mb-3 text-xs text-gray-600">{strings.auth.body}</p>

      {mode === 'choice' ? (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => alert('Sign-in flow opens the storefront account page.')}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600"
          >
            <LogIn className="h-4 w-4" />
            {strings.auth.signIn}
          </button>
          <button
            onClick={() => setMode('guest')}
            className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Search className="h-4 w-4" />
            {strings.auth.guestLookup}
          </button>
          <button
            onClick={onCancel}
            className="py-1 text-xs text-gray-400 hover:text-gray-600"
          >
            {strings.auth.cancel}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <input
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder={strings.auth.orderNumber}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={strings.auth.email}
            type="email"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none"
          />
          {error && <p className="text-xs text-error">{error}</p>}
          <button
            disabled={loading || !orderNumber || !email}
            onClick={submit}
            className="rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
          >
            {loading ? strings.common.loading : strings.auth.submit}
          </button>
          <button
            onClick={() => setMode('choice')}
            className="py-1 text-xs text-gray-400 hover:text-gray-600"
          >
            {strings.auth.cancel}
          </button>
        </div>
      )}
    </div>
  );
}
