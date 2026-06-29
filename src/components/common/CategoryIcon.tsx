import React from 'react';
import { Feather, Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { ensureContrastOnDark } from '../../constants';
import { useIsDark } from '../../hooks/useCalm';

// Single renderer for every category / cost-category / product / payment-method icon.
//
// Icon specs are lib-prefixed:
//   i/<name>   -> Ionicons
//   m/<name>   -> MaterialCommunityIcons
//   fa/<name>  -> FontAwesome5
// A bare name with no "/" is treated as a Feather glyph. This is the safety net:
// every category created before this migration stored a plain Feather name, so it
// keeps rendering correctly — a category can never become a blank box.
//
// In dark mode the icon colour is lightened just enough to stay legible (fixed
// category colours like olive #4F5104 / deep #332D03 otherwise vanish on the dark
// surface). Pass adaptDark={false} to keep a colour verbatim (e.g. EmptyState,
// which intentionally renders a faint border-grey icon).
interface CategoryIconProps {
  icon?: string | null;
  size?: number;
  color?: string;
  style?: any;
  adaptDark?: boolean;
}

const CategoryIcon: React.FC<CategoryIconProps> = ({ icon, size = 22, color = '#000', style, adaptDark = true }) => {
  const isDark = useIsDark();
  const c = adaptDark && isDark ? ensureContrastOnDark(color) : color;
  if (icon && icon.includes('/')) {
    const [lib, name] = icon.split('/');
    if (lib === 'm') return <MaterialCommunityIcons name={name as any} size={size} color={c} style={style} />;
    if (lib === 'i') return <Ionicons name={name as any} size={size} color={c} style={style} />;
    if (lib === 'fa') return <FontAwesome5 name={name as any} size={size} color={c} style={style} />;
  }
  return <Feather name={(icon || 'tag') as any} size={size} color={c} style={style} />;
};

export default React.memo(CategoryIcon);
