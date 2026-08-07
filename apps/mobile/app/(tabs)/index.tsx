import React from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { listProducts } from '../../src/services/productService';
import { useSession } from '../../src/store/session-context';
import type { ProductSummary } from '../../src/lib/types';

/** 홈 (F1 skeleton) — shop banner + new-arrivals rail; full feed arrives in F3. */
export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { token } = useSession();

  const newArrivalsQuery = useQuery({
    queryKey: ['products', 'new-arrivals', token],
    enabled: !!token,
    queryFn: () => listProducts(token!, { page: 1, size: 10 }),
  });

  const products = newArrivalsQuery.data ?? [];

  return (
    <ScrollView style={styles.container}>
      <Pressable style={styles.banner} onPress={() => router.push('/shop')}>
        <Ionicons name="storefront-outline" size={22} color="#fff" />
        <Text style={styles.bannerText}>{t('home.visitShop')}</Text>
        <Ionicons name="chevron-forward" size={18} color="#fff" />
      </Pressable>

      <Text style={styles.section}>{t('home.newArrivals')}</Text>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={products}
        keyExtractor={(p) => p.handle}
        contentContainerStyle={styles.rail}
        renderItem={({ item }) => (
          <ProductCard product={item} onPress={() => router.push(`/product/${item.handle}`)} />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {newArrivalsQuery.isLoading ? t('common.loading') : t('products.empty')}
          </Text>
        }
      />
    </ScrollView>
  );
}

function ProductCard({ product, onPress }: { product: ProductSummary; onPress: () => void }) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      {product.imageUrl ? (
        <Image source={{ uri: product.imageUrl }} style={styles.cardImage} resizeMode="cover" />
      ) : (
        <View style={[styles.cardImage, styles.cardImageEmpty]}>
          <Ionicons name="image-outline" size={28} color="#9ca3af" />
        </View>
      )}
      <Text style={styles.cardTitle} numberOfLines={2}>
        {product.title}
      </Text>
      <Text style={styles.cardPrice}>
        {product.currency} {product.price}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
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
  section: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginTop: 20,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  rail: { paddingHorizontal: 12, paddingBottom: 16 },
  card: {
    width: 140,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 10,
    marginRight: 10,
  },
  cardImage: { width: '100%', aspectRatio: 1, borderRadius: 8, backgroundColor: '#f3f4f6' },
  cardImageEmpty: { alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 13, color: '#111827', marginTop: 8, minHeight: 34 },
  cardPrice: { fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 4 },
  empty: { color: '#6b7280', paddingHorizontal: 8, paddingVertical: 20 },
});
