import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getOrder, getTracking } from '../../src/services/orderService';
import { useSession } from '../../src/store/session-context';
import { ApiError } from '../../src/lib/api-client';
import type { OrderItemLine, TrackingStep } from '../../src/lib/types';

export default function OrderDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useSession();

  const orderQuery = useQuery({
    queryKey: ['order', id, token],
    enabled: !!token && !!id,
    queryFn: () => getOrder(id!, token!),
  });

  const trackingQuery = useQuery({
    queryKey: ['tracking', id, token],
    enabled: !!token && !!id,
    queryFn: async () => {
      try {
        return await getTracking(id!, token!);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });

  const detail = orderQuery.data;
  const tracking = trackingQuery.data;

  return (
    <ScrollView style={styles.container}>
      <Stack.Screen options={{ title: detail ? `#${detail.order.orderNumber}` : '' }} />
      {detail && (
        <View style={styles.card}>
          <View style={styles.headRow}>
            <Text style={styles.orderNo}>#{detail.order.orderNumber}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{detail.order.statusUi}</Text>
            </View>
          </View>
          <Text style={styles.meta}>
            {detail.order.currency} {detail.order.total}
          </Text>
          <Text style={styles.section}>{t('orders.items')}</Text>
          {detail.items.map((item: OrderItemLine, idx: number) => (
            <View key={item.id ?? String(idx)} style={styles.itemRow}>
              <Text style={styles.itemTitle}>
                {item.title}
                {item.optionText ? ` (${item.optionText})` : ''}
              </Text>
              <Text style={styles.itemMeta}>
                ×{item.qty} · {item.price}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.section}>{t('orders.tracking')}</Text>
        {tracking ? (
          <>
            <Text style={styles.meta}>
              {t('orders.carrier')}: {tracking.carrier || '—'} · {t('orders.trackingNumber')}:{' '}
              {tracking.trackingNumber || '—'}
            </Text>
            <View style={styles.steps}>
              {tracking.steps.map((step: TrackingStep, idx: number) => {
                const done = idx <= tracking.stepIndex;
                return (
                  <View key={step.label} style={styles.stepRow}>
                    <View style={[styles.dot, done && styles.dotDone]} />
                    <Text style={[styles.stepLabel, done && styles.stepLabelDone]}>{step.label}</Text>
                  </View>
                );
              })}
            </View>
          </>
        ) : (
          <Text style={styles.meta}>{t('orders.noTracking')}</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  card: {
    backgroundColor: '#fff',
    margin: 12,
    marginBottom: 0,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderNo: { fontSize: 18, fontWeight: '800' },
  badge: { backgroundColor: '#eef2ff', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#4338ca', fontSize: 12, fontWeight: '700' },
  meta: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  section: { fontSize: 14, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  itemTitle: { fontSize: 14, color: '#111827', flex: 1, marginRight: 8 },
  itemMeta: { fontSize: 13, color: '#6b7280' },
  steps: { marginTop: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#d1d5db', marginRight: 10 },
  dotDone: { backgroundColor: '#6366F1' },
  stepLabel: { fontSize: 14, color: '#9ca3af' },
  stepLabelDone: { color: '#111827', fontWeight: '600' },
});
