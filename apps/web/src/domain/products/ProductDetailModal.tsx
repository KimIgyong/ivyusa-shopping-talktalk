import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Package } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { Badge } from '@/components/Badge';
import { useProduct } from './products.hooks';

function fmtMoney(value: number | null | undefined, currency: string | undefined): string {
  if (typeof value !== 'number') return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency ?? 'USD' }).format(value);
  } catch {
    return `${value.toLocaleString()} ${currency ?? ''}`.trim();
  }
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <span className="w-28 shrink-0 text-gray-500">{label}</span>
      <span className="min-w-0 flex-1 break-words text-gray-900">{children}</span>
    </div>
  );
}

/**
 * One product in full (PLN-260808-Console-Product-List, 상세보기).
 *
 * A dialog rather than a route: the operator is scanning a list and wants the
 * body of one row, not a place to navigate to and back from. The description is
 * fetched here — the list only ships a 100-character snippet.
 */
export function ProductDetailModal({ handle, onClose }: { handle: string | null; onClose: () => void }) {
  const { t } = useTranslation('products');
  const { data: p, isLoading, error } = useProduct(handle);

  return (
    <Modal open={!!handle} onClose={onClose} title={p?.title ?? t('detail.title')} size="lg">
      {isLoading && <p className="py-6 text-center text-sm text-gray-500">{t('detail.loading')}</p>}
      {error && <p className="py-6 text-center text-sm text-error">{(error as Error).message}</p>}
      {p && (
        <div>
          <div className="mb-4 flex gap-4">
            {p.imageUrl ? (
              <img
                src={p.imageUrl}
                alt=""
                className="h-28 w-28 shrink-0 rounded border border-gray-200 object-cover"
                onError={(e) => {
                  e.currentTarget.style.visibility = 'hidden';
                }}
              />
            ) : (
              <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded border border-gray-200 bg-gray-50 text-gray-300">
                <Package className="h-6 w-6" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {p.status === 'archived' ? (
                  <Badge tone="gray">{t('status.archived')}</Badge>
                ) : (
                  <Badge tone="success">{t('status.active')}</Badge>
                )}
                {p.inKnowledge ? (
                  <Badge tone="primary">{t('knowledge.registered')}</Badge>
                ) : (
                  <Badge tone="warning">{t('knowledge.missing')}</Badge>
                )}
              </div>
              <p className="text-lg font-semibold text-gray-900">{fmtMoney(p.price, p.currency)}</p>
              {p.productUrl && (
                <a
                  href={p.productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-sm text-primary-600 hover:underline"
                >
                  {t('detail.openInShop')} <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>

          <div className="divide-y divide-gray-100 border-y border-gray-100">
            <Row label={t('columns.category')}>{p.category ?? '—'}</Row>
            {p.vendor && <Row label={t('detail.vendor')}>{p.vendor}</Row>}
            <Row label={t('detail.tags')}>{p.tags ?? '—'}</Row>
            <Row label={t('detail.sku')}>{p.sku ?? '—'}</Row>
            {/* The key the knowledge document is filed under — the join an
                operator needs when a product and its document disagree. */}
            <Row label={t('detail.handle')}>
              <code className="text-xs">{p.handle}</code>
            </Row>
            <Row label={t('detail.publishedAt')}>{fmtDateTime(p.publishedAt)}</Row>
            <Row label={t('detail.syncedAt')}>{fmtDateTime(p.syncedAt)}</Row>
          </div>

          <div className="mt-4">
            <p className="mb-1 text-sm text-gray-500">{t('detail.description')}</p>
            {p.description ? (
              <p className="whitespace-pre-wrap text-sm text-gray-800">{p.description}</p>
            ) : (
              // Worth saying plainly: with no description and no tags the
              // converter holds the product back, so it never becomes knowledge.
              <p className="text-sm text-gray-400">{t('detail.noDescription')}</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
