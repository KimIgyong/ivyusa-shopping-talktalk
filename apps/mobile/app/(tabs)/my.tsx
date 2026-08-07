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
import { Ionicons } from '@expo/vector-icons';
import { guestLookup, listOrders } from '../../src/services/orderService';
import { listJourney } from '../../src/services/journeyService';
import { addDiaryNote, listDiaryNotes, removeDiaryNote } from '../../src/services/diaryService';
import { useRemoveSave, useSaves } from '../../src/hooks/useSaves';
import { ProductRailCard } from '../../src/components/ProductRail';
import { useSession } from '../../src/store/session-context';
import { useToast } from '../../src/components/Toast';
import { ApiError } from '../../src/lib/api-client';
import type { DiaryNote, JourneyEvent, OrderSummary, SaveItem } from '../../src/lib/types';

/** Journey event → diary-row icon + i18n label key. product_view is skipped (too noisy). */
const JOURNEY_ROW: Record<string, { icon: string; key: string }> = {
  wish_added: { icon: '♡', key: 'journey.wish' },
  save_added: { icon: '📥', key: 'journey.save' },
  nudge_sent: { icon: '💝', key: 'journey.nudge' },
  order_created: { icon: '🛒', key: 'journey.order' },
  shipment_update: { icon: '📦', key: 'journey.shipment' },
  review_submitted: { icon: '⭐', key: 'journey.review' },
  chat_message: { icon: '💬', key: 'journey.chat' },
  session_start: { icon: '👋', key: 'journey.session' },
};

type TimelineRow =
  | { kind: 'event'; id: string; icon: string; label: string; createdAt: string }
  | { kind: 'note'; id: string; noteId: string; body: string; createdAt: string };

