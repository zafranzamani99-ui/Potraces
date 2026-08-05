import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Switch,
  Alert,
  Keyboard,
  Linking,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Feather, Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useNeu } from '../../components/common/neu';
import { signInWithGoogle, statusCodes, hasGoogleDriveAccess, connectGoogleDrive, getConnectedGoogleEmail, disconnectGoogle } from '../../services/googleAuth';
import { signInWithApple } from '../../services/appleAuth';
import { signOut, getAuthSession, signInWithPhone, signUpWithPhone, deleteAccountRemote, clearPersonalDataRemote, supabasePersonal } from '../../services/supabase';
import { syncPersonal, disablePersonalSync } from '../../services/personalSync';
import { revokeQuickLogKey } from '../../services/quickLogKey';
import { confirmReuse } from '../../services/reuseAccount';
import { planDelete } from '../../services/deleteAccountFlow';
import { resetBackoff } from '../../services/syncBackoff';
import { runCloudBackupDrain, enqueueAllReceiptsForDriveBackup } from '../../services/cloudBackupRunner';
import { pendingBackupJobCount, clearBackupQueue, retryFailedBackupJobs } from '../../services/cloudBackupQueue';
import { fullResyncTransactions } from '../../services/sheetsSync';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useBackupStore } from '../../store/backupStore';
import { usePremiumStore } from '../../store/premiumStore';
import { CLOUD_BACKUP_ENABLED } from '../../constants/flags';
import PaywallModal from '../../components/common/PaywallModal';
import { useToast } from '../../context/ToastContext';
import { lightTap } from '../../services/haptics';
import { useT } from '../../i18n';

const PRIVACY_URL = 'https://jejakbaki.my/privacy.html';

