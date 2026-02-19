import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, RADIUS, SHADOWS, TYPOGRAPHY } from '../../constants';

interface CustomTabBarProps extends BottomTabBarProps {
  accentColor: string;
  centerButtonGradient?: [string, string];
}

const CustomTabBar: React.FC<CustomTabBarProps> = ({
  state,
  descriptors,
  navigation,
  accentColor,
  centerButtonGradient = [accentColor, accentColor],
}) => {
  const insets = useSafeAreaInsets();
  const centerIndex = Math.floor(state.routes.length / 2);

  return (
    <View
      style={[
        styles.container,
        {
          marginHorizontal: SPACING.lg,
          marginBottom: SPACING.sm,
          height: 72 + Math.max(insets.bottom, SPACING.sm),
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

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const onLongPress = () => {
          navigation.emit({
            type: 'tabLongPress',
            target: route.key,
          });
        };

        // Get icon
        const iconName = options.tabBarIcon
          ? ((options.tabBarIcon as any)({ focused: isFocused, color: '', size: 24 }) as any)
              .props.name
          : 'circle';

        if (isCenterButton) {
          return (
            <View key={route.key} style={styles.centerButtonContainer}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                accessibilityLabel={options.tabBarAccessibilityLabel}
                onPress={onPress}
                onLongPress={onLongPress}
                style={styles.centerButtonTouchable}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={centerButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.centerButton}
                >
                  <Feather name={iconName} size={26} color="#FFFFFF" />
                </LinearGradient>
                <Text style={styles.centerLabel}>
                  {label}
                </Text>
              </TouchableOpacity>
            </View>
          );
        }

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            onPress={onPress}
            onLongPress={onLongPress}
            style={styles.tabButton}
            activeOpacity={0.7}
          >
            <Feather
              name={iconName}
              size={24}
              color={isFocused ? accentColor : COLORS.textTertiary}
            />
            <Text
              style={[
                styles.tabLabel,
                { color: isFocused ? accentColor : COLORS.textTertiary },
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </TouchableOpacity>
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
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.xl,
    ...SHADOWS.lg,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    gap: 2,
  },
  tabLabel: {
    fontSize: 10,
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
    ...SHADOWS.xl,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.primary,
        shadowOpacity: 0.4,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  centerLabel: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
    marginTop: 2,
    textAlign: 'center',
  },
});

export default CustomTabBar;
