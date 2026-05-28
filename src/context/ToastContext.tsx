import React, { createContext, useContext, useCallback, useEffect, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import RootSiblings from 'react-native-root-siblings';
import Toast, { ToastAction } from '../components/common/Toast';

export type ToastType = 'success' | 'error' | 'info';

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

// --- Modal toast host registry ---
interface ModalHostEntry {
  show: (message: string, type: ToastType, action?: ToastAction) => void;
}

const modalHostStack: ModalHostEntry[] = [];

export function registerModalToastHost(entry: ModalHostEntry): () => void {
  modalHostStack.push(entry);
  return () => {
    const idx = modalHostStack.indexOf(entry);
    if (idx >= 0) modalHostStack.splice(idx, 1);
  };
}

let _globalShowToast: ((message: string, type?: ToastType, action?: ToastAction) => void) | null = null;
export function globalShowToast(message: string, type: ToastType = 'success', action?: ToastAction) {
  if (_globalShowToast) _globalShowToast(message, type, action);
}

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const siblingRef = useRef<RootSiblings | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleHide = useCallback(() => {
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    if (siblingRef.current) {
      siblingRef.current.destroy();
      siblingRef.current = null;
    }
  }, []);

  const showToast = useCallback((msg: string, toastType: ToastType = 'success', toastAction?: ToastAction) => {
    if (modalHostStack.length > 0) {
      modalHostStack[modalHostStack.length - 1].show(msg, toastType, toastAction);
      return;
    }
    if (siblingRef.current) {
      siblingRef.current.destroy();
      siblingRef.current = null;
    }
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }

    const duration = toastAction ? 4000 : 2500;

    siblingRef.current = new RootSiblings(
      <GestureHandlerRootView style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999, pointerEvents: 'box-none' }}>
        <Toast
          visible
          message={msg}
          type={toastType}
          onHide={handleHide}
          action={toastAction ?? undefined}
          duration={duration}
        />
      </GestureHandlerRootView>
    );
  }, [handleHide]);

  useEffect(() => {
    _globalShowToast = showToast;
    return () => {
      _globalShowToast = null;
      if (siblingRef.current) siblingRef.current.destroy();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
    </ToastContext.Provider>
  );
};
