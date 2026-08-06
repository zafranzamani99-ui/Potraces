import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { startOfMonth } from 'date-fns';
import { PremiumState, PremiumTier } from '../types';
import { canCreate, remainingOf, TIER_LIMITS } from '../constants/premium';
import { resolveEffectiveTier } from '../services/entitlementPolicy';
import { disablePersonalSync } from '../services/personalSync';
import { CLOUD_BACKUP_ENABLED } from '../constants/flags';

// Losing the cloud-backup entitlement (a genuine downgrade / cancel) must STOP syncing —
// otherwise a downgraded user keeps backing up for free and the toggle still reads ON.
// Keyed on the TRANSITION (prev had backup, next doesn't), NOT the new tier alone: this
// makes free→free a no-op, so billing.syncFromCustomerInfo's launch-time setTier('free')
// reconcile of a never-subscribed user can never force-disable a grandfathered free user's
// pre-existing sync. Upgrades (→ backup-capable) are no-ops too. Safe: personalSync's
// dependency tree does not import premiumStore, so no import cycle.
const enforceBackupEntitlement = (prev: PremiumTier, next: PremiumTier) => {
  if (TIER_LIMITS[prev].cloudBackup && !TIER_LIMITS[next].cloudBackup) {
    void disablePersonalSync(false);
  }
};

