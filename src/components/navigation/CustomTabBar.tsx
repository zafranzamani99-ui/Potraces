import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CALM, SPACING, RADIUS, TYPOGRAPHY } from '../../constants';

interface CustomTabBarProps extends BottomTabBarProps {
  accentColor: string;
  centerButtonGradient?: [string, string]; // kept for API compat, ignored
}

// ─── Memoized tab item components ────────────────────────────
interface TabItemProps {
  routeKey: string;
  routeName: string;
  label: string;
  isFocused: boolean;
  iconName: React.ComponentProps<typeof Feather>['name'];
  accentColor: string;
  accessibilityLabel?: string;
  onPress: () => void;
  onLongPress: () => void;
}

const TabItem = React.memo<TabItemProps>(({
  label,
  isFocused,
  iconName,
  accentColor,
  accessibilityLabel,
  onPress,
  onLongPress,
}) => (
  <TouchableOpacity
    accessibilityRole="button"
    accessibilityState={isFocused ? { selected: true } : {}}
    accessibilityLabel={accessibilityLabel}
    onPress={onPress}
    onLongPress={onLongPress}
    style={styles.tabButton}
    activeOpacity={0.7}
  >
    <Feather
      name={iconName}
      size={24}
      color={isFocused ? accentColor : CALM.textMuted}
    />
    {isFocused && (
      <Text
        style={[styles.tabLabel, { color: accentColor }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    )}
  </TouchableOpacity>
));

const CenterTabItem = React.memo<TabItemProps>(({
  label,
  isFocused,
  iconName,
  accentColor,
  accessibilityLabel,
  onPress,
  onLongPress,
}) => (
  <View style={styles.centerButtonContainer}>
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.centerButtonTouchable}
      activeOpacity={0.7}
    >
      <View style={[styles.centerButton, { backgroundColor: accentColor }]}>
        <Feather name={iconName} size={26} color="#FFFFFF" />
      </View>
      <Text style={styles.centerLabel}>{label}</Text>
    </TouchableOpacity>
  </View>
));

const CustomTabBar: React.FC<CustomTabBarProps> = ({
  state,
  descriptors,
  navigation,
  accentColor,
}) => {
  const insets = useSafeAreaInsets();
  const centerIndex = Math.floor(state.routes.length / 2);

  const handlePress = useCallback((routeKey: string, routeName: string, isFocused: boolean) => {
    const event = navigation.emit({
      type: 'tabPress',
      target: routeKey,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(routeName);
    }
  }, [navigation]);

  const handleLongPress = useCallback((routeKey: string) => {
    navigation.emit({
      type: 'tabLongPress',
      target: routeKey,
    });
  }, [navigation]);

  return (
    <View
      style={[
        styles.container,
        {
          marginHorizontal: SPACING.lg,
          marginBottom: SPACING.sm,
          height: 80 + Math.max(insets.bottom, SPACING.sm),
          paddingBottom: Math.max(insets.bottom, SPACING.sm),
        },
      ]}
    >
      {/* Tab Bar Background */}
      <View style={styles.background} />

      {/* Tab Items */}
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = typeof options.tabBarLabel === 'string'
          ? options.tabBarLabel
          : (options.title ?? route.name);
        const isFocused = state.index === index;
        const isCenterButton = index === centerIndex;

        // Get icon
        const iconName: React.ComponentProps<typeof Feather>['name'] = options.tabBarIcon
          ? ((options.tabBarIcon as any)({ focused: isFocused, color: '', size: 24 }) as any)
              .props.name
          : 'circle';

        const Component = isCenterButton ? CenterTabItem : TabItem;

        return (
          <Component
            key={route.key}
            routeKey={route.key}
            routeName={route.name}
            label={label}
            isFocused={isFocused}
            iconName={iconName}
            accentColor={accentColor}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            onPress={() => handlePress(route.key, route.name, isFocused)}
            onLongPress={() => handleLongPress(route.key)}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    borderRadius: RADIUS.xl,
    overflow: 'visible',
  },
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    minHeight: 44, // minimum touch target
    gap: 2,
  },
  tabLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    textAlign: 'center',
  },
  centerButtonContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerButtonTouchable: {
    alignItems: 'center',
    marginTop: -20,
  },
  centerButton: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
  },
  centerLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginTop: 2,
    textAlign: 'center',
  },
});

export default React.memo(CustomTabBar);