// Official 4-color Google "G". ponytail: brand hex is spec-mandated, not theme tokens;
// mirrors AuthScreen's logo — extract to a shared component if a third caller appears.
const GoogleGLogo = ({ size = 18 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </Svg>
);

/**
 * AccountScreen — the personal-mode account + cloud-backup hub.
 *
 * Signed OUT: a trust-building "back up your money" sign-in. Three paths:
 *   • Google / Apple — frictionless, pre-verified.
 *   • Phone + password — for users who don't use Google/Apple. NOTE: personal
 *     phone sign-in does NOT use the Telegram OTP (that's seller verification);
 *     a Supabase session alone is all personal backup needs. We set provider
 *     'phone' but deliberately leave `isVerified` untouched, so business mode
 *     still enforces its own seller-verification gate.
 *
 * Signed IN: identity + cloud-backup toggle + last-synced + sign out, all here,
 * so Settings no longer carries a separate buried sync section.
 */
export default function AccountScreen() {
  const C = useCalm();
  const isDark = useIsDark();
  const neu = useNeu(undefined, { faintDark: true });
  const tr = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  // Set when another screen (e.g. Quick Log setup) sent the user here just to
  // enable Cloud Backup: return there on success and skip unrelated prompts.
  const returnTo = route.params?.returnTo as string | undefined;
  // Optional params to hand back to the returnTo screen (e.g. CollectzJoin's
  // share code, so the participant lands back on the same session).
  const returnParams = route.params?.returnParams as Record<string, unknown> | undefined;
  const { showToast } = useToast();

  const isAuthenticated = useAuthStore((s) => s.personal.isAuthenticated);
  const provider = useAuthStore((s) => s.personal.provider);
  const personalSyncEnabled = useSettingsStore((s) => s.personalSyncEnabled);
  const lastPersonalSyncAt = useSettingsStore((s) => s.lastPersonalSyncAt);
  const lastPersonalSyncError = useSettingsStore((s) => s.lastPersonalSyncError);
  // Google Backup (Drive receipts + Sheets) — separate from the Supabase
  // personal sync above: these ride the NATIVE Google session, so they work
  // for Apple/phone accounts too.
  const googleDriveEmail = useSettingsStore((s) => s.googleDriveEmail);
  const driveBackupEnabled = useSettingsStore((s) => s.driveBackupEnabled);
  const googleSheetsSyncEnabled = useSettingsStore((s) => s.googleSheetsSyncEnabled);
  const backupWifiOnly = useSettingsStore((s) => s.backupWifiOnly);
  const lastDriveBackupAt = useSettingsStore((s) => s.lastDriveBackupAt);
  const lastDriveBackupError = useSettingsStore((s) => s.lastDriveBackupError);
  const lastSheetsSyncAt = useSettingsStore((s) => s.lastSheetsSyncAt);
  const lastSheetsSyncError = useSettingsStore((s) => s.lastSheetsSyncError);
  const spreadsheetId = useBackupStore((s) => s.spreadsheetId);

  const [email, setEmail] = useState<string | null>(null);
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [backupPaywallVisible, setBackupPaywallVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Google Backup in-flight action (drives button spinners + disables rows).
  const [googleBusy, setGoogleBusy] = useState<'connect' | 'disconnect' | 'drive' | 'sheets' | 'resync' | 'backup' | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  // Phone form
  const [isLogin, setIsLogin] = useState(true);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [error, setError] = useState('');
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const busy = !!socialLoading || phoneLoading;

  // Pull the email off the live Supabase session for the profile card.
  useEffect(() => {
    let alive = true;
    if (isAuthenticated) {
      getAuthSession(supabasePersonal)
        .then((s) => { if (alive) setEmail((s?.user as any)?.email ?? null); })
        .catch(() => {});
    } else {
      setEmail(null);
    }
    return () => { alive = false; };
  }, [isAuthenticated]);

  const enableBackup = useCallback(async () => {
    // Demo-data guard: if the user explored with sample data and is now signing
    // in for real, drop that sample data LOCALLY before enabling sync — so it
    // never pushes into their real cloud account. localOnly keeps the real
    // account's existing cloud rows intact for pullAll to bring down. Runs
    // before setPersonalSyncEnabled(true) so no push (here or via
    // PersonalSyncManager) can start while sample data is still present.
    const settings = useSettingsStore.getState();
    if (settings.sampleDataLoaded) {
      await settings.clearSampleData({ localOnly: true });
    }
    // Cloud backup is a PAID feature. Signing in must NOT silently enable it for a free
    // user — that bypassed the toggle's own paywall (every sign-in path called this).
    // Auth still succeeded; the user can upgrade and flip the toggle (which enforces the
    // paywall via hasCloudBackup) any time.
    if (!usePremiumStore.getState().hasCloudBackup()) {
      // Only nudge to upgrade if backup isn't already running — a grandfathered free user
      // whose sync is on must not be told "backup is a paid feature" (it contradicts reality).
      // Skip the nudge when arriving from the Quick Log gate: they signed in for the FREE
      // feature, and a paid-backup toast there reads as a bait-and-switch.
      if (!useSettingsStore.getState().personalSyncEnabled && returnTo !== 'QuickLogSetup') {
        showToast(CLOUD_BACKUP_ENABLED ? tr.settings.cloudBackupPaid : tr.settings.cloudBackupBeta, 'info');
      }
      if (returnTo) navigation.navigate(returnTo as never, returnParams as never);
      return;
    }
    useSettingsStore.getState().setPersonalSyncEnabled(true);
    showToast(tr.auth.acctBackingUp, 'info');
    // Came from another screen's gate (Quick Log setup)? Take the user back
    // there immediately — the sync continues in the background.
    if (returnTo) navigation.navigate(returnTo as never, returnParams as never);
    try {
      await syncPersonal();
      showToast(tr.settings.syncedToCloud, 'success');
    } catch {
      showToast(tr.settings.syncFailedRetry, 'info');
    }
  }, [showToast, tr, returnTo, returnParams, navigation]);

  const handleGoogle = useCallback(async () => {
    if (busy) return;
    lightTap();
    setSocialLoading('google');
    try {
      const result = await signInWithGoogle(supabasePersonal);
      useAuthStore.getState().setPersonalAuth({
        isAuthenticated: true, userId: result.userId, provider: 'google',
      });
      // Google profile photo becomes the avatar — and it STAYS (re-synced on
      // every sign-in, matching Google's auto-update; a manual preset pick
      // overrides it until the next sign-in).
      getAuthSession(supabasePersonal)
        .then((s) => {
          const url = (s?.user as { user_metadata?: { avatar_url?: unknown } })?.user_metadata?.avatar_url;
          if (typeof url === 'string' && url) useSettingsStore.getState().setAvatarUri(url);
        })
        .catch(() => {});
      await enableBackup();
      // Skip the cross-mode reuse prompt when the user came here mid-setup
      // from another screen — it derails the flow they were in.
      if (!returnTo) confirmReuse('business', { provider: 'google' }, tr);
    } catch (e: any) {
      if (e?.code === statusCodes.SIGN_IN_CANCELLED) return;
      console.warn('[personal google sign-in] failed:', e?.status, e?.code, e?.message ?? e);
      if (e?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) showToast(tr.auth.playServicesRequired, 'info');
      else showToast(Platform.OS === 'ios' ? tr.auth.googleFailedTryApple : tr.auth.socialSignInFailed, 'info');
    } finally {
      setSocialLoading(null);
    }
  }, [busy, enableBackup, showToast, tr, returnTo]);

  const handleApple = useCallback(async () => {
    if (busy) return;
    lightTap();
    setSocialLoading('apple');
    try {
      const result = await signInWithApple(supabasePersonal);
      useAuthStore.getState().setPersonalAuth({
        isAuthenticated: true, userId: result.userId, provider: 'apple',
      });
      await enableBackup();
      if (!returnTo) confirmReuse('business', { provider: 'apple' }, tr);
    } catch (e: any) {
      if (e?.code === 'ERR_CANCELED' || e?.code === '1001') return;
      console.warn('[personal apple sign-in] failed:', e?.status, e?.code, e?.message ?? e);
      showToast(tr.auth.socialSignInFailed, 'info');
    } finally {
      setSocialLoading(null);
    }
  }, [busy, enableBackup, showToast, tr, returnTo]);

  const cleanPhone = useCallback((raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('0')) return '60' + digits.slice(1);
    if (digits.startsWith('60')) return digits;
    return digits;
  }, []);

  const handlePhoneSubmit = useCallback(async () => {
    if (busy) return;
    setError('');
    const cleaned = cleanPhone(phone);
    if (cleaned.length < 10) { setError(tr.auth.errEnterValidPhone); return; }
    if (password.length < 6) { setError(tr.auth.errPasswordLen); return; }
    if (!isLogin && password !== confirmPassword) { setError(tr.auth.errPasswordMismatch); return; }

    Keyboard.dismiss();
    lightTap();
    setPhoneLoading(true);
    try {
      const data = isLogin
        ? await signInWithPhone(cleaned, password, supabasePersonal)
        : await signUpWithPhone(cleaned, password, supabasePersonal);
      if (data.session) {
        // Personal backup needs only a session — no seller profile, no OTP.
        // Business mode keeps its own independent account + verification gate.
        useAuthStore.getState().setPersonalAuth({
          isAuthenticated: true, userId: data.session.user.id, phone: cleaned, provider: 'phone',
        });
        await enableBackup();
        confirmReuse('business', { provider: 'phone', phone: cleaned, password }, tr);
      }
    } catch (e: any) {
      const msg = e?.message || tr.auth.errSomethingWrong;
      if (msg.includes('Invalid login')) setError(tr.auth.errWrongCreds);
      else if (msg.includes('already registered') || msg.includes('already been registered')) setError(tr.auth.errAlreadyRegistered);
      else setError(msg.toLowerCase());
    } finally {
      setPhoneLoading(false);
    }
  }, [busy, cleanPhone, phone, password, confirmPassword, isLogin, enableBackup, tr]);

  const handleSyncNow = useCallback(async () => {
    if (syncing) return;
    lightTap();
    setSyncing(true);
    resetBackoff('personalSync');
    showToast(tr.settings.syncing, 'info');
    try {
      await syncPersonal();
      showToast(tr.settings.synced, 'success');
    } catch {
      showToast(tr.settings.syncFailed, 'info');
    } finally {
      setSyncing(false);
    }
  }, [syncing, showToast, tr]);

  const handleToggleBackup = useCallback((value: boolean) => {
    lightTap();
    if (value) {
      // Beta lock takes precedence over the paywall — don't dangle a dead-end upgrade.
      if (!CLOUD_BACKUP_ENABLED) { showToast(tr.settings.cloudBackupBeta, 'info'); return; }
      // Cloud backup is a paid feature — free users get the paywall, not sync.
      if (!usePremiumStore.getState().hasCloudBackup()) { setBackupPaywallVisible(true); return; }
      enableBackup();
      return;
    }
    Alert.alert(tr.settings.turnOffCloudSync, tr.settings.turnOffCloudSyncMsg, [
      { text: tr.common.cancel, style: 'cancel' },
      {
        text: tr.settings.turnOff,
        // Revoke the Quick Log key too: with sync off the app never drains,
        // so a live key would keep producing FALSE "Logged RM…" pushes.
        onPress: async () => { await revokeQuickLogKey().catch(() => {}); await disablePersonalSync(false); showToast(tr.settings.cloudSyncDisabled, 'info'); },
      },
      {
        text: tr.settings.turnOffWipe,
        style: 'destructive',
        onPress: async () => { await revokeQuickLogKey().catch(() => {}); await disablePersonalSync(true); showToast(tr.settings.cloudSyncDisabledWiped, 'info'); },
      },
    ]);
  }, [enableBackup, showToast, tr]);

  // ── Google Backup (Drive + Sheets) ──────────────────────────────────────
  const needsReconnect = lastDriveBackupError === 'NEEDS_REAUTH' || lastSheetsSyncError === 'NEEDS_REAUTH';

  const refreshPending = useCallback(async () => {
    try {
      setPendingCount(await pendingBackupJobCount());
    } catch {}
  }, []);

  // Queue depth: load on focus, then poll every 5s while THIS screen is
  // focused only — the interval dies on blur/unmount.
  useFocusEffect(
    useCallback(() => {
      refreshPending();
      const id = setInterval(refreshPending, 5000);
      return () => clearInterval(id);
    }, [refreshPending]),
  );

  // Drive-only native connect — the app account (Google/Apple/phone) is untouched.
  const handleGoogleConnect = useCallback(async () => {
    if (googleBusy) return;
    lightTap();
    setGoogleBusy('connect');
    try {
      if (!(await hasGoogleDriveAccess())) await connectGoogleDrive();
      useSettingsStore.getState().setGoogleDriveEmail(await getConnectedGoogleEmail());
    } catch (e: any) {
      if (e?.code === statusCodes.SIGN_IN_CANCELLED) return; // user bailed — silent
      showToast(e?.message || tr.auth.errSomethingWrong, 'error');
    } finally {
      setGoogleBusy(null);
    }
  }, [googleBusy, showToast, tr]);

  const handleGoogleDisconnect = useCallback(() => {
    if (googleBusy) return;
    lightTap();
    Alert.alert(tr.settings.googleBackup.disconnectConfirmTitle, tr.settings.googleBackup.disconnectConfirmMsg, [
      { text: tr.common.cancel, style: 'cancel' },
      {
        text: tr.settings.googleBackup.disconnect,
        style: 'destructive',
        onPress: async () => {
          setGoogleBusy('disconnect');
          try {
            await disconnectGoogle();
            useSettingsStore.getState().setGoogleDriveEmail(null);
            // Nothing may re-upload against an account that is no longer linked.
            await clearBackupQueue();
            useBackupStore.getState().resetGoogleBackup();
            const settings = useSettingsStore.getState();
            settings.setDriveBackupEnabled(false);
            settings.setGoogleSheetsSyncEnabled(false);
            refreshPending();
          } finally {
            setGoogleBusy(null);
          }
        },
      },
    ]);
  }, [googleBusy, tr, refreshPending]);

  // Same gate order as the personal cloud-backup toggle (beta lock → paywall),
  // plus a Google connection before anything can run.
  const handleToggleDriveBackup = useCallback((value: boolean) => {
    lightTap();
    if (!value) { useSettingsStore.getState().setDriveBackupEnabled(false); return; }
    if (!CLOUD_BACKUP_ENABLED) { showToast(tr.settings.cloudBackupBeta, 'info'); return; }
    if (!usePremiumStore.getState().hasCloudBackup()) { setBackupPaywallVisible(true); return; }
    if (!useSettingsStore.getState().googleDriveEmail) { showToast(tr.settings.googleBackup.connectFirst, 'info'); return; }
    useSettingsStore.getState().setDriveBackupEnabled(true);
    (async () => {
      setGoogleBusy('drive');
      try {
        // Catch up the existing receipt backlog, then drain right away. The
        // drain isolates + records per-job errors itself — nothing to catch.
        await enqueueAllReceiptsForDriveBackup();
        await runCloudBackupDrain();
      } catch {
        // Unexpected (the drain does not throw per-job errors) — leave the
        // queue as-is; the next drain retries.
      } finally {
        setGoogleBusy(null);
        refreshPending();
      }
    })();
  }, [showToast, tr, refreshPending]);

  const handleToggleSheetsSync = useCallback((value: boolean) => {
    lightTap();
    if (!value) { useSettingsStore.getState().setGoogleSheetsSyncEnabled(false); return; }
    if (!CLOUD_BACKUP_ENABLED) { showToast(tr.settings.cloudBackupBeta, 'info'); return; }
    if (!usePremiumStore.getState().hasCloudBackup()) { setBackupPaywallVisible(true); return; }
    if (!useSettingsStore.getState().googleDriveEmail) { showToast(tr.settings.googleBackup.connectFirst, 'info'); return; }
    useSettingsStore.getState().setGoogleSheetsSyncEnabled(true);
    (async () => {
      setGoogleBusy('sheets');
      try {
        await runCloudBackupDrain();
      } catch {
        // Same as the Drive toggle — the queue owns retry bookkeeping.
      } finally {
        setGoogleBusy(null);
        refreshPending();
      }
    })();
  }, [showToast, tr, refreshPending]);

  const handleOpenSheet = useCallback(() => {
    if (!spreadsheetId) return;
    lightTap();
    Linking.openURL(`https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
  }, [spreadsheetId]);

  const handleFullResync = useCallback(() => {
    if (googleBusy) return;
    lightTap();
    if (!useSettingsStore.getState().googleDriveEmail) { showToast(tr.settings.googleBackup.connectFirst, 'info'); return; }
    Alert.alert(tr.settings.googleBackup.fullResyncConfirmTitle, tr.settings.googleBackup.fullResyncConfirmMsg, [
      { text: tr.common.cancel, style: 'cancel' },
      {
        text: tr.common.confirm,
        onPress: async () => {
          setGoogleBusy('resync');
          try {
            await fullResyncTransactions();
            showToast(tr.settings.googleBackup.sheetSyncDone, 'success');
          } catch (e: any) {
            showToast(e?.message || tr.auth.errSomethingWrong, 'error');
          } finally {
            setGoogleBusy(null);
          }
        },
      },
    ]);
  }, [googleBusy, showToast, tr]);

  const handleBackUpNow = useCallback(async () => {
    if (googleBusy) return;
    lightTap();
    if (!useSettingsStore.getState().googleDriveEmail) { showToast(tr.settings.googleBackup.connectFirst, 'info'); return; }
    setGoogleBusy('backup');
    try {
      await runCloudBackupDrain();
      showToast(tr.settings.googleBackup.backupDone, 'success');
    } catch (e: any) {
      showToast(e?.message || tr.auth.errSomethingWrong, 'error');
    } finally {
      setGoogleBusy(null);
      refreshPending();
    }
  }, [googleBusy, showToast, tr, refreshPending]);

  const handleToggleWifiOnly = useCallback((value: boolean) => {
    lightTap();
    useSettingsStore.getState().setBackupWifiOnly(value);
  }, []);

  // Expired Google access: reconnect natively, then re-arm the failed jobs and
  // drain. The drain re-stamps NEEDS_REAUTH if the session is somehow still dead.
  const handleReconnect = useCallback(async () => {
    if (googleBusy) return;
    lightTap();
    setGoogleBusy('connect');
    try {
      if (!(await hasGoogleDriveAccess())) await connectGoogleDrive();
      const settings = useSettingsStore.getState();
      settings.setGoogleDriveEmail(await getConnectedGoogleEmail());
      // Re-auth just succeeded, so the stamps are stale — clear them even when
      // the queue is empty (a drain only clears them when it completes jobs).
      if (settings.lastDriveBackupError === 'NEEDS_REAUTH') settings.setLastDriveBackupError(null);
      if (settings.lastSheetsSyncError === 'NEEDS_REAUTH') settings.setLastSheetsSyncError(null);
      await retryFailedBackupJobs();
      await runCloudBackupDrain();
      refreshPending();
    } catch (e: any) {
      if (e?.code !== statusCodes.SIGN_IN_CANCELLED) showToast(e?.message || tr.auth.errSomethingWrong, 'error');
    } finally {
      setGoogleBusy(null);
    }
  }, [googleBusy, showToast, tr, refreshPending]);

  const handleSignOut = useCallback(() => {
    lightTap();
    Alert.alert(tr.auth.acctSignOutTitle, tr.auth.acctSignOutMsg, [
      { text: tr.common.cancel, style: 'cancel' },
      {
        text: tr.settings.signOut,
        style: 'destructive',
        onPress: async () => {
          // Revoke Quick Log first — needs the live session, and prevents
          // false "Logged" pushes to an account nobody is signed into.
          await revokeQuickLogKey().catch(() => {});
          await disablePersonalSync(false);
          signOut(supabasePersonal).catch(() => {});
          useAuthStore.getState().resetPersonal();
        },
      },
    ]);
  }, [tr]);

  const handleDeleteAccount = useCallback(() => {
    if (deleting) return;
    lightTap();
    Alert.alert(tr.auth.acctDeleteTitle, tr.auth.acctDeleteWarning, [
      { text: tr.common.cancel, style: 'cancel' },
      {
        text: tr.auth.acctDeleteCta,
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            const { business, personal } = useAuthStore.getState();
            const plan = planDelete('personal', business.userId, personal.userId);
            // Server FIRST (needs the live session). Throws on failure so we never
            // wipe the device while the account still lives server-side.
            if (plan === 'data-only') {
              // Same account is also signed into business — deleting the auth user
              // would orphan business. Wipe only personal cloud rows, keep the user.
              Alert.alert(tr.auth.acctDeleteSharedTitle, tr.auth.acctDeleteSharedMsg);
              await clearPersonalDataRemote(supabasePersonal);
            } else {
              // Distinct (or personal-only) account — safe to delete the auth user.
              await deleteAccountRemote(supabasePersonal);
            }
            // Wipe personal on-device data + sign the personal client out. Business
            // stores are left intact — that's a separate account now.
            await useSettingsStore.getState().clearPersonalData();
            await disablePersonalSync(false);
            await signOut(supabasePersonal).catch(() => {});
            useAuthStore.getState().resetPersonal();
            showToast(tr.auth.acctDeleteDone, 'success');
          } catch {
            setDeleting(false);
            showToast(tr.auth.acctDeleteFailed, 'info');
          }
        },
      },
    ]);
  }, [deleting, showToast, tr]);

  const providerName =
    provider === 'apple' ? tr.auth.acctProviderApple
      : provider === 'phone' ? tr.auth.acctProviderPhone
        : tr.auth.acctProviderGoogle;
  const avatarInitial = (email?.[0] ?? providerName?.[0] ?? '?').toUpperCase();

  const benefits = [
    { icon: 'cloud' as const, title: tr.auth.acctBenefitBackup, desc: tr.auth.acctBenefitBackupDesc },
    { icon: 'smartphone' as const, title: tr.auth.acctBenefitDevices, desc: tr.auth.acctBenefitDevicesDesc },
    { icon: 'lock' as const, title: tr.auth.acctBenefitPrivate, desc: tr.auth.acctBenefitPrivateDesc },
  ];

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(80, insets.bottom + 40) }]}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        bottomOffset={32}
      >
        <View style={styles.contentWrap}>
          {!isAuthenticated ? (
            <>
              {/* Hero */}
              <View style={styles.hero}>
                <View style={styles.iconCircle}>
                  <Feather name="cloud" size={28} color={C.accent} />
                </View>
                <Text style={styles.heroTitle}>{tr.auth.acctBackupTitle}</Text>
                <Text style={styles.heroSubtitle}>{tr.auth.acctBackupSubtitle}</Text>
              </View>

              {/* Benefits */}
              <View style={styles.benefits}>
                {benefits.map((b) => (
                  <View key={b.icon} style={styles.benefitRow}>
                    <View style={styles.benefitIcon}>
                      <Feather name={b.icon} size={16} color={C.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.benefitTitle}>{b.title}</Text>
                      <Text style={styles.benefitDesc}>{b.desc}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Google */}
              <Pressable
                style={[styles.socialBtn, socialLoading === 'google' && { opacity: 0.6 }]}
                onPress={handleGoogle}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={tr.auth.continueWithGoogle}
              >
                {({ pressed }) => (
                  <View style={[styles.socialBtnInner, pressed && { opacity: 0.85 }]}>
                    {socialLoading === 'google' ? (
                      <ActivityIndicator color={C.textPrimary} size="small" />
                    ) : (
                      <>
                        <GoogleGLogo size={18} />
                        <Text style={styles.socialBtnText}>{tr.auth.continueWithGoogle}</Text>
                      </>
                    )}
                  </View>
                )}
              </Pressable>

              {/* Apple (iOS only) — matching white pill + real Apple mark.
                  Equal-size pills keep Apple as prominent as Google. */}
              {Platform.OS === 'ios' && (
                <Pressable
                  style={[styles.socialBtn, socialLoading === 'apple' && { opacity: 0.6 }]}
                  onPress={handleApple}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={tr.auth.continueWithApple}
                >
                  {({ pressed }) => (
                    <View style={[styles.socialBtnInner, pressed && { opacity: 0.85 }]}>
                      {socialLoading === 'apple' ? (
                        <ActivityIndicator color={C.textPrimary} size="small" />
                      ) : (
                        <>
                          <Ionicons name="logo-apple" size={19} color={C.textPrimary} />
                          <Text style={styles.socialBtnText}>{tr.auth.continueWithApple}</Text>
                        </>
                      )}
                    </View>
                  )}
                </Pressable>
              )}

              {/* Divider */}
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{tr.auth.orContinueWith}</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Phone + password (no OTP for personal) */}
              <View style={styles.toggle}>
                <Pressable
                  style={[styles.toggleBtn, isLogin && styles.toggleActive]}
                  onPress={() => { setIsLogin(true); setError(''); }}
                >
                  <Text style={[styles.toggleText, isLogin && styles.toggleTextActive]}>{tr.auth.signIn}</Text>
                </Pressable>
                <Pressable
                  style={[styles.toggleBtn, !isLogin && styles.toggleActive]}
                  onPress={() => { setIsLogin(false); setError(''); }}
                >
                  <Text style={[styles.toggleText, !isLogin && styles.toggleTextActive]}>{tr.auth.signUp}</Text>
                </Pressable>
              </View>

              <View style={styles.fieldCard}>
                <Text style={styles.fieldLabel}>{tr.auth.phoneNumber}</Text>
                <View style={styles.phoneRow}>
                  <View style={styles.prefixBox}>
                    <Text style={styles.prefixText}>+60</Text>
                  </View>
                  <TextInput
                    style={[styles.fieldInput, { flex: 1 }]}
                    placeholder={tr.auth.phonePlaceholder}
                    placeholderTextColor={withAlpha(C.textPrimary, 0.25)}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    returnKeyType="next"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                    selectionColor={withAlpha(C.accent, 0.25)}
                  />
                </View>
              </View>

              <View style={styles.fieldCard}>
                <Text style={styles.fieldLabel}>{tr.auth.password}</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    ref={passwordRef}
                    style={[styles.fieldInput, { flex: 1, paddingRight: 36 }]}
                    placeholder={tr.auth.passwordPlaceholder}
                    placeholderTextColor={withAlpha(C.textPrimary, 0.25)}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoComplete={isLogin ? 'password' : 'new-password'}
                    returnKeyType={isLogin ? 'done' : 'next'}
                    onSubmitEditing={() => {
                      if (!isLogin) confirmRef.current?.focus();
                      else handlePhoneSubmit();
                    }}
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                    selectionColor={withAlpha(C.accent, 0.25)}
                  />
                  <Pressable
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={tr.auth.password}
                  >
                    <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={C.textMuted} />
                  </Pressable>
                </View>
              </View>

              {!isLogin && (
                <View style={styles.fieldCard}>
                  <Text style={styles.fieldLabel}>{tr.auth.confirmPassword}</Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      ref={confirmRef}
                      style={[styles.fieldInput, { flex: 1, paddingRight: 36 }]}
                      placeholder={tr.auth.confirmPasswordPlaceholder}
                      placeholderTextColor={withAlpha(C.textPrimary, 0.25)}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showPassword}
                      autoComplete="new-password"
                      returnKeyType="done"
                      onSubmitEditing={handlePhoneSubmit}
                      keyboardAppearance={isDark ? 'dark' : 'light'}
                      selectionColor={withAlpha(C.accent, 0.25)}
                    />
                  </View>
                </View>
              )}

              {error ? (
                <View style={styles.errorBox}>
                  <Feather name="alert-circle" size={14} color={C.bronze} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                style={[styles.submitBtn, busy && { opacity: 0.6 }]}
                onPress={handlePhoneSubmit}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={isLogin ? tr.auth.signIn : tr.auth.createAccount}
              >
                {({ pressed }) => (
                  <View style={[styles.submitBtnInner, pressed && { opacity: 0.85 }]}>
                    {phoneLoading ? (
                      <ActivityIndicator color={C.onAccent} size="small" />
                    ) : (
                      <>
                        <Feather name={isLogin ? 'log-in' : 'user-plus'} size={16} color={C.onAccent} />
                        <Text style={styles.submitText}>{isLogin ? tr.auth.signIn : tr.auth.createAccount}</Text>
                      </>
                    )}
                  </View>
                )}
              </Pressable>

              <Pressable
                style={styles.switchHint}
                onPress={() => { setIsLogin(!isLogin); setError(''); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.switchHintText}>
                  {isLogin ? tr.auth.noAccountYet : tr.auth.alreadyHaveAccount}
                </Text>
              </Pressable>

              {/* Privacy footnote */}
              <Text style={styles.footnote}>
                {tr.auth.acctAgreePrefix}{' '}
                <Text style={styles.footnoteLink} onPress={() => Linking.openURL(PRIVACY_URL)}>
                  {tr.auth.acctPrivacyPolicy}
                </Text>
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.pageTitle}>{tr.auth.acctTitle}</Text>

              {/* Profile */}
              <View style={[styles.card, neu.raisedSoft]}>
                <View style={styles.profileRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{avatarInitial}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    {email ? <Text style={styles.profileEmail} numberOfLines={1}>{email}</Text> : null}
                    <Text style={styles.profileProvider}>
                      {tr.auth.acctSignedInWith} {providerName}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Cloud backup */}
              <View style={[styles.card, neu.raisedSoft]}>
                <View style={styles.settingRow}>
                  <View style={styles.settingLabelWrap}>
                    <View style={styles.settingLabelRow}>
                      <Feather name="cloud" size={18} color={C.textSecondary} />
                      <Text style={styles.settingLabel}>{tr.auth.acctCloudBackup}</Text>
                    </View>
                    <Text style={styles.settingDesc}>{tr.auth.acctCloudBackupDesc}</Text>
                  </View>
                  <Switch
                    value={personalSyncEnabled}
                    onValueChange={handleToggleBackup}
                    trackColor={{ false: C.border, true: C.positive }}
                    thumbColor={C.surface}
                  />
                </View>

                {/* A failed / paused backup must never be silent — the sync engine
                    records a code and we surface it here (shown even when a schema
                    error auto-disabled the toggle). */}
                {!!lastPersonalSyncError && (
                  <View style={styles.syncIssueRow}>
                    <Feather name="alert-triangle" size={16} color={C.bronze} />
                    <Text style={styles.syncIssueText}>
                      {lastPersonalSyncError === 'schema'
                        ? tr.settings.syncIssueSchema
                        : lastPersonalSyncError === 'session'
                          ? tr.settings.syncIssueSession
                          : tr.settings.syncIssueIncomplete}
                    </Text>
                  </View>
                )}

                {personalSyncEnabled && (
                  <>
                    <View style={styles.divider} />
                    <View style={styles.settingRow}>
                      <View style={styles.settingLabelWrap}>
                        <View style={styles.settingLabelRow}>
                          <Feather name="refresh-cw" size={18} color={C.textSecondary} />
                          <Text style={styles.settingLabel}>{tr.settings.lastSync}</Text>
                        </View>
                        <Text style={styles.settingDesc}>
                          {lastPersonalSyncAt ? lastPersonalSyncAt.toLocaleString() : tr.settings.notSyncedYet}
                        </Text>
                      </View>
                      <Pressable
                        onPress={handleSyncNow}
                        disabled={syncing}
                        style={[styles.syncNowBtn, syncing && { opacity: 0.6 }]}
                        accessibilityRole="button"
                        accessibilityLabel={tr.settings.syncNow}
                      >
                        {syncing
                          ? <ActivityIndicator color={C.accent} size="small" />
                          : <Text style={styles.syncNowText}>{tr.settings.syncNow}</Text>}
                      </Pressable>
                    </View>
                  </>
                )}
              </View>

              {/* Google Backup — Drive receipts + Sheets sync via the native
                  Google session (any sign-in provider). */}
              <Text style={styles.sectionTitle}>{tr.settings.googleBackup.sectionTitle}</Text>
              <View style={[styles.card, neu.raisedSoft]}>
                {needsReconnect && (
                  <Pressable
                    style={[styles.syncIssueRow, { marginTop: SPACING.sm }]}
                    onPress={handleReconnect}
                    disabled={googleBusy !== null}
                    accessibilityRole="button"
                    accessibilityLabel={tr.settings.googleBackup.reconnect}
                  >
                    <Feather name="alert-triangle" size={16} color={C.bronze} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reconnectTitle}>{tr.settings.googleBackup.reconnect}</Text>
                      <Text style={styles.syncIssueText}>{tr.settings.googleBackup.reconnectMsg}</Text>
                    </View>
                    {googleBusy === 'connect' && <ActivityIndicator color={C.bronze} size="small" />}
                  </Pressable>
                )}

                {/* Connection */}
                {googleDriveEmail == null ? (
                  <Pressable
                    style={[styles.socialBtn, { marginTop: SPACING.sm }, googleBusy !== null && { opacity: 0.6 }]}
                    onPress={handleGoogleConnect}
                    disabled={googleBusy !== null}
                    accessibilityRole="button"
                    accessibilityLabel={tr.settings.googleBackup.connect}
                  >
                    {({ pressed }) => (
                      <View style={[styles.socialBtnInner, pressed && { opacity: 0.85 }]}>
                        {googleBusy === 'connect' ? (
                          <ActivityIndicator color={C.textPrimary} size="small" />
                        ) : (
                          <>
                            <GoogleGLogo size={18} />
                            <Text style={styles.socialBtnText}>{tr.settings.googleBackup.connect}</Text>
                          </>
                        )}
                      </View>
                    )}
                  </Pressable>
                ) : (
                  <View style={styles.settingRow}>
                    <View style={styles.settingLabelWrap}>
                      <View style={styles.settingLabelRow}>
                        <GoogleGLogo size={18} />
                        <Text style={styles.settingLabel} numberOfLines={1}>
                          {tr.settings.googleBackup.connectedAs} {googleDriveEmail}
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      style={[styles.disconnectBtn, googleBusy !== null && { opacity: 0.6 }]}
                      onPress={handleGoogleDisconnect}
                      disabled={googleBusy !== null}
                      accessibilityRole="button"
                      accessibilityLabel={tr.settings.googleBackup.disconnect}
                    >
                      {googleBusy === 'disconnect'
                        ? <ActivityIndicator color={C.bronze} size="small" />
                        : <Text style={styles.disconnectText}>{tr.settings.googleBackup.disconnect}</Text>}
                    </Pressable>
                  </View>
                )}

                <View style={styles.divider} />

                {/* Drive receipt backup */}
                <View style={styles.settingRow}>
                  <View style={styles.settingLabelWrap}>
                    <View style={styles.settingLabelRow}>
                      <Feather name="upload-cloud" size={18} color={C.textSecondary} />
                      <Text style={styles.settingLabel}>{tr.settings.googleBackup.driveBackup}</Text>
                    </View>
                    <Text style={styles.settingDesc}>{tr.settings.googleBackup.driveBackupDesc}</Text>
                    <Text style={styles.settingDesc}>
                      {tr.settings.googleBackup.lastBackup}: {lastDriveBackupAt ? new Date(lastDriveBackupAt).toLocaleString() : tr.settings.googleBackup.never}
                      {pendingCount > 0 ? ` · ${pendingCount} ${tr.settings.googleBackup.pendingSuffix}` : ''}
                    </Text>
                  </View>
                  <Switch
                    value={driveBackupEnabled}
                    onValueChange={handleToggleDriveBackup}
                    disabled={googleBusy !== null}
                    trackColor={{ false: C.border, true: C.positive }}
                    thumbColor={C.surface}
                  />
                </View>

                <View style={styles.divider} />

                {/* Google Sheets sync */}
                <View style={styles.settingRow}>
                  <View style={styles.settingLabelWrap}>
                    <View style={styles.settingLabelRow}>
                      <Feather name="grid" size={18} color={C.textSecondary} />
                      <Text style={styles.settingLabel}>{tr.settings.googleBackup.sheetsSync}</Text>
                    </View>
                    <Text style={styles.settingDesc}>{tr.settings.googleBackup.sheetsSyncDesc}</Text>
                    <Text style={styles.settingDesc}>{tr.settings.googleBackup.sheetsNote}</Text>
                    <Text style={styles.settingDesc}>
                      {tr.settings.googleBackup.lastBackup}: {lastSheetsSyncAt ? new Date(lastSheetsSyncAt).toLocaleString() : tr.settings.googleBackup.never}
                    </Text>
                  </View>
                  <Switch
                    value={googleSheetsSyncEnabled}
                    onValueChange={handleToggleSheetsSync}
                    disabled={googleBusy !== null}
                    trackColor={{ false: C.border, true: C.positive }}
                    thumbColor={C.surface}
                  />
                </View>

                {/* Open spreadsheet — only once one has been provisioned. */}
                {spreadsheetId && (
                  <>
                    <View style={styles.divider} />
                    <Pressable
                      style={styles.settingRow}
                      onPress={handleOpenSheet}
                      accessibilityRole="button"
                      accessibilityLabel={tr.settings.googleBackup.openSheet}
                    >
                      <View style={styles.settingLabelWrap}>
                        <View style={styles.settingLabelRow}>
                          <Feather name="external-link" size={18} color={C.textSecondary} />
                          <Text style={styles.settingLabel}>{tr.settings.googleBackup.openSheet}</Text>
                        </View>
                      </View>
                      <Feather name="chevron-right" size={18} color={C.textMuted} />
                    </Pressable>
                  </>
                )}

                <View style={styles.divider} />

                {/* Full re-sync */}
                <Pressable
                  style={[styles.settingRow, googleBusy !== null && { opacity: 0.6 }]}
                  onPress={handleFullResync}
                  disabled={googleBusy !== null}
                  accessibilityRole="button"
                  accessibilityLabel={tr.settings.googleBackup.fullResync}
                >
                  <View style={styles.settingLabelWrap}>
                    <View style={styles.settingLabelRow}>
                      <Feather name="refresh-cw" size={18} color={C.textSecondary} />
                      <Text style={styles.settingLabel}>{tr.settings.googleBackup.fullResync}</Text>
                    </View>
                  </View>
                  {googleBusy === 'resync'
                    ? <ActivityIndicator color={C.accent} size="small" />
                    : <Feather name="chevron-right" size={18} color={C.textMuted} />}
                </Pressable>

                <View style={styles.divider} />

                {/* Back up now */}
                <Pressable
                  style={[styles.syncNowBtn, styles.backUpNowBtn, googleBusy !== null && { opacity: 0.6 }]}
                  onPress={handleBackUpNow}
                  disabled={googleBusy !== null}
                  accessibilityRole="button"
                  accessibilityLabel={tr.settings.googleBackup.backUpNow}
                >
                  {googleBusy === 'backup'
                    ? <ActivityIndicator color={C.accent} size="small" />
                    : <Text style={styles.syncNowText}>{tr.settings.googleBackup.backUpNow}</Text>}
                </Pressable>

                <View style={styles.divider} />

                {/* Wi-Fi only */}
                <View style={styles.settingRow}>
                  <View style={styles.settingLabelWrap}>
                    <View style={styles.settingLabelRow}>
                      <Feather name="wifi" size={18} color={C.textSecondary} />
                      <Text style={styles.settingLabel}>{tr.settings.googleBackup.wifiOnly}</Text>
                    </View>
                  </View>
                  <Switch
                    value={backupWifiOnly}
                    onValueChange={handleToggleWifiOnly}
                    trackColor={{ false: C.border, true: C.positive }}
                    thumbColor={C.surface}
                  />
                </View>
              </View>

              {/* Sign out */}
              <Pressable
                style={styles.signOutBtn}
                onPress={handleSignOut}
                accessibilityRole="button"
                accessibilityLabel={tr.settings.signOut}
              >
                {({ pressed }) => (
                  <View style={[styles.signOutInner, pressed && { opacity: 0.7 }]}>
                    <Feather name="log-out" size={16} color={C.bronze} />
                    <Text style={styles.signOutText}>{tr.settings.signOut}</Text>
                  </View>
                )}
              </Pressable>

              {/* Delete account — permanent, server-side (App Store 5.1.1(v) + Play). */}
              <Pressable
                style={styles.deleteAcctBtn}
                onPress={handleDeleteAccount}
                disabled={deleting}
                accessibilityRole="button"
                accessibilityLabel={tr.auth.acctDeleteAccount}
              >
                {({ pressed }) => (
                  <View style={[styles.deleteAcctInner, pressed && { opacity: 0.7 }]}>
                    {deleting ? (
                      <ActivityIndicator color={C.textMuted} size="small" />
                    ) : (
                      <Text style={styles.deleteAcctText}>{tr.auth.acctDeleteAccount}</Text>
                    )}
                  </View>
                )}
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAwareScrollView>
      <PaywallModal
        visible={backupPaywallVisible}
        onClose={() => setBackupPaywallVisible(false)}
        feature="backup"
        reason={tr.settings.cloudBackupPaid}
      />
    </View>
  );
}

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: SPACING.xl,
  },
  // Tablet cap — keep the column readable, centered on wide screens.
  contentWrap: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },

  // ── Signed-out hero ───────────────────────────────────────
  hero: {
    alignItems: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: withAlpha(C.accent, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  heroTitle: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: -0.4,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.regular,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: SPACING.sm,
  },

  // ── Benefits ──────────────────────────────────────────────
  benefits: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.lg,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm + 2,
  },
  benefitIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: withAlpha(C.accent, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  benefitDesc: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    marginTop: 1,
  },

  // ── Social buttons (mirrors AuthScreen) ───────────────────
  socialBtn: {
    width: '100%',
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.full,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginBottom: SPACING.sm + 2,
  },
  socialBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
  },
  socialBtnText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    letterSpacing: 0.2,
  },

  // ── Divider ───────────────────────────────────────────────
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: withAlpha(C.textPrimary, 0.10),
  },
  dividerText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.3,
  },

  // ── Phone form ────────────────────────────────────────────
  toggle: {
    flexDirection: 'row',
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.10 : 0.05),
    borderRadius: RADIUS.md,
    padding: 3,
    marginBottom: SPACING.md,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: SPACING.sm + 1,
    alignItems: 'center',
    borderRadius: RADIUS.sm + 2,
  },
  toggleActive: {
    backgroundColor: C === CALM_DARK ? withAlpha(C.textPrimary, 0.15) : C.surface,
    borderWidth: C === CALM_DARK ? 1 : 0,
    borderColor: withAlpha(C.textPrimary, 0.12),
    ...(C === CALM_DARK ? {} : SHADOWS.xs),
  },
  toggleText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: withAlpha(C.textPrimary, 0.35),
  },
  toggleTextActive: {
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  fieldCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingHorizontal: SPACING.md + 2,
    paddingVertical: SPACING.sm + 4,
    marginBottom: SPACING.sm + 2,
  },
  fieldLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  fieldInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
    paddingVertical: 2,
    minHeight: 22,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  prefixBox: {
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.08 : 0.04),
    borderRadius: RADIUS.sm + 2,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs + 1,
  },
  prefixText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eyeBtn: {
    position: 'absolute',
    right: 0,
    padding: SPACING.xs,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm - 2,
    backgroundColor: withAlpha(C.bronze, 0.08),
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    marginBottom: SPACING.sm + 2,
  },
  errorText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
    flex: 1,
    lineHeight: 18,
  },
  submitBtn: {
    width: '100%',
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.full,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: SPACING.sm,
  },
  submitBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
    letterSpacing: 0.3,
  },
  switchHint: {
    marginTop: SPACING.md,
    alignSelf: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  switchHintText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
  },
  footnote: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    textAlign: 'center',
    marginTop: SPACING.lg,
    lineHeight: 18,
  },
  footnoteLink: {
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // ── Signed-in ─────────────────────────────────────────────
  pageTitle: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: -0.4,
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  // Neu Card — surface + lift from neu.raisedSoft (spread at the call site), not a
  // fill/border (Onyx rule 2). Content self-pads horizontally.
  card: {
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md + 2,
    marginBottom: SPACING.md,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: withAlpha(C.accent, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },
  profileEmail: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  profileProvider: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    marginTop: 2,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  settingLabelWrap: {
    flex: 1,
    paddingRight: SPACING.md,
  },
  settingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  settingLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  settingDesc: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    marginTop: 3,
  },
  divider: {
    height: 1,
    backgroundColor: withAlpha(C.textPrimary, 0.08),
  },
  syncNowBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: C.accent,
    backgroundColor: withAlpha(C.accent, 0.1),
    minWidth: 72,
    alignItems: 'center',
  },
  syncNowText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.accent,
  },
  syncIssueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    marginBottom: SPACING.sm,
    borderRadius: RADIUS.lg,
    backgroundColor: withAlpha(C.bronze, 0.1),
    borderWidth: 1,
    borderColor: withAlpha(C.bronze, 0.25),
  },
  syncIssueText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.bronze,
    lineHeight: TYPOGRAPHY.size.sm * 1.4,
  },
  // ── Google Backup ─────────────────────────────────────────
  sectionTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: -0.2,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  reconnectTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
    marginBottom: 2,
  },
  disconnectBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: withAlpha(C.bronze, 0.5),
    backgroundColor: withAlpha(C.bronze, 0.08),
    minWidth: 72,
    alignItems: 'center',
  },
  disconnectText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },
  backUpNowBtn: {
    alignSelf: 'stretch',
    marginVertical: SPACING.sm,
  },
  signOutBtn: {
    marginTop: SPACING.sm,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  signOutInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  signOutText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },
  deleteAcctBtn: {
    marginTop: SPACING.xs,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  deleteAcctInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    minHeight: 20,
  },
  deleteAcctText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
    textDecorationLine: 'underline',
  },
});
