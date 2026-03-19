import { useColorScheme } from 'react-native';
import { useSettingsStore } from '../store/settingsStore';
import { CALM, CALM_DARK } from '../constants';

/** Returns the active CALM palette based on user theme preference. */
export const useCalm = () => {
  const pref = useSettingsStore(s => s.themePreference);
  const system = useColorScheme();
  const isDark = pref === 'dark' || (pref === 'system' && system === 'dark');
  return isDark ? CALM_DARK : CALM;
};

/** Returns true when dark mode is active. */
export const useIsDark = () => {
  const pref = useSettingsStore(s => s.themePreference);
  const system = useColorScheme();
  return pref === 'dark' || (pref === 'system' && system === 'dark');
};
