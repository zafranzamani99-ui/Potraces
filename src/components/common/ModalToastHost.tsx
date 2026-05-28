import React, { useState, useCallback, useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Toast, { ToastAction } from './Toast';
import { registerModalToastHost, globalShowToast, ToastType } from '../../context/ToastContext';

interface ToastState {
  message: string;
  type: ToastType;
  action?: ToastAction;
  key: number;
  duration: number;
}

export default function ModalToastHost() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const pendingRef = useRef<ToastState | null>(null);

  const show = useCallback((msg: string, type: ToastType, action?: ToastAction) => {
    const duration = action ? 4000 : type === 'error' ? 3500 : 2500;
    const state = { message: msg, type, action, key: Date.now(), duration };
    pendingRef.current = state;
    setToast(state);
  }, []);

  const hide = useCallback(() => {
    pendingRef.current = null;
    setToast(null);
  }, []);

  useEffect(() => registerModalToastHost({ show }), [show]);

  // Transfer active toast to global level when this host unmounts (Modal closing)
  useEffect(() => {
    return () => {
      const active = pendingRef.current;
      if (active) {
        pendingRef.current = null;
        setTimeout(() => globalShowToast(active.message, active.type, active.action), 0);
      }
    };
  }, []);

  if (!toast) return null;

  return (
    <GestureHandlerRootView style={styles.host} pointerEvents="box-none">
      <Toast
        key={toast.key}
        visible
        message={toast.message}
        type={toast.type}
        onHide={hide}
        action={toast.action}
        duration={toast.duration}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    pointerEvents: 'box-none',
  },
});
