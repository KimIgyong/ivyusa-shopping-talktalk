import React from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ProductSummary } from '../lib/types';

/**
 * Shared horizontal product-card rail (wireframe 4.1) — used by the home feed
 * rails (AI 추천 / 신상품) and, via ProductRailCard, the 마이-tab save rails.
 */
export function ProductRail({
  products,
  onOpen,
  emptyText,
}: {
  products: ProductSummary[];
  onOpen: (handle: string) => void;
  /** Shown when the rail is empty; omit to hide the rail entirely instead. */
  emptyText?: string;
}) {
  if (products.length === 0) {
    return emptyText ? <Text style={styles.railEmpty}>{emptyText}</Text> : null;
  }
  return (
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      data={products}
      keyExtractor={(p) => p.handle}
      contentContainerStyle={styles.rail}
      renderItem={({ item }) => (
        <ProductRailCard
          title={item.title}
          price={item.price}
          currency={item.currency}
          imageUrl={item.imageUrl}
          onPress={() => onOpen(item.handle)}
        />
      )}
    />
  );
}

/** Single rail card — image, title, price, optional small remove button (save rails). */
export function ProductRailCard({
  title,
  price,
  currency,
  imageUrl,
  onPress,
  onRemove,
}: {
  title: string;
  price?: number;
  currency?: string;
  imageUrl?: string | null;
  onPress: () => void;
  onRemove?: () => void;
}) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.cardImage} resizeMode="cover" />
      ) : (
        <View style={[styles.cardImage, styles.cardImageEmpty]}>
          <Ionicons name="image-outline" size={28} color="#9ca3af" />
        </View>
      )}
      <Text style={styles.cardTitle} numberOfLines={2}>
        {title}
      </Text>
      {price != null && currency ? (
        <Text style={styles.cardPrice}>
          {currency} {price}
        </Text>
      ) : null}
      {onRemove ? (
        <Pressable style={styles.cardRemove} hitSlop={8} onPress={onRemove}>
          <Ionicons name="close" size={14} color="#6b7280" />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rail: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
  railEmpty: { color: '#6b7280', fontSize: 13, marginHorizontal: 16, marginTop: 8 },
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
  cardRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
