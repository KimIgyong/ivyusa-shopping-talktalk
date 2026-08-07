import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { getOrder, getTracking, submitReview } from '../../src/services/orderService';
import { useSession } from '../../src/store/session-context';
import { useToast } from '../../src/components/Toast';
import { ApiError } from '../../src/lib/api-client';
import type { OrderItemLine, TrackingStep } from '../../src/lib/types';

export default function OrderDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useSession();
  const toast = useToast();
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Items reviewed this session — their button stays disabled (A-8).
  const [reviewedIds, setReviewedIds] = useState<readonly string[]>([]);

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

  const toggleForm = (itemId: string) => {
    setRating(0);
    setBody('');
    setOpenItemId((cur) => (cur === itemId ? null : itemId));
  };

  const onSubmitReview = async (itemId: string) => {
    if (!token || rating < 1 || submitting) return;
    setSubmitting(true);
    try {
      await submitReview(token, Number(itemId), rating, body.trim() || undefined);
      toast.show(t('review.ok'));
      setReviewedIds((prev) => [...prev, itemId]);
      setOpenItemId(null);
      setRating(0);
      setBody('');
    } catch (e) {
      // 422 = blocked by moderation; 403 (not your item) and the rest = generic failure.
      if (e instanceof ApiError && e.status === 422) toast.show(t('review.blocked'), 'error');
      else toast.show(t('review.failed'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

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
          {detail.items.map((item: OrderItemLine, idx: number) => {
            const itemId = item.id;
            const reviewed = !!itemId && reviewedIds.includes(itemId);
            const formOpen = !!itemId && openItemId === itemId;
            return (
              <View key={itemId ?? String(idx)} style={styles.itemBlock}>
                <View style={styles.itemRow}>
                  <Text style={styles.itemTitle}>
                    {item.title}
                    {item.optionText ? ` (${item.optionText})` : ''}
                  </Text>
                  <Text style={styles.itemMeta}>
                    ×{item.qty} · {item.price}
                  </Text>
                </View>
                {itemId ? (
                  <Pressable
                    style={[styles.reviewBtn, reviewed && styles.reviewBtnDisabled]}
                    onPress={() => toggleForm(itemId)}
                    disabled={reviewed}
                  >
                    <Ionicons
                      name={reviewed ? 'checkmark-circle-outline' : 'create-outline'}
                      size={16}
                      color={reviewed ? '#9ca3af' : '#6366F1'}
                    />
                    <Text style={[styles.reviewBtnText, reviewed && styles.reviewBtnTextDisabled]}>
                      {t('review.write')}
                    </Text>
                  </Pressable>
                ) : null}
                {formOpen && (
                  <View style={styles.reviewForm}>
                    <View style={styles.starRow} accessibilityLabel={t('review.ratingLabel')}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Pressable key={star} hitSlop={6} onPress={() => setRating(star)}>
                          <Ionicons
                            name={star <= rating ? 'star' : 'star-outline'}
                            size={26}
                            color={star <= rating ? '#f59e0b' : '#9ca3af'}
                          />
                        </Pressable>
                      ))}
                    </View>
                    <TextInput
                      style={styles.reviewInput}
                      placeholder={t('review.placeholder')}
                      value={body}
                      onChangeText={setBody}
                      multiline
                    />
                    <Pressable
                      style={[
                        styles.reviewSubmit,
                        (rating < 1 || submitting) && styles.reviewSubmitDisabled,
                      ]}
                      onPress={() => void onSubmitReview(itemId!)}
                      disabled={rating < 1 || submitting}
                    >
                      <Text style={styles.reviewSubmitText}>{t('review.submit')}</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
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
  itemBlock: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between' },
  itemTitle: { fontSize: 14, color: '#111827', flex: 1, marginRight: 8 },
  itemMeta: { fontSize: 13, color: '#6b7280' },
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#6366F1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  reviewBtnDisabled: { borderColor: '#d1d5db' },
  reviewBtnText: { color: '#6366F1', fontSize: 13, fontWeight: '700' },
  reviewBtnTextDisabled: { color: '#9ca3af' },
  reviewForm: { marginTop: 10 },
  starRow: { flexDirection: 'row', gap: 6 },
  reviewInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
    fontSize: 14,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  reviewSubmit: {
    backgroundColor: '#6366F1',
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 10,
  },
  reviewSubmitDisabled: { opacity: 0.5 },
  reviewSubmitText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  steps: { marginTop: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#d1d5db', marginRight: 10 },
  dotDone: { backgroundColor: '#6366F1' },
  stepLabel: { fontSize: 14, color: '#9ca3af' },
  stepLabelDone: { color: '#111827', fontWeight: '600' },
});