/** 마이 — 주문 + 다이어리(타임라인+메모, F3) + 찜/보관함 rails. */
export default function MyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { token } = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [looking, setLooking] = useState(false);
  const [memo, setMemo] = useState('');
  const [savingMemo, setSavingMemo] = useState(false);

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

  // Diary — journey timeline (401 = anonymous session → sign-in hint) + free-form notes.
  const journeyQuery = useQuery({
    queryKey: ['journey', token],
    enabled: !!token,
    queryFn: async () => {
      try {
        return { bound: true, events: await listJourney(token!, { page: 1, size: 30 }) };
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return { bound: false, events: [] };
        throw e;
      }
    },
  });
  const diaryQuery = useQuery({
    queryKey: ['diary', token],
    enabled: !!token,
    queryFn: async () => {
      try {
        return await listDiaryNotes(token!);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return [];
        throw e;
      }
    },
  });

  const journeyEvents: JourneyEvent[] = journeyQuery.data?.events ?? [];
  const diaryNotes: DiaryNote[] = diaryQuery.data ?? [];
  const timeline: TimelineRow[] = [
    ...journeyEvents.flatMap<TimelineRow>((e) => {
      const row = JOURNEY_ROW[e.eventType];
      if (!row) return []; // product_view (and unknown types): skipped
      const p = e.payload ?? {};
      const label = t(row.key, {
        handle: p.handle ?? '',
        orderNumber: p.orderNumber ?? '',
        status: p.status ?? '',
      }).trim();
      return [{ kind: 'event', id: `j-${e.id}`, icon: row.icon, label, createdAt: e.createdAt }];
    }),
    ...diaryNotes.map<TimelineRow>((n) => ({
      kind: 'note',
      id: `d-${n.id}`,
      noteId: n.id,
      body: n.body,
      createdAt: n.createdAt,
    })),
  ].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  const saveMemo = async () => {
    if (!token || !memo.trim()) return;
    setSavingMemo(true);
    try {
      await addDiaryNote(token, memo.trim());
      toast.show(t('my.diarySaved'));
      setMemo('');
      await qc.invalidateQueries({ queryKey: ['diary', token] });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) toast.show(t('save.needLogin'), 'error');
      else toast.show(t('my.diaryFailed'), 'error');
    } finally {
      setSavingMemo(false);
    }
  };

  const deleteMemo = async (noteId: string) => {
    if (!token) return;
    try {
      await removeDiaryNote(token, noteId);
      toast.show(t('my.diaryDeleted'));
      await qc.invalidateQueries({ queryKey: ['diary', token] });
    } catch {
      toast.show(t('my.diaryFailed'), 'error');
    }
  };

  const savesQuery = useSaves();
  const removeSaved = useRemoveSave();
  const saves = savesQuery.data;
  const wishItems = saves?.items.filter((s) => s.list === 'wish') ?? [];
  const laterItems = saves?.items.filter((s) => s.list === 'later') ?? [];

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
        <>
          <Text style={styles.section}>{t('my.diary')}</Text>
          {journeyQuery.data && !journeyQuery.data.bound ? (
            <Text style={styles.hint}>{t('save.needLogin')}</Text>
          ) : (
            <>
              <View style={styles.diaryComposer}>
                <TextInput
                  style={styles.diaryInput}
                  placeholder={t('my.diaryPlaceholder')}
                  value={memo}
                  onChangeText={setMemo}
                  multiline
                />
                <Pressable
                  style={[styles.cta, styles.diaryCta, (savingMemo || !memo.trim()) && styles.ctaDisabled]}
                  onPress={saveMemo}
                  disabled={savingMemo || !memo.trim()}
                >
                  <Text style={styles.ctaText}>{t('my.diarySave')}</Text>
                </Pressable>
              </View>
              {timeline.length === 0 ? (
                <Text style={styles.railEmpty}>
                  {journeyQuery.isLoading || diaryQuery.isLoading
                    ? t('common.loading')
                    : t('my.diaryEmpty')}
                </Text>
              ) : (
                <View style={styles.timeline}>
                  {timeline.map((row) => (
                    <View key={row.id} style={styles.diaryRow}>
                      <Text style={styles.diaryIcon}>{row.kind === 'note' ? '📝' : row.icon}</Text>
                      <View style={styles.diaryBody}>
                        <Text style={styles.diaryLabel}>
                          {row.kind === 'note' ? row.body : row.label}
                        </Text>
                        <Text style={styles.diaryDate}>
                          {new Date(row.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                      {row.kind === 'note' ? (
                        <Pressable hitSlop={8} onPress={() => void deleteMemo(row.noteId)}>
                          <Ionicons name="trash-outline" size={16} color="#6b7280" />
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
          {saves && !saves.bound ? (
            <>
              <Text style={styles.section}>
                {t('my.wishlist')} · {t('my.savedForLater')}
              </Text>
              <Text style={styles.hint}>{t('save.needLogin')}</Text>
            </>
          ) : (
            <>
              <Text style={styles.section}>{t('my.wishlist')}</Text>
              <SaveRail
                items={wishItems}
                emptyText={t('my.emptyWishlist')}
                onOpen={(h) => router.push(`/product/${h}`)}
                onRemove={(item) => void removeSaved(item.productHandle, item.list)}
              />
              <Text style={styles.section}>{t('my.savedForLater')}</Text>
              <SaveRail
                items={laterItems}
                emptyText={t('my.emptySaved')}
                onOpen={(h) => router.push(`/product/${h}`)}
                onRemove={(item) => void removeSaved(item.productHandle, item.list)}
              />
            </>
          )}
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
        </>
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

/** Horizontal saved-products rail — shared rail card + a small remove button. */
function SaveRail({
  items,
  emptyText,
  onOpen,
  onRemove,
}: {
  items: SaveItem[];
  emptyText: string;
  onOpen: (handle: string) => void;
  onRemove: (item: SaveItem) => void;
}) {
  if (items.length === 0) {
    return <Text style={styles.railEmpty}>{emptyText}</Text>;
  }
  return (
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      data={items}
      keyExtractor={(s) => s.id}
      contentContainerStyle={styles.rail}
      renderItem={({ item }) => (
        <ProductRailCard
          title={item.product?.title ?? item.productHandle}
          price={item.product?.price}
          currency={item.product?.currency}
          imageUrl={item.product?.imageUrl}
          onPress={() => onOpen(item.productHandle)}
          onRemove={() => onRemove(item)}
        />
      )}
    />
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
  hint: { color: '#6b7280', fontSize: 13, marginHorizontal: 16, marginTop: 8 },
  rail: { paddingHorizontal: 12, paddingTop: 10 },
  railEmpty: { color: '#6b7280', fontSize: 13, marginHorizontal: 16, marginTop: 8 },
  diaryComposer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginHorizontal: 12,
    marginTop: 10,
    gap: 8,
  },
  diaryInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#fff',
    maxHeight: 96,
  },
  diaryCta: { paddingHorizontal: 16 },
  timeline: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  diaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  diaryIcon: { fontSize: 16, width: 24, textAlign: 'center' },
  diaryBody: { flex: 1 },
  diaryLabel: { fontSize: 13, color: '#111827' },
  diaryDate: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
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
