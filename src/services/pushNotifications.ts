import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabaseBusiness as supabase, supabasePersonal } from './supabase'; // per-mode clients
import { useSettingsStore } from '../store/settingsStore';

// Configure how notifications appear when app is in foreground.
// Two independent master switches (Settings → Preferences): order pushes
// (data.type === 'new_order') follow the business orders toggle; everything
// else (broadcasts, quick-log, payment alerts, reminders) follows the personal
// push toggle.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const s = useSettingsStore.getState();
    const isOrder = notification?.request?.content?.data?.type === 'new_order';
    const enabled = isOrder ? s.orderNotificationsEnabled : s.notificationsEnabled;
    return {
      shouldShowAlert: enabled,
      shouldPlaySound: enabled,
      shouldSetBadge: false,
      shouldShowBanner: enabled,
      shouldShowList: enabled,
    };
  },
});

/**
 * Android notification channel IDs.
 *
 * Android requires every local/remote notification to target a channel; without
 * a matching channel the OS drops the notification onto a silent "Miscellaneous"
 * default. Personal notifications previously had no channel registered, so they
 * could be silenced. Schedulers should pass these IDs as `content.channelId`.
 */
export const ANDROID_CHANNELS = {
  orders: 'orders',
  spendingAlerts: 'spending-alerts',
  subscription: 'bills', // matches subscriptionNotifications.ts existing channel
  qrPaymentReminder: 'qr-payment-reminder',
  collectz: 'collectz',
  broadcast: 'broadcast',
} as const;

/**
 * Create all Android notification channels up front (seller + personal).
 *
 * Safe to call repeatedly and independent of notification permission — creating
 * channels does not require permission and ensures personal notifications
 * (spending alerts, subscription bills, QR payment reminders) render with the
 * right importance/sound the moment they fire. No-op off Android.
 */
export async function registerAndroidNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Promise.all([
      Notifications.setNotificationChannelAsync(ANDROID_CHANNELS.orders, {
        name: 'Pesanan',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
      }),
      Notifications.setNotificationChannelAsync(ANDROID_CHANNELS.spendingAlerts, {
        name: 'Spending alerts',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      }),
      Notifications.setNotificationChannelAsync(ANDROID_CHANNELS.subscription, {
        name: 'Bill reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      }),
      Notifications.setNotificationChannelAsync(ANDROID_CHANNELS.qrPaymentReminder, {
        name: 'Payment reminders',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      }),
      Notifications.setNotificationChannelAsync(ANDROID_CHANNELS.collectz, {
        name: 'Kutipan',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
      }),
      Notifications.setNotificationChannelAsync(ANDROID_CHANNELS.broadcast, {
        name: 'Announcements',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
      }),
    ]);
  } catch (e) {
    if (__DEV__) console.warn('[push] Failed to register Android channels:', e);
  }
}

/**
 * Register for push notifications and save token to Supabase.
 *
 * `promptIfNeeded` controls the OS permission prompt:
 *   - false (default): only register when permission was ALREADY granted. This
 *     is what runs at seller-session startup — returning users keep getting
 *     their token + channel registered, but new users do NOT get a cold,
 *     no-rationale OS prompt the moment they log in (acceptance-rate killer).
 *   - true: actively request permission. Call this from a contextual moment
 *     (e.g. just after the seller creates their first order) so the prompt has
 *     earned context. Delivery works as soon as permission is granted.
 */
export async function registerPushNotifications(
  opts: { promptIfNeeded?: boolean } = {},
): Promise<string | null> {
  const { promptIfNeeded = false } = opts;

  if (!Device.isDevice) {
    return null;
  }

  // Check / request permissions
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    // Only fire the OS prompt when we have earned context. At startup we stay
    // silent and simply skip token registration until permission exists.
    if (!promptIfNeeded) {
      return null;
    }
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  // Get Expo push token
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId,
  });
  const token = tokenData.data;

  // Android notification channels (seller 'orders' + personal channels).
  registerAndroidNotificationChannels();

  // Save token. seller_profiles.push_token (single, back-compat) AND device_tokens
  // (one row per device → a payment alert reaches every phone the seller is
  // logged into, e.g. two phones at one counter). qr-payment-webhook reads
  // device_tokens; legacy senders still read seller_profiles.push_token.
  // push_token feeds the new-order DB trigger, so it is only (re)written while
  // the orders toggle is ON — otherwise the silent startup registration would
  // resurrect order pushes after the seller opted out.
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      if (useSettingsStore.getState().orderNotificationsEnabled) {
        await supabase
          .from('seller_profiles')
          .update({ push_token: token })
          .eq('user_id', session.user.id);
      }
      // Upsert per-device token (unique on user_id+token).
      await supabase
        .from('device_tokens')
        .upsert(
          { user_id: session.user.id, token, platform: Platform.OS, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,token' },
        );
    }
  } catch (e) {
    if (__DEV__) console.warn('[push] Failed to save token:', e);
  }

  return token;
}

