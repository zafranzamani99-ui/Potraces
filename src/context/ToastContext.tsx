import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import Toast, { ToastAction } from '../components/common/Toast';

type ToastType = 'success' | 'error' | 'info';

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

// Global toast function callable from anywhere (outside React tree)
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
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [type, setType] = useState<ToastType>('success');
  const [action, setAction] = useState<ToastAction | null>(null);

  const showToast = useCallback((msg: string, toastType: ToastType = 'success', toastAction?: ToastAction) => {
    setMessage(msg);
    setType(toastType);
    setAction(toastAction ?? null);
    setVisible(true);
  }, []);

  // Register global reference
  useEffect(() => {
    _globalShowToast = showToast;
    return () => { _globalShowToast = null; };
  }, [showToast]);

  const handleHide = useCallback(() => {
    setVisible(false);
    setAction(null);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Toast
        visible={visible}
        message={message}
        type={type}
        onHide={handleHide}
        action={action}
        duration={action ? 4000 : 2500}
      />
    </ToastContext.Provider>
  );
};
