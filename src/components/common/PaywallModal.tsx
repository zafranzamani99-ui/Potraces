import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  StyleSheet,
  Modal,
  Linking,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha, TERMS_URL, PRIVACY_URL } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FREE_TIER, TIER_LIMITS } from '../../constants/premium';
import { usePremiumStore } from '../../store/premiumStore';
import type { PremiumTier } from '../../types';
import { isBillingConfigured, purchaseTier, restorePurchases } from '../../services/billing';
import type { PaidTier } from '../../services/billingMap';
import { hasSmartAi } from '../../services/chatModel';
import { useNeu } from './neu';
import NeuButton from './NeuButton';
import GlassSegmentedControl from './GlassSegmentedControl';
import { selectionChanged } from '../../services/haptics';
import { useT, type Translations } from '../../i18n';

// Verified-seal tick badge for the feature list. Scalloped starburst + check, drawn in
// react-native-svg. The bright green is a DELIBERATE off-palette exception requested by the
// user — the app is otherwise olive-only ("no green as success"). White check reads on green
// in both light and dark, so both colors are baked in (not theme tokens).
const VERIFIED_GREEN = '#22C55E';
const VerifiedTick: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      d="M23 12l-2.44-2.79.34-3.69-3.61-.82-1.89-3.2L12 2.96 8.6 1.5 6.71 4.69 3.1 5.5l.34 3.7L1 12l2.44 2.79-.34 3.7 3.61.82 1.89 3.2L12 21.05l3.4 1.46 1.89-3.19 3.61-.82-.34-3.69z"
      fill={VERIFIED_GREEN}
    />
    <Path
      d="M8 12.6l3 3 5.2-6.1"
      fill="none"
      stroke="#FFFFFF"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

// Legal links (TERMS_URL / PRIVACY_URL) live in constants so the paywall, SubscriptionCard,
// and AppSettings all point at the same pages. Apple requires functional Terms + Privacy on
// any subscription screen.
const openLegal = (url: string) => {
  Linking.openURL(url).catch(() => {
    /* URL unopenable (no browser / offline) — fail silently rather than crash the paywall */
  });
};

// Store-specific renewal wording lives INSIDE the component now (it needs `t` for i18n):
// the disclosure must name the RIGHT store per platform (Apple ID / App Store account on iOS,
// Google Play account / Google Play subscriptions on Android), not hardcode Apple everywhere.

type PaywallFeature = 'wallet' | 'budget' | 'savings' | 'goals' | 'subscription' | 'scan' | 'ai' | 'backup' | 'collectz' | 'businessProfile';

interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
  feature: PaywallFeature;
  currentUsage?: number;
  reason?: string;
  /**
   * Render the paywall WITHOUT its own <Modal> wrapper (as a plain full-screen
   * overlay), for use inside another Modal window (e.g. a BottomSheet's `overlay`
   * slot). iOS cannot present a second Modal over an already-open one, so a nested
   * paywall Modal shows behind the sheet (invisible). Parent controls mounting.
   */
  asOverlay?: boolean;
}

// ─── Feature-aware header ─────────────────────────────────────────────
// The sheet is shared across every gate (wallet/budget/savings/scan/ai), so the
// headline + trigger line adapt. One olive-emphasised word carries the promise;
// the quota is a grey whisper (stated, never used to shame). See the paywall design.
// Copy comes from i18n, so the map is BUILT INSIDE the component (needs `t`); only the
// free-tier limits (constants) live here in the shape.
type FeatureConfig = { headA: string; headEm: string; headB: string; unit: string; freeLimit: number };

