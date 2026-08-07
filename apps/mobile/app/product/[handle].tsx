import React, { useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { getProduct, subscribeRestock } from '../../src/services/productService';
import { addSave, removeSave } from '../../src/services/saveService';
import { createNudge } from '../../src/services/nudgeService';
import { getAffiliateStatus } from '../../src/services/affiliateService';
import { useSaves } from '../../src/hooks/useSaves';
import { useSession } from '../../src/store/session-context';
import { useToast } from '../../src/components/Toast';
import { ApiError } from '../../src/lib/api-client';
import type { SaveList } from '../../src/lib/types';

export default function ProductDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const { token } = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const [subscribing, setSubscribing] = useState(false);
  const [togglingList, setTogglingList] = useState<SaveList | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [nudging, setNudging] = useState(false);

  const productQuery = useQuery({
    queryKey: ['product', handle, token],
    enabled: !!token && !!handle,
    queryFn: () => getProduct(handle!, token!),
  });

  const savesQuery = useSaves();

  const affiliateQuery = useQuery({
    queryKey: ['affiliate-status', token],
    enabled: !!token,
    queryFn: async () => {
      try {
        return await getAffiliateStatus(token!);
      } catch (e) {
        // 404 = never applied; 401 = anonymous session — both mean "not an affiliate".
        if (e instanceof ApiError && (e.status === 404 || e.status === 401)) return null;
        throw e;
      }
    },
  });

  const product = productQuery.data;
  const saves = savesQuery.data;
  const isSaved = (list: SaveList) =>
    !!saves?.items.some((s) => s.list === list && s.productHandle === handle);

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

  const onToggleSave = async (list: SaveList) => {
    if (!token || !product || togglingList) return;
    if (saves && !saves.bound) {
      toast.show(t('save.needLogin'), 'error');
      return;
    }
    const active = isSaved(list);
    setTogglingList(list);
    try {
      if (active) await removeSave(token, product.handle, list);
      else await addSave(token, product.handle, list);
      toast.show(t(active ? 'save.removed' : 'save.saved'));
      await qc.invalidateQueries({ queryKey: ['saves', token] });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) toast.show(t('save.needLogin'), 'error');
      else toast.show(t('save.failed'), 'error');
    } finally {
      setTogglingList(null);
    }
  };

  /** SNS 홍보하기 (A-6) — UTM link; approved affiliates get their ?ref= code appended. */
  const onPromote = async () => {
    if (!product) return;
    setShareOpen(false);
    const affiliate = affiliateQuery.data;
    let url = `${product.productUrl}?utm_source=shoptalk_app&utm_medium=share`;
    if (affiliate && affiliate.status === 'approved' && affiliate.linkCode) {
      url += `&ref=${encodeURIComponent(affiliate.linkCode)}`;
    }
    try {
      await Share.share({ message: product.title, url });
    } catch {
      toast.show(t('share.failed'), 'error');
    }
  };

  /** 조르기 (A-5) — mint the public card, then hand its URL to the OS share sheet. */
  const onNudge = async () => {
    if (!token || !product || nudging) return;
    setNudging(true);
    try {
      const nudge = await createNudge(token, product.handle);
      setShareOpen(false);
      await Share.share({
        message: `${t('share.nudgeMessage', { title: product.title })} ${nudge.url}`,
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) toast.show(t('save.needLogin'), 'error');
      else toast.show(t('share.failed'), 'error');
    } finally {
      setNudging(false);
    }
  };

  const wished = isSaved('wish');
  const savedLater = isSaved('later');

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

            <View style={styles.actionRow}>
              <Pressable
                style={[styles.actionBtn, wished && styles.actionBtnActive, togglingList === 'wish' && styles.btnDisabled]}
                onPress={() => void onToggleSave('wish')}
                disabled={!!togglingList}
              >
                <Ionicons
                  name={wished ? 'heart' : 'heart-outline'}
                  size={18}
                  color={wished ? '#e11d48' : '#6366F1'}
                />
                <Text style={styles.actionText}>{t('save.wish')}</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, savedLater && styles.actionBtnActive, togglingList === 'later' && styles.btnDisabled]}
                onPress={() => void onToggleSave('later')}
                disabled={!!togglingList}
              >
                <Ionicons
                  name={savedLater ? 'archive' : 'archive-outline'}
                  size={18}
                  color="#6366F1"
                />
                <Text style={styles.actionText}>{t('save.later')}</Text>
              </Pressable>
            </View>

            <Pressable style={styles.buyBtn} onPress={onBuy}>
              <Ionicons name="cart-outline" size={18} color="#fff" />
              <Text style={styles.buyText}>{t('product.buy')}</Text>
            </Pressable>
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.actionBtn, subscribing && styles.btnDisabled]}
                onPress={() => void onRestock()}
                disabled={subscribing}
              >
                <Ionicons name="notifications-outline" size={18} color="#6366F1" />
                <Text style={styles.actionText}>{t('product.restock')}</Text>
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={() => setShareOpen(true)}>
                <Ionicons name="share-outline" size={18} color="#6366F1" />
                <Text style={styles.actionText}>{t('share.title')}</Text>
              </Pressable>
            </View>
          </View>
        </>
      )}

      <Modal
        visible={shareOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setShareOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setShareOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{t('share.title')}</Text>
            <Pressable style={styles.sheetOption} onPress={() => void onPromote()}>
              <Ionicons name="megaphone-outline" size={20} color="#6366F1" />
              <Text style={styles.sheetOptionText}>{t('share.promote')}</Text>
            </Pressable>
            <Pressable
              style={[styles.sheetOption, nudging && styles.btnDisabled]}
              onPress={() => void onNudge()}
              disabled={nudging}
            >
              <Ionicons name="gift-outline" size={20} color="#6366F1" />
              <Text style={styles.sheetOptionText}>{t('share.nudge')}</Text>
            </Pressable>
            <Pressable style={styles.sheetCancel} onPress={() => setShareOpen(false)}>
              <Text style={styles.sheetCancelText}>{t('common.cancel')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#6366F1',
    paddingVertical: 13,
  },
  actionBtnActive: { backgroundColor: '#eef2ff' },
  actionText: { color: '#6366F1', fontSize: 14, fontWeight: '700' },
  buyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6366F1',
    borderRadius: 10,
    paddingVertical: 13,
    marginTop: 10,
  },
  buyText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 28,
  },
  sheetTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 8 },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  sheetOptionText: { fontSize: 15, color: '#111827', fontWeight: '600' },
  sheetCancel: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  sheetCancelText: { fontSize: 15, color: '#6b7280', fontWeight: '600' },
});
