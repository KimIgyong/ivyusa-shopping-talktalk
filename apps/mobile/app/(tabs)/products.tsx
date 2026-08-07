import React, { useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { listProductCategories, listProducts } from '../../src/services/productService';
import { useSession } from '../../src/store/session-context';
import type { ProductSummary } from '../../src/lib/types';

/** '전체' chip sentinel — no category filter. */
const ALL = '';

export default function ProductsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { token } = useSession();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL);

  // Debounce keystrokes 400ms before hitting the API.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const categoriesQuery = useQuery({
    queryKey: ['product-categories', token],
    enabled: !!token,
    queryFn: () => listProductCategories(token!),
  });

  const productsQuery = useQuery({
    queryKey: ['products', 'list', query, category, token],
    enabled: !!token,
    // F1: single page (size 50); infinite scroll arrives with the full feed.
    queryFn: () =>
      listProducts(token!, { q: query || undefined, category: category || undefined, page: 1, size: 50 }),
  });

  const categories = categoriesQuery.data ?? [];
  const products = productsQuery.data ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color="#9ca3af" />
        <TextInput
          style={styles.searchInput}
          placeholder={t('products.search')}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        contentContainerStyle={styles.chipRowContent}
      >
        <CategoryChip
          label={t('products.all')}
          active={category === ALL}
          onPress={() => setCategory(ALL)}
        />
        {categories.map((c: string) => (
          <CategoryChip key={c} label={c} active={category === c} onPress={() => setCategory(c)} />
        ))}
      </ScrollView>

      <FlatList
        data={products}
        keyExtractor={(p) => p.handle}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.gridContent}
        refreshControl={
          <RefreshControl
            refreshing={productsQuery.isRefetching}
            onRefresh={() => void productsQuery.refetch()}
          />
        }
        renderItem={({ item }) => (
          <ProductCard product={item} onPress={() => router.push(`/product/${item.handle}`)} />
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.empty}>
              {productsQuery.isLoading ? t('common.loading') : t('products.empty')}
            </Text>
          </View>
        }
      />
    </View>
  );
}

function CategoryChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function ProductCard({ product, onPress }: { product: ProductSummary; onPress: () => void }) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      {product.imageUrl ? (
        <Image source={{ uri: product.imageUrl }} style={styles.cardImage} resizeMode="cover" />
      ) : (
        <View style={[styles.cardImage, styles.cardImageEmpty]}>
          <Ionicons name="image-outline" size={32} color="#9ca3af" />
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
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14 },
  chipRow: { marginTop: 10, maxHeight: 40 },
  chipRowContent: { paddingHorizontal: 12, gap: 8, alignItems: 'center' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  chipText: { color: '#111827', fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  gridRow: { paddingHorizontal: 12, gap: 10 },
  gridContent: { paddingTop: 12, paddingBottom: 16 },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 10,
    marginBottom: 10,
  },
  cardImage: { width: '100%', aspectRatio: 1, borderRadius: 8, backgroundColor: '#f3f4f6' },
  cardImageEmpty: { alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 13, color: '#111827', marginTop: 8, minHeight: 34 },
  cardPrice: { fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 4 },
  emptyWrap: { padding: 24 },
  empty: { color: '#6b7280', textAlign: 'center' },
});
