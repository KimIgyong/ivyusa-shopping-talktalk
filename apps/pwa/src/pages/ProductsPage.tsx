import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { listCategories, listProducts } from '../services/productService';
import { useSession } from '../store/session-context';
import type { ProductSummary } from '../lib/types';

const PAGE_SIZE = 20;

export default function ProductsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = useSession();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  // Debounced search — one request ~350ms after the user stops typing.
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const categoriesQuery = useQuery({
    queryKey: ['productCategories', token],
    enabled: !!token,
    queryFn: () => listCategories(token!),
  });

  const productsQuery = useInfiniteQuery({
    queryKey: ['products', token, q, category],
    enabled: !!token,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      listProducts(token!, {
        q: q || undefined,
        category: category ?? undefined,
        page: pageParam,
        size: PAGE_SIZE,
      }),
    getNextPageParam: (last, pages) => {
      if (last.pagination) return last.pagination.hasNext ? last.pagination.page + 1 : undefined;
      // Defensive fallback when the meta is missing: a full page implies more.
      return last.items.length === PAGE_SIZE ? pages.length + 1 : undefined;
    },
  });

  const items = productsQuery.data?.pages.flatMap((p) => p.items) ?? [];
  const categories = categoriesQuery.data ?? [];

  return (
    <div className="page">
      <input
        className="input"
        type="search"
        placeholder={t('products.search')}
        aria-label={t('products.search')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoCapitalize="none"
      />

      {categories.length > 0 && (
        <div className="filter-chips" role="tablist">
          <CategoryChip
            label={t('products.all')}
            active={category === null}
            onClick={() => setCategory(null)}
          />
          {categories.map((c) => (
            <CategoryChip
              key={c}
              label={c}
              active={category === c}
              onClick={() => setCategory(c)}
            />
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <p className="empty">
          {productsQuery.isLoading ? t('common.loading') : t('products.empty')}
        </p>
      ) : (
        <div className="product-grid">
          {items.map((p) => (
            <ProductCard
              key={p.handle}
              product={p}
              onClick={() => navigate(`/products/${encodeURIComponent(p.handle)}`)}
            />
          ))}
        </div>
      )}

      {productsQuery.hasNextPage && (
        <button
          type="button"
          className="btn btn-outline btn-block"
          onClick={() => void productsQuery.fetchNextPage()}
          disabled={productsQuery.isFetchingNextPage}
        >
          {productsQuery.isFetchingNextPage ? t('common.loading') : t('products.loadMore')}
        </button>
      )}
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`filter-chip ${active ? 'filter-chip-active' : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function ProductCard({ product, onClick }: { product: ProductSummary; onClick: () => void }) {
  return (
    <div
      className="product-card"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick();
      }}
    >
      {product.imageUrl ? (
        <img className="product-img" src={product.imageUrl} alt={product.title} loading="lazy" />
      ) : (
        <div className="product-img product-img-empty" aria-hidden="true">
          🛍
        </div>
      )}
      <div className="product-card-body">
        <div className="product-title">{product.title}</div>
        <div className="product-price">
          {product.currency} {product.price}
        </div>
      </div>
    </div>
  );
}
