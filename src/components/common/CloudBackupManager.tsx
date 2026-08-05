import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useSettingsStore } from '../../store/settingsStore';
import { useReceiptStore } from '../../store/receiptStore';
import { usePersonalStore } from '../../store/personalStore';
import { withBackoff } from '../../services/syncBackoff';
import { runCloudBackupDrain } from '../../services/cloudBackupRunner';
import { enqueueReceiptDriveBackup } from '../../services/driveBackup';
import { enqueueBackupJob } from '../../services/cloudBackupQueue';

const runDrain = () => withBackoff('cloudBackup', runCloudBackupDrain);

const anyBackupFeatureOn = () => {
  const s = useSettingsStore.getState();
  return s.driveBackupEnabled || s.googleSheetsSyncEnabled;
};

/**
 * Triggers cloud-backup queue drains on:
 *   - mount (once, after store hydration)
 *   - AppState foreground transitions
 *   - offline → online transitions
 *   - debounced (~1.5s) receipt / transaction mutations
 *     (receipt added → enqueue its Drive job; transactions changed → enqueue
 *     one dedupe'd 'sheets:transactions' job covering all new rows)
 *
 * All gating (flag, premium tier, network, token) lives in cloudBackupRunner —
 * this component only decides WHEN to ask for a drain. Renders nothing.
 */
export default function CloudBackupManager() {
  const driveEnabled = useSettingsStore((s) => s.driveBackupEnabled);
  const sheetsEnabled = useSettingsStore((s) => s.googleSheetsSyncEnabled);
  const anyEnabled = driveEnabled || sheetsEnabled;
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const didInitialDrain = useRef(false);

  // Initial drain once stores are hydrated + a backup feature is on
  useEffect(() => {
    if (!anyEnabled) return;
    if (didInitialDrain.current) return;

    const checkHydrated = () => {
      const receiptsHydrated = (useReceiptStore as any).persist?.hasHydrated?.() ?? true;
      const personalHydrated = (usePersonalStore as any).persist?.hasHydrated?.() ?? true;
      return receiptsHydrated && personalHydrated;
    };

    if (checkHydrated()) {
      didInitialDrain.current = true;
      runDrain().catch(() => {});
      return;
    }

    const timer = setInterval(() => {
      if (checkHydrated()) {
        didInitialDrain.current = true;
        clearInterval(timer);
        runDrain().catch(() => {});
      }
    }, 150);
    return () => clearInterval(timer);
  }, [anyEnabled]);

  // Foreground-triggered drain
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev.match(/inactive|background/) && next === 'active') {
        if (anyBackupFeatureOn()) {
          runDrain().catch(() => {});
        }
      }
    });
    return () => sub.remove();
  }, []);

  // Drain when connectivity returns. NetInfo fires the listener immediately
  // with the current state, so the first event only seeds `wasConnected` —
  // the mount drain already covers the app's starting network state.
  useEffect(() => {
    let wasConnected = true;
    let seeded = false;
    const unsub = NetInfo.addEventListener((state) => {
      const connected = !!state.isConnected && state.isInternetReachable !== false;
      const cameOnline = seeded && !wasConnected && connected;
      seeded = true;
      wasConnected = connected;
      if (cameOnline && anyBackupFeatureOn()) {
        runDrain().catch(() => {});
      }
    });
    return () => unsub();
  }, []);

  // Drive backup: receipt added → enqueue its file job, then debounce a drain.
  // Subscribed only while driveBackupEnabled is on.
  useEffect(() => {
    if (!driveEnabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (useSettingsStore.getState().driveBackupEnabled) {
          runDrain().catch(() => {});
        }
      }, 1500);
    };
    const unsub = useReceiptStore.subscribe((s, p) => {
      if (s.receipts === p.receipts) return;
      const prevIds = new Set(p.receipts.map((r) => r.id));
      const added = s.receipts.filter((r) => !prevIds.has(r.id));
      if (added.length === 0) return;
      for (const r of added) {
        // Queue dedupes on `drive:<id>`; the processor no-ops if the receipt
        // has no artifact or is already backed up.
        void enqueueReceiptDriveBackup(r.id).catch(() => {});
      }
      schedule();
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [driveEnabled]);

  // Sheets sync: transactions changed → enqueue one dedupe'd job (a single
  // pending 'sheets:transactions' job covers any number of new rows), then
  // debounce a drain. Subscribed only while googleSheetsSyncEnabled is on.
  useEffect(() => {
    if (!sheetsEnabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (useSettingsStore.getState().googleSheetsSyncEnabled) {
          runDrain().catch(() => {});
        }
      }, 1500);
    };
    const unsub = usePersonalStore.subscribe((s, p) => {
      if (s.transactions === p.transactions) return;
      void enqueueBackupJob('sheet-rows', 'sheets:transactions').catch(() => {});
      schedule();
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [sheetsEnabled]);

  return null;
}
