import React, { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../src/store/session-context';
import { setOnboarded, setPendingMarketingOptIn } from '../src/lib/storage';
import { SUPPORTED_LANGUAGES, type AppLanguage } from '../src/lib/config';

const LANGUAGE_LABELS: Record<AppLanguage, string> = { en: 'English', es: 'Español', ko: '한국어' };

/** Onboarding: language → notification permission → marketing opt-in (G5). */
export default function OnboardingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { language, changeLanguage, registerPush } = useSession();
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      // Permission prompt + device token registration (anonymous at this point).
      await registerPush();
      // Pref rows need a bound customer — park the choice until identity upgrade.
      await setPendingMarketingOptIn(marketing);
      await setOnboarded();
      router.replace('/(tabs)');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>{t('onboarding.welcome')}</Text>
        <Text style={styles.subtitle}>{t('onboarding.intro')}</Text>

        <Text style={styles.section}>{t('onboarding.chooseLanguage')}</Text>
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

        <Text style={styles.section}>{t('onboarding.notifTitle')}</Text>
        <Text style={styles.explain}>{t('onboarding.notifExplain')}</Text>

        <View style={styles.optInRow}>
          <View style={styles.optInTextWrap}>
            <Text style={styles.optInLabel}>{t('onboarding.marketingOptIn')}</Text>
            <Text style={styles.explain}>{t('onboarding.marketingExplain')}</Text>
          </View>
          <Switch value={marketing} onValueChange={setMarketing} />
        </View>

        <Pressable style={[styles.cta, busy && styles.ctaDisabled]} onPress={start} disabled={busy}>
          <Text style={styles.ctaText}>{t('onboarding.start')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#4b5563', marginBottom: 32 },
  section: { fontSize: 15, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  explain: { fontSize: 13, color: '#6b7280' },
  langRow: { flexDirection: 'row', gap: 8 },
  langChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  langChipActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  langText: { color: '#111827' },
  langTextActive: { color: '#fff', fontWeight: '700' },
  optInRow: { flexDirection: 'row', alignItems: 'center', marginTop: 24, gap: 12 },
  optInTextWrap: { flex: 1 },
  optInLabel: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  cta: {
    marginTop: 40,
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
