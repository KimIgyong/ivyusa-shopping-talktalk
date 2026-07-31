import React from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useMarkRead, useNotificationList } from '../../src/hooks/useNotifications';
import { useToast } from '../../src/components/Toast';
import type { NotificationItem } from '../../src/lib/types';

const CATEGORY_ICON: Record<string, string> = {
  shipping: '📦',
  payment: '💳',
  chat: '💬',
  event: '🎉',
  review: '⭐',
};

export default function AlertsScreen() {
  const { t } = useTranslation();
  const listQuery = useNotificationList();
  const markRead = useMarkRead();
  const toast = useToast();

  const onPress = async (item: NotificationItem) => {
    if (item.read) return;
    try {
      await markRead(item.id);
    } catch {
      toast.show(t('alerts.markReadFailed'), 'error');
    }
  };

  return (
    <FlatList
      style={styles.container}
      data={listQuery.data ?? []}
      keyExtractor={(n) => n.id}
      refreshControl={
        <RefreshControl refreshing={listQuery.isRefetching} onRefresh={() => void listQuery.refetch()} />
      }
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          <Text style={styles.empty}>{t('alerts.empty')}</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable style={[styles.row, !item.read && styles.rowUnread]} onPress={() => void onPress(item)}>
          <Text style={styles.icon}>{CATEGORY_ICON[item.category] ?? '🔔'}</Text>
          <View style={styles.textWrap}>
            <Text style={[styles.title, !item.read && styles.titleUnread]}>{item.title}</Text>
            {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
            <Text style={styles.time}>{new Date(item.createdAt).toLocaleString()}</Text>
          </View>
          {item.statusBadge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.statusBadge}</Text>
            </View>
          ) : null}
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  row: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  rowUnread: { borderColor: '#c7d2fe', backgroundColor: '#f8faff' },
  icon: { fontSize: 22, marginRight: 12 },
  textWrap: { flex: 1 },
  title: { fontSize: 14, color: '#374151' },
  titleUnread: { fontWeight: '700', color: '#111827' },
  body: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  time: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  badge: { backgroundColor: '#eef2ff', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  badgeText: { color: '#4338ca', fontSize: 11, fontWeight: '700' },
  emptyWrap: { padding: 24 },
  empty: { color: '#6b7280', textAlign: 'center' },
});
