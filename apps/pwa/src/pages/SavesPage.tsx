import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { listSaves, removeSave } from '../services/saveService';
import { useSession } from '../store/session-context';
import { useToast } from '../components/Toast';
import type { SaveItem, SaveList } from '../lib/types';

/** 찜/보관함 lists (F2, A-4) — reached from the header ♡, not a nav tab. */
export default function SavesPage() {
  const { t } = useTranslation();
  const { token } = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [removing, setRemoving] = useState<string | null>(null);

  const savesQuery = useQuery({
    queryKey: ['saves', token],
    enabled: !!token,
    queryFn: () => listSaves(token!),
  });

  const saves = savesQuery.data ?? [];
  const wish = saves.filter((s) => s.list === 'wish');
  const later = saves.filter((s) => s.list === 'later');

  const remove = async (item: SaveItem) => {
    if (!token || removing) return;
    setRemoving(item.id);
    try {
      await removeSave(token, item.productHandle, item.list);
      await queryClient.invalidateQueries({ queryKey: ['saves'] });
      toast.show(t('save.removed'));
    } catch {
      toast.show(t('save.failed'), 'error');
    } finally {
      setRemoving(null);
    }
  };

  const section = (list: SaveList, items: SaveItem[]) => (
    <>
      <h3 className="section-heading">
        {list === 'wish' ? '♡' : '📥'} {t(list === 'wish' ? 'save.wish' : 'save.later')}
      </h3>
      {items.length === 0 ? (
        <p className="meta">{t('save.empty')}</p>
      ) : (
        items.map((item) => (
          <div key={item.id} className="save-row">
            <button
              type="button"
              className="save-main"
              onClick={() => navigate(`/products/${encodeURIComponent(item.productHandle)}`)}
            >
              {item.product?.imageUrl ? (
                <img className="save-img" src={item.product.imageUrl} alt="" />
              ) : (
                <span className="save-img save-img-empty">🛍</span>
              )}
              <span className="save-info">
                <span className="save-title">{item.product?.title ?? item.productHandle}</span>
                {item.product ? (
                  <span className="meta">
                    {item.product.currency} {item.product.price}
                  </span>
                ) : null}
              </span>
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={removing === item.id}
              onClick={() => void remove(item)}
            >
              {t('save.remove')}
            </button>
          </div>
        ))
      )}
    </>
  );

  return (
    <div className="page">
      <h2 className="card-title">{t('save.title')}</h2>
      {!token ? (
        <p className="empty">{t('save.needLogin')}</p>
      ) : savesQuery.isLoading ? (
        <p className="hint">{t('common.loading')}</p>
      ) : savesQuery.isError ? (
        <p className="empty">{t('common.error')}</p>
      ) : (
        <>
          {section('wish', wish)}
          {section('later', later)}
        </>
      )}
    </div>
  );
}
