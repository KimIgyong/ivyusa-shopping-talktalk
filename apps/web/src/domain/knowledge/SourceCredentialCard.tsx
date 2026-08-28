import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';

/**
 * The credential row under the knowledge source list (PLN-260821 W2).
 *
 * Extracted when Notion became the second source type needing one. Both rows
 * do the same four things — show whether a credential exists, show what
 * identifies it, take a paste, and offer a test — and the differences (a
 * service-account address versus a token hint, a JSON blob versus one line)
 * are small enough to be props. A copy would have had to stay in step by hand.
 *
 * One collapsed line per provider (PLN-260829 P1-5): the paste area only
 * appears on demand — two always-open cards were spending a third of the
 * screen on inputs that are used once per tenant.
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
  const [open, setOpen] = useState(false);
  // Both rows render at once, so the hint id has to be unique per instance.
  const hintId = useId();

  return (
    <div className="rounded-md border border-gray-200 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-medium">{title}</h4>
        {connected ? (
          <Badge tone="success">{t('credentialConnected')}</Badge>
        ) : (
          <Badge tone="gray">{t('credentialNotConnected')}</Badge>
        )}
        {connected && identityValue && (
          // The full sentence ("share your folder with …") lives in the title
          // attribute; inline there is only room for the identifier itself.
          <code
            className="min-w-0 flex-1 truncate font-mono text-xs text-gray-500"
            title={`${identityLabel} ${identityValue}`}
          >
            {identityValue}
          </code>
        )}
        <div className="ml-auto flex shrink-0 gap-2">
          {connected ? (
            <>
              {/* Either action in flight disables both: a test that started
                  first can report success on a credential already deleted. */}
              <Button
                variant="ghost"
                size="sm"
                disabled={busy.testing || busy.removing}
                onClick={onTest}
              >
                {t('testConnection')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy.removing || busy.testing}
                onClick={() => {
                  if (window.confirm(removeConfirm)) onRemove();
                }}
              >
                {tc('delete')}
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
              {open ? tc('cancel') : t('registerKey')}
            </Button>
          )}
        </div>
      </div>

      {!connected && open && (
        <div className="mt-2 space-y-2">
          {multiline ? (
            <textarea
              className="h-28 w-full rounded-md border border-gray-300 p-2 font-mono text-xs"
              placeholder={placeholder}
              aria-label={title}
              aria-describedby={hintId}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          ) : (
            <input
              type="password"
              className="w-full rounded-md border border-gray-300 p-2 font-mono text-xs"
              placeholder={placeholder}
              aria-label={title}
              aria-describedby={hintId}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          )}
          {/* Says plainly that the paste is one-way: the secret is never shown
              again, only what identifies it. */}
          <p id={hintId} className="text-xs text-gray-500">
            {inputHint}
          </p>
          <Button
            size="sm"
            disabled={busy.saving || !draft.trim()}
            onClick={() =>
              onSave(draft.trim(), () => {
                setDraft('');
                setOpen(false);
              })
            }
          >
            {tc('save')}
          </Button>
        </div>
      )}
    </div>
  );
}