const buildFeatureConfig = (t: Translations): Record<PaywallFeature, FeatureConfig> => ({
  ai: { headA: t.paywall.aiHeadA, headEm: t.paywall.aiHeadEm, headB: t.paywall.aiHeadB, unit: t.paywall.unitAiChats, freeLimit: FREE_TIER.maxAiCallsPerMonth },
  scan: { headA: t.paywall.scanHeadA, headEm: t.paywall.scanHeadEm, headB: t.paywall.scanHeadB, unit: t.paywall.unitScans, freeLimit: FREE_TIER.maxScansPerMonth },
  wallet: { headA: t.paywall.walletHeadA, headEm: t.paywall.walletHeadEm, headB: t.paywall.walletHeadB, unit: t.paywall.unitWallets, freeLimit: FREE_TIER.maxWallets },
  budget: { headA: t.paywall.budgetHeadA, headEm: t.paywall.budgetHeadEm, headB: t.paywall.budgetHeadB, unit: t.paywall.unitBudgets, freeLimit: FREE_TIER.maxBudgets },
  savings: { headA: t.paywall.savingsHeadA, headEm: t.paywall.savingsHeadEm, headB: t.paywall.savingsHeadB, unit: t.paywall.unitSavings, freeLimit: FREE_TIER.maxSavingsAccounts },
  goals: { headA: t.paywall.goalsHeadA, headEm: t.paywall.goalsHeadEm, headB: t.paywall.goalsHeadB, unit: t.paywall.unitGoals, freeLimit: FREE_TIER.maxGoals },
  subscription: { headA: t.paywall.subscriptionHeadA, headEm: t.paywall.subscriptionHeadEm, headB: t.paywall.subscriptionHeadB, unit: t.paywall.unitSharedSubs, freeLimit: FREE_TIER.maxSharedSubs },
  backup: { headA: t.paywall.backupHeadA, headEm: t.paywall.backupHeadEm, headB: t.paywall.backupHeadB, unit: '', freeLimit: 0 },
  collectz: { headA: t.paywall.collectzHeadA, headEm: t.paywall.collectzHeadEm, headB: t.paywall.collectzHeadB, unit: t.paywall.unitCollectzSessions, freeLimit: FREE_TIER.maxCollectzSessionsPerWeek },
  businessProfile: { headA: t.paywall.businessProfileHeadA, headEm: t.paywall.businessProfileHeadEm, headB: t.paywall.businessProfileHeadB, unit: t.paywall.unitBusinessProfiles, freeLimit: FREE_TIER.maxBusinessProfiles },
});

// ─── Plans ────────────────────────────────────────────────────────────
// Single source of pricing truth for the sheet. When RevenueCat is wired,
// map (tier, billing) → a purchase package right here — nothing else changes.
// Prices mirror docs/MONETIZATION_AND_PRICING.md. Every struck "was" is a real
// 12× monthly price (keeps the discount claim honest).
type PlanTier = 'basic' | 'pro' | 'prem';
type Billing = 'monthly' | 'yearly';

interface TierPrice {
  was?: string;
  price: string;
  per: string;
  bill?: string;
  pill?: string;
}
interface Tier {
  id: PlanTier;
  name: string;
  monthly: TierPrice;
  yearly: TierPrice;
  under: Record<Billing, string>;
}

// `under` holds only the numeric price part (kept as-is, per pricing truth); the
// "· cancel anytime" tail is appended from i18n at render (see underLine()).
// `bill: 'monthly only'` is the ONE non-numeric bill string — swapped for t.paywall.monthlyOnly
// at render; every '/mo' `per` is likewise swapped for t.paywall.perMonth.
const TIERS: Tier[] = [
  {
    id: 'basic',
    name: 'Basic',
    monthly: { price: 'RM7.99', per: '/mo' },
    yearly: { price: 'RM7.99', per: '/mo', bill: 'monthly only' },
    under: { monthly: 'RM7.99/mo', yearly: 'RM7.99/mo' },
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly: { price: 'RM14', per: '/mo' },
    yearly: { was: 'RM14', price: 'RM10', per: '/mo', bill: 'RM120/yr', pill: '−28%' },
    under: { monthly: 'RM14/mo', yearly: 'RM120/yr' },
  },
  {
    id: 'prem',
    name: 'Premium',
    monthly: { price: 'RM25', per: '/mo' },
    yearly: { was: 'RM25', price: 'RM16.67', per: '/mo', bill: 'RM200/yr', pill: '−33%' },
    under: { monthly: 'RM25/mo', yearly: 'RM200/yr' },
  },
];

// Selected plan tier → the store's PremiumTier ('prem' card = 'premium' entitlement).
const STORE_TIER: Record<PlanTier, PremiumTier> = { basic: 'basic', pro: 'pro', prem: 'premium' };

// ─── Compact "tell all" spec ──────────────────────────────────────────
// Every line is derived from TIER_LIMITS (the SAME table the app enforces), so the sheet
// can't over/under-promise — but it's packed into a 2-column grid so the whole plan fits
// on screen without scrolling. Only what the tier INCLUDES is shown (every line is a sell —
// "not included" rows are filtered out in buildItems). Once the count caps go
// unlimited (Pro+), the six count rows collapse to one line to save even more height.
const fmtCount = (n: number) => (n === Infinity ? '∞' : String(n));

interface SpecItem {
  label: string;
  on: boolean;
}

const num = (label: string, n: number) => label.replace('{n}', fmtCount(n));

