import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

type ToastType = 'success' | 'error';

interface ToastState {
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  /** UX rule (dev-kit §4.3): success auto-closes, error stays until closed. */
  show: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => undefined });

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, type: ToastType = 'success') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, type });
    if (type === 'success') {
      timer.current = setTimeout(() => setToast(null), 2500);
    }
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <View
          style={[styles.toast, toast.type === 'error' ? styles.error : styles.success]}
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.message}>{toast.message}</Text>
          {toast.type === 'error' && (
            <Pressable onPress={() => setToast(null)} hitSlop={8}>
              <Text style={styles.close}>{t('common.close')}</Text>
            </Pressable>
          )}
        </View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 96,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  success: { backgroundColor: '#1f2937' },
  error: { backgroundColor: '#b91c1c' },
  message: { color: '#fff', flex: 1, fontSize: 14 },
  close: { color: '#fff', fontWeight: '700', marginLeft: 12 },
});
