import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getPrefs, setPref } from '../src/services/notificationService';
import {
  deleteData,
  exportData,
  getOptOutStatus,
  setOptOut,
} from '../src/services/privacyService';
import { useSession } from '../src/store/session-context';
import { useToast } from '../src/components/Toast';
import { ApiError } from '../src/lib/api-client';
import { SUPPORTED_LANGUAGES, type AppLanguage } from '../src/lib/config';
import type { NotifPref } from '../src/lib/types';

const LANGUAGE_LABELS: Record<AppLanguage, string> = { en: 'English', es: 'Español', ko: '한국어' };

/** UI toggle -> underlying (push channel) categories it controls. */
const TOGGLE_GROUPS = [
  { key: 'notifOrders', categories: ['payment', 'shipping'] as const, defaultOn: true },
  { key: 'notifChat', categories: ['chat'] as const, defaultOn: true },
  { key: 'notifEvent', categories: ['event', 'review'] as const, defaultOn: false },
] as const;

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { token, session, language, changeLanguage, refresh } = useSession();
  const toast = useToast();
  const qc = useQueryClient();

  // Pref rows exist only for a customer-bound session (401 = anonymous).
  const prefsQuery = useQuery({
    queryKey: ['prefs', token],
    enabled: !!token,
    queryFn: async () => {
      try {
        return { bound: true, prefs: await getPrefs(token!) };
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return { bound: false, prefs: [] as NotifPref[] };
        throw e;
      }
    },
  });

  const optOutQuery = useQuery({
    queryKey: ['optout', token],
    enabled: !!token && prefsQuery.data?.bound === true,
    queryFn: () => getOptOutStatus(token!),
  });

  const bound = prefsQuery.data?.bound === true;
  const prefs = prefsQuery.data?.prefs ?? [];

  const groupEnabled = (group: (typeof TOGGLE_GROUPS)[number]): boolean => {
    const rows = prefs.filter(
      (p: NotifPref) =>
        p.channel === 'push' && (group.categories as readonly string[]).includes(p.category),
    );
    if (rows.length === 0) return group.defaultOn; // server default (D-4)
    return rows.some((p: NotifPref) => p.enabled);
  };

  const toggleGroup = async (group: (typeof TOGGLE_GROUPS)[number], enabled: boolean) => {
    if (!token) return;
    try {
      for (const category of group.categories) {
        await setPref(token, 'push', category, enabled);
      }
      toast.show(t('settings.prefSaved'));
      await qc.invalidateQueries({ queryKey: ['prefs', token] });
    } catch {
      toast.show(t('settings.prefFailed'), 'error');
    }
  };

  const onToggleOptOut = async (optOut: boolean) => {
    if (!token) return;
    try {
      await setOptOut(token, optOut);
      toast.show(t('settings.optOutSaved'));
      await qc.invalidateQueries({ queryKey: ['optout', token] });
      await qc.invalidateQueries({ queryKey: ['prefs', token] });
    } catch {
      toast.show(t('settings.prefFailed'), 'error');
    }
  };

  const onExport = async () => {
    if (!token) return;
    try {
      const data = await exportData(token);
      Alert.alert(t('settings.exportData'), JSON.stringify(data).slice(0, 600) + '…');
    } catch {
      toast.show(t('settings.exportNeedVerified'), 'error');
    }
  };

  const onDelete = () => {
    Alert.alert(t('settings.deleteConfirmTitle'), t('settings.deleteConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.ok'),
        style: 'destructive',
        onPress: async () => {
          if (!token) return;
          try {
            await deleteData(token);
            toast.show(t('settings.deleteDone'));
            await refresh();
          } catch {
            toast.show(t('settings.deleteFailed'), 'error');
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      <Stack.Screen options={{ title: t('settings.title') }} />
      <Text style={styles.section}>{t('settings.language')}</Text>
      <View style={styles.card}>
        <View style={styles.langRow}>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <Pressable
              key={lang}
              style={[styles.langChip, language === lang && styles.langChipActive]}
              onPress={() => void changeLanguage(lang)}
            >
              <Text style={[styles.langText, language === lang && styles.langTextActive]}>
                {LANGUAGE_LABELS[lang]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Text style={styles.section}>{t('settings.notifSection')}</Text>
      <View style={styles.card}>
        {!bound && <Text style={styles.hint}>{t('settings.notifNeedAccount')}</Text>}
        {TOGGLE_GROUPS.map((group) => (
          <View key={group.key} style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, !bound && styles.disabledText]}>
              {t(`settings.${group.key}`)}
            </Text>
            <Switch
              value={groupEnabled(group)}
              disabled={!bound}
              onValueChange={(v) => void toggleGroup(group, v)}
            />
          </View>
        ))}
      </View>

      <Text style={styles.section}>{t('settings.privacySection')}</Text>
      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <Text style={[styles.toggleLabel, !bound && styles.disabledText]}>{t('settings.optOut')}</Text>
          <Switch
            value={optOutQuery.data?.optOut ?? false}
            disabled={!bound}
            onValueChange={(v) => void onToggleOptOut(v)}
          />
        </View>
        <Pressable style={styles.linkRow} onPress={() => void onExport()}>
          <Text style={styles.link}>{t('settings.exportData')}</Text>
        </Pressable>
        <Pressable style={styles.linkRow} onPress={onDelete}>
          <Text style={styles.linkDanger}>{t('settings.deleteData')}</Text>
        </Pressable>
      </View>

      <Text style={styles.version}>
        {t('settings.version')} {Constants.expoConfig?.version ?? '1.0.0'}
        {session?.authenticated ? ' · ✓' : ''}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  section: { fontSize: 13, fontWeight: '700', color: '#6b7280', marginTop: 20, marginHorizontal: 16, marginBottom: 6 },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  langRow: { flexDirection: 'row', gap: 8 },
  langChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  langChipActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  langText: { color: '#111827', fontSize: 14 },
  langTextActive: { color: '#fff', fontWeight: '700' },
  hint: { color: '#9ca3af', fontSize: 12, marginBottom: 8 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  toggleLabel: { fontSize: 15, color: '#111827', flex: 1, marginRight: 8 },
  disabledText: { color: '#9ca3af' },
  linkRow: { paddingVertical: 10 },
  link: { color: '#6366F1', fontSize: 15 },
  linkDanger: { color: '#b91c1c', fontSize: 15 },
  version: { textAlign: 'center', color: '#9ca3af', fontSize: 12, marginVertical: 24 },
});
