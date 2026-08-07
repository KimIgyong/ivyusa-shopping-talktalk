import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { getProduct, subscribeRestock } from '../../src/services/productService';
import { useSession } from '../../src/store/session-context';
import { useToast } from '../../src/components/Toast';

export default function ProductDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const { token } = useSession();
  const toast = useToast();
  const [subscribing, setSubscribing] = useState(false);

  const productQuery = useQuery({
    queryKey: ['product', handle, token],
    enabled: !!token && !!handle,
    queryFn: () => getProduct(handle!, token!),
  });

  const product = productQuery.data;

  const onBuy = () => {
    if (!product) return;
    router.push(`/shop?url=${encodeURIComponent(product.productUrl)}`);
  };

  const onRestock = async () => {
    if (!token || !product) return;
    setSubscribing(true);
    try {
      await subscribeRestock(token, product.handle);
      toast.show(t('product.restockOk'));
    } catch {
      toast.show(t('product.restockFailed'), 'error');
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Stack.Screen options={{ title: product?.title ?? '' }} />
      {productQuery.isLoading && <Text style={styles.loading}>{t('common.loading')}</Text>}
      {product && (
        <>
          {product.imageUrl ? (
            <Image source={{ uri: product.imageUrl }} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={[styles.image, styles.imageEmpty]}>
              <Ionicons name="image-outline" size={48} color="#9ca3af" />
            </View>
          )}
          <View style={styles.body}>
            <Text style={styles.title}>{product.title}</Text>
            {product.vendor ? <Text style={styles.vendor}>{product.vendor}</Text> : null}
            <Text style={styles.price}>
              {product.currency} {product.price}
            </Text>
            {product.description ? (
              <Text style={styles.description}>{product.description}</Text>
            ) : null}

            <Pressable style={styles.buyBtn} onPress={onBuy}>
              <Ionicons name="cart-outline" size={18} color="#fff" />
              <Text style={styles.buyText}>{t('product.buy')}</Text>
            </Pressable>
            <Pressable
              style={[styles.restockBtn, subscribing && styles.btnDisabled]}
              onPress={() => void onRestock()}
              disabled={subscribing}
            >
              <Ionicons name="notifications-outline" size={18} color="#6366F1" />
              <Text style={styles.restockText}>{t('product.restock')}</Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loading: { color: '#6b7280', textAlign: 'center', padding: 24 },
  image: { width: '100%', aspectRatio: 1, backgroundColor: '#f3f4f6' },
  imageEmpty: { alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  vendor: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  price: { fontSize: 18, fontWeight: '700', color: '#111827', marginTop: 8 },
  description: { fontSize: 14, color: '#374151', marginTop: 12, lineHeight: 21 },
  buyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6366F1',
    borderRadius: 10,
    paddingVertical: 13,
    marginTop: 20,
  },
  buyText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  restockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#6366F1',
    paddingVertical: 13,
    marginTop: 10,
  },
  restockText: { color: '#6366F1', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
});
