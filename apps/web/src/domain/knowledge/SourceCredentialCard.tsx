import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';

/**
 * The credential card beside the knowledge source list (PLN-260821 W2).
 *
 * Extracted when Notion became the second source type needing one. Both cards
 * do the same four things — show whether a credential exists, show what
 * identifies it, take a paste, and offer a test — and the differences (a
 * service-account address versus a token hint, a JSON blob versus one line)
 * are small enough to be props. A copy would have had to stay in step by hand.
 */
export interface SourceCredentialCardProps {
  title: string;
  connected: boolean;
  /** Sentence above the identifier, e.g. which address to share a folder with. */
  identityLabel: string;
  /** What names the stored credential: an address, or a masked hint. */
  identityValue: string | null;
  /** What to say about the paste before it is made. */
  inputHint: string;
  placeholder: string;
  /** Service-account keys are a JSON blob; a Notion token is one line. */
  multiline?: boolean;
  removeConfirm: string;
  busy: { saving: boolean; removing: boolean; testing: boolean };
  onSave: (value: string, clear: () => void) => void;
  onRemove: () => void;
  onTest: () => void;
}

export function SourceCredentialCard({
  title,
  connected,
  identityLabel,
  identityValue,
  inputHint,
  placeholder,
  multiline = false,
  removeConfirm,
  busy,
  onSave,
  onRemove,
  onTest,
}: SourceCredentialCardProps) {
  const { t } = useTranslation('knowledge');
  const { t: tc } = useTranslation('common');
  const [draft, setDraft] = useState('');

  return (
    <div className="rounded-md border border-gray-200 p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{title}</h4>
        {connected ? (
          <Badge tone="success">{t('credentialConnected')}</Badge>
        ) : (
          <Badge tone="gray">{t('credentialNotConnected')}</Badge>
        )}
      </div>

      {connected ? (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-gray-500">{identityLabel}</p>
          {identityValue && (
            <code className="block break-all font-mono text-xs">{identityValue}</code>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" disabled={busy.testing} onClick={onTest}>
              {t('testConnection')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy.removing}
              onClick={() => {
                if (window.confirm(removeConfirm)) onRemove();
              }}
            >
              {tc('delete')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {multiline ? (
            <textarea
              className="h-28 w-full rounded-md border border-gray-300 p-2 font-mono text-xs"
              placeholder={placeholder}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          ) : (
            <input
              type="password"
              className="w-full rounded-md border border-gray-300 p-2 font-mono text-xs"
              placeholder={placeholder}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          )}
          {/* Says plainly that the paste is one-way: the secret is never shown
              again, only what identifies it. */}
          <p className="text-xs text-gray-500">{inputHint}</p>
          <Button
            size="sm"
            disabled={busy.saving || !draft.trim()}
            onClick={() => onSave(draft.trim(), () => setDraft(''))}
          >
            {tc('save')}
          </Button>
        </div>
      )}
    </div>
  );
}
