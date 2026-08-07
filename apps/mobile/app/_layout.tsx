import '../src/i18n/i18n';
import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { SessionProvider } from '../src/store/session-context';
import { ToastProvider } from '../src/components/Toast';
import { configureForegroundNotifications } from '../src/lib/push';

configureForegroundNotifications();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

export default function RootLayout() {
  const router = useRouter();

  // Push tap → deep link by category (PLN-MobileApp M4).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const data = resp.notification.request.content.data as { category?: string } | undefined;
      const category = data?.category;
      if (category === 'chat') router.push('/(tabs)/chat');
      else if (category === 'shipping' || category === 'payment') router.push('/(tabs)/my');
      else router.push('/(tabs)/alerts');
    });
    return () => sub.remove();
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <ToastProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="shop" options={{ headerShown: true, title: '' }} />
            <Stack.Screen name="product/[handle]" options={{ headerShown: true, title: '' }} />
            <Stack.Screen name="settings" options={{ headerShown: true, title: '' }} />
            <Stack.Screen name="order/[id]" options={{ headerShown: true, title: '' }} />
          </Stack>
        </ToastProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
