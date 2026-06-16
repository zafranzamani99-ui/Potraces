import AsyncStorage from '@react-native-async-storage/async-storage';
import { newId } from './id';

// Stable per-install id. Used as the AI-proxy rate-limit identity for signed-out
// personal users (signed-in users are metered by their auth uid instead).
const KEY = 'potraces.deviceId';
let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  try {
    let id = await AsyncStorage.getItem(KEY);
    if (!id) {
      id = newId();
      await AsyncStorage.setItem(KEY, id);
    }
    cached = id;
    return id;
  } catch {
    // Storage unavailable — fall back to an in-memory id so the call still works.
    if (!cached) cached = newId();
    return cached;
  }
}
