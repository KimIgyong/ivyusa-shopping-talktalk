import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { useSetSessionAlias } from './live-chat.hooks';

const MAX_LENGTH = 60;

/**
 * The operator's own name for a session, edited in place (PLN-260812).
 *
 * Shown ahead of the derived name and with the session label kept behind it —
 * an alias tells an agent who this is, the label is still how the thread is
 * referred to. Submitting an empty value clears the alias.
 */
export function SessionAlias({
  conversationId,
  alias,
  fallback,
  sessionLabel,
  compact,
}: {
  conversationId: string;
  alias?: string | null;
  /** Derived name (customer → email) used when no alias is set. */
  fallback: string;
  /** "Session a1b2c3" — rendered behind the name; omit to place it elsewhere
   *  (the list row moved it to its own line, REQ-260824 R1). */
  sessionLabel?: string;
  /** List row: smaller type, edit affordance only on hover/selection. */
  compact?: boolean;
}) {
  const { t } = useTranslation('livechat');
  const save = useSetSessionAlias();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(alias ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(alias ?? '');
  }, [alias, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    const next = draft.trim().slice(0, MAX_LENGTH);
    setEditing(false);
    // Unchanged (including "still empty") is not worth a request or a toast.
    if (next === (alias ?? '')) return;
    save.mutate({ id: conversationId, alias: next.length ? next : null });
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        maxLength={MAX_LENGTH}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          // The list row is a button and Enter would re-open the thread.
          e.stopPropagation();
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) commit();
          if (e.key === 'Escape') {
            setDraft(alias ?? '');
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        placeholder={t('alias.placeholder')}
        aria-label={t('alias.edit')}
        className={cn(
          'w-full rounded border border-primary-400 px-1.5 py-0.5 outline-none',
          compact ? 'text-xs' : 'text-sm',
        )}
      />
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className={cn('truncate', compact ? 'text-sm font-medium text-gray-800' : 'font-semibold')}>
        {alias || fallback}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        title={alias ? t('alias.edit') : t('alias.add')}
        aria-label={alias ? t('alias.edit') : t('alias.add')}
        className="shrink-0 rounded p-0.5 text-gray-300 hover:bg-gray-100 hover:text-gray-500"
      >
        <Pencil className="h-3 w-3" />
      </button>
      {sessionLabel && (
        <span className="shrink-0 text-[11px] text-gray-400">{sessionLabel}</span>
      )}
    </span>
  );
}
