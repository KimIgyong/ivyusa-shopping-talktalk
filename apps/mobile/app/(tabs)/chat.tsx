import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  getConversation,
  getScenarioButtons,
  sendMessage,
  sendScenario,
} from '../../src/services/chatService';
import { useSession } from '../../src/store/session-context';
import { useToast } from '../../src/components/Toast';
import type { ChatMessage, ScenarioButton } from '../../src/lib/types';

/** Foreground chat poll (parity with widget POLL_MS); push covers background. */
const POLL_MS = 5000;

export default function ChatScreen() {
  const { t } = useTranslation();
  const { token, session, grantConsent } = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const consented = session?.consentState === 'granted' && !session?.noticeOutdated;

  const conversationQuery = useQuery({
    queryKey: ['conversation', token],
    enabled: !!token && consented && focused,
    refetchInterval: focused ? POLL_MS : false,
    queryFn: () => getConversation(token!),
  });

  const scenarioQuery = useQuery({
    queryKey: ['scenario', token],
    enabled: !!token && consented,
    staleTime: 5 * 60_000,
    queryFn: () => getScenarioButtons(token!),
  });

  const refetchConversation = () => qc.invalidateQueries({ queryKey: ['conversation', token] });

  const sendMut = useMutation({
    mutationFn: (message: string) => sendMessage(token!, message),
    onSuccess: async (reply) => {
      if (reply.needsAuth) toast.show(t('chat.needsAuth'), 'error');
      if (reply.escalate) toast.show(t('chat.escalated'));
      await refetchConversation();
    },
    onError: () => toast.show(t('chat.sendFailed'), 'error'),
  });

  const scenarioMut = useMutation({
    mutationFn: (action: string) => sendScenario(token!, action),
    onSuccess: () => refetchConversation(),
    onError: () => toast.show(t('chat.sendFailed'), 'error'),
  });

  const messages = useMemo(
    () => [...(conversationQuery.data?.messages ?? [])].reverse(),
    [conversationQuery.data],
  );

  const submit = () => {
    const text = draft.trim();
    if (!text || !token) return;
    setDraft('');
    sendMut.mutate(text);
  };

  if (!consented) {
    return (
      <View style={styles.consentWrap}>
        <Text style={styles.consentTitle}>{t('chat.consentTitle')}</Text>
        <Text style={styles.consentBody}>{t('chat.consentBody')}</Text>
        {session?.privacyPolicyUrl ? (
          <Pressable onPress={() => void Linking.openURL(session.privacyPolicyUrl!)}>
            <Text style={styles.consentLink}>{t('chat.consentPolicy')}</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.consentCta} onPress={() => void grantConsent()}>
          <Text style={styles.consentCtaText}>{t('chat.consentAgree')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <FlatList
        inverted
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <MessageBubble message={item} />}
        contentContainerStyle={styles.list}
      />
      {scenarioQuery.data?.scenarioButtons?.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chips}
          contentContainerStyle={styles.chipsContent}
        >
          {scenarioQuery.data.scenarioButtons
            .filter((b: ScenarioButton) => b.enabled)
            .map((b: ScenarioButton) => (
              <Pressable key={b.id} style={styles.chip} onPress={() => scenarioMut.mutate(b.action)}>
                <Text style={styles.chipText}>{b.label}</Text>
              </Pressable>
            ))}
        </ScrollView>
      ) : null}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={t('chat.placeholder')}
          onSubmitEditing={submit}
          returnKeyType="send"
          multiline
        />
        <Pressable style={styles.sendBtn} onPress={submit} disabled={sendMut.isPending}>
          <Text style={styles.sendText}>{t('chat.send')}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const mine = message.senderType === 'user';
  return (
    <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        {!mine && message.senderName ? (
          <Text style={styles.sender}>{message.senderName}</Text>
        ) : null}
        <Text style={mine ? styles.textMine : styles.textTheirs}>{message.body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  list: { padding: 12 },
  bubbleRow: { marginVertical: 4, flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { backgroundColor: '#6366F1' },
  bubbleTheirs: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' },
  sender: { fontSize: 11, color: '#6b7280', marginBottom: 2 },
  textMine: { color: '#fff', fontSize: 15 },
  textTheirs: { color: '#111827', fontSize: 15 },
  chips: { maxHeight: 48, backgroundColor: '#f9fafb' },
  chipsContent: { paddingHorizontal: 12, gap: 8, alignItems: 'center' },
  chip: {
    backgroundColor: '#eef2ff',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  chipText: { color: '#4338ca', fontSize: 13, fontWeight: '600' },
  inputRow: {
    flexDirection: 'row',
    padding: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 15,
  },
  sendBtn: {
    marginLeft: 8,
    backgroundColor: '#6366F1',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendText: { color: '#fff', fontWeight: '700' },
  consentWrap: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  consentTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  consentBody: { fontSize: 14, color: '#4b5563', marginBottom: 12 },
  consentLink: { color: '#6366F1', textDecorationLine: 'underline', marginBottom: 20 },
  consentCta: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  consentCtaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
