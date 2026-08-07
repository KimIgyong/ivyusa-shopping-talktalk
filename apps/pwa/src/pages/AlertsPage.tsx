import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMarkRead, useNotificationList } from '../hooks/useNotifications';
import { useToast } from '../components/Toast';
import type { NotificationItem } from '../lib/types';

/** Extract the product handle from a `/products/<handle>` URL, or null (F4 A-9). */
function extractProductHandle(url: string): string | null {
  const match = url.match(/\/products\/([^/?#]+)/);
  return match ? match[1] : null;
}

const CATEGORY_ICON: Record<string, string> = {
  shipping: '📦',
  payment: '💳',
  chat: '💬',
  event: '🎉',
  review: '⭐',
};

export default function AlertsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const listQuery = useNotificationList();
  const markRead = useMarkRead();
  const toast = useToast();

  const onSelect = async (item: NotificationItem) => {
    // Mark read first (existing behavior), then follow the deep link if any (F4 A-9).
    if (!item.read) {
      try {
        await markRead(item.id);
      } catch {
        toast.show(t('alerts.markReadFailed'), 'error');
      }
    }
    if (!item.linkUrl) return;
    const handle = item.linkUrl.includes('/products/')
      ? extractProductHandle(item.linkUrl)
      : null;
    if (handle) navigate(`/products/${handle}`);
    else window.open(item.linkUrl, '_blank', 'noopener');
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
