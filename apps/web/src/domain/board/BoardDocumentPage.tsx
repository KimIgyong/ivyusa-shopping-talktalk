import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import MDEditor from '@uiw/react-md-editor';
import '@uiw/react-md-editor/markdown-editor.css';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Modal } from '@/components/Modal';
import { FormRow, Input, Select } from '@/components/Field';
import { useJobLabels } from '@/domain/users/users.hooks';
import {
  useAddBoardLink,
  useBoardDocument,
  useBoardRevisions,
  useCreateBoardDocument,
  useDeleteBoardDocument,
  useRemoveBoardAttachment,
  useRestoreBoardRevision,
  useUpdateBoardDocument,
  useUploadBoardAttachments,
} from './board.hooks';

const GROUPS = ['counsel', 'product', 'operation'] as const;

/**
 * Board document editor (PLN-260829 B1 §3). Markdown source is what is stored
 * (D-5); the toolbar/preview come from @uiw/react-md-editor. Attachments live
 * in a side panel; images offer "insert into body" with their signed URL.
 */
export function BoardDocumentPage() {
  const { t } = useTranslation('board');
  const { t: tk } = useTranslation('knowledge');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const docId = isNew ? null : (id ?? null);

  const detail = useBoardDocument(docId);
  const jobLabels = useJobLabels();
  const createDoc = useCreateBoardDocument();
  const updateDoc = useUpdateBoardDocument();
  const deleteDoc = useDeleteBoardDocument();
  const upload = useUploadBoardAttachments();
  const addLink = useAddBoardLink();
  const removeAttachment = useRemoveBoardAttachment();
  const restore = useRestoreBoardRevision();

  const [group, setGroup] = useState('counsel');
  const [category1, setCategory1] = useState('');
  const [category2, setCategory2] = useState('');
  const [teamLabel, setTeamLabel] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const loadedFor = useRef<string | null>(null);

  const revisions = useBoardRevisions(historyOpen && docId ? docId : null);

  // Hydrate the form once per document — not on every refetch, or a background
  // invalidation would stomp text the operator is typing.
  useEffect(() => {
    const d = detail.data;
    if (!d || loadedFor.current === d.id) return;
    loadedFor.current = d.id;
    setGroup(d.docGroup);
    setCategory1(d.category1);
    setCategory2(d.category2 ?? '');
    setTeamLabel(d.teamLabel ?? '');
    setTitle(d.title);
    setContent(d.content);
    setTags(d.tags);
  }, [detail.data]);

  const body = (status?: string) => ({
    doc_group: group,
    category1,
    category2,
    title,
    team_label: teamLabel,
    content,
    tags,
    ...(status ? { status } : {}),
  });

  const save = (status?: string) => {
    if (isNew) {
      createDoc.mutate(body(status), { onSuccess: (d) => navigate(`/knowledge/board/${d.id}`, { replace: true }) });
    } else if (docId) {
      updateDoc.mutate({ id: docId, body: body(status) });
    }
  };

  const addTag = () => {
    const v = tagDraft.trim();
    if (v && !tags.includes(v)) setTags([...tags, v]);
    setTagDraft('');
  };

  const insertImage = (url: string, filename: string) =>
    setContent((prev) => `${prev}${prev.endsWith('\n') || !prev ? '' : '\n'}![${filename}](${url})\n`);

  const saving = createDoc.isPending || updateDoc.isPending;
  const canSave = title.trim() !== '' && category1.trim() !== '';
  const status = detail.data?.status ?? 'draft';

  return (
    <div>
      <PageHeader
        title={isNew ? t('newDocument') : detail.data?.title ?? t('title')}
        subtitle={t('editorSubtitle')}
      />
      <Card
        title={t('editor')}
        action={
          <div className="flex items-center gap-2">
            {!isNew && (
              <>
                <Badge tone={status === 'published' ? 'info' : 'gray'}>
                  {t(`statusValue.${status}`)}
                </Badge>
                <Button variant="ghost" onClick={() => setHistoryOpen(true)}>
                  {t('history')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm(t('deleteConfirm')) && docId)
                      deleteDoc.mutate(docId, { onSuccess: () => navigate('/knowledge/board') });
                  }}
                >
                  {tc('delete')}
                </Button>
              </>
            )}
            <Button variant="secondary" onClick={() => navigate('/knowledge/board')}>
              {t('backToList')}
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <FormRow label={tk('groupColumn')}>
            <Select value={group} onChange={(e) => setGroup(e.target.value)}>
              {GROUPS.map((g) => (
                <option key={g} value={g}>
                  {tk(`group.${g}`)}
                </option>
              ))}
            </Select>
          </FormRow>
          <FormRow label={t('category1')}>
            <Input value={category1} onChange={(e) => setCategory1(e.target.value)} />
          </FormRow>
          <FormRow label={t('category2')}>
            <Input value={category2} onChange={(e) => setCategory2(e.target.value)} />
          </FormRow>
          <FormRow label={t('team')}>
            <Select value={teamLabel} onChange={(e) => setTeamLabel(e.target.value)}>
              <option value="">—</option>
              {(jobLabels.data ?? []).map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </Select>
          </FormRow>
        </div>

        <FormRow label={t('title_column')}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </FormRow>

        <FormRow label={t('tags')}>
          <div className="flex flex-wrap items-center gap-1">
            {tags.map((x) => (
              <span key={x} className="flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs">
                #{x}
                <button
                  type="button"
                  aria-label={t('removeTag')}
                  onClick={() => setTags(tags.filter((v) => v !== x))}
                >
                  ×
                </button>
              </span>
            ))}
            <Input
              value={tagDraft}
              placeholder={t('tagPlaceholder')}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              }}
              className="h-7 w-40"
            />
          </div>
        </FormRow>

        {/* MD source is authoritative (D-5); the wikilink hint keeps [[..]] discoverable. */}
        <div data-color-mode="light" className="mt-2">
          <MDEditor value={content} onChange={(v) => setContent(v ?? '')} height={420} />
          <p className="mt-1 text-xs text-gray-500">{t('wikilinkHint')}</p>
        </div>

        {!isNew && (
          <div className="mt-4 rounded-md border border-gray-200 p-3">
            <div className="mb-2 flex items-center gap-2">
              <h4 className="text-sm font-medium">{t('attachments')}</h4>
              <span className="text-xs text-gray-500">{t('attachmentHint')}</span>
              <div className="ml-auto flex gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.xlsx,.csv,.png,.jpg,.jpeg,.webp,.zip,.rar"
                  className="hidden"
                  onChange={(e) => {
                    const files = [...(e.target.files ?? [])];
                    if (files.length && docId) upload.mutate({ id: docId, files });
                    e.target.value = '';
                  }}
                />
                <Button variant="ghost" size="sm" disabled={upload.isPending} onClick={() => fileInput.current?.click()}>
                  {upload.isPending ? tc('loading') : t('addFiles')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setLinkOpen(true)}>
                  {t('addLink')}
                </Button>
              </div>
            </div>
            <ul className="space-y-1 text-sm">
              {(detail.data?.attachments ?? []).map((a) => (
                <li key={a.id} className="flex items-center gap-2">
                  <a
                    href={a.url ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-primary-600 hover:underline"
                  >
                    {a.kind === 'link' ? '🔗 ' : '📎 '}
                    {a.filename}
                  </a>
                  {a.size != null && (
                    <span className="text-xs text-gray-400">{(a.size / 1024 / 1024).toFixed(1)}MB</span>
                  )}
                  {a.kind === 'file' && a.mime?.startsWith('image/') && a.url && (
                    <button
                      type="button"
                      className="text-xs text-primary-600 hover:underline"
                      onClick={() => insertImage(a.url!, a.filename)}
                    >
                      {t('insertImage')}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={tc('delete')}
                    className="ml-auto text-xs text-gray-400 hover:text-red-600"
                    onClick={() => docId && removeAttachment.mutate({ attachmentId: a.id, documentId: docId })}
                  >
                    ×
                  </button>
                </li>
              ))}
              {!detail.data?.attachments.length && (
                <li className="text-xs text-gray-400">{t('noAttachments')}</li>
              )}
            </ul>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" disabled={!canSave || saving} onClick={() => save()}>
            {saving ? tc('loading') : t('saveDraft')}
          </Button>
          <Button disabled={!canSave || saving} onClick={() => save('published')}>
            {t('publish')}
          </Button>
        </div>
      </Card>

      <Modal open={linkOpen} onClose={() => setLinkOpen(false)} title={t('addLink')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setLinkOpen(false)}>{tc('cancel')}</Button>
            <Button
              disabled={!linkUrl.trim() || addLink.isPending}
              onClick={() =>
                docId &&
                addLink.mutate(
                  { id: docId, url: linkUrl.trim(), label: linkLabel.trim() || undefined },
                  { onSuccess: () => { setLinkOpen(false); setLinkUrl(''); setLinkLabel(''); } },
                )
              }
            >
              {tc('save')}
            </Button>
          </>
        }
      >
        <FormRow label="URL">
          <Input value={linkUrl} placeholder="https://drive.google.com/…" onChange={(e) => setLinkUrl(e.target.value)} />
        </FormRow>
        <FormRow label={t('linkLabel')}>
          <Input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} />
        </FormRow>
      </Modal>

      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title={t('history')}
        footer={<Button variant="ghost" onClick={() => setHistoryOpen(false)}>{tc('close')}</Button>}
      >
        <ul className="max-h-96 space-y-1 overflow-y-auto text-sm">
          {(revisions.data ?? []).map((r) => (
            <li key={r.id} className="flex items-center gap-2 border-b border-gray-100 py-1.5 last:border-0">
              <span className="w-8 tabular-nums text-xs text-gray-400">#{r.revisionNo}</span>
              <span className="min-w-0 flex-1 truncate">{r.title}</span>
              <Badge tone="gray">{r.changeKind}</Badge>
              <span className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleString()}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (!docId) return;
                  // The restore round-trips through the server; re-hydrating
                  // the form is just resetting the loaded marker.
                  restore.mutate(
                    { id: docId, revisionId: r.id },
                    {
                      onSuccess: () => {
                        loadedFor.current = null;
                        setHistoryOpen(false);
                      },
                    },
                  );
                }}
              >
                {t('restore')}
              </Button>
            </li>
          ))}
          {!revisions.data?.length && <li className="text-xs text-gray-400">{t('noHistory')}</li>}
        </ul>
      </Modal>
    </div>
  );
}
