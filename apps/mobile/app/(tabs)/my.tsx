import React, { useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { guestLookup, listOrders } from '../../src/services/orderService';
import { useSession } from '../../src/store/session-context';
import { useToast } from '../../src/components/Toast';
import { ApiError } from '../../src/lib/api-client';
import type { OrderSummary } from '../../src/lib/types';

/** 마이 — orders section (moved from the former Orders tab); diary/wish arrive in F2/F3. */
export default function MyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
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

  const lookup = async () => {
    if (!token || !orderNumber.trim() || !email.trim()) return;
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
    <FlatList
      style={styles.container}
      data={orders}
      keyExtractor={(o) => o.id}
      refreshControl={
        <RefreshControl refreshing={ordersQuery.isRefetching} onRefresh={() => void ordersQuery.refetch()} />
      }
      ListHeaderComponent={<Text style={styles.section}>{t('my.orders')}</Text>}
      renderItem={({ item }) => <OrderRow order={item} onPress={() => router.push(`/order/${item.id}`)} />}
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          <Text style={styles.empty}>{t('orders.empty')}</Text>
        </View>
      }
      ListFooterComponent={
        <View style={styles.lookupCard}>
          <Text style={styles.lookupTitle}>{t('orders.lookupTitle')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('orders.orderNumber')}
            value={orderNumber}
            onChangeText={setOrderNumber}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder={t('orders.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Pressable style={[styles.cta, looking && styles.ctaDisabled]} onPress={lookup} disabled={looking}>
            <Text style={styles.ctaText}>{t('orders.lookup')}</Text>
          </Pressable>
        </View>
      }
    />
  );
}

function OrderRow({ order, onPress }: { order: OrderSummary; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.rowLeft}>
        <Text style={styles.orderNo}>#{order.orderNumber}</Text>
        <Text style={styles.meta}>
          {order.currency} {order.total} · {new Date(order.createdAt).toLocaleDateString()}
        </Text>
      </View>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{order.statusUi}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
    marginTop: 16,
    marginHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  rowLeft: { flex: 1 },
  orderNo: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  badge: { backgroundColor: '#eef2ff', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#4338ca', fontSize: 12, fontWeight: '700' },
  emptyWrap: { padding: 24 },
  empty: { color: '#6b7280', textAlign: 'center' },
  lookupCard: {
    backgroundColor: '#fff',
    margin: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  lookupTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    fontSize: 14,
  },
  cta: { backgroundColor: '#6366F1', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: '#fff', fontWeight: '700' },
});
