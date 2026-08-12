import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Field';
import { Badge } from '@/components/Badge';
import { useAnswerReuseList, useAnswerReuseMutations } from './answer-reuse.hooks';
import type { AnswerReuseItem } from './answer-reuse.service';

/**
 * Answer-reuse store management (PLN-260808 Track C, D-C3): list with search /
 * active filter, per-entry active toggle, inline answer editing, delete, and a
 * bulk deactivate for "the knowledge changed, stop replaying everything".
 */
export function AnswerReuseSection() {
  const { t } = useTranslation('aiSetting');
  const { t: tc } = useTranslation('common');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const { data, isLoading } = useAnswerReuseList(page, search, activeOnly);
  const { update, remove, deactivateAll } = useAnswerReuseMutations();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 10));

  return (
    <Card title={t('answerReuse.title')}>
      <p className="mb-3 text-sm text-gray-500">{t('answerReuse.desc')}</p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSearch(q);
          }}
        >
          <Input
            value={q}
            placeholder={t('answerReuse.searchPlaceholder')}
            onChange={(e) => setQ(e.target.value)}
          />
          <Button type="submit" variant="secondary">
            {tc('search')}
          </Button>
        </form>
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => {
              setPage(1);
              setActiveOnly(e.target.checked);
            }}
          />
          {t('answerReuse.activeOnly')}
        </label>
        <span className="ml-auto text-xs text-gray-400">
          {t('answerReuse.total', { count: total })}
        </span>
        <Button
          variant="secondary"
          disabled={deactivateAll.isPending || total === 0}
          onClick={() => {
            if (window.confirm(t('answerReuse.deactivateAllConfirm'))) deactivateAll.mutate();
          }}
        >
          {t('answerReuse.deactivateAll')}
        </Button>
      </div>

      {isLoading && <p className="py-6 text-center text-sm text-gray-400">{tc('loading')}</p>}
      {!isLoading && items.length === 0 && (
        <p className="py-6 text-center text-sm text-gray-400">{t('answerReuse.empty')}</p>
      )}

      <div className="space-y-2">
        {items.map((item: AnswerReuseItem) => (
          <div key={item.id} className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">
                Q: {item.questionText}
              </span>
              <Badge tone={item.source === 'agent' ? 'success' : 'info'}>
                {item.source === 'agent'
                  ? t('answerReuse.sourceAgent')
                  : `AI ${item.confidence != null ? item.confidence.toFixed(2) : ''}`}
              </Badge>
              <span className="text-xs text-gray-400">
                {t('answerReuse.hits', { count: item.hitCount })}
              </span>
              <button
                onClick={() => update.mutate({ id: item.id, active: !item.active })}
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  item.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                }`}
              >
                {item.active ? 'ON' : 'OFF'}
              </button>
            </div>

            {editingId === item.id ? (
              <div className="mt-2">
                <textarea
                  className="w-full rounded-lg border border-gray-200 p-2 text-sm focus:border-primary-400 focus:outline-none"
                  rows={3}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                />
                <div className="mt-1 flex gap-2">
                  <Button
                    disabled={update.isPending || editText.trim().length < 20}
                    onClick={() =>
                      update.mutate(
                        { id: item.id, answerText: editText },
                        { onSuccess: () => setEditingId(null) },
                      )
                    }
                  >
                    {tc('save')}
                  </Button>
                  <Button variant="secondary" onClick={() => setEditingId(null)}>
                    {tc('cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-1 flex items-start gap-2">
                <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-gray-600">
                  A: {item.answerText}
                </p>
                <button
                  className="text-xs font-medium text-primary-600 hover:underline"
                  onClick={() => {
                    setEditingId(item.id);
                    setEditText(item.answerText);
                  }}
                >
                  {tc('edit')}
                </button>
                <button
                  className="text-xs font-medium text-red-500 hover:underline"
                  onClick={() => {
                    if (window.confirm(t('answerReuse.deleteConfirm'))) remove.mutate(item.id);
                  }}
                >
                  {tc('delete')}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3 text-sm">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ←
          </Button>
          <span className="text-gray-500">
            {page} / {totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            →
          </Button>
        </div>
      )}
    </Card>
  );
}