const buildItems = (tier: PremiumTier, t: Translations): SpecItem[] => {
  const L = TIER_LIMITS[tier];
  const items: SpecItem[] = [
    { label: num(t.paywall.itemChats, L.maxAiCallsPerMonth), on: true },
    { label: t.paywall.itemAskEcho, on: L.askEchoPerScreen },
    { label: t.paywall.itemSmarterEcho, on: hasSmartAi(tier) },
    { label: num(t.paywall.itemScans, L.maxScansPerMonth), on: true },
    { label: t.paywall.itemPhotoIcons, on: L.photoCategoryIcons },
    { label: t.paywall.cloudBackup, on: L.cloudBackup },
    { label: t.paywall.itemExport, on: L.exportData },
    { label: t.paywall.itemGoogleDocs, on: L.googleDocsSync },
  ];
  // Finite counts get their own cells; unlimited counts collapse into a single full line
  // (rendered separately) so Pro/Premium stay short.
  if (L.maxWallets !== Infinity) {
    items.push(
      { label: num(t.paywall.itemWallets, L.maxWallets), on: true },
      { label: num(t.paywall.itemPerType, L.maxWalletsPerType), on: true },
      { label: num(t.paywall.itemBudgets, L.maxBudgets), on: true },
      { label: num(t.paywall.itemSavings, L.maxSavingsAccounts), on: true },
      { label: num(t.paywall.itemGoals, L.maxGoals), on: true },
      { label: num(t.paywall.itemSharedSubs, L.maxSharedSubs), on: true },
      // Playbooks ship in v1.2 — not sold on the paywall yet. Re-add this row (and it's
      // already in i18n as itemPlaybooks) when the feature launches.
    );
  }
  // Sell what the tier INCLUDES, not what it lacks — drop every "not included" line
  // (e.g. Smarter Echo / Google Docs sync on Basic) so the sheet reads as pure value.
  return items.filter((i) => i.on);
};

// Business/shop roadmap — one honest line on the sheet, clearly "soon", never a checkmark.
const bizSoon = (tier: PremiumTier, t: Translations): string =>
  tier === 'pro' ? t.paywall.bizSoonPro : tier === 'premium' ? t.paywall.bizSoonPremium : '';

// The full itemized roadmap — shown in the tap-to-open "coming soon" dialog.
const bizFeatures = (tier: PremiumTier, t: Translations): string[] => {
  if (tier === 'pro') {
    return [t.paywall.bizRemoveBranding, t.paywall.bizStoreTemplates, t.paywall.bizAiPreview];
  }
  if (tier === 'premium') {
    return [
      t.paywall.bizRemoveBranding,
      t.paywall.bizStoreTemplates,
      t.paywall.bizAiFull,
      t.paywall.bizAnalytics,
      t.paywall.bizTapToPay,
    ];
  }
  return [];
};

