import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { listProducts, listRecommendations } from '../../src/services/productService';
import { listOrders } from '../../src/services/orderService';
import { useNotificationList } from '../../src/hooks/useNotifications';
import { ProductRail } from '../../src/components/ProductRail';
import { useSession } from '../../src/store/session-context';
import { ApiError } from '../../src/lib/api-client';
import type { NotificationItem, OrderSummary } from '../../src/lib/types';

/** 홈 피드 (F3, wireframe 4.1) — 샵 배너 · 진행중 배송 카드 · AI 추천 · 신상품 · 이벤트 배너. */
export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { token } = useSession();

  const ordersQuery = useQuery({
    queryKey: ['orders', token],
    enabled: !!token,
    queryFn: async () => {
      try {
        return await listOrders(token!);
      } catch (e) {
        // Anonymous session (not yet bound to a customer): no card, not an error.
        if (e instanceof ApiError && (e.status === 401 || e.status === 404)) return [];
        throw e;
      }
    },
  });
  // Most recent order still in flight — Delivered/Review means nothing left to track.
  const homeOrders: OrderSummary[] = ordersQuery.data ?? [];
  const activeOrder = [...homeOrders]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .find((o) => o.statusUi !== 'Delivered' && o.statusUi !== 'Review');

  const recoQuery = useQuery({
    queryKey: ['products', 'recommendations', token],
    enabled: !!token,
    queryFn: async () => {
      try {
        return await listRecommendations(token!, 10);
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 404)) return [];
        throw e;
      }
    },
  });
  const recommendations = recoQuery.data ?? [];

  const newArrivalsQuery = useQuery({
    queryKey: ['products', 'new-arrivals', token],
    enabled: !!token,
    queryFn: () => listProducts(token!, { page: 1, size: 10 }),
  });
  const newArrivals = newArrivalsQuery.data ?? [];

  // 이벤트 배너 — latest unread event notification (campaign wiring lands in F4).
  const notifQuery = useNotificationList();
  const notifications: NotificationItem[] = notifQuery.data ?? [];
  const eventNotif = notifications
    .filter((n) => n.category === 'event' && !n.read)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];

  const openProduct = (handle: string) => router.push(`/product/${handle}`);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable style={styles.banner} onPress={() => router.push('/shop')}>
        <Ionicons name="storefront-outline" size={22} color="#fff" />
        <Text style={styles.bannerText}>{t('home.visitShop')}</Text>
        <Ionicons name="chevron-forward" size={18} color="#fff" />
      </Pressable>

      {activeOrder ? (
        <Pressable style={styles.shipCard} onPress={() => router.push(`/order/${activeOrder.id}`)}>
          <View style={styles.shipBody}>
            <Text style={styles.shipTitle} numberOfLines={1}>
              🚚 #{activeOrder.orderNumber} {activeOrder.statusUi}
            </Text>
            <Text style={styles.shipMeta}>{t('home.shippingNow')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#6b7280" />
        </Pressable>
      ) : null}

      {recoQuery.isLoading || recommendations.length > 0 ? (
        <>
          <Text style={styles.section}>✨ {t('home.recommended')}</Text>
          <ProductRail
            products={recommendations}
            onOpen={openProduct}
            emptyText={recoQuery.isLoading ? t('common.loading') : undefined}
          />
        </>
      ) : null}

      <View style={styles.sectionRow}>
        <Text style={styles.sectionRowTitle}>🆕 {t('home.newArrivals')}</Text>
        <Pressable hitSlop={8} onPress={() => router.push('/(tabs)/products')}>
          <Text style={styles.seeAll}>{t('home.seeAll')}</Text>
        </Pressable>
      </View>
      <ProductRail
        products={newArrivals}
        onOpen={openProduct}
        emptyText={newArrivalsQuery.isLoading ? t('common.loading') : t('products.empty')}
      />

      {eventNotif ? (
        <Pressable style={styles.eventBanner} onPress={() => router.push('/(tabs)/alerts')}>
          <Text style={styles.eventTitle} numberOfLines={2}>
            🎉 {eventNotif.title}
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#92400e" />
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { paddingBottom: 24 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  bannerText: { color: '#fff', fontSize: 15, fontWeight: '700', flex: 1 },
  shipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  shipBody: { flex: 1 },
  shipTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  shipMeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  section: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginTop: 20,
    marginHorizontal: 16,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginHorizontal: 16,
  },
  sectionRowTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  seeAll: { fontSize: 13, fontWeight: '600', color: '#6366F1' },
  eventBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    marginHorizontal: 12,
    marginTop: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  eventTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: '#92400e' },
});
