import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Animated,
  Easing,
  KeyboardTypeOptions,
  ReturnKeyTypeOptions,
  TextInputProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { CALM, BIZ, RADIUS, SPACING, TYPOGRAPHY, TYPE, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import InputError from '../common/InputError';

/**
 * The shared Newst outline — the ONE border every business/stall-mode input wears,
 * Newst floating-label or not, so all inputs read as identical. Spread it LAST in a
 * style array so it overrides any existing border/background.
 * `active` = the highlight condition: focused (plain inputs) or floated (Newst fields).
 * Idle → C.border; active → C.textPrimary (black in light / white in dark).
 * `error` → BIZ.inputError border + 8% wash (the seller-form validation convention);
 * it wins over both idle and active so an invalid field never looks merely focused.
 */
export const newstOutline = (C: typeof CALM, active: boolean, error?: boolean) => ({
  borderWidth: 1.5,
  borderColor: error ? BIZ.inputError : active ? C.textPrimary : C.border,
  borderRadius: RADIUS.lg,
  backgroundColor: error ? withAlpha(BIZ.inputError, 0.08) : ('transparent' as const),
});

export interface NewstInputProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  /** Currency / symbol shown inside the box, left of the text — only while floated. */
  prefix?: string;
  /** Muted helper line below the box. */
  hint?: string;
  /** Validation message — tints the box (BIZ.inputError) and shows InputError below. */
  error?: string | null;
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoFocus?: boolean;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Outer wrapper style — use for call-site spacing (e.g. marginBottom). */
  style?: StyleProp<ViewStyle>;
}

/**
 * Newst Input — the standard business / stall-mode text field.
 * Floating label: rests inside the box and floats up to notch the top border on
 * focus/fill. Monochrome — active border + floated label use C.textPrimary (black in
 * light, white in dark); idle border stays C.border. Spec: docs/BUSINESS_MODE_DESIGN.md.
 */
const NewstInput: React.FC<NewstInputProps> = ({
  label,
  value,
  onChangeText,
  prefix,
  hint,
  multiline,
  keyboardType,
  autoFocus,
  autoCapitalize,
  returnKeyType,
  onSubmitEditing,
  accessibilityLabel,
  accessibilityHint,
  error,
  style,
}) => {
  const C = useCalm();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [focused, setFocused] = useState(false);
  const [fieldW, setFieldW] = useState(0);
  const floated = focused || value.length > 0;
  const anim = useRef(new Animated.Value(floated ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: floated ? 1 : 0,
      duration: 150,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: false, // animating top/fontSize (layout props)
    }).start();
  }, [floated, anim]);

  const labelStyle = {
    top: anim.interpolate({ inputRange: [0, 1], outputRange: multiline ? [16, -8] : [17, -8] }),
    fontSize: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 12] }),
    color: focused ? C.textPrimary : floated ? C.textSecondary : C.neutral,
    backgroundColor: floated ? C.background : 'transparent',
    // Bound the label to the field so adjustsFontSizeToFit has a target to shrink
    // into (the label hugs its text for the border notch, so without this cap a
    // long label just spills past the field edge instead of shrinking).
    maxWidth: fieldW ? fieldW - 24 : undefined,
  };

  return (
    <View style={style} onLayout={(e) => setFieldW(e.nativeEvent.layout.width)}>
      <View
        style={[
          styles.box,
          multiline && styles.boxMultiline,
          newstOutline(C, floated, !!error),
        ]}
      >
        {prefix != null && floated ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType={keyboardType}
          autoFocus={autoFocus}
          autoCapitalize={autoCapitalize}
          returnKeyType={returnKeyType ?? (multiline ? 'default' : 'done')}
          onSubmitEditing={onSubmitEditing}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : undefined}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityHint={accessibilityHint}
          keyboardAppearance={isDark ? 'dark' : 'light'}
          selectionColor={withAlpha(C.textPrimary, 0.2)}
        />
      </View>
      <Animated.Text
        pointerEvents="none"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
        style={[styles.label, labelStyle]}
      >
        {label}
      </Animated.Text>
      {hint && !error ? <Text style={styles.hint}>{hint}</Text> : null}
      <InputError message={error} />
    </View>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    box: {
      // border/radius/bg come from newstOutline(); this is layout only
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      minHeight: 56,
    },
    boxMultiline: {
      alignItems: 'flex-start',
      minHeight: 96,
      paddingTop: 4,
    },
    prefix: {
      fontSize: TYPOGRAPHY.size.lg,
      fontWeight: TYPOGRAPHY.weight.medium,
      color: C.textSecondary,
      marginRight: SPACING.sm,
    },
    input: {
      flex: 1,
      paddingVertical: SPACING.md,
      fontSize: 16,
      color: C.textPrimary,
    },
    label: {
      position: 'absolute',
      left: 14,
      paddingHorizontal: 4,
      fontWeight: TYPOGRAPHY.weight.medium,
    },
    hint: {
      ...TYPE.muted,
      marginTop: SPACING.sm,
      marginLeft: 12,
    },
  });

export default NewstInput;
