import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSettingsStore } from '../../store/settingsStore';
import {
  cloudHasPersonalData,
  hasLocalPersonalData,
  isPersonalAccountMismatch,
  syncPersonal,
} from '../../services/personalSync';
import { withBackoff } from '../../services/syncBackoff';
import { CLOUD_BACKUP_ENABLED } from '../../constants/flags';
import { useT } from '../../i18n';
import { usePersonalStore } from '../../store/personalStore';
import { useWalletStore } from '../../store/walletStore';
import { useDebtStore } from '../../store/debtStore';
import { useNotesStore } from '../../store/notesStore';
import { useSavingsStore } from '../../store/savingsStore';
import { useReceiptStore } from '../../store/receiptStore';
import { useBudgetProfileStore } from '../../store/budgetProfileStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useLearningStore } from '../../store/learningStore';

const runSync = () => withBackoff('personalSync', syncPersonal);

// Restore-prompt bookkeeping lives OUTSIDE settingsStore on purpose — it's a
// one-shot device-local flag, not a setting (and keeps this manager free of
// settings-schema churn).
const RESTORE_PROMPTED_KEY = 'cloud-restore-prompted-v1';

/**
 * Triggers personal-mode cloud sync on:
 *   - mount (once, after store hydration)
 *   - AppState foreground transitions
 *   - opt-in flip (personalSyncEnabled → true)
 *
 * Also owns two cloud-backup "honesty" surfaces:
 *   - ACCOUNT MISMATCH alert — when sync is silently blocked because this
 *     device holds data synced from a different account (once per app launch).
 *   - RESTORE-ON-NEW-DEVICE prompt — a fresh install (no local data) signed
 *     into an account that HAS cloud data gets one offer to pull it down.
 *     Gated on CLOUD_BACKUP_ENABLED: inert until the beta lock lifts.
 *
 * No-op when personalSyncEnabled is false or no auth session.
 * Renders nothing.
 */
export default function PersonalSyncManager() {
  const enabled = useSettingsStore((s) => s.personalSyncEnabled);
  const t = useT();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const didInitialSync = useRef(false);
  const didMismatchAlert = useRef(false);

  // The mismatch flag is set inside syncPersonal — check it after a sync settles.
  const maybeAlertMismatch = () => {
    if (didMismatchAlert.current || !isPersonalAccountMismatch()) return;
    didMismatchAlert.current = true;
    Alert.alert(t.settings.syncMismatchTitle, t.settings.syncMismatchBody);
  };

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
      syncPersonal().catch(() => {}).finally(maybeAlertMismatch);
      return;
    }

    const timer = setInterval(() => {
      if (checkHydrated()) {
        didInitialSync.current = true;
        clearInterval(timer);
        runSync().catch(() => {}).finally(maybeAlertMismatch);
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
          runSync().catch(() => {}).finally(maybeAlertMismatch);
        }
      }
    });
    return () => sub.remove();
  }, []);

  // Restore-on-new-device: fresh install (no local data) + account WITH cloud
  // rows + sync not enabled → ONE offer to pull the backup down. Inert while
  // the beta lock is on.
  useEffect(() => {
    if (!CLOUD_BACKUP_ENABLED) return;
    if (enabled) return; // sync already on — nothing to offer
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        if (cancelled) return;
        if (await AsyncStorage.getItem(RESTORE_PROMPTED_KEY)) return;
        if (hasLocalPersonalData()) return; // not a fresh device
        if (!(await cloudHasPersonalData())) return; // nothing to restore
        await AsyncStorage.setItem(RESTORE_PROMPTED_KEY, '1');
        if (cancelled) return;
        Alert.alert(
          t.settings.cloudRestoreTitle,
          t.settings.cloudRestoreBody,
          [
            { text: t.settings.cloudRestoreLater, style: 'cancel' },
            {
              text: t.settings.cloudRestoreYes,
              onPress: () => {
                useSettingsStore.getState().setPersonalSyncEnabled(true);
                syncPersonal().catch(() => {});
              },
            },
          ],
        );
      } catch {
        /* best-effort — the Account screen toggle remains the manual path */
      }
    }, 4000); // let launch settle + stores hydrate before probing
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, t]);

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
    const unsubN = useNotesStore.subscribe((s, p) => {
      if (s.pages !== p.pages) schedule();
    });
    // Savings accounts/snapshots are written by the Savings screen AND by Echo
    // (set-savings / add-savings-account). Without this, those writes never kicked
    // a debounced push, so a savings change sat local-only until some OTHER store
    // mutated or the app was backgrounded+reopened.
    const unsubS = useSavingsStore.subscribe((s, p) => {
      if (s.accounts !== p.accounts) schedule();
    });
    // Stage 5 coverage gaps (docs/INCREMENTAL_SYNC_PLAN.md): receipts and the
    // three single-row LWW blobs (budget profile, categories, learning) never
    // kicked a debounced push — a change there sat local-only until some OTHER
    // store mutated or the app was backgrounded+reopened.
    const unsubR = useReceiptStore.subscribe((s, p) => {
      if (s.receipts !== p.receipts) schedule();
    });
    const unsubBP = useBudgetProfileStore.subscribe((s, p) => {
      if (s.updatedAt !== p.updatedAt) schedule();
    });
    const unsubC = useCategoryStore.subscribe((s, p) => {
      if (s.updatedAt !== p.updatedAt) schedule();
    });
    const unsubL = useLearningStore.subscribe((s, p) => {
      if (s.updatedAt !== p.updatedAt) schedule();
    });
    return () => {
      unsubP();
      unsubW();
      unsubD();
      unsubN();
      unsubS();
      unsubR();
      unsubBP();
      unsubC();
      unsubL();
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);

  return null;
}
