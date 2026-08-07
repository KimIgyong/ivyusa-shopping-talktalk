import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getProduct, subscribeRestock } from '../services/productService';
import { useSession } from '../store/session-context';
import { useToast } from '../components/Toast';

export default function ProductDetailPage() {
  const { t } = useTranslation();
  const { handle } = useParams<{ handle: string }>();
  const { token } = useSession();
  const toast = useToast();
  const [subscribing, setSubscribing] = useState(false);

  const productQuery = useQuery({
    queryKey: ['product', handle, token],
    enabled: !!token && !!handle,
    queryFn: () => getProduct(handle!, token!),
  });

  const product = productQuery.data;

  const restock = async () => {
    if (!token || !handle || subscribing) return;
    setSubscribing(true);
    try {
      await subscribeRestock(token, handle);
      toast.show(t('product.restockOk'));
    } catch {
      toast.show(t('product.restockFailed'), 'error');
    } finally {
      setSubscribing(false);
    }
  };

  // Storefront must open top-level in a NEW TAB — Shopify forbids iframing (C1).
  const buy = () => {
    if (product?.productUrl) window.open(product.productUrl, '_blank', 'noopener');
  };

  return (
    <div className="page">
      <Link className="back-link" to="/products">
        ← {t('common.back')}
      </Link>

      {productQuery.isLoading ? <p className="hint">{t('common.loading')}</p> : null}
      {productQuery.isError ? <p className="empty">{t('product.notFound')}</p> : null}

      {product && (
        <div className="card">
          {product.imageUrl ? (
            <img className="product-detail-img" src={product.imageUrl} alt={product.title} />
          ) : null}
          <h2 className="product-detail-title">{product.title}</h2>
          {product.vendor ? <div className="meta">{product.vendor}</div> : null}
          <div className="product-detail-price">
            {product.currency} {product.price}
          </div>
          {product.description ? <p className="product-desc">{product.description}</p> : null}
          <div className="product-actions">
            <button type="button" className="btn btn-primary btn-block" onClick={buy}>
              🛒 {t('product.buy')} ↗
            </button>
            <button
              type="button"
              className="btn btn-outline btn-block"
              onClick={() => void restock()}
              disabled={subscribing}
            >
              🔔 {t('product.restock')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
