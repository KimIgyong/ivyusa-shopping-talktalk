import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getNudgeCard } from '../services/nudgeService';

/**
 * Public nudge card (F2, A-5 — PLN wireframe 4.3 right panel).
 * Recipients open this link without the app installed and without a session:
 * the fetch is public (no token header) and nothing here gates on bootstrap.
 */
export default function NudgePage() {
  const { t } = useTranslation();
  const { code } = useParams<{ code: string }>();

  const cardQuery = useQuery({
    queryKey: ['nudge', code],
    enabled: !!code,
    retry: false,
    queryFn: () => getNudgeCard(code!),
  });

  const card = cardQuery.data;
  const product = card?.product ?? null;

  // Storefront must open top-level in a NEW TAB — Shopify forbids iframing (C1).
  const gift = () => {
    if (product?.productUrl) window.open(product.productUrl, '_blank', 'noopener');
  };

  return (
    <div className="page">
      {cardQuery.isLoading ? <p className="hint">{t('common.loading')}</p> : null}
      {cardQuery.isError ? <p className="empty">{t('nudge.notFound')}</p> : null}

      {card && (
        <div className="card nudge-card">
          <div className="nudge-from">
            💝{' '}
            {card.senderName
              ? t('nudge.from', { name: card.senderName })
              : t('nudge.fromSomeone')}
          </div>

          {product && (
            <>
              {product.imageUrl ? (
                <img className="nudge-img" src={product.imageUrl} alt={product.title} />
              ) : null}
              <div className="nudge-product-title">{product.title}</div>
              {product.vendor ? <div className="meta">{product.vendor}</div> : null}
              <div className="product-detail-price">
                {product.currency} {product.price}
              </div>
            </>
          )}

          {card.message ? <div className="nudge-bubble">{card.message}</div> : null}

          {product && (
            <button type="button" className="btn btn-primary btn-block nudge-gift" onClick={gift}>
              🎁 {t('nudge.gift')} ↗
            </button>
          )}
          <p className="hint nudge-hint">{t('nudge.hint')}</p>
        </div>
      )}
    </div>
  );
}
