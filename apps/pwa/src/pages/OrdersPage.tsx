import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { guestLookup, listOrders } from '../services/orderService';
import { useSession } from '../store/session-context';
import { useToast } from '../components/Toast';
import { ApiError } from '../lib/api-client';
import type { OrderSummary } from '../lib/types';

export default function OrdersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [looking, setLooking] = useState(false);

  const ordersQuery = useQuery({
    queryKey: ['orders', token],
    enabled: !!token,
    queryFn: async () => {
      try {
        return await listOrders(token!);
      } catch (e) {
        // Anonymous session (not yet bound to a customer): empty list, not an error.
        if (e instanceof ApiError && (e.status === 401 || e.status === 404)) return [];
        throw e;
      }
    },
  });

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !orderNumber.trim() || !email.trim() || looking) return;
    setLooking(true);
    try {
      await guestLookup(token, orderNumber.trim(), email.trim());
      toast.show(t('orders.lookupOk'));
      setOrderNumber('');
      setEmail('');
      await qc.invalidateQueries({ queryKey: ['orders', token] });
    } catch {
      toast.show(t('orders.lookupFailed'), 'error');
    } finally {
      setLooking(false);
    }
  };

  const orders = ordersQuery.data ?? [];

  return (
    <div className="page">
      {orders.length === 0 ? (
        <p className="empty">{ordersQuery.isLoading ? t('common.loading') : t('orders.empty')}</p>
      ) : (
        <ul className="order-list">
          {orders.map((o) => (
            <OrderRow key={o.id} order={o} onClick={() => navigate(`/orders/${o.id}`)} />
          ))}
        </ul>
      )}

      <form className="card lookup-card" onSubmit={(e) => void lookup(e)}>
        <h2 className="card-title">{t('orders.lookupTitle')}</h2>
        <input
          className="input"
          placeholder={t('orders.orderNumber')}
          aria-label={t('orders.orderNumber')}
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
          autoCapitalize="none"
        />
        <input
          className="input"
          type="email"
          placeholder={t('orders.email')}
          aria-label={t('orders.email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoCapitalize="none"
        />
        <button type="submit" className="btn btn-primary btn-block" disabled={looking}>
          {t('orders.lookup')}
        </button>
      </form>
    </div>
  );
}

function OrderRow({ order, onClick }: { order: OrderSummary; onClick: () => void }) {
  return (
    <li className="order-row" onClick={onClick} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}>
      <div className="order-row-left">
        <div className="order-no">#{order.orderNumber}</div>
        <div className="meta">
          {order.currency} {order.total} · {new Date(order.createdAt).toLocaleDateString()}
        </div>
      </div>
      <span className="badge">{order.statusUi}</span>
    </li>
  );
}
