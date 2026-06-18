import { useState } from 'react';
import { BellOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWidgetStore } from '../../store/widgetStore';
import {
  useMarkRead,
  useNotifications,
} from '../../hooks/useNotifications';
import { Badge, toneForStatus } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';
import { formatTime, groupByDate } from '../../lib/format';
import type { NotificationItem } from '../../lib/types';

const FILTERS: { key: string; labelKey: string }[] = [
  { key: 'all', labelKey: 'notifications.filters.all' },
  { key: 'payment', labelKey: 'notifications.filters.payment' },
  { key: 'shipping', labelKey: 'notifications.filters.shipping' },
  { key: 'event', labelKey: 'notifications.filters.event' },
  { key: 'review', labelKey: 'notifications.filters.review' },
];

function Row({
  n,
  onRead,
}: {
  n: NotificationItem;
  onRead: (id: string) => void;
}) {
  const unread = !n.readAt;
  return (
    <button
      onClick={() => unread && onRead(n.id)}
      className="flex w-full items-start gap-2 rounded-lg p-2 text-left transition-colors hover:bg-gray-50"
    >
      <span
        className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${
          unread ? 'bg-primary-500' : 'bg-transparent'
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`truncate text-sm ${
              unread ? 'font-semibold text-gray-900' : 'text-gray-600'
            }`}
          >
            {n.title}
          </span>
          <span className="flex-shrink-0 text-[10px] text-gray-400">
            {formatTime(n.createdAt)}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{n.body}</p>
        {n.statusBadge && (
          <div className="mt-1">
            <Badge tone={toneForStatus(n.statusBadge)}>{n.statusBadge}</Badge>
          </div>
        )}
      </div>
    </button>
  );
}

export function NotificationsTab() {
  const { t } = useTranslation();
  const sessionToken = useWidgetStore((s) => s.sessionToken);
  const [filter, setFilter] = useState('all');
  const { data, isLoading, isError } = useNotifications(sessionToken, filter);
  const markRead = useMarkRead(sessionToken);

  const groups = groupByDate(data ?? []);

  return (
    <div className="flex h-full flex-col">
      {/* Filter chips */}
      <div className="scroll-thin flex gap-1.5 overflow-x-auto border-b border-gray-100 p-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex-shrink-0 rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.key
                ? 'bg-primary-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto p-2">
        {isLoading && <Spinner label={t('common.loading')} />}
        {isError && (
          <p className="py-8 text-center text-sm text-gray-400">
            {t('common.error')}
          </p>
        )}
        {!isLoading && !isError && groups.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
            <BellOff className="h-6 w-6" />
            <span className="text-sm">{t('notifications.empty')}</span>
          </div>
        )}
        {groups.map((g) => (
          <div key={g.date} className="mb-3">
            <div className="px-2 py-1 text-[11px] font-medium text-gray-400">
              {g.date}
            </div>
            {g.items.map((n) => (
              <Row key={n.id} n={n} onRead={(id) => markRead.mutate(id)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
