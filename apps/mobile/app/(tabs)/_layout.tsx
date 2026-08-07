import React, { useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { Redirect, Tabs, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { isOnboarded } from '../../src/lib/storage';
import { useUnreadBadge } from '../../src/hooks/useNotifications';

export default function TabsLayout() {
  const { t } = useTranslation();
  const router = useRouter();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const unread = useUnreadBadge();

  useEffect(() => {
    void isOnboarded().then(setOnboarded);
  }, []);

  if (onboarded == null) return null;
  if (!onboarded) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#6366F1',
        headerShown: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          headerTitle: t('home.title'),
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: t('tabs.products'),
          headerTitle: t('products.title'),
          tabBarIcon: ({ color, size }) => <Ionicons name="pricetags-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: t('tabs.chat'),
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-ellipses-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="my"
        options={{
          title: t('tabs.my'),
          headerTitle: t('my.title'),
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/settings')}
              hitSlop={8}
              style={{ marginRight: 16 }}
              accessibilityLabel={t('my.settings')}
            >
              <Ionicons name="settings-outline" size={22} color="#111827" />
            </Pressable>
          ),
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: t('tabs.alerts'),
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