/**
 * Business orders toggle OFF: clear seller_profiles.push_token so the
 * trg_notify_order_link trigger stops pushing (it treats '' as "no token").
 * device_tokens rows are kept — qr-payment-webhook payment alerts are a
 * separate feature with their own delivery path.
 */
export async function unregisterOrderPushToken(): Promise<void> {
  if (!Device.isDevice) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase
      .from('seller_profiles')
      .update({ push_token: '' })
      .eq('user_id', session.user.id);
  } catch (e) {
    if (__DEV__) console.warn('[push] Failed to clear order push token:', e);
  }
}

/**
 * Personal-mode counterpart. Quick-log pushes are sent to device_tokens rows
 * belonging to the PERSONAL auth user — the seller path above registers under
 * the business user only (two-account split), so without this a personal-only
 * user never receives them. Same permission etiquette as above: silent unless
 * promptIfNeeded (QuickLogSetup passes true — a contextual, earned prompt).
 */
export async function registerPersonalDeviceToken(
  opts: { promptIfNeeded?: boolean } = {},
): Promise<void> {
  const { promptIfNeeded = false } = opts;
  if (!Device.isDevice) return;
  // Master personal push switch is OFF — don't (re)register behind the user's back.
  if (!useSettingsStore.getState().notificationsEnabled) return;

  const { data: { session } } = await supabasePersonal.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    if (!promptIfNeeded) return;
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  registerAndroidNotificationChannels();
  try {
    await supabasePersonal.from('device_tokens').upsert(
      { user_id: userId, token: tokenData.data, platform: Platform.OS, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,token' },
    );
  } catch (e) {
    if (__DEV__) console.warn('[push] Failed to save personal token:', e);
  }
}

/**
 * Account-free broadcast registration. Unlike registerPersonalDeviceToken (which
 * needs a signed-in personal account and writes device_tokens), this writes the
 * device's Expo token to push_devices via the register-device edge function —
 * so an admin broadcast reaches EVERY installed app that allowed notifications,
 * with no login required. Same permission etiquette: silent unless
 * promptIfNeeded (onboarding passes true — a contextual, earned prompt).
 */
export async function registerBroadcastDevice(
  opts: { promptIfNeeded?: boolean } = {},
): Promise<void> {
  const { promptIfNeeded = false } = opts;
  if (!Device.isDevice) return;
  // Master personal push switch is OFF — broadcasts stay opted out too.
  if (!useSettingsStore.getState().notificationsEnabled) return;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    if (!promptIfNeeded) return;
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  registerAndroidNotificationChannels();
  try {
    // JWT-free function — the anon key on supabasePersonal is enough; no session
    // required, which is the whole point (fresh, never signed-in testers).
    await supabasePersonal.functions.invoke('register-device', {
      body: { token: tokenData.data, platform: Platform.OS },
    });
  } catch (e) {
    if (__DEV__) console.warn('[push] Failed to register broadcast device:', e);
  }
}

/**
 * Personal push toggle OFF: delete THIS device's token from the personal
 * user's device_tokens, so quick-log / payment pushes stop reaching it.
 * Other signed-in devices keep their own rows.
 */
export async function unregisterPersonalDeviceToken(): Promise<void> {
  if (!Device.isDevice) return;
  try {
    const { data: { session } } = await supabasePersonal.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await supabasePersonal
      .from('device_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('token', token);
  } catch (e) {
    if (__DEV__) console.warn('[push] Failed to delete personal token:', e);
  }
}

/**
 * Personal push toggle OFF: remove this device from push_devices (admin
 * broadcasts) via the register-device function's remove flag.
 */
export async function unregisterBroadcastDevice(): Promise<void> {
  if (!Device.isDevice) return;
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await supabasePersonal.functions.invoke('register-device', {
      body: { token, remove: true },
    });
  } catch (e) {
    if (__DEV__) console.warn('[push] Failed to unregister broadcast device:', e);
  }
}

/**
 * Diagnostic: is THIS device's push token actually registered for the personal
 * user? Compares the device's current Expo token against the user's
 * device_tokens rows (owner RLS allows the read). Surfaced on QuickLogSetup so
 * "no notification" can be diagnosed on-device instead of guessed at.
 */
export async function getPersonalPushStatus(): Promise<
  { state: 'no-session' | 'no-permission' | 'no-token' | 'not-registered' | 'registered'; tokenTail?: string }
> {
  const { data: { session } } = await supabasePersonal.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return { state: 'no-session' };
  const perm = await Notifications.getPermissionsAsync();
  if (perm.status !== 'granted') return { state: 'no-permission' };
  let token: string;
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return { state: 'no-token' }; // APNs/Expo token fetch failed on this device
  }
  const tokenTail = token.slice(-8);
  const { count } = await supabasePersonal
    .from('device_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('token', token);
  return { state: (count ?? 0) > 0 ? 'registered' : 'not-registered', tokenTail };
}