// Gates read the ACTIVE tier's row in TIER_LIMITS (src/constants/tiers.ts). No more
// free-vs-premium branching — a single table drives all four tiers, and the paywall's
// selected tier flows in via setTier(). Grandfathering is automatic: canCreate() blocks
// the next create when a legacy user is already over a (now-lowered) cap, never deleting.
//
// `tier` is the EFFECTIVE tier — derived by recompute() below from localTier
// (setTier / local unlock / future RevenueCat) and the persisted SERVER
// entitlement snapshot (reconcileEntitlement from my_entitlement /
// get-entitlements). Merge rules live in src/services/entitlementPolicy.ts:
// once the launch gate is on and the server has answered, the SERVER WINS for
// signed-in users (a flipped localTier can't beat a server 'free'); on
// network/server failure we fail OPEN on the cached snapshot (+ grace past
// expiry); gate off / signed out / never verified → localTier exactly as
// before, so the ~32 gate call sites and the dev free-unlock are unchanged.
export const usePremiumStore = create<PremiumState>()(
  persist(
    (set, get) => {
      // The ONLY place `tier` changes: recompute the effective tier from the local
      // + server inputs, and run the backup-entitlement side effect on TRANSITIONS
      // (prev ≠ next) — a reconcile that lands on the same effective tier must
      // never toggle sync (same guarantee the old inline calls gave).
      const recompute = () => {
        const s = get();
        const next = resolveEffectiveTier(s.localTier, {
          tier: s.serverTier,
          source: s.serverSource,
          expiresAt: s.premiumUntil,
          gateOn: s.gateOn,
          fetchedAt: s.serverFetchedAt,
        }, new Date());
        const prev = s.tier;
        if (next === prev) return;
        set({ tier: next });
        enforceBackupEntitlement(prev, next);
      };

      return {
      tier: 'free',
      localTier: 'free',
      serverTier: 'free',
      serverSource: 'none',
      premiumUntil: null,
      gateOn: false,
      serverFetchedAt: null,
      subscribedAt: null,
      scanCount: 0,
      scanResetDate: startOfMonth(new Date()),
      aiCallsCount: 0,
      aiCallsResetDate: startOfMonth(new Date()),

      // Local unlock (billing not wired). subscribe() = top tier for back-compat; the
      // paywall calls setTier(selectedTier) — that's the seam RevenueCat plugs into.
      subscribe: () => {
        set({ localTier: 'premium', subscribedAt: new Date() });
        recompute();
      },

      setTier: (tier: PremiumTier) => {
        set({ localTier: tier, subscribedAt: tier === 'free' ? null : new Date() });
        recompute();
      },

      // Server entitlement (my_entitlement RPC or the get-entitlements edge
      // function). A definitive server response always reconciles — including
      // tier 'free' once the gate is on (server WINS: a local flip can't beat it).
      reconcileEntitlement: ({ tier, premiumUntil, gateOn, source, fetchedAt }) => {
        set({
          serverTier: tier,
          serverSource: source ?? (tier === 'free' ? 'none' : 'grant'),
          premiumUntil,
          gateOn,
          serverFetchedAt: fetchedAt ?? new Date(),
        });
        recompute();
      },

      // Signed out: drop the whole server snapshot (the local unlock is
      // untouched) — signed-out behavior stays purely local, as today.
      resetServerEntitlement: () => {
        set({ serverTier: 'free', serverSource: 'none', premiumUntil: null, gateOn: false, serverFetchedAt: null });
        recompute();
      },

      unsubscribe: () => {
        set({ localTier: 'free', subscribedAt: null });
        recompute();
      },

      incrementScanCount: () =>
        set((state) => ({
          scanCount: state.scanCount + 1,
        })),

      resetScanCountIfNeeded: () => {
        const state = get();
        const currentMonthStart = startOfMonth(new Date());
        const resetDate = state.scanResetDate instanceof Date
          ? state.scanResetDate
          : new Date(state.scanResetDate);
        if (isNaN(resetDate.getTime()) || resetDate < currentMonthStart) {
          set({
            scanCount: 0,
            scanResetDate: currentMonthStart,
          });
        }
      },

      incrementAiCalls: () => {
        const state = get();
        state.resetAiCallsIfNeeded();
        set((s) => ({ aiCallsCount: s.aiCallsCount + 1 }));
      },

      resetAiCallsIfNeeded: () => {
        const state = get();
        const currentMonthStart = startOfMonth(new Date());
        const resetDate = state.aiCallsResetDate instanceof Date
          ? state.aiCallsResetDate
          : new Date(state.aiCallsResetDate);
        if (isNaN(resetDate.getTime()) || resetDate < currentMonthStart) {
          set({
            aiCallsCount: 0,
            aiCallsResetDate: currentMonthStart,
          });
        }
      },

      // ── Count gates ──
      canCreateWallet: (currentCount: number) => canCreate(get().tier, 'maxWallets', currentCount),
      canCreateBudget: (currentCount: number) => canCreate(get().tier, 'maxBudgets', currentCount),
      canCreateSavingsAccount: (currentCount: number) => canCreate(get().tier, 'maxSavingsAccounts', currentCount),
      canCreateGoal: (currentCount: number) => canCreate(get().tier, 'maxGoals', currentCount),
      canCreateSharedSub: (currentCount: number) => canCreate(get().tier, 'maxSharedSubs', currentCount),
      canCreateBusinessProfile: (currentCount: number) => canCreate(get().tier, 'maxBusinessProfiles', currentCount),
      canCreatePaymentQr: (currentCount: number) => canCreate(get().tier, 'maxPaymentQrs', currentCount),

      // ── Metered gates (reset the monthly window first) ──
      canScanReceipt: () => {
        get().resetScanCountIfNeeded();
        return canCreate(get().tier, 'maxScansPerMonth', get().scanCount);
      },

      getRemainingScans: () => {
        get().resetScanCountIfNeeded();
        return remainingOf(get().tier, 'maxScansPerMonth', get().scanCount);
      },

      canUseAI: () => {
        get().resetAiCallsIfNeeded();
        return canCreate(get().tier, 'maxAiCallsPerMonth', get().aiCallsCount);
      },

      getRemainingAiCalls: () => {
        get().resetAiCallsIfNeeded();
        return remainingOf(get().tier, 'maxAiCallsPerMonth', get().aiCallsCount);
      },

      // ── Capability gates ──
      // Beta lock: even a (locally-unlocked) paid tier can't back up until launch.
      hasCloudBackup: () => CLOUD_BACKUP_ENABLED && TIER_LIMITS[get().tier].cloudBackup,
      hasAskEcho: () => TIER_LIMITS[get().tier].askEchoPerScreen,
      hasPhotoIcon: () => TIER_LIMITS[get().tier].photoCategoryIcons,
      };
    },
    {
      name: 'premium-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        tier: state.tier,
        localTier: state.localTier,
        serverTier: state.serverTier,
        serverSource: state.serverSource,
        premiumUntil: state.premiumUntil instanceof Date ? state.premiumUntil.toISOString() : state.premiumUntil,
        gateOn: state.gateOn,
        serverFetchedAt: state.serverFetchedAt instanceof Date ? state.serverFetchedAt.toISOString() : state.serverFetchedAt,
        subscribedAt: state.subscribedAt instanceof Date ? state.subscribedAt.toISOString() : state.subscribedAt,
        scanCount: state.scanCount,
        scanResetDate: state.scanResetDate instanceof Date ? state.scanResetDate.toISOString() : state.scanResetDate,
        aiCallsCount: state.aiCallsCount,
        aiCallsResetDate: state.aiCallsResetDate instanceof Date ? state.aiCallsResetDate.toISOString() : state.aiCallsResetDate,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const sd = (v: any) => {
          if (!v) return null;
          const d = v instanceof Date ? v : new Date(v);
          return isNaN(d.getTime()) ? null : d;
        };
        state.subscribedAt = sd(state.subscribedAt);
        state.scanResetDate = sd(state.scanResetDate) ?? startOfMonth(new Date());
        state.aiCallsResetDate = sd(state.aiCallsResetDate) ?? startOfMonth(new Date());
        // Legacy migration: builds before server entitlements persisted only `tier`,
        // which was the LOCAL unlock — so it becomes localTier. (Legacy values 'free'
        // | 'premium' are valid members of the 4-tier union, so no value mapping needed.)
        if (state.localTier == null) state.localTier = state.tier ?? 'free';
        state.serverTier = state.serverTier ?? 'free';
        state.serverSource = state.serverSource ?? 'none';
        state.premiumUntil = sd(state.premiumUntil);
        state.gateOn = state.gateOn ?? false;
        // Builds before server-wins enforcement persisted no fetchedAt → treated
        // as "never verified" (fail-open, local rules) until the first refresh lands.
        state.serverFetchedAt = sd(state.serverFetchedAt);
        // Recompute the effective tier from the rehydrated inputs — an expired server
        // grant drops out here even if `tier` was persisted while the grant was live.
        state.tier = resolveEffectiveTier(state.localTier, {
          tier: state.serverTier,
          source: state.serverSource,
          expiresAt: state.premiumUntil,
          gateOn: state.gateOn,
          fetchedAt: state.serverFetchedAt,
        }, new Date());
      },
    }
  )
);
