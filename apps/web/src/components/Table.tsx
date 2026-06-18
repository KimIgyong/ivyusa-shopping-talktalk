import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[] | undefined;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
}

export function Table<T>({
  columns,
  data,
  loading,
  error,
  emptyMessage,
  rowKey,
  onRowClick,
}: TableProps<T>) {
  const { t } = useTranslation('common');
  const empty = emptyMessage ?? t('empty');
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-left">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-4 py-3 text-sm font-medium text-gray-600 ${c.className ?? ''}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {loading && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-gray-400">
                <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                {t('loading')}
              </td>
            </tr>
          )}
          {!loading && error && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-error">
                {error}
              </td>
            </tr>
          )}
          {!loading && !error && (!data || data.length === 0) && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-gray-400">
                {empty}
              </td>
            </tr>
          )}
          {!loading &&
            !error &&
            data?.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`hover:bg-gray-50 ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 text-sm text-gray-700 ${c.className ?? ''}`}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
