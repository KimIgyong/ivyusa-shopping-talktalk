import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getProduct, subscribeRestock } from '../services/productService';
import { addSave, listSaves, removeSave } from '../services/saveService';
import { createNudge } from '../services/nudgeService';
import { getAffiliateStatus } from '../services/affiliateService';
import { useSession } from '../store/session-context';
import { useToast } from '../components/Toast';
import { ApiError } from '../lib/api-client';
import type { SaveList } from '../lib/types';

export default function ProductDetailPage() {
  const { t } = useTranslation();
  const { handle } = useParams<{ handle: string }>();
  const { token } = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [subscribing, setSubscribing] = useState(false);
  const [saving, setSaving] = useState<SaveList | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharing, setSharing] = useState(false);

  const productQuery = useQuery({
    queryKey: ['product', handle, token],
    enabled: !!token && !!handle,
    queryFn: () => getProduct(handle!, token!),
  });

  // Save state (♡찜 / 📥담아두기) — tolerate guests: buttons just hint on tap.
  const savesQuery = useQuery({
    queryKey: ['saves', token],
    enabled: !!token,
    queryFn: () => listSaves(token!),
  });

  // Affiliate ref code for the SNS share link (A-6) — null unless approved.
  const affiliateQuery = useQuery({
    queryKey: ['affiliate-status', token],
    enabled: !!token,
    queryFn: () => getAffiliateStatus(token!),
  });

  const product = productQuery.data;
  const savedIn = (list: SaveList) =>
    (savesQuery.data ?? []).some((s) => s.list === list && s.productHandle === handle);

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

  const toggleSave = async (list: SaveList) => {
    if (!handle || saving) return;
    if (!token) {
      toast.show(t('save.needLogin'));
      return;
    }
    setSaving(list);
    try {
      if (savedIn(list)) {
        await removeSave(token, handle, list);
        toast.show(t('save.removed'));
      } else {
        await addSave(token, handle, list);
        toast.show(t('save.added'));
      }
      await queryClient.invalidateQueries({ queryKey: ['saves'] });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) toast.show(t('save.needLogin'));
      else toast.show(t('save.failed'), 'error');
    } finally {
      setSaving(null);
    }
  };

  /** OS share sheet with clipboard fallback (both paths end user-visibly). */
  const shareOrCopy = async (url: string, text?: string) => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(text ? { text, url } : { url });
        return;
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return; // user closed the sheet
        // fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(text ? `${text} ${url}` : url);
      toast.show(t('share.copied'));
    } catch {
      toast.show(t('share.failed'), 'error');
    }
  };

  // SNS promote (A-6): storefront URL + UTM, plus ?ref= for approved affiliates.
  const shareSns = async () => {
    if (!product) return;
    setShareOpen(false);
    const sep = product.productUrl.includes('?') ? '&' : '?';
    let url = `${product.productUrl}${sep}utm_source=shoptalk_pwa&utm_medium=share`;
    const affiliate = affiliateQuery.data;
    if (affiliate?.status === 'approved' && affiliate.linkCode) {
      url += `&ref=${encodeURIComponent(affiliate.linkCode)}`;
    }
    await shareOrCopy(url);
  };

  // 조르기 (A-5): mint a public card link, then hand it to the share sheet.
  const shareNudge = async () => {
    if (!product || !handle || sharing) return;
    if (!token) {
      toast.show(t('save.needLogin'));
      return;
    }
    setSharing(true);
    try {
      const nudge = await createNudge(token, handle);
      setShareOpen(false);
      await shareOrCopy(nudge.url, t('share.nudgeMessage', { title: product.title }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) toast.show(t('save.needLogin'));
      else toast.show(t('share.failed'), 'error');
    } finally {
      setSharing(false);
    }
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
            <div className="action-row">
              <button
                type="button"
                className={`btn ${savedIn('wish') ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => void toggleSave('wish')}
                disabled={saving === 'wish'}
              >
                {savedIn('wish') ? '♥' : '♡'} {t('save.wish')}
              </button>
              <button
                type="button"
                className={`btn ${savedIn('later') ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => void toggleSave('later')}
                disabled={saving === 'later'}
              >
                📥 {t('save.later')}
              </button>
            </div>
            <button type="button" className="btn btn-primary btn-block" onClick={buy}>
              🛒 {t('product.buy')} ↗
            </button>
            <div className="action-row">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => void restock()}
                disabled={subscribing}
              >
                🔔 {t('product.restock')}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                aria-expanded={shareOpen}
                onClick={() => setShareOpen((v) => !v)}
              >
                ↗ {t('share.share')}
              </button>
            </div>
            {shareOpen && (
              <div className="share-menu">
                <button type="button" className="share-option" onClick={() => void shareSns()}>
                  📣 {t('share.sns')}
                </button>
                <button
                  type="button"
                  className="share-option"
                  onClick={() => void shareNudge()}
                  disabled={sharing}
                >
                  💝 {t('share.nudge')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
