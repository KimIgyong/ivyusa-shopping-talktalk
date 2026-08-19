import { AlertTriangle, Ban } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Shown after repeated sign-in failures on a tenant login page.
 *
 * It exists because a login at the WRONG store can never succeed no matter how
 * correct the password is — the slug in the URL picks the tenant, and an account
 * that lives on another store simply is not there. The screen said only
 * "invalid credentials", so the operator kept retrying until the 5-failure
 * lockout fired (REQ-260819 §… / PLN-260819).
 *
 * ⚠️ The copy is IDENTICAL whether the password was wrong or the account belongs
 * to a different store, and it is triggered by the failure COUNT alone — never
 * by a reason the server returned. Saying "that account is not on this store"
 * would let anyone enumerate accounts across tenants. This adds no information:
 * it repeats which store you are on, at the moment that fact starts to matter.
 */
export function LoginTroubleHint({
  storeName,
  slug,
  rateLimited,
}: {
  storeName: string;
  slug: string;
  rateLimited: boolean;
}) {
  const { t } = useTranslation('auth');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="mb-4 space-y-3">
      {rateLimited && (
        <div
          className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          <Ban className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">{t('lockedTitle')}</p>
            {/* No countdown: the server sends no Retry-After, and a guessed
                number would be worse guidance than none. */}
            <p className="mt-0.5">{t('lockedDesc')}</p>
          </div>
        </div>
      )}

      <div
        className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
        role="status"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">{t('wrongStoreTitle')}</p>
          <p className="mt-0.5">{t('wrongStoreDesc', { store: storeName })}</p>
          <p className="mt-1 font-mono text-xs text-amber-700">
            {origin}/{slug}
          </p>
        </div>
      </div>
    </div>
  );
}
