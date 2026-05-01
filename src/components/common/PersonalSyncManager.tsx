import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useSettingsStore } from '../../store/settingsStore';
import { syncPersonal } from '../../services/personalSync';
import { withBackoff } from '../../services/syncBackoff';
import { usePersonalStore } from '../../store/personalStore';
import { useWalletStore } from '../../store/walletStore';
import { useDebtStore } from '../../store/debtStore';

const runSync = () => withBackoff('personalSync', syncPersonal);

/**
 * Triggers personal-mode cloud sync on:
 *   - mount (once, after store hydration)
 *   - AppState foreground transitions
 *   - opt-in flip (personalSyncEnabled → true)
 *
 * No-op when personalSyncEnabled is false or no auth session.
 * Renders nothing.
 */
export default function PersonalSyncManager() {
  const enabled = useSettingsStore((s) => s.personalSyncEnabled);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const didInitialSync = useRef(false);

  // Initial sync once stores are hydrated + sync enabled
  useEffect(() => {
    if (!enabled) return;
    if (didInitialSync.current) return;

    const checkHydrated = () => {
      const personalHydrated = (usePersonalStore as any).persist?.hasHydrated?.() ?? true;
      const walletHydrated = (useWalletStore as any).persist?.hasHydrated?.() ?? true;
      const debtHydrated = (useDebtStore as any).persist?.hasHydrated?.() ?? true;
      return personalHydrated && walletHydrated && debtHydrated;
    };

    if (checkHydrated()) {
      didInitialSync.current = true;
      syncPersonal().catch(() => {});
      return;
    }

    const timer = setInterval(() => {
      if (checkHydrated()) {
        didInitialSync.current = true;
        clearInterval(timer);
        runSync().catch(() => {});
      }
    }, 150);
    return () => clearInterval(timer);
  }, [enabled]);

  // Foreground-triggered sync
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev.match(/inactive|background/) && next === 'active') {
        if (useSettingsStore.getState().personalSyncEnabled) {
          runSync().catch(() => {});
        }
      }
    });
    return () => sub.remove();
  }, []);

  // Debounced auto-sync on local mutations (~1.5s after last change)
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (useSettingsStore.getState().personalSyncEnabled) {
          runSync().catch(() => {});
        }
      }, 1500);
    };
    const unsubP = usePersonalStore.subscribe((s, p) => {
      if (
        s.transactions !== p.transactions ||
        s.subscriptions !== p.subscriptions ||
        s.budgets !== p.budgets ||
        s.goals !== p.goals
      ) schedule();
    });
    const unsubW = useWalletStore.subscribe((s, p) => {
      if (s.wallets !== p.wallets || s.transfers !== p.transfers) schedule();
    });
    const unsubD = useDebtStore.subscribe((s, p) => {
      if (
        s.debts !== p.debts ||
        s.splits !== p.splits ||
        s.contacts !== p.contacts
      ) schedule();
    });
    return () => {
      unsubP();
      unsubW();
      unsubD();
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);

  return null;
}
