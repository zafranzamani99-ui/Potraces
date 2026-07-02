import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { useSettingsStore } from '../store/settingsStore';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => {
    const enabled = useSettingsStore.getState().notificationsEnabled;
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
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase
        .from('seller_profiles')
        .update({ push_token: token })
        .eq('user_id', session.user.id);
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
