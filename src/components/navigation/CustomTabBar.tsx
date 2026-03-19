import React, { useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CALM, SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { selectionChanged } from '../../services/haptics';

// CIMB-style: full-width bar matching app bg, labels always visible,
// big colored circle popping out with a border ring

interface CustomTabBarProps extends BottomTabBarProps {
  accentColor: string;
  centerButtonGradient?: [string, string];
}

interface TabItemProps {
  label: string;
  isFocused: boolean;
  iconName: React.ComponentProps<typeof Feather>['name'];
  accentColor: string;
  activeColor: string;
  inactiveColor: string;
  tabButtonStyle: any;
  tabLabelStyle: any;
  accessibilityLabel?: string;
  onPress: () => void;
  onLongPress: () => void;
}

const TabItem = React.memo<TabItemProps>(({
  label,
  isFocused,
  iconName,
  activeColor,
  inactiveColor,
  tabButtonStyle,
  tabLabelStyle,
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
    style={tabButtonStyle}
    activeOpacity={0.7}
  >
    <Feather
      name={iconName}
      size={24}
      color={isFocused ? activeColor : inactiveColor}
    />
    <Text
      style={[
        tabLabelStyle,
        { color: isFocused ? activeColor : inactiveColor },
      ]}
      numberOfLines={1}
    >
      {label}
    </Text>
  </TouchableOpacity>
));

interface CenterTabItemProps extends TabItemProps {
  centerContainerStyle: any;
  centerTouchableStyle: any;
  centerRingStyle: any;
  centerButtonStyle: any;
  centerLabelStyle: any;
}

const CenterTabItem = React.memo<CenterTabItemProps>(({
  label,
  isFocused,
  iconName,
  accentColor,
  centerContainerStyle,
  centerTouchableStyle,
  centerRingStyle,
  centerButtonStyle,
  centerLabelStyle,
  accessibilityLabel,
  onPress,
  onLongPress,
}) => (
  <View style={centerContainerStyle}>
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onLongPress={onLongPress}
      style={centerTouchableStyle}
      activeOpacity={0.8}
    >
      <View style={centerRingStyle}>
        <View style={[centerButtonStyle, { backgroundColor: accentColor }]}>
          <Feather name={iconName} size={28} color="#FFFFFF" />
        </View>
      </View>
      <Text style={centerLabelStyle}>{label}</Text>
    </TouchableOpacity>
  </View>
));

const CustomTabBar: React.FC<CustomTabBarProps> = ({
  state,
  descriptors,
  navigation,
  accentColor,
}) => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const ACTIVE_COLOR = C.textPrimary;
  const INACTIVE_COLOR = C.textMuted;
  const insets = useSafeAreaInsets();
  const centerIndex = Math.floor(state.routes.length / 2);

  const handlePress = useCallback((routeKey: string, routeName: string, isFocused: boolean) => {
    const event = navigation.emit({
      type: 'tabPress',
      target: routeKey,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      selectionChanged();
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
          paddingBottom: Math.max(insets.bottom, SPACING.sm),
        },
      ]}
    >
      <View style={styles.background} />

      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = typeof options.tabBarLabel === 'string'
          ? options.tabBarLabel
          : (options.title ?? route.name);
        const isFocused = state.index === index;
        const isCenterButton = index === centerIndex;

        const iconName: React.ComponentProps<typeof Feather>['name'] = options.tabBarIcon
          ? ((options.tabBarIcon as any)({ focused: isFocused, color: '', size: 24 }) as any)
              .props.name
          : 'circle';

        if (isCenterButton) {
          return (
            <CenterTabItem
              key={route.key}
              label={label}
              isFocused={isFocused}
              iconName={iconName}
              accentColor={accentColor}
              activeColor={ACTIVE_COLOR}
              inactiveColor={INACTIVE_COLOR}
              tabButtonStyle={styles.tabButton}
              tabLabelStyle={styles.tabLabel}
              centerContainerStyle={styles.centerButtonContainer}
              centerTouchableStyle={styles.centerButtonTouchable}
              centerRingStyle={styles.centerRing}
              centerButtonStyle={styles.centerButton}
              centerLabelStyle={styles.centerLabel}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              onPress={() => handlePress(route.key, route.name, isFocused)}
              onLongPress={() => handleLongPress(route.key)}
            />
          );
        }

        return (
          <TabItem
            key={route.key}
            label={label}
            isFocused={isFocused}
            iconName={iconName}
            accentColor={accentColor}
            activeColor={ACTIVE_COLOR}
            inactiveColor={INACTIVE_COLOR}
            tabButtonStyle={styles.tabButton}
            tabLabelStyle={styles.tabLabel}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            onPress={() => handlePress(route.key, route.name, isFocused)}
            onLongPress={() => handleLongPress(route.key)}
          />
        );
      })}
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    overflow: 'visible',
    backgroundColor: C.surface,
  },
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: C.border,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    paddingBottom: 8,
    minHeight: 56,
    gap: 4,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.medium,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  centerButtonContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 8,
  },
  centerButtonTouchable: {
    alignItems: 'center',
    marginTop: -34,
  },
  centerRing: {
    width: 74,
    height: 74,
    borderRadius: RADIUS.full,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: C.border,
  },
  centerButton: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerLabel: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    marginTop: 4,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
});

export default React.memo(CustomTabBar);
