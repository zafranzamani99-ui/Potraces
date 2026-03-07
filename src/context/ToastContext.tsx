import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import Toast from '../components/common/Toast';

type ToastType = 'success' | 'error' | 'info';

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

// Global toast function callable from anywhere (outside React tree)
let _globalShowToast: ((message: string, type?: ToastType) => void) | null = null;
export function globalShowToast(message: string, type: ToastType = 'success') {
  if (_globalShowToast) _globalShowToast(message, type);
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

  const showToast = useCallback((msg: string, toastType: ToastType = 'success') => {
    setMessage(msg);
    setType(toastType);
    setVisible(true);
  }, []);

  // Register global reference
  useEffect(() => {
    _globalShowToast = showToast;
    return () => { _globalShowToast = null; };
  }, [showToast]);

  const handleHide = useCallback(() => {
    setVisible(false);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Toast
        visible={visible}
        message={message}
        type={type}
        onHide={handleHide}
      />
    </ToastContext.Provider>
  );
};
