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

/** Register for push notifications and save token to Supabase. */
export async function registerPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    return null;
  }

  // Check / request permissions
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
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

  // Android notification channel
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('orders', {
      name: 'Pesanan',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  // Save token to seller_profiles
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase
        .from('seller_profiles')
        .update({ push_token: token })
        .eq('user_id', session.user.id);
    }
  } catch (e) {
    if (__DEV__) console.warn('[push] Failed to save token:', e);
  }

  return token;
}
