/* Hallmark · redesign v2 · app-screen (locked system: CALM palette + neu kit — consistency, not variety)
 * structure: hero neu card → method picker → timeline checklist → slim strips → collapsed footer
 * pre-emit critique: P4 H5 E4 S4 R5 V4 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, Linking, AppState, Modal } from 'react-native';
// Page scroller = gesture-handler's ScrollView (DebtTracking recipe) — RNGH's
// arbitrates with the app's GestureHandlerRootView so drags aren't lost. No
// KeyboardToolbar/keyboard insets here: this screen has no text inputs.
import { ScrollView } from 'react-native-gesture-handler';
import * as Clipboard from 'expo-clipboard';
import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useT } from '../../i18n';
import { useCalm } from '../../hooks/useCalm';
import { useToast } from '../../context/ToastContext';
import { useSettingsStore } from '../../store/settingsStore';
import { useAuthStore } from '../../store/authStore';
import { SPACING, RADIUS, withAlpha } from '../../constants';
import { useNeu } from '../../components/common/neu';
import NeuButton from '../../components/common/NeuButton';
import NeuIconButton from '../../components/common/NeuIconButton';
import CollapsibleSection from '../../components/common/CollapsibleSection';
import { successNotification, lightTap } from '../../services/haptics';
import {
  registerQuickLogKey, getQuickLogKeyStatus, revokeQuickLogKey,
} from '../../services/quickLogKey';
import { registerPersonalDeviceToken, getPersonalPushStatus } from '../../services/pushNotifications';
import { getQuickLogRealtimeStatus } from '../../services/quickLogInbox';
import { pushQuickLogCategories } from '../../services/quickLogCategories';

// Signed shortcut built by scripts/build-quick-log-shortcut.py, hosted on the
// public `web` bucket, served via the branded jejakbaki.my redirect
// (vercel.json /shortcut → storage URL). NOTE: the redirect goes live on the
// next git push (Vercel deploys from this repo) — ship both together.
const SHORTCUT_URL = 'https://jejakbaki.my/shortcut';
const AUTOLOG_URL = 'https://jejakbaki.my/autolog';
const SHORTCUT_READY = !SHORTCUT_URL.includes('REPLACE_ME');
// Direct storage URLs — shortcuts://import-shortcut wants the signed file itself
// (no redirect hop), so the one-tap path bypasses the branded redirects. The
// Safari URLs above stay as the manual/fallback download path.
// The ?v= suffix is a CDN cache-buster: Cloudflare caches the storage URL for
// an hour (max-age=3600), so without it a just-republished shortcut can serve
// STALE for up to an hour (bit us 2026-07-21). Bump the value on every
// shortcut re-upload — a new query string is a new cache key, straight to origin.
const SHORTCUT_FILE_URL = 'https://jngmanwvhbpkpkeklfiv.supabase.co/storage/v1/object/public/web/PotracesQuickLog.shortcut?v=20260721b';
const AUTOLOG_FILE_URL = 'https://jngmanwvhbpkpkeklfiv.supabase.co/storage/v1/object/public/web/PotracesAutoLog.shortcut?v=20260722a';
// NOTE (2026-07-21, device-verified): the `shortcuts://import-shortcut?url=…`
// scheme REJECTS non-iCloud URLs on modern iOS ("The shortcut URL provided was
// invalid") — since iOS 13 only icloud.com share links import by URL; signed
// FILES may only enter by being opened as files. So the one-tap flow downloads
// the signed file itself and hands it to Shortcuts via the share sheet:
// tap "Shortcuts" → the Add Shortcut preview opens. Deterministic fallback —
// a failed download is detectable (unlike the fire-and-forget deep link), and
// then we open the Safari guidance page instead.

type LogMethod = 'apple' | 'backtap';

// Real setup screenshots (owner-captured 2026-07-21/22) — the guide is a
// VERTICAL slide-through: one screenshot per step, each with its instruction,
// scrolled top-to-bottom (competitor-parity). ~600KB of 80%-quality JPEGs.
// Explicit render dims (~590×1280 sources) — percentage width + aspectRatio
// inside the flexed timeline row rendered a giant zoom-crop on device.
const PHOTO_H = 300;
const PHOTO_W = Math.round(PHOTO_H * (590 / 1280));
const SHOTS = {
  // Back Tap flow
  btAdd: require('../../../assets/setup/bt1-add.jpg'),
  btTouch: require('../../../assets/setup/bt2-touch.jpg'),
  btBackTap: require('../../../assets/setup/bt3-backtap.jpg'),
  btSelect: require('../../../assets/setup/bt4-select.jpg'),
  // Apple Pay flow
  apAdd: require('../../../assets/setup/ap1-add.jpg'),
  apAutomation: require('../../../assets/setup/ap2-automation.jpg'),
  apWallet: require('../../../assets/setup/ap3-wallet.jpg'),
  apChoose: require('../../../assets/setup/ap4-choose.jpg'),
  apRun: require('../../../assets/setup/ap5-run.jpg'),
};

export default function QuickLogSetup() {
  const t = useT();
  const C = useCalm();
  const neu = useNeu();
  const navigation = useNavigation<any>();
  const { showToast } = useToast();
  // Quick Log logs to the account via the server, so it needs a signed-in
  // (FREE) account — NOT Cloud Backup, which stays a paid feature on its own.
  const signedIn = useAuthStore((s) => s.personal.isAuthenticated);
  // In-app toggle (Settings → Preferences → Notifications): when OFF, the
  // foreground handler suppresses ALL banners while the app is open.
  const inAppNotifs = useSettingsStore((s) => s.notificationsEnabled);
  // Which logging method the user is setting up — picked on arrival via the
  // two method cards. Default = backtap: its flow creates the key the Apple
  // Log automation depends on.
  const [method, setMethod] = useState<LogMethod>('backtap');
  // Tap-to-enlarge: the inline slide photos are only ~138pt wide, too small to
  // read the iOS labels they're teaching. Holds the require()'d asset id of the
  // photo being viewed full-screen (null = viewer closed).
  const [zoomPhoto, setZoomPhoto] = useState<number | null>(null);
  // Seed from the app-wide cache so a signed-in returning user sees the right
  // state instantly (the fetch below then confirms + re-syncs the cache).
  const [hasKey, setHasKey] = useState(useSettingsStore.getState().quickLogConfigured);
  // keyLoaded gates the Apple flow's prereq/steps swap so a keyed user never
  // sees a flash of "set up Backtap first" while the status fetch is in flight.
  const [keyLoaded, setKeyLoaded] = useState(false);
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // OS notification permission (distinct from the in-app Notifications toggle
  // in Settings → Preferences — no duplication: this reflects iOS itself).
  const [notifGranted, setNotifGranted] = useState<boolean | null>(null);
  const [notifCanAsk, setNotifCanAsk] = useState(true);

  // Diagnostics — observable truth beats guessing (push registration state of
  // THIS device + live realtime channel status).
  const [pushState, setPushState] = useState<string>('…');
  const [liveState, setLiveState] = useState<string>(getQuickLogRealtimeStatus());

  const refreshNotifStatus = useCallback(async () => {
    const p = await Notifications.getPermissionsAsync();
    setNotifGranted(p.status === 'granted');
    setNotifCanAsk(p.canAskAgain !== false);
    if (p.status === 'granted') {
      await registerPersonalDeviceToken().catch(() => {});
    }
    const s = await getPersonalPushStatus().catch(() => ({ state: 'no-token' as const }));
    setPushState(s.state);
  }, []);

  useEffect(() => {
    if (signedIn) {
      getQuickLogKeyStatus()
        .then((s) => {
          setHasKey(s.hasActiveKey);
          // Keep the app-wide cache in sync (Echo's check-in nudge reads it).
          useSettingsStore.getState().setQuickLogConfigured(s.hasActiveKey);
        })
        .catch(() => {})
        .finally(() => setKeyLoaded(true));
      refreshNotifStatus();
      // Keep the Shortcut's live category list current for this account.
      pushQuickLogCategories().catch(() => {});
    }
    // Re-check when returning from iPhone Settings (app becomes active again).
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && signedIn) refreshNotifStatus();
    });
    // Realtime channel status, polled while the screen is open.
    const liveTimer = setInterval(() => setLiveState(getQuickLogRealtimeStatus()), 2000);
    return () => {
      sub.remove();
      clearInterval(liveTimer);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, [signedIn, refreshNotifStatus]);

  const onTestNotification = async () => {
    // Local notification with the quick_log payload: proves banner rendering
    // AND the tap→TransactionsList path without needing the server.
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Potraces',
          body: t.settings.quickLog.diagTestBody,
          data: { type: 'quick_log' },
          sound: 'default',
        },
        // SDK 54 trigger shape — the legacy bare {seconds} form gets rejected.
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 1.5,
        },
      });
    } catch (e) {
      // Never swallow the diagnostic's own failure.
      showToast(String(e), 'error');
    }
  };

  const pushStateLabel = (s: string) => {
    switch (s) {
      case 'registered': return t.settings.quickLog.diagRegistered;
      case 'not-registered': return t.settings.quickLog.diagNotRegistered;
      case 'no-permission': return t.settings.quickLog.diagNoPermission;
      case 'no-session': return t.settings.quickLog.diagNoSession;
      case 'no-token': return t.settings.quickLog.diagNoToken;
      default: return s;
    }
  };

  const onEnableNotifications = async () => {
    if (notifCanAsk) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        setNotifGranted(true);
        registerPersonalDeviceToken().catch(() => {});
      } else {
        setNotifCanAsk(false); // iOS won't re-prompt — route via Settings
      }
    } else {
      Linking.openSettings().catch(() => {});
    }
  };

  // One-tap setup: mint the key + copy it silently, then jump straight into the
  // Shortcuts app's "Add Shortcut" sheet. The rebuilt Shortcut reads the key off
  // the clipboard on its first run with NO prompt (QLOG- prefix match), so the
  // user's first Back Tap double-tap IS the first log — no copy, no Safari, no
  // "run it once in Shortcuts" step. Key rotation is grace-period safe
  // (registerQuickLogKey never revokes the old key until the new one is used).
  const [oneTapDone, setOneTapDone] = useState(false);

  // Fetch the signed .shortcut into cache and hand it to Shortcuts via the
  // share sheet. Any failure (offline, storage hiccup, sharing unavailable)
  // falls back to the Safari guidance page — detectable, never a dead end.
  const handoffShortcut = async (fileUrl: string, filename: string, fallbackUrl: string) => {
    try {
      const dest = `${FileSystem.cacheDirectory}${filename}`;
      const dl = await FileSystem.downloadAsync(fileUrl, dest);
      if (dl.status !== 200 || !(await Sharing.isAvailableAsync())) throw new Error(`dl-${dl.status}`);
      await Sharing.shareAsync(dl.uri, {
        mimeType: 'application/x-apple-shortcut',
        UTI: 'com.apple.shortcut',
        dialogTitle: 'Potraces Quick Log',
      });
    } catch {
      showToast(t.settings.quickLog.importFellBack, 'info');
      await Linking.openURL(fallbackUrl).catch(() => {});
    }
  };

  const onOneTapSetup = async () => {
    setBusy(true);
    try {
      const key = await registerQuickLogKey();
      await Clipboard.setStringAsync(key);
      setHasKey(true);
      setShownKey(null); // silent path — key lives on the clipboard, not on screen
      setOneTapDone(true);
      successNotification();
      // Spaced filename: Shortcuts names a file import after the FILE, so this
      // is what shows in the library + Back Tap list ("Potraces Quick Log").
      await handoffShortcut(SHORTCUT_FILE_URL, 'Potraces Quick Log.shortcut', SHORTCUT_URL);
    } catch (e: any) {
      showToast(
        e?.message === 'not-signed-in' ? t.settings.quickLog.signInFirst : t.settings.quickLog.genFailed,
        'error',
      );
    } finally { setBusy(false); }
  };

  const onGenerate = async () => {
    setBusy(true);
    try {
      const key = await registerQuickLogKey();
      setShownKey(key);
      setHasKey(true);
      setCopied(false);
    } catch (e: any) {
      // 'not-signed-in' is the only expected failure that means "go sign in";
      // anything else (network, RLS) is a real error, not a sign-in nudge.
      showToast(
        e?.message === 'not-signed-in' ? t.settings.quickLog.signInFirst : t.settings.quickLog.genFailed,
        'error',
      );
    } finally { setBusy(false); }
  };

  const onCopy = async () => {
    if (!shownKey) return;
    await Clipboard.setStringAsync(shownKey);
    successNotification(); // felt feedback — the button also morphs to “Copied ✓”
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2500);
  };

  const onRevoke = async () => {
    try {
      await revokeQuickLogKey();
      setHasKey(false);
      setShownKey(null);
    } catch {
      showToast(t.settings.quickLog.revokeFailed, 'error');
    }
  };

  /**
   * Timeline step — number node on a left rail, connector line running down to
   * the next node. Replaces the old card-per-step stack: one continuous rail
   * reads as a single guided path. Deliberately a RENDER FUNCTION (called, not
   * used as <JSX/>): an inline component type would change identity every
   * render and remount the subtree, popping press/morph state on buttons.
   */
  const renderTimelineStep = (n: string, title: string, body: string, last: boolean, children?: React.ReactNode) => (
    <View style={styles.tlStep}>
      <View style={styles.tlRail}>
        <View style={[styles.tlNode, neu.well, { backgroundColor: withAlpha(C.accent, 0.12) }]}>
          <Text style={[styles.tlNodeText, { color: C.accent }]}>{n}</Text>
        </View>
        {!last && <View style={[styles.tlLine, { backgroundColor: C.border }]} />}
      </View>
      <View style={[styles.tlContent, last && styles.tlContentLast]}>
        <Text style={[styles.tlTitle, { color: C.textPrimary }]}>{title}</Text>
        <Text style={[styles.stepBody, { color: C.textSecondary }]}>{body}</Text>
        {children}
      </View>
    </View>
  );

  /**
   * ONE vertical slide: numbered node on the left rail (connector continues to
   * the next), instruction text, then its screenshot. The whole guide is a
   * top-to-bottom read — no horizontal swiping, no hunting for which photo
   * belongs to which sentence. Photo is a Neu Card with the seam-rule split
   * (shadow on the unclipped outer, overflow:'hidden' on the inner clip).
   * Deliberately a RENDER FUNCTION (stable identity — see renderTimelineStep).
   */
  const renderSlide = (
    n: string,
    title: string,
    body: string,
    photo: number | null,
    last: boolean,
    children?: React.ReactNode,
  ) => (
    <View style={styles.tlStep}>
      <View style={styles.tlRail}>
        <View style={[styles.tlNode, neu.well, { backgroundColor: withAlpha(C.accent, 0.12) }]}>
          <Text style={[styles.tlNodeText, { color: C.accent }]}>{n}</Text>
        </View>
        {!last && <View style={[styles.tlLine, { backgroundColor: C.border }]} />}
      </View>
      <View style={[styles.tlContent, last && styles.tlContentLast]}>
        <Text style={[styles.tlTitle, { color: C.textPrimary }]}>{title}</Text>
        <Text style={[styles.stepBody, { color: C.textSecondary }]}>{body}</Text>
        {children}
        {photo !== null && (
          /* Tap the shot to blow it up full-screen. Seam rule holds: the shadow
             lives on the outer Pressable, overflow:'hidden' on the inner clip. */
          <Pressable
            style={[styles.photoCard, neu.raisedSoft, { backgroundColor: C.background }]}
            onPress={() => { lightTap(); setZoomPhoto(photo); }}
            accessibilityRole="imagebutton"
            accessibilityLabel={t.settings.quickLog.photoZoomHint}
          >
            <View style={styles.photoClip}>
              <Image source={photo} style={styles.photo} resizeMode="cover" />
              <View style={[styles.photoZoomBadge, { backgroundColor: withAlpha('#000000', 0.55) }]}>
                <Feather name="maximize-2" size={11} color="#FFFFFF" />
              </View>
            </View>
          </Pressable>
        )}
      </View>
    </View>
  );

  /**
   * Method card — the arrival chooser (Apple Log / Backtap Log). Radio
   * semantics: one is always selected, the checklist below follows it. Same
   * render-function discipline as renderTimelineStep (stable identity).
   */
  const renderMethodCard = (id: LogMethod) => {
    const q = t.settings.quickLog;
    const selected = method === id;
    const isApple = id === 'apple';
    return (
      <Pressable
        key={id}
        onPress={() => { if (!selected) { lightTap(); setMethod(id); } }}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        style={({ pressed }) => [styles.pickPress, pressed && styles.pickPressed]}
      >
        <View
          style={[
            styles.pickCard,
            neu.raisedSoft,
            {
              backgroundColor: selected ? withAlpha(C.accent, 0.08) : C.background,
              borderColor: selected ? C.accent : 'transparent',
            },
          ]}
        >
          <View style={styles.pickTop}>
            <View style={[styles.pickIcon, neu.well, { backgroundColor: withAlpha(C.accent, 0.12) }]}>
              <Feather name={isApple ? 'credit-card' : 'smartphone'} size={18} color={C.accent} />
            </View>
            <View
              style={[
                styles.pickCheck,
                {
                  borderColor: selected ? C.accent : C.border,
                  backgroundColor: selected ? C.accent : 'transparent',
                },
              ]}
            >
              {selected && <Feather name="check" size={12} color={C.onAccent} />}
            </View>
          </View>
          <Text style={[styles.pickName, { color: C.textPrimary }]}>
            {isApple ? q.appleName : q.backtapName}
          </Text>
          <Text style={[styles.pickDesc, { color: C.textSecondary }]}>
            {isApple ? q.appleDesc : q.backtapDesc}
          </Text>
          <View style={styles.pickMetaRow}>
            {isApple && (
              <View style={[styles.pickBadgePill, { backgroundColor: withAlpha(C.gold, 0.2) }]}>
                <Text style={[styles.pickBadge, { color: C.bronze }]}>{q.appleBadge}</Text>
              </View>
            )}
            <Text style={[styles.pickMeta, { color: C.textMuted }]}>
              {isApple ? q.appleMeta : q.backtapMeta}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  /** "You're done" strip — positive-tinted closer after a finished checklist. */
  const renderDone = (text: string) => (
    <View style={[styles.doneStrip, { backgroundColor: withAlpha(C.accent, 0.09) }]}>
      <Feather name="check-circle" size={15} color={C.accent} />
      <Text style={[styles.doneText, { color: C.textPrimary }]}>{text}</Text>
    </View>
  );

  /** Backtap Log — one-tap setup → turn on Back Tap → first double-tap logs. */
  const renderBacktapFlow = () => {
    const q = t.settings.quickLog;
    return (
      <>
        <View style={[styles.card, neu.raisedSoft, { backgroundColor: C.background }]}>
          {/* Vertical slide-through: every step carries its own screenshot, so
              the picture is always right under the sentence it illustrates.
              Step 1 — ONE-TAP setup: key minted + copied silently, then
              straight into Shortcuts' "Add Shortcut" sheet (the photo). */}
          {renderSlide('1', q.heroTitle, q.heroBody, SHOTS.btAdd, false, (
            <>
              <NeuButton
                label={oneTapDone ? q.heroAgain : q.heroCta}
                icon="zap"
                disabled={busy}
                onPress={onOneTapSetup}
                style={styles.tlCta}
              />
              {oneTapDone && (
                <Text style={[styles.caption, { color: C.positive }]}>
                  {q.heroDone}
                </Text>
              )}
              {/* Visible escape hatch — if the Shortcuts deep link misbehaves
                  on some iOS version, the Safari download path always works. */}
              <Pressable
                onPress={() => Linking.openURL(SHORTCUT_URL).catch(() => {})}
                accessibilityRole="link"
                hitSlop={8}
              >
                <Text style={[styles.caption, { color: C.textSecondary, textDecorationLine: 'underline' }]}>
                  {q.safariFallback}
                </Text>
              </Pressable>
            </>
          ))}
          {/* Steps 2-4 — Back Tap, one Settings screen per slide. Apple offers
              no deep link into Accessibility, so these stay explicit
              instructions (guides-must-be-explicit) — now with the real
              screenshots so there's nothing to hunt for. */}
          {renderSlide('2', q.btTouchTitle, q.btTouchBody, SHOTS.btTouch, false)}
          {renderSlide('3', q.btBackTapTitle, q.btBackTapBody, SHOTS.btBackTap, false)}
          {renderSlide('4', q.btSelectTitle, q.btSelectBody, SHOTS.btSelect, false)}
          {/* Step 5 — the first double-tap IS the first log: the rebuilt
              Shortcut silently reads the QLOG- key off the clipboard on its
              first run (no prompt), then persists it after the server accepts. */}
          {renderSlide('5', q.stepTapTitle, q.stepTapBody, null, true)}
        </View>
        {renderDone(q.afterSetup)}
      </>
    );
  };

  /** Apple Log — automation on Apple Pay card taps. Reuses the key FILE the
   *  Backtap shortcut saves on its first successful run, so without a key the
   *  flow is an honest prerequisite card instead of six useless steps. */
  const renderAppleFlow = () => {
    const q = t.settings.quickLog;
    if (!keyLoaded) return null; // don't flash the prereq while status loads
    if (!hasKey) {
      return (
        <View style={[styles.card, neu.raisedSoft, { backgroundColor: C.background, gap: SPACING.sm }]}>
          <View style={styles.prereqHead}>
            <View style={[styles.prereqIcon, neu.well, { backgroundColor: withAlpha(C.gold, 0.18) }]}>
              <Feather name="key" size={15} color={C.bronze} />
            </View>
            <Text style={[styles.tlTitle, { color: C.textPrimary }]}>{q.apPrereqTitle}</Text>
          </View>
          <Text style={[styles.stepBody, { color: C.textSecondary }]}>{q.apPrereqBody}</Text>
          <NeuButton
            label={q.apPrereqCta}
            icon="smartphone"
            onPress={() => { lightTap(); setMethod('backtap'); }}
          />
        </View>
      );
    }
    return (
      <>
        <View style={[styles.card, neu.raisedSoft, { backgroundColor: C.background }]}>
          <Text style={[styles.stepBody, styles.apLead, { color: C.textSecondary }]}>{q.apIntro}</Text>
          {/* Vertical slide-through, one screenshot per step. The silent Auto
              Log shortcut is the "Do" of a hand-built Wallet automation — Apple
              bars sharing/importing automations, so the building can't be
              removed, but every screen now has its picture. */}
          {renderSlide('1', q.apStep1Title, q.apStep1Body, SHOTS.apAdd, false, (
            <>
              <NeuButton
                label={q.apGet}
                icon="download"
                onPress={() => { handoffShortcut(AUTOLOG_FILE_URL, 'Potraces Auto Log.shortcut', AUTOLOG_URL); }}
                style={styles.tlCta}
              />
              {/* Same visible escape hatch as the Backtap flow — AUTOLOG_URL was
                  previously only reachable from handoffShortcut's silent failure
                  fallback, so a user whose share sheet misbehaved had no way out. */}
              <Pressable
                onPress={() => Linking.openURL(AUTOLOG_URL).catch(() => {})}
                accessibilityRole="link"
                hitSlop={8}
              >
                <Text style={[styles.caption, { color: C.textSecondary, textDecorationLine: 'underline' }]}>
                  {q.safariFallbackAuto}
                </Text>
              </Pressable>
            </>
          ))}
          {renderSlide('2', q.apStep2Title, q.apStep2Body, SHOTS.apAutomation, false)}
          {renderSlide('3', q.apStep3Title, q.apStep3Body, SHOTS.apWallet, false)}
          {renderSlide('4', q.apStep4Title, q.apStep4Body, SHOTS.apChoose, false)}
          {renderSlide('5', q.apStep5Title, q.apStep5Body, SHOTS.apRun, false)}
          {renderSlide('6', q.apStep6Title, q.apStep6Body, null, true)}
        </View>
        <Text style={[styles.caption, { color: C.textSecondary }]}>{q.apKeyNote}</Text>
        {renderDone(q.apDone)}
      </>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.background }} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero — Neu Card: headline, value prop, and the live setup status as a
            chip. The zap is a focal icon, so it LIFTS (neu.raised), never sinks. */}
        <View style={[styles.hero, neu.raisedSoft, { backgroundColor: C.background }]}>
          <View style={styles.heroTop}>
            <View style={[styles.heroIcon, neu.raised, { backgroundColor: withAlpha(C.accent, 0.12) }]}>
              <Feather name="zap" size={20} color={C.accent} />
            </View>
            {signedIn && keyLoaded && (
              <View style={[styles.heroChip, { backgroundColor: withAlpha(hasKey ? C.accent : C.textPrimary, 0.1) }]}>
                <View style={[styles.heroChipDot, { backgroundColor: hasKey ? C.accent : C.textMuted }]} />
                <Text style={[styles.heroChipText, { color: hasKey ? C.accent : C.textSecondary }]}>
                  {hasKey ? t.settings.quickLog.chipSet : t.settings.quickLog.chipNotSet}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.heroHeadline, { color: C.textPrimary }]}>{t.settings.quickLog.heroHeadline}</Text>
          <Text style={[styles.heroSub, { color: C.textSecondary }]}>{t.settings.quickLog.heroSub}</Text>
        </View>

        {!signedIn ? (
          // ── Gate: Quick Log needs a signed-in (free) account ─────────────
          <View style={[styles.card, neu.raisedSoft, { backgroundColor: C.background, gap: SPACING.sm }]}>
            <View style={styles.prereqHead}>
              <View style={[styles.prereqIcon, neu.well, { backgroundColor: withAlpha(C.accent, 0.12) }]}>
                <Feather name="cloud" size={15} color={C.accent} />
              </View>
              <Text style={[styles.tlTitle, { color: C.textPrimary }]}>
                {t.settings.quickLog.cloudTitle}
              </Text>
            </View>
            <Text style={[styles.stepBody, { color: C.textSecondary }]}>
              {t.settings.quickLog.cloudBody}
            </Text>
            <NeuButton
              label={t.settings.quickLog.setupCloud}
              icon="cloud"
              onPress={() => navigation.navigate('Account', { returnTo: 'QuickLogSetup' })}
            />
          </View>
        ) : (
          <>
            {/* Method picker — the arrival choice: Apple Log or Backtap Log.
                The checklist below shows one method's flow at a time. */}
            <Text style={[styles.pickLabel, { color: C.textMuted }]}>
              {t.settings.quickLog.pickLabel}
            </Text>
            <View style={styles.pickRow}>
              {renderMethodCard('apple')}
              {renderMethodCard('backtap')}
            </View>

            {/* Notification permission — slim banner, shared by BOTH flows
                (the confirmation tap-through needs OS permission). */}
            {notifGranted === false && (
              <View style={[styles.banner, { backgroundColor: withAlpha(C.gold, 0.14) }]}>
                <Feather name="bell" size={14} color={C.bronze} />
                <Text style={[styles.bannerText, { color: C.textPrimary }]}>
                  {t.settings.quickLog.notifTitle}
                </Text>
                <Pressable onPress={onEnableNotifications} hitSlop={8} accessibilityRole="button">
                  <Text style={[styles.bannerAction, { color: C.accent }]}>
                    {notifCanAsk ? t.settings.quickLog.notifEnable : t.settings.quickLog.notifOpenSettings}
                  </Text>
                </Pressable>
              </View>
            )}

            {/* The picked method's timeline */}
            {method === 'backtap' ? renderBacktapFlow() : renderAppleFlow()}

            {/* Manual fallback — the pre-one-tap flow (generate + copy + Safari
                download), kept for hand-setup and key rotation. Collapsed:
                the one-tap path above is the story now. */}
            <CollapsibleSection title={t.settings.quickLog.advancedTitle}>
              <View style={[styles.card, neu.raisedSoft, { backgroundColor: C.background, gap: SPACING.sm }]}>
                <Text style={[styles.stepBody, { color: C.textSecondary }]}>
                  {t.settings.quickLog.manualIntro}
                </Text>
                <NeuButton
                  label={hasKey ? t.settings.quickLog.regenerate : t.settings.quickLog.generate}
                  icon="key"
                  disabled={busy}
                  onPress={onGenerate}
                />
                {shownKey && (
                  <View style={[styles.keyBox, neu.insetSoft, { backgroundColor: C.background }]}>
                    {/* NOT selectable — text-selection gestures fight the scroll,
                        and the Copy button is the one true way to grab the key. */}
                    <Text style={[styles.key, { color: C.textPrimary }]}>{shownKey}</Text>
                    <Text style={[styles.caption, { color: C.textSecondary }]}>
                      {t.settings.quickLog.keyOnceWarning}
                    </Text>
                    <NeuButton
                      label={copied ? t.settings.quickLog.copiedBtn : t.settings.quickLog.copyKey}
                      icon={copied ? 'check' : 'copy'}
                      color={copied ? C.positive : undefined}
                      onPress={onCopy}
                    />
                  </View>
                )}
                <NeuButton
                  label={t.settings.quickLog.getShortcut}
                  icon="download"
                  onPress={() => {
                    if (!SHORTCUT_READY) { showToast(t.settings.quickLog.shortcutSoon, 'info'); return; }
                    Linking.openURL(SHORTCUT_URL).catch(() => {});
                  }}
                />
                <Text style={[styles.caption, { color: C.textSecondary }]}>
                  {t.settings.quickLog.regenNote}
                </Text>
              </View>
            </CollapsibleSection>

            {/* Diagnostics — on-device truth for push + live-update delivery.
                Collapsed by default: power-user/debug content, not setup. */}
            <CollapsibleSection title={t.settings.quickLog.diagTitle}>
            <View style={[styles.card, neu.raisedSoft, { backgroundColor: C.background, gap: SPACING.sm }]}>
              <View style={styles.diagRow}>
                <Text style={[styles.stepBody, { color: C.textSecondary }]}>{t.settings.quickLog.diagPush}</Text>
                <Text style={[styles.diagValue, { color: pushState === 'registered' ? C.positive : C.overdue }]}>
                  {pushStateLabel(pushState)}
                </Text>
              </View>
              <View style={styles.diagRow}>
                <Text style={[styles.stepBody, { color: C.textSecondary }]}>{t.settings.quickLog.diagLive}</Text>
                <Text style={[styles.diagValue, { color: liveState === 'SUBSCRIBED' ? C.positive : C.overdue }]}>
                  {liveState === 'SUBSCRIBED' ? t.settings.quickLog.diagLiveOk : liveState}
                </Text>
              </View>
              <View style={styles.diagRow}>
                <Text style={[styles.stepBody, { color: C.textSecondary }]}>{t.settings.quickLog.diagInApp}</Text>
                <Text style={[styles.diagValue, { color: inAppNotifs ? C.positive : C.overdue }]}>
                  {inAppNotifs ? t.settings.quickLog.diagInAppOn : t.settings.quickLog.diagInAppOff}
                </Text>
              </View>
              <NeuButton
                label={t.settings.quickLog.diagTest}
                icon="bell"
                disabled={notifGranted !== true}
                onPress={onTestNotification}
              />
            </View>
            </CollapsibleSection>

            {hasKey && (
              <Pressable style={styles.revoke} onPress={onRevoke}>
                <Text style={{ color: C.overdue }}>{t.settings.quickLog.revoke}</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>

      {/* Full-screen photo viewer. Opaque C.background rather than a dim scrim:
          these are dark iOS screenshots, and a 0.4 backdrop over the cream page
          leaves them unreadable — the point of enlarging is to READ the labels.
          Close = Neu Key (presses IN) parked at the BOTTOM, thumb-reachable. */}
      <Modal
        visible={zoomPhoto !== null}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setZoomPhoto(null)}
      >
        <SafeAreaView style={[styles.zoomRoot, { backgroundColor: C.background }]} edges={['top', 'bottom']}>
          <Pressable style={styles.zoomTapArea} onPress={() => setZoomPhoto(null)}>
            {zoomPhoto !== null && (
              <Image source={zoomPhoto} style={styles.zoomImage} resizeMode="contain" />
            )}
          </Pressable>
          <View style={styles.zoomFooter}>
            <NeuIconButton
              size={54}
              radius={27}
              onPress={() => setZoomPhoto(null)}
              accessibilityLabel={t.settings.quickLog.photoZoomClose}
            >
              <Feather name="x" size={22} color={C.textPrimary} />
            </NeuIconButton>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xl, maxWidth: 680, width: '100%', alignSelf: 'center' as const },

  // Hero — Neu Card (C.background + neu.raisedSoft), colours applied inline.
  hero: { borderRadius: RADIUS['2xl'], padding: SPACING.xl, gap: SPACING.sm },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  heroChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 5 },
  heroChipDot: { width: 6, height: 6, borderRadius: 3 },
  heroChipText: { fontSize: 12, fontWeight: '600' },
  heroHeadline: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3, lineHeight: 28, marginTop: SPACING.xs },
  heroSub: { fontSize: 13.5, lineHeight: 19 },

  // Method picker — two equal cards, the selected one ringed in accent.
  pickLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' as const },
  pickRow: { flexDirection: 'row', gap: SPACING.sm },
  pickPress: { flex: 1 },
  pickPressed: { opacity: 0.85 },
  pickCard: { flex: 1, borderRadius: RADIUS.xl, padding: SPACING.md, gap: SPACING.xs, borderWidth: 2 },
  pickTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pickCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  pickName: { fontSize: 16, fontWeight: '700', marginTop: SPACING.xs },
  pickDesc: { fontSize: 13, lineHeight: 18 },
  pickMetaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.xs },
  pickBadgePill: { borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 2 },
  pickBadge: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' as const },
  pickMeta: { fontSize: 12, fontWeight: '500' },

  // Slim notification banner — replaces the old full card.
  banner: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, borderRadius: RADIUS.full, paddingVertical: 10, paddingHorizontal: SPACING.md },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '500' },
  bannerAction: { fontSize: 13, fontWeight: '700' },

  // Shared surfaces.
  card: { borderRadius: RADIUS.xl, padding: SPACING.md },
  prereqHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  prereqIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  stepBody: { fontSize: 14, lineHeight: 21 },
  apLead: { paddingBottom: SPACING.sm },

  // Timeline — left rail, number nodes, connector line.
  tlStep: { flexDirection: 'row', gap: SPACING.sm },
  tlRail: { width: 28, alignItems: 'center' },
  tlNode: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tlNodeText: { fontSize: 14, fontWeight: '700' },
  tlLine: { flex: 1, width: 1.5, marginTop: 4 },
  tlContent: { flex: 1, gap: SPACING.xs, paddingBottom: SPACING.xl },
  tlContentLast: { paddingBottom: 0 },
  tlTitle: { fontSize: 16, fontWeight: '700' },
  tlCta: { marginTop: SPACING.xs },
  // Step screenshot tile — outer carries the neu shadow (NO overflow), inner
  // clips the image to the rounded corner (seam rule). EXPLICIT dimensions
  // (590×1280 source ratio): percentage width + aspectRatio inside the flexed
  // timeline row rendered a giant zoom-crop on device.
  photoCard: { borderRadius: RADIUS.lg, marginTop: SPACING.sm, alignSelf: 'center' },
  photoClip: { borderRadius: RADIUS.lg, overflow: 'hidden' },
  photo: { width: PHOTO_W, height: PHOTO_H },
  // Corner hint so the shot reads as tappable — sits INSIDE the clip, so it
  // never touches the shadowed outer (seam rule).
  photoZoomBadge: {
    position: 'absolute', right: 5, bottom: 5,
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },

  // Full-screen photo viewer.
  zoomRoot: { flex: 1 },
  zoomTapArea: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.md },
  zoomImage: { width: '100%', height: '100%' },
  zoomFooter: { alignItems: 'center', paddingTop: SPACING.sm, paddingBottom: SPACING.md },

  // Done strip — positive closer after a checklist.
  doneStrip: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, borderRadius: RADIUS.lg, padding: SPACING.md },
  doneText: { flex: 1, fontSize: 13, lineHeight: 19 },

  keyBox: { borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.sm, marginTop: SPACING.xs },
  key: { fontSize: 17, fontWeight: '700', letterSpacing: 1 },
  caption: { fontSize: 13, fontStyle: 'italic' },
  diagRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  diagValue: { fontSize: 14, fontWeight: '600' },
  revoke: { alignItems: 'center', paddingVertical: 12 },
});
