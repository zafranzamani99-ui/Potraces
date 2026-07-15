import React from 'react';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useAppStore } from '../../store/appStore';
import AppSettings from './AppSettings';
import PersonalSettings from '../personal/PersonalSettings';
import BusinessSettings from '../business/BusinessSettings';
import type { RootStackParamList } from '../../types';

/**
 * Settings router. One component is registered under every settings route
 * (personal tab, business tabs, root Settings / SellerSettings / SettingsDetail),
 * so it dispatches to the right screen at render time:
 *
 *  - preferences / security / about  → shared AppSettings (mode-agnostic)
 *  - hub / money / data              → PersonalSettings or BusinessSettings by
 *                                       the current app mode
 *
 * Keeping the routing here means the navigators and every deep-link
 * (SettingsDetail?section=money&scrollTo=qr|categories) stay untouched.
 */
const Settings: React.FC = () => {
  const route = useRoute<RouteProp<RootStackParamList, 'SettingsDetail'>>();
  const params = route.params ?? {};
  const section = params.section;
  const scrollTo = params.scrollTo;
  const mode = useAppStore((s) => s.mode);

  if (section === 'preferences' || section === 'security' || section === 'about') {
    return <AppSettings section={section} />;
  }

  return mode === 'business'
    ? <BusinessSettings section={section} scrollTo={scrollTo} />
    : <PersonalSettings section={section} scrollTo={scrollTo} />;
};

export default Settings;
