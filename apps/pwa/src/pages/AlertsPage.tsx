import { useTranslation } from 'react-i18next';
import { useMarkRead, useNotificationList } from '../hooks/useNotifications';
import { useToast } from '../components/Toast';
import type { NotificationItem } from '../lib/types';

const CATEGORY_ICON: Record<string, string> = {
  shipping: '📦',
  payment: '💳',
  chat: '💬',
  event: '🎉',
  review: '⭐',
};

export default function AlertsPage() {
  const { t } = useTranslation();
  const listQuery = useNotificationList();
  const markRead = useMarkRead();
  const toast = useToast();

  const onSelect = async (item: NotificationItem) => {
    if (item.read) return;
    try {
      await markRead(item.id);
    } catch {
      toast.show(t('alerts.markReadFailed'), 'error');
    }
  };

  const items = listQuery.data ?? [];

  return (
    <div className="page">
      <div className="page-toolbar">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={listQuery.isRefetching}
          onClick={() => void listQuery.refetch()}
        >
          {t('common.refresh')}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="empty">{listQuery.isLoading ? t('common.loading') : t('alerts.empty')}</p>
      ) : (
        <ul className="alert-list">
          {items.map((item) => (
            <li
              key={item.id}
              className={`alert-row ${item.read ? '' : 'alert-unread'}`}
              role="button"
              tabIndex={0}
              onClick={() => void onSelect(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') void onSelect(item);
              }}
            >
              <span className="alert-icon">{CATEGORY_ICON[item.category] ?? '🔔'}</span>
              <span className="alert-text">
                <span className={`alert-title ${item.read ? '' : 'alert-title-unread'}`}>
                  {item.title}
                </span>
                {item.body ? <span className="alert-body">{item.body}</span> : null}
                <span className="alert-time">{new Date(item.createdAt).toLocaleString()}</span>
              </span>
              {item.statusBadge ? <span className="badge">{item.statusBadge}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
