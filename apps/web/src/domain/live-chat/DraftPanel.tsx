import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { useDraftActions } from './live-chat.hooks';
import type { PendingDraft } from './live-chat.service';

function clockTime(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * The AI's proposed answer, waiting for a person (PLN-260812 S7).
 *
 * Editable before sending: an approval step that only offers yes/no makes the
 * agent retype a good answer to fix one word. Approving goes out as the
 * agent's own reply — same moderation and delivery as anything they write.
 */
export function DraftPanel({
  conversationId,
  draft,
}: {
  conversationId: string;
  draft: PendingDraft;
}) {
  const { t } = useTranslation('livechat');
  const { approve, discard } = useDraftActions(conversationId);
  const [body, setBody] = useState(draft.body);

  // A new draft (next customer turn) replaces what is in the box.
  useEffect(() => setBody(draft.body), [draft.id, draft.body]);

  const busy = approve.isPending || discard.isPending;

  return (
    <div className="mx-3 mb-2 rounded-lg border border-primary-200 bg-primary-500/5 p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-primary-700">
        <Sparkles className="h-3.5 w-3.5" />
        <span className="font-medium">{t('draft.title')}</span>
        {draft.confidence != null && (
          <span className="text-primary-600/70">
            {t('draft.confidence', { value: Number(draft.confidence).toFixed(2) })}
          </span>
        )}
        <span className="ml-auto text-gray-400">{clockTime(draft.createdAt)}</span>
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="w-full resize-y rounded border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-800 outline-none focus:border-primary-400"
      />

      <div className="mt-1.5 flex items-center gap-2">
        <Button
          size="sm"
          disabled={busy || !body.trim()}
          onClick={() => approve.mutate(body.trim() === draft.body ? undefined : body.trim())}
        >
          {approve.isPending ? t('draft.sending') : t('draft.approve')}
        </Button>
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => discard.mutate()}>
          {t('draft.discard')}
        </Button>
        <span className="text-[11px] text-gray-400">{t('draft.hint')}</span>
      </div>
    </div>
  );
}
