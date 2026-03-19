import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { TYPE, SPACING, CALM } from '../../constants';
import { useCalm } from '../../hooks/useCalm';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const CollapsibleSection = React.memo(function CollapsibleSection({
  title,
  subtitle,
  children,
  defaultOpen = false,
}: CollapsibleSectionProps) {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsOpen((prev) => !prev);
  }, []);

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={toggle} style={styles.header} activeOpacity={0.6}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerText}>
            {title}
          </Text>
          {!isOpen && subtitle ? (
            <Text style={styles.subtitleText}>{subtitle}</Text>
          ) : null}
        </View>
        <Feather
          name={isOpen ? 'chevron-down' : 'chevron-right'}
          size={16}
          color={C.textSecondary}
        />
      </TouchableOpacity>
      {isOpen && <View style={styles.content}>{children}</View>}
    </View>
  );
});

export default CollapsibleSection;

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    marginVertical: SPACING.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    minHeight: 44,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  subtitleText: {
    fontSize: 12,
    color: C.textSecondary,
  },
  headerText: {
    fontSize: TYPE.label.fontSize,
    color: TYPE.label.color,
    textTransform: TYPE.label.textTransform,
    letterSpacing: TYPE.label.letterSpacing,
    fontWeight: '600',
  },
  content: {
    paddingTop: SPACING.sm,
  },
});
