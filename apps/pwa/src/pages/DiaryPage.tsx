import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { listJourney } from '../services/journeyService';
import { addDiaryNote, listDiaryNotes, removeDiaryNote } from '../services/diaryService';
import { useSession } from '../store/session-context';
import { useToast } from '../components/Toast';
import { ApiError } from '../lib/api-client';
import type { DiaryNote, JourneyEvent } from '../lib/types';

const JOURNEY_PAGE_SIZE = 30;

/** eventType → icon + i18n key (wireframe 4.3 rows). Unknown types render raw as fallback. */
const EVENT_META: Record<string, { icon: string; key: string }> = {
  wish_added: { icon: '♡', key: 'journey.wishAdded' },
  save_added: { icon: '📥', key: 'journey.saveAdded' },
  nudge_sent: { icon: '💝', key: 'journey.nudgeSent' },
  shared: { icon: '📣', key: 'journey.shared' },
  order_created: { icon: '🛒', key: 'journey.orderCreated' },
  delivered: { icon: '📦', key: 'journey.delivered' },
  review_created: { icon: '⭐', key: 'journey.reviewCreated' },
};

type TimelineRow =
  | { kind: 'event'; id: string; event: JourneyEvent; createdAt: string }
  | { kind: 'note'; id: string; note: DiaryNote; createdAt: string };

/** 쇼핑 다이어리 (F3, A-7) — journey timeline + free memos; header 📖 entry, not a tab. */
export default function DiaryPage() {
  const { t } = useTranslation();
  const { token } = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const journeyQuery = useQuery({
    queryKey: ['journey', token],
    enabled: !!token,
    queryFn: () => listJourney(token!, { page: 1, size: JOURNEY_PAGE_SIZE }),
  });

  const notesQuery = useQuery({
    queryKey: ['diaryNotes', token],
    enabled: !!token,
    queryFn: () => listDiaryNotes(token!),
  });

  // Anonymous session (401 = not bound to a customer) → same sign-in hint as saves.
  const is401 = (err: unknown) => err instanceof ApiError && err.status === 401;
  const needLogin = !token || is401(journeyQuery.error) || is401(notesQuery.error);

  const saveMemo = async () => {
    const body = memo.trim();
    if (!token || !body || saving) return;
    setSaving(true);
    try {
      await addDiaryNote(token, body);
      setMemo('');
      await queryClient.invalidateQueries({ queryKey: ['diaryNotes'] });
      toast.show(t('diary.memoSaved'));
    } catch (err) {
      toast.show(t(is401(err) ? 'save.needLogin' : 'diary.memoFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeMemo = async (note: DiaryNote) => {
    if (!token || removing) return;
    setRemoving(note.id);
    try {
      await removeDiaryNote(token, note.id);
      await queryClient.invalidateQueries({ queryKey: ['diaryNotes'] });
      toast.show(t('diary.memoDeleted'));
    } catch {
      toast.show(t('diary.memoDeleteFailed'), 'error');
    } finally {
      setRemoving(null);
    }
  };

  // Merged desc timeline — journey events (minus noisy product_view) + memo rows.
  const rows: TimelineRow[] = [
    ...(journeyQuery.data?.items ?? [])
      .filter((e) => e.eventType !== 'product_view')
      .map<TimelineRow>((e) => ({ kind: 'event', id: `e-${e.id}`, event: e, createdAt: e.createdAt })),
    ...(notesQuery.data ?? []).map<TimelineRow>((n) => ({
      kind: 'note',
      id: `n-${n.id}`,
      note: n,
      createdAt: n.createdAt,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const loading = journeyQuery.isLoading || notesQuery.isLoading;

  return (
    <div className="page">
      <h2 className="card-title">📖 {t('diary.title')}</h2>
      {needLogin ? (
        <p className="empty">{t('save.needLogin')}</p>
      ) : (
        <>
          <div className="card diary-composer">
            <textarea
              className="input diary-textarea"
              placeholder={t('diary.memoPlaceholder')}
              aria-label={t('diary.memoPlaceholder')}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              maxLength={1000}
            />
            <div className="diary-composer-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={saving || !memo.trim()}
                onClick={() => void saveMemo()}
              >
                {saving ? t('common.loading') : t('diary.memoSave')}
              </button>
            </div>
          </div>

          {loading ? (
            <p className="hint">{t('common.loading')}</p>
          ) : rows.length === 0 ? (
            <p className="empty">{t('diary.empty')}</p>
          ) : (
            <div className="diary-list">
              {rows.map((row) =>
                row.kind === 'note' ? (
                  <NoteRow
                    key={row.id}
                    note={row.note}
                    removing={removing === row.note.id}
                    onRemove={() => void removeMemo(row.note)}
                  />
                ) : (
                  <EventRow key={row.id} event={row.event} />
                ),
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EventRow({ event }: { event: JourneyEvent }) {
  const { t } = useTranslation();
  const meta = EVENT_META[event.eventType];
  const payload = event.payload ?? {};
  const orderNumber = typeof payload.orderNumber === 'string' ? payload.orderNumber : null;
  const handle = typeof payload.handle === 'string' ? payload.handle : null;
  const detail = orderNumber ? `#${orderNumber}` : handle;

  return (
    <div className="diary-row">
      <span className="diary-icon" aria-hidden="true">
        {meta?.icon ?? '•'}
      </span>
      <div className="diary-body">
        <div className="diary-text">
          {meta ? t(meta.key) : event.eventType}
          {detail ? <span className="diary-detail"> · {detail}</span> : null}
        </div>
        <div className="meta">{new Date(event.createdAt).toLocaleString()}</div>
      </div>
    </div>
  );
}

function NoteRow({
  note,
  removing,
  onRemove,
}: {
  note: DiaryNote;
  removing: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="diary-row">
      <span className="diary-icon" aria-hidden="true">
        📝
      </span>
      <div className="diary-body">
        <div className="diary-text">{note.body}</div>
        <div className="meta">{new Date(note.createdAt).toLocaleString()}</div>
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={removing}
        onClick={onRemove}
      >
        {t('diary.delete')}
      </button>
    </div>
  );
}
