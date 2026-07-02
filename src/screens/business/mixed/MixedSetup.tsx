import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Keyboard,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useMixedStore } from '../../../store/mixedStore';
import { withAlpha, CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../../constants';
import { useCalm, useIsDark } from '../../../hooks/useCalm';
import { useT } from '../../../i18n';
import { successNotification, lightTap } from '../../../services/haptics';

const MixedSetup: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const PLACEHOLDERS = [
    t.mixed.streamPlaceholder1,
    t.mixed.streamPlaceholder2,
    t.mixed.streamPlaceholder3,
    t.mixed.streamPlaceholder4,
    t.mixed.streamPlaceholder5,
    t.mixed.streamPlaceholder6,
    t.mixed.streamPlaceholder7,
    t.mixed.streamPlaceholder8,
  ];
  const styles = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation<any>();
  const { mixedDetails, setMixedDetails } = useMixedStore();

  const [streams, setStreams] = useState<string[]>(
    mixedDetails.streams.length > 0 ? [...mixedDetails.streams] : ['']
  );
  const [hasRoadCosts, setHasRoadCosts] = useState(mixedDetails.hasRoadCosts);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const getPlaceholder = (index: number) => {
    return PLACEHOLDERS[index % PLACEHOLDERS.length];
  };

  const handleStreamChange = (text: string, index: number) => {
    const updated = [...streams];
    updated[index] = text;
    setStreams(updated);
  };

  const handleRemoveStream = (index: number) => {
    lightTap();
    if (streams.length <= 1) {
      setStreams(['']);
      return;
    }
    const updated = streams.filter((_, i) => i !== index);
    setStreams(updated);
  };

  const handleAddStream = () => {
    if (streams.length >= 8) return;
    lightTap();
    setStreams([...streams, '']);
    setTimeout(() => {
      inputRefs.current[streams.length]?.focus();
    }, 200);
  };

  const handleSave = () => {
    Keyboard.dismiss();
    const validStreams = streams
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    setMixedDetails({
      streams: validStreams,
      hasRoadCosts,
      setupComplete: true,
    });

    successNotification();
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>{t.mixed.setupHeading}</Text>
        <Text style={styles.subText}>
          {t.mixed.setupSub}
        </Text>

        {/* Stream inputs */}
        {streams.map((stream, index) => (
          <View key={index} style={styles.streamRow}>
            <TextInput
              ref={(ref) => { inputRefs.current[index] = ref; }}
              style={styles.streamInput}
              value={stream}
              onChangeText={(text) => handleStreamChange(text, index)}
              placeholder={getPlaceholder(index)}
              placeholderTextColor={C.textMuted}
              returnKeyType="next"
              onSubmitEditing={() => {
                if (index < streams.length - 1) {
                  inputRefs.current[index + 1]?.focus();
                } else {
                  Keyboard.dismiss();
                }
              }}
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={withAlpha(C.accent, 0.25)}
            />
            {(streams.length > 1 || stream.trim().length > 0) && (
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => handleRemoveStream(index)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={16} color={C.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        ))}

        {/* Add another */}
        {streams.length < 8 && (
          <TouchableOpacity
            style={styles.addLink}
            onPress={handleAddStream}
            activeOpacity={0.7}
          >
            <Text style={styles.addLinkText}>{t.mixed.addAnother}</Text>
          </TouchableOpacity>
        )}

        {/* Road costs toggle */}
        <Text style={styles.sectionHeading}>
          {t.mixed.roadCostsHeading}
        </Text>
        <Text style={styles.sectionSubText}>
          {t.mixed.roadCostsSub}
        </Text>

        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[
              styles.togglePill,
              hasRoadCosts && styles.togglePillActive,
            ]}
            onPress={() => {
              lightTap();
              setHasRoadCosts(true);
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.toggleText,
                hasRoadCosts && styles.toggleTextActive,
              ]}
            >
              {t.mixed.yes}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.togglePill,
              !hasRoadCosts && styles.togglePillActive,
            ]}
            onPress={() => {
              lightTap();
              setHasRoadCosts(false);
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.toggleText,
                !hasRoadCosts && styles.toggleTextActive,
              ]}
            >
              {t.mixed.no}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Save */}
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSave}
          activeOpacity={0.7}
        >
          <Text style={styles.saveButtonText}>{t.mixed.thatsMe}</Text>
        </TouchableOpacity>

        <Text style={styles.optionalNote}>
          {t.mixed.optionalNote}
        </Text>
      </KeyboardAwareScrollView>
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING['2xl'],
    paddingBottom: SPACING['5xl'],
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
  },

  heading: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.light,
    color: C.textPrimary,
    marginBottom: SPACING.sm,
    marginTop: SPACING.xl,
  },
  subText: {
    ...TYPE.muted,
    marginBottom: SPACING['2xl'],
  },

  streamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  streamInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: SPACING.lg,
    minHeight: 44,
  },
  removeButton: {
    padding: SPACING.md,
    marginLeft: SPACING.xs,
  },

  addLink: {
    paddingVertical: SPACING.md,
    marginBottom: SPACING['2xl'],
  },
  addLinkText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  sectionHeading: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.light,
    color: C.textPrimary,
    marginBottom: SPACING.xs,
  },
  sectionSubText: {
    ...TYPE.muted,
    marginBottom: SPACING.lg,
  },

  toggleRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING['3xl'],
  },
  togglePill: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.full,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.bar,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  togglePillActive: {
    backgroundColor: C.bronze,
    borderColor: C.bronze,
  },
  toggleText: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textSecondary,
  },
  toggleTextActive: {
    color: C.onAccent,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  saveButton: {
    backgroundColor: C.bronze,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    marginTop: SPACING.xl,
    minHeight: 44,
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },

  optionalNote: {
    ...TYPE.muted,
    textAlign: 'center',
    marginTop: SPACING.xl,
  },
});

export default MixedSetup;
