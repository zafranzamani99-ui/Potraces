import { useSettingsStore } from '../store/settingsStore';
import { en } from './en';
import { ms } from './ms';

/** Returns the active translation object based on user language preference. */
export const useT = () => {
  const lang = useSettingsStore(s => s.language);
  return lang === 'ms' ? ms : en;
};

export type { Translations } from './en';
