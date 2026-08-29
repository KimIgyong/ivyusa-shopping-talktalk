import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { useUsers } from '@/domain/users/users.hooks';
import {
  useAddBoardComment,
  useBoardComments,
  useBoardLinkGraph,
  useRemoveBoardComment,
} from './board.hooks';

/**
 * Collaboration panels under the editor (PLN-260829 B3): comments with
 * @mentions, and the wikilink graph — backlinks plus outgoing targets, where
 * a missing target is an invitation to write it (P5-4).
 */
export function BoardCollabPanels({ documentId, docGroup }: { documentId: string; docGroup: string }) {
  const { t } = useTranslation('board');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();

  const comments = useBoardComments(documentId);
  const links = useBoardLinkGraph(documentId);
  const addComment = useAddBoardComment();
  const removeComment = useRemoveBoardComment();
  const users = useUsers();

  const [draft, setDraft] = useState('');
  const [mentions, setMentions] = useState<Array<{ id: string; name: string }>>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  // The picker filters on what follows the last "@" in the draft.
  const atQuery = useMemo(() => {
    const m = draft.match(/@([^\s@]*)$/);
    return m ? m[1] : null;
  }, [draft]);
  const candidates = (users.data ?? [])
    .filter((u) => !mentions.some((m) => m.id === String(u.id)))
    .filter((u) => {
      if (atQuery === null) return false;
      const name = u.name || u.email;
      return name.toLowerCase().includes(atQuery.toLowerCase());
    })
    .slice(0, 6);

  const pickMention = (id: string, name: string) => {
    setMentions([...mentions, { id, name }]);
    setDraft(draft.replace(/@[^\s@]*$/, ''));
    setPickerOpen(false);
  };

  const submit = () => {
    if (!draft.trim() && !mentions.length) return;
    addComment.mutate(
      { id: documentId, body: draft.trim() || '@', mentionIds: mentions.map((m) => Number(m.id)) },
      {
        onSuccess: () => {
          setDraft('');
          setMentions([]);
        },
      },
    );
  };

  return (
    <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* ---- Comments ---- */}
      <div className="rounded-md border border-gray-200 p-3">
        <h4 className="mb-2 text-sm font-medium">
          {t('comments')} ({comments.data?.length ?? 0})
        </h4>
        <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
          {(comments.data ?? []).map((c) => (
            <li key={c.id} className="border-b border-gray-100 pb-2 last:border-0">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="font-medium text-gray-700">{c.authorName}</span>
                <span>{new Date(c.createdAt).toLocaleString()}</span>
                <button
                  type="button"
                  className="ml-auto text-gray-400 hover:text-red-600"
                  aria-label={tc('delete')}
                  onClick={() => removeComment.mutate({ commentId: c.id, documentId })}
                >
                  ×
                </button>
              </div>
              <p className="whitespace-pre-wrap">
                {c.mentions.map((m) => (
                  <span key={m.id} className="mr-1 rounded bg-primary-50 px-1 text-xs text-primary-700">
                    @{m.name}
                  </span>
                ))}
                {c.body}
              </p>
            </li>
          ))}
          {!comments.data?.length && (
            <li className="text-xs text-gray-400">{t('noComments')}</li>
          )}
        </ul>

        <div className="relative mt-2">
          {mentions.length > 0 && (
            <div className="mb-1 flex flex-wrap gap-1">
              {mentions.map((m) => (
                <span key={m.id} className="flex items-center gap-1 rounded bg-primary-50 px-2 py-0.5 text-xs text-primary-700">
                  @{m.name}
                  <button type="button" onClick={() => setMentions(mentions.filter((x) => x.id !== m.id))}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={draft}
              placeholder={t('commentPlaceholder')}
              onChange={(e) => {
                setDraft(e.target.value);
                setPickerOpen(/@[^\s@]*$/.test(e.target.value));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !pickerOpen) {
                  e.preventDefault();
                  submit();
                }
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
            />
            <Button size="sm" disabled={addComment.isPending || (!draft.trim() && !mentions.length)} onClick={submit}>
              {t('commentSubmit')}
            </Button>
          </div>
          {pickerOpen && candidates.length > 0 && (
            <ul className="absolute bottom-full z-10 mb-1 w-64 rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg">
              {candidates.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-1.5 text-left hover:bg-gray-50"
                    onClick={() => pickMention(String(u.id), u.name || u.email)}
                  >
                    @{u.name || u.email}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ---- Link graph ---- */}
      <div className="rounded-md border border-gray-200 p-3 text-sm">
        <h4 className="mb-1 text-sm font-medium">{t('linkPanel')}</h4>
        <p className="mb-1 text-xs font-medium text-gray-500">
          ← {t('backlinksTitle')} ({links.data?.backlinks.length ?? 0})
        </p>
        <ul className="mb-2 space-y-0.5">
          {(links.data?.backlinks ?? []).map((b) => (
            <li key={b.id}>
              <button
                type="button"
                className="truncate text-primary-600 hover:underline"
                onClick={() => navigate(`/knowledge/board/${b.id}`)}
              >
                {b.title}
              </button>
            </li>
          ))}
          {!links.data?.backlinks.length && (
            <li className="text-xs text-gray-400">{t('noBacklinks')}</li>
          )}
        </ul>
        <p className="mb-1 text-xs font-medium text-gray-500">→ {t('outgoingTitle')}</p>
        <ul className="space-y-0.5">
          {(links.data?.outgoing ?? []).map((o) => (
            <li key={o.title} className="flex items-center gap-1">
              {o.documentId ? (
                <button
                  type="button"
                  className="truncate text-primary-600 hover:underline"
                  onClick={() => navigate(`/knowledge/board/${o.documentId}`)}
                >
                  [[{o.title}]]
                </button>
              ) : (
                <button
                  type="button"
                  className="truncate text-gray-500 hover:text-primary-600"
                  title={t('createFromLink')}
                  onClick={() =>
                    navigate(
                      `/knowledge/board/new?group=${encodeURIComponent(docGroup)}&title=${encodeURIComponent(o.title)}`,
                    )
                  }
                >
                  [[{o.title}]] <Badge tone="warning">{t('linkMissing')}</Badge>
                </button>
              )}
            </li>
          ))}
          {!links.data?.outgoing.length && (
            <li className="text-xs text-gray-400">{t('noOutgoing')}</li>
          )}
        </ul>
        <p className="mt-2 text-xs text-gray-400">{t('linkRenameHint')}</p>
      </div>
    </div>
  );
}
