import React, { useEffect, useState } from 'react';
import { Redirect, Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { isOnboarded } from '../../src/lib/storage';
import { useUnreadBadge } from '../../src/hooks/useNotifications';

export default function TabsLayout() {
  const { t } = useTranslation();
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
          title: t('tabs.shop'),
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="storefront-outline" color={color} size={size} />,
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
        name="orders"
        options={{
          title: t('tabs.orders'),
          tabBarIcon: ({ color, size }) => <Ionicons name="cube-outline" color={color} size={size} />,
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
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