const PaywallModal: React.FC<PaywallModalProps> = ({
  visible,
  onClose,
  feature,
  currentUsage,
  reason,
  asOverlay = false,
}) => {
  const t = useT();
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();

  // Store-aware billing names + renewal disclosure — needs `t`, so built here (not module-level).
  const BILLING_ACCOUNT = Platform.OS === 'android' ? t.paywall.accountGoogle : t.paywall.accountApple;
  const BILLING_MANAGE = Platform.OS === 'android' ? t.paywall.manageGoogle : t.paywall.manageApple;
  const RENEWAL_DISCLOSURE = t.paywall.renewalDisclosure
    .replace('{account}', BILLING_ACCOUNT)
    .replace('{manage}', BILLING_MANAGE);
  const neu = useNeu(); // full neu — ✕ button (Neu Key), active toggle thumb, selected tier
  const neuF = useNeu(undefined, { faintDark: true }); // Onyx rule 3 — unselected selector cards
  const applyTier = usePremiumStore((s) => s.setTier);
  const { height: SCREEN_H } = useWindowDimensions();

  // ─── Bottom-sheet mechanics ─────────────────────────────────────────
  // Mirror the canonical BottomSheet (Goals' gfSheet) EXACTLY so this reads like every
  // other sheet: reanimated slide-up, a backdrop that fades with sheet position, and
  // drag-to-dismiss from the grabber/header. A plain Modal animationType="slide" wipes the
  // backdrop up with the sheet (no fade) and gives no drag — that's the "not like other
  // sheets" the design flagged.
  const sheetY = useSharedValue(SCREEN_H);
  const dragStart = useSharedValue(0);
  const closingRef = useRef(false);

  const finishClose = useCallback(() => {
    if (!closingRef.current) return;
    closingRef.current = false;
    onClose();
  }, [onClose]);

  // Animated close — slide down, then flip the parent's `visible` off once it settles.
  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    sheetY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
  }, [SCREEN_H, sheetY, finishClose]);

  // Open — reset off-screen, then slide up.
  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      sheetY.value = SCREEN_H;
      sheetY.value = withTiming(0, { duration: 280 });
    }
  }, [visible, SCREEN_H, sheetY]);

  const sheetGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([10, 9999]) // only downward drags grab; taps + the inner ScrollView stay live
        .onStart(() => {
          'worklet';
          dragStart.value = sheetY.value;
        })
        .onUpdate((e) => {
          'worklet';
          let newY = dragStart.value + e.translationY;
          if (newY < 0) newY = newY / 3; // rubber-band past the top
          sheetY.value = newY;
        })
        .onEnd((e) => {
          'worklet';
          if (e.translationY > 100 || e.velocityY > 800) {
            runOnJS(close)();
          } else {
            sheetY.value = withTiming(0, { duration: 280 });
          }
        }),
    [close, sheetY, dragStart],
  );

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));
  const backdropAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));

  // Basic (RM7.99) is the pushed hero — pre-selected + "BEST VALUE". Monthly leads so the
  // RM7.99 → RM14 gap stays visible (yearly makes Pro ~RM10/mo, which cannibalises Basic).
  const [tier, setTier] = useState<PlanTier>('basic');
  const [billing, setBilling] = useState<Billing>('monthly');
  // Tap-to-open info dialogs (business roadmap / subscription details). Rendered as an
  // in-window overlay — NOT a second Modal (iOS can't stack Modals; see the sheet's own note).
  const [infoModal, setInfoModal] = useState<null | 'business' | 'terms'>(null);

  const featureConfig = buildFeatureConfig(t);
  const cfg = featureConfig[feature];
  const selected = TIERS.find((tr) => tr.id === tier)!;

  // The AI headline number scales with the SELECTED tier vs the free allowance
  // (free 30 → Basic 300 = 10× · Pro 800 = 27× · Premium 1500 = 50×). Every other
  // gate uses qualitative copy ("every"/"all"/"without"), so only AI is tier-driven.
  const headEm =
    feature === 'ai'
      ? `${Math.round(TIER_LIMITS[STORE_TIER[tier]].maxAiCallsPerMonth / FREE_TIER.maxAiCallsPerMonth)}×`
      : cfg.headEm;

  // "· cancel anytime" is composed from i18n; the numeric price stays in the tier data.
  const underLine = `${selected.under[billing]} · ${t.paywall.cancelAnytime}`;

  // AI gate: the sub-line shows the SELECTED tier's monthly allowance ("300 AI chats every
  // month") — a friendlier "here's what you get" that scales as you tap Basic/Pro/Premium.
  // Other gates keep the usage/limit trigger (they pass currentUsage).
  const triggerText =
    cfg.freeLimit <= 0
      ? '' // capability gate (e.g. cloud backup) — no quota line
      : feature === 'ai'
        ? t.paywall.triggerTierMonthly
            .replace('{limit}', String(TIER_LIMITS[STORE_TIER[tier]].maxAiCallsPerMonth))
            .replace('{unit}', cfg.unit)
        : currentUsage !== undefined
          ? t.paywall.triggerUsed
              .replace('{used}', String(currentUsage))
              .replace('{limit}', String(cfg.freeLimit))
              .replace('{unit}', cfg.unit)
          : t.paywall.triggerLimit
              .replace('{limit}', String(cfg.freeLimit))
              .replace('{unit}', cfg.unit);

  const pickTier = (id: PlanTier) => {
    selectionChanged();
    setTier(id);
  };

  const paidTier = STORE_TIER[tier] as PaidTier; // basic | pro | premium (never 'free' here)

  // Split the spec into two clean columns, centered as a group (checkmarks stay aligned
  // within each column — vs a wrap-grid that pins the columns to the far edges).
  const specItems = buildItems(paidTier, t);
  const specMid = Math.ceil(specItems.length / 2);
  const specCols = [specItems.slice(0, specMid), specItems.slice(specMid)];

  const handleContinue = async () => {
    if (isBillingConfigured()) {
      // Real purchase: buy the (tier, billing) package → entitlement → store tier.
      try {
        const ok = await purchaseTier(paidTier, billing);
        if (ok) close();
      } catch (e: any) {
        if (!e?.userCancelled) console.warn('[paywall] purchase failed:', e?.message);
      }
      return;
    }
    // Billing not configured yet → local unlock so the app stays fully usable in dev.
    applyTier(paidTier);
    close();
  };

  const handleRestore = async () => {
    if (!isBillingConfigured()) return;
    try {
      if (await restorePurchases()) close();
    } catch (e: any) {
      console.warn('[paywall] restore failed:', e?.message);
    }
  };

  const body = (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <View style={StyleSheet.absoluteFill}>
        {/* Backdrop — fades in/out with sheet position; tap to dismiss (Onyx rule 4) */}
        <Reanimated.View style={[styles.backdrop, backdropAnimStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel={t.paywall.close}
          />
        </Reanimated.View>

        {/* Sheet — slides up, anchored to the bottom edge */}
        <Reanimated.View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, SPACING.md) },
            sheetAnimStyle,
          ]}
        >
          {/* Drag zone: grabber + brand header. A downward Pan dismisses from here (like
              every other sheet); the ✕/logo taps still register, and the ScrollView below
              keeps its own scroll. */}
          <GestureDetector gesture={sheetGesture}>
            <View collapsable={false}>
              <View style={styles.grabber} />
              {/* Brand lockup + soft-neu close (findable exit, Apple rejects traps) */}
              <View style={styles.header}>
                <Text style={styles.logo}>
                  Potraces <Text style={styles.logoAccent}>{selected.name}</Text>
                </Text>
                <TouchableOpacity
                  style={[styles.closeBtn, neu.raised]}
                  onPress={close}
                  accessibilityRole="button"
                  accessibilityLabel={t.paywall.close}
                >
                  <Feather name="x" size={15} color={C.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
          </GestureDetector>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >

            {/* Headline = the promise, one olive word */}
            <Text style={styles.headline}>
              {cfg.headA}
              <Text style={styles.headlineEm}>{headEm}</Text>
              {cfg.headB}
            </Text>
            {triggerText ? <Text style={styles.trigger}>{triggerText}</Text> : null}
            {reason ? <Text style={styles.reason}>{reason}</Text> : null}

            {/* Monthly / Yearly — the app's liquid-glass segmented control (same as the
                Personal/Business mode toggle): genuine iOS-26 system glass, blur fallback
                elsewhere. Monthly leads (keeps the RM7.99→RM14 gap; yearly is the upsell). */}
            <View style={styles.billingToggle}>
              <GlassSegmentedControl
                values={[t.paywall.monthly, t.paywall.yearly]}
                selectedIndex={billing === 'yearly' ? 1 : 0}
                onChange={(i) => setBilling(i === 1 ? 'yearly' : 'monthly')}
              />
            </View>

            {/* Tier cards — Basic is the pushed hero (raised, pre-selected, BEST VALUE) */}
            <View style={styles.cards}>
              {TIERS.map((tr) => {
                const isSel = tr.id === tier;
                const isHero = tr.id === 'basic';
                const p = billing === 'yearly' ? tr.yearly : tr.monthly;
                // '/mo' → localized; 'monthly only' is the ONE non-numeric bill (localize it,
                // keep 'RM120/yr' etc. as-is).
                const perLabel = p.per === '/mo' ? t.paywall.perMonth : p.per;
                const billLabel = p.bill === 'monthly only' ? t.paywall.monthlyOnly : p.bill;
                return (
                  <TouchableOpacity
                    key={tr.id}
                    activeOpacity={0.9}
                    onPress={() => pickTier(tr.id)}
                    style={[
                      styles.card,
                      isHero && styles.cardHero,
                      isSel ? [neu.raised, styles.cardSel] : neuF.raisedSoft,
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSel }}
                    accessibilityLabel={`${tr.name}, ${p.price}${perLabel}`}
                  >
                    {isHero && (
                      <View style={[styles.tag, isSel ? styles.tagSel : neu.raised]}>
                        <Text style={[styles.tagText, isSel && styles.tagTextSel]}>
                          {t.paywall.bestValue}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.tierName}>{tr.name}</Text>
                    <Text style={styles.was}>{p.was ?? ' '}</Text>
                    <View style={styles.priceRow}>
                      <Text style={styles.price}>{p.price}</Text>
                      <Text style={styles.per}>{perLabel}</Text>
                    </View>
                    <Text style={styles.bill}>{billLabel ?? ' '}</Text>
                    {p.pill ? (
                      <View style={styles.pill}>
                        <Text style={styles.pillText}>{p.pill}</Text>
                      </View>
                    ) : (
                      <View style={styles.pillSpacer} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* The always-included promise — the one line that alone justifies paying
                for a money app. Fear of loss > desire for features. */}
            <View style={styles.cloud}>
              <Feather name="cloud" size={16} color={C.accent} />
              <Text style={styles.cloudText}>
                {t.paywall.cloudBackup} <Text style={styles.cloudSub}>{t.paywall.cloudBackupSub}</Text>
              </Text>
            </View>

            {/* Everything in the selected tier — a dense 2-column grid so the whole plan
                shows at once (no scroll). Generated from TIER_LIMITS; only included features shown. */}
            <Text style={styles.specHeader}>
              {t.paywall.everythingIn}<Text style={styles.specHeaderEm}>{selected.name}</Text>
            </Text>
            <View style={styles.grid}>
              {specCols.map((col, ci) => (
                <View key={ci} style={styles.gridCol}>
                  {col.map((it) => (
                    <View key={it.label} style={styles.gridItem}>
                      {it.on ? (
                        <VerifiedTick />
                      ) : (
                        <Text style={styles.gridDash}>—</Text>
                      )}
                      <Text
                        style={[styles.gridLabel, !it.on && styles.gridLabelOff]}
                        numberOfLines={1}
                      >
                        {it.label}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>

            {/* Unlimited counts collapse into one line at Pro+ */}
            {TIER_LIMITS[paidTier].maxWallets === Infinity && (
              <View style={styles.fullRow}>
                <VerifiedTick />
                <Text style={styles.gridLabel}>{t.paywall.itemUnlimited}</Text>
              </View>
            )}

            {/* Roadmap — one honest line, flagged so nothing reads as a live promise.
                Tappable → a dialog that lists the full coming-soon business set. */}
            {bizSoon(paidTier, t) ? (
              <TouchableOpacity
                style={styles.fullRow}
                onPress={() => setInfoModal('business')}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t.paywall.a11yBusinessSoon}
              >
                <Feather name="clock" size={12} color={C.textMuted} />
                <Text
                  style={[styles.gridLabel, styles.gridLabelOff, { flexShrink: 1 }]}
                  numberOfLines={1}
                >
                  {bizSoon(paidTier, t)}
                </Text>
                <View style={styles.soonPill}>
                  <Text style={styles.soonPillText}>{t.paywall.soon}</Text>
                </View>
                <Feather name="chevron-right" size={14} color={C.textMuted} />
              </TouchableOpacity>
            ) : null}

            {/* One olive key (Neu Select) — the only saturated thing on screen */}
            <NeuButton label={t.paywall.continue} onPress={handleContinue} style={styles.cta} />
            <Text style={styles.under}>{underLine}</Text>

            {/* Auto-renewal disclosure — required near the purchase CTA (store-aware).
                Tappable → a dialog with the full subscription terms. */}
            <TouchableOpacity
              onPress={() => setInfoModal('terms')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t.paywall.subscriptionDetails}
            >
              <Text style={styles.disclosure}>
                {RENEWAL_DISCLOSURE} <Text style={styles.disclosureLink}>{t.paywall.details}</Text>
              </Text>
            </TouchableOpacity>

            <View style={styles.legal}>
              <TouchableOpacity onPress={handleRestore} accessibilityRole="button">
                <Text style={styles.legalText}>{t.paywall.restore}</Text>
              </TouchableOpacity>
              <Text style={styles.legalDot}>·</Text>
              <TouchableOpacity
                onPress={() => openLegal(TERMS_URL)}
                accessibilityRole="link"
                accessibilityLabel={t.paywall.a11yTermsOfUse}
              >
                <Text style={styles.legalText}>{t.paywall.terms}</Text>
              </TouchableOpacity>
              <Text style={styles.legalDot}>·</Text>
              <TouchableOpacity
                onPress={() => openLegal(PRIVACY_URL)}
                accessibilityRole="link"
                accessibilityLabel={t.paywall.a11yPrivacyPolicy}
              >
                <Text style={styles.legalText}>{t.paywall.privacy}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Reanimated.View>

        {/* Tap-to-open info dialog — rendered on TOP of the sheet, inside this same window
            (no second Modal). Centered Onyx dialog card; tap the scrim to dismiss. */}
        {infoModal && (
          <View style={styles.infoOverlay}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setInfoModal(null)}
              accessibilityRole="button"
              accessibilityLabel={t.paywall.close}
            />
            <View style={[styles.infoCard, neu.raisedSoft]}>
              {infoModal === 'business' ? (
                <>
                  <View style={styles.infoHead}>
                    <View style={styles.infoIcon}>
                      <Feather name="shopping-bag" size={15} color={C.accent} />
                    </View>
                    <Text style={styles.infoTitle}>{t.paywall.bizComingSoonTitle}</Text>
                  </View>
                  <Text style={styles.infoSub}>
                    {t.paywall.bizOnTheWay.replace('{tier}', selected.name)}
                  </Text>
                  <View style={styles.infoList}>
                    {bizFeatures(paidTier, t).map((f) => (
                      <View key={f} style={styles.infoListRow}>
                        <Feather name="clock" size={13} color={C.textMuted} style={styles.infoBullet} />
                        <Text style={styles.infoListText}>{f}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.infoHead}>
                    <View style={styles.infoIcon}>
                      <Feather name="file-text" size={15} color={C.accent} />
                    </View>
                    <Text style={styles.infoTitle}>{t.paywall.subscriptionDetails}</Text>
                  </View>
                  <Text style={styles.infoPlan}>{selected.name} — {underLine}</Text>
                  <View style={styles.infoList}>
                    {[
                      t.paywall.detailAutoRenews,
                      t.paywall.detailBilled.replace('{account}', BILLING_ACCOUNT),
                      t.paywall.detailCancel.replace('{manage}', BILLING_MANAGE),
                      t.paywall.detailStops,
                    ].map((line, i) => (
                      <View key={i} style={styles.infoListRow}>
                        <Feather name="check" size={13} color={C.accent} style={styles.infoBullet} />
                        <Text style={styles.infoListText}>{line}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.infoLegal}>
                    <TouchableOpacity onPress={() => openLegal(TERMS_URL)} accessibilityRole="link">
                      <Text style={styles.infoLegalLink}>{t.paywall.a11yTermsOfUse}</Text>
                    </TouchableOpacity>
                    <Text style={styles.legalDot}>·</Text>
                    <TouchableOpacity onPress={() => openLegal(PRIVACY_URL)} accessibilityRole="link">
                      <Text style={styles.infoLegalLink}>{t.paywall.a11yPrivacyPolicy}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
              <TouchableOpacity
                style={[styles.infoBtn, neu.raised]}
                onPress={() => setInfoModal(null)}
                accessibilityRole="button"
              >
                <Text style={styles.infoBtnText}>{t.paywall.gotIt}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </GestureHandlerRootView>
  );

  // Mirror BottomSheet: stay mounted through the close animation, then unmount once the
  // parent flips `visible` off via onClose (so the slide-down always plays fully).
  if (!visible) return null;

  // As an overlay: the parent (e.g. BudgetPlannerSheet's overlay slot) already owns a Modal
  // window, and iOS can't stack a second Modal — so render the animated body directly.
  if (asOverlay) return body;

  return (
    <Modal
      visible
      transparent
      statusBarTranslucent
      animationType="none" // reanimated drives the slide; Modal just provides the window
      onRequestClose={close}
    >
      {body}
    </Modal>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    gestureRoot: { flex: 1 }, // fills the Modal window (and nests fine inside a parent's root)
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.4)', // Onyx rule 4 — opacity is animated, driven by sheet position
    },
    // Onyx rule 1/2: C.background sheet, no border. Anchored to the bottom edge, full width,
    // only the top corners rounded; separation from the scrim is the tone + grabber, not a shadow.
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      maxHeight: '92%',
      backgroundColor: C.background,
      borderTopLeftRadius: RADIUS['2xl'],
      borderTopRightRadius: RADIUS['2xl'],
      paddingHorizontal: SPACING.xl,
      paddingTop: SPACING.sm,
    },
    grabber: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: withAlpha(C.textPrimary, 0.18),
      alignSelf: 'center',
      marginBottom: SPACING.sm,
    },
    // Auto-size (BottomSheet pattern): flexShrink lets the sheet HUG its content — so on a
    // normal phone the whole plan shows with no scroll — and only shrink+scroll when the
    // content genuinely can't fit under the sheet's 92% cap (small devices). No fixed height.
    scroll: { flexShrink: 1 },
    scrollContent: { paddingBottom: SPACING.xs },

    header: {
      height: 34,
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
      marginBottom: SPACING.sm,
    },
    logo: {
      fontSize: 16,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.textPrimary,
      letterSpacing: -0.2,
    },
    logoAccent: {
      color: C.accent,
      fontWeight: TYPOGRAPHY.weight.regular,
    },
    closeBtn: {
      position: 'absolute',
      right: 0,
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: C.background,
      alignItems: 'center',
      justifyContent: 'center',
    },

    headline: {
      fontSize: 23,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.textPrimary,
      textAlign: 'center',
      letterSpacing: -0.4,
      lineHeight: 28,
      marginHorizontal: SPACING.md,
    },
    headlineEm: { color: C.accent },
    trigger: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      textAlign: 'center',
      marginTop: 4,
    },
    reason: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textSecondary,
      textAlign: 'center',
      marginTop: 4,
    },

    billingToggle: { marginTop: SPACING.lg },

    cards: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'center',
      gap: SPACING.sm,
      marginTop: SPACING.lg,
      paddingTop: 10, // room for the Pro tag to sit on the top edge
    },
    card: {
      flex: 1,
      borderRadius: RADIUS.xl,
      paddingVertical: SPACING.md,
      paddingHorizontal: 4,
      alignItems: 'center',
      backgroundColor: C.background,
      borderWidth: 1.5,
      borderColor: 'transparent', // reserve the ring width so selecting doesn't shift layout
    },
    cardHero: { paddingTop: SPACING.md + 4 },
    cardSel: {
      backgroundColor: withAlpha(C.accent, 0.09),
      borderColor: withAlpha(C.accent, 0.5),
    },
    tag: {
      position: 'absolute',
      top: -10,
      alignSelf: 'center',
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: RADIUS.full,
      backgroundColor: C.background,
    },
    tagSel: { backgroundColor: C.accent },
    tagText: {
      fontSize: 8.5,
      fontWeight: TYPOGRAPHY.weight.bold,
      letterSpacing: 0.6,
      color: C.textSecondary,
    },
    tagTextSel: { color: C.onAccent },
    tierName: {
      fontSize: 10.5,
      fontWeight: TYPOGRAPHY.weight.bold,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: C.textSecondary,
    },
    was: {
      fontSize: 11.5,
      color: C.textMuted,
      textDecorationLine: 'line-through',
      marginTop: 4,
      minHeight: 15,
    },
    priceRow: { flexDirection: 'row', alignItems: 'flex-end' },
    price: {
      fontSize: 19,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.textPrimary,
      letterSpacing: -0.4,
    },
    per: {
      fontSize: 10.5,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textSecondary,
      marginBottom: 2,
    },
    bill: {
      fontSize: 9.5,
      color: C.textMuted,
      marginTop: 2,
      minHeight: 12,
    },
    pill: {
      marginTop: 8,
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: RADIUS.full,
      backgroundColor: C.accent,
    },
    pillText: {
      fontSize: 10,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.onAccent,
    },
    pillSpacer: { marginTop: 8, height: 19 },

    cloud: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center', // center the icon + text as a group (was left-aligned)
      gap: 10,
      marginTop: SPACING.lg,
      paddingVertical: 10,
      paddingHorizontal: SPACING.md,
      borderRadius: RADIUS.lg,
      backgroundColor: withAlpha(C.accent, 0.09),
    },
    cloudText: {
      fontSize: 13,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
      textAlign: 'center',
    },
    cloudSub: { fontWeight: TYPOGRAPHY.weight.regular, color: C.textSecondary },

    specHeader: {
      fontSize: 12.5,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textSecondary,
      textAlign: 'center',
      marginTop: SPACING.lg,
    },
    specHeaderEm: { color: C.textPrimary, fontWeight: TYPOGRAPHY.weight.bold },
    // Two content-width columns centered as a group with a gutter — the whole block sits
    // centered under the header, and checkmarks stay aligned within each column.
    grid: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'flex-start',
      columnGap: SPACING.xl,
      marginTop: SPACING.sm,
    },
    gridCol: {},
    gridItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 5,
    },
    gridLabel: {
      fontSize: 12,
      color: C.textPrimary,
    },
    gridLabelOff: { color: C.textMuted },
    gridDash: {
      width: 18,
      textAlign: 'center',
      fontSize: 12,
      color: C.textMuted,
    },
    fullRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 5,
    },
    soonPill: {
      paddingHorizontal: 6,
      paddingVertical: 1.5,
      borderRadius: RADIUS.full,
      backgroundColor: withAlpha(C.accent, 0.12),
    },
    soonPillText: {
      fontSize: 8,
      fontWeight: TYPOGRAPHY.weight.bold,
      letterSpacing: 0.5,
      color: C.accent,
    },

    cta: { marginTop: SPACING.lg },
    under: {
      textAlign: 'center',
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      marginTop: SPACING.sm,
    },
    disclosure: {
      textAlign: 'center',
      fontSize: 10,
      lineHeight: 14,
      color: C.textMuted,
      marginTop: SPACING.sm,
      paddingHorizontal: SPACING.xs,
    },
    disclosureLink: {
      color: C.textSecondary,
      textDecorationLine: 'underline',
      fontWeight: TYPOGRAPHY.weight.semibold,
    },
    legal: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 14,
      paddingVertical: SPACING.sm,
      marginTop: SPACING.xs,
    },
    legalText: { fontSize: 11, color: C.textMuted },
    legalDot: { fontSize: 11, color: C.textMuted },

    // ── Tap-to-open info dialog (business roadmap / subscription details) ──
    infoOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.4)', // Onyx rule 4 — scrim over the sheet
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: SPACING.xl,
    },
    // Onyx centered-dialog card: borderless C.background + neu.raisedSoft.
    infoCard: {
      width: '100%',
      maxWidth: 330,
      backgroundColor: C.background,
      borderRadius: RADIUS['2xl'],
      padding: SPACING.xl,
    },
    infoHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: SPACING.md,
    },
    infoIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: withAlpha(C.accent, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoTitle: {
      flex: 1,
      fontSize: 16,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.textPrimary,
      letterSpacing: -0.2,
    },
    infoSub: {
      fontSize: 12.5,
      lineHeight: 18,
      color: C.textSecondary,
      marginBottom: SPACING.md,
    },
    infoPlan: {
      fontSize: 13,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.accent,
      marginBottom: SPACING.md,
    },
    infoList: { gap: 11, marginBottom: SPACING.lg },
    infoListRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    infoBullet: { marginTop: 2 },
    infoListText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
      color: C.textPrimary,
    },
    infoLegal: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
      marginBottom: SPACING.lg,
    },
    infoLegalLink: {
      fontSize: 12,
      color: C.textSecondary,
      textDecorationLine: 'underline',
    },
    infoBtn: {
      borderRadius: RADIUS.full,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: C.background,
    },
    infoBtnText: {
      fontSize: 14,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
    },
  });

export default PaywallModal;
