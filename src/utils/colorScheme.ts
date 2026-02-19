import { useColorScheme } from 'react-native';
import { COLORS, COLORS_DARK } from '../constants';

/**
 * Hook to get theme colors based on device color scheme
 * Returns COLORS_DARK for dark mode, COLORS for light mode
 *
 * @example
 * const colors = useThemeColors();
 * <View style={{ backgroundColor: colors.background }} />
 */
export const useThemeColors = () => {
  const scheme = useColorScheme();
  return scheme === 'dark' ? COLORS_DARK : COLORS;
};

/**
 * Check if current theme is dark mode
 */
export const useIsDarkMode = () => {
  const scheme = useColorScheme();
  return scheme === 'dark';
};

export default useThemeColors;
