import React, { useState, useRef } from 'react';
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
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../../constants';
import { successNotification, lightTap } from '../../../services/haptics';

const PLACEHOLDERS = [
  'e.g. Grab driving',
  'e.g. tutoring',
  'e.g. selling kuih',
  'e.g. freelance design',
  'e.g. part-time work',
  'e.g. online selling',
  'e.g. photography',
  'e.g. baking',
];

const MixedSetup: React.FC = () => {
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
        <Text style={styles.heading}>where does your money come from?</Text>
        <Text style={styles.subText}>
          list your income sources — you can always add more later.
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
              placeholderTextColor={CALM.textMuted}
              returnKeyType="next"
              onSubmitEditing={() => {
                if (index < streams.length - 1) {
                  inputRefs.current[index + 1]?.focus();
                } else {
                  Keyboard.dismiss();
                }
              }}
            />
            {(streams.length > 1 || stream.trim().length > 0) && (
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => handleRemoveStream(index)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={16} color={CALM.textMuted} />
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
            <Text style={styles.addLinkText}>+ add another</Text>
          </TouchableOpacity>
        )}

        {/* Road costs toggle */}
        <Text style={styles.sectionHeading}>
          do you have costs on the road?
        </Text>
        <Text style={styles.sectionSubText}>
          petrol, toll, data — things that eat into what you earn.
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
              yes
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
              no
            </Text>
          </TouchableOpacity>
        </View>

        {/* Save */}
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSave}
          activeOpacity={0.7}
        >
          <Text style={styles.saveButtonText}>that's me</Text>
        </TouchableOpacity>

        <Text style={styles.optionalNote}>
          all fields are optional — you can always come back and change things.
        </Text>
      </KeyboardAwareScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING['2xl'],
    paddingBottom: SPACING['5xl'],
  },

  heading: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.light,
    color: CALM.textPrimary,
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
    color: CALM.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
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
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  sectionHeading: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.light,
    color: CALM.textPrimary,
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
    backgroundColor: CALM.background,
    borderWidth: 1,
    borderColor: CALM.bar,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  togglePillActive: {
    backgroundColor: CALM.bronze,
    borderColor: CALM.bronze,
  },
  toggleText: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textSecondary,
  },
  toggleTextActive: {
    color: '#FFFFFF',
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  saveButton: {
    backgroundColor: CALM.bronze,
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
    color: '#FFFFFF',
  },

  optionalNote: {
    ...TYPE.muted,
    textAlign: 'center',
    marginTop: SPACING.xl,
  },
});

export default MixedSetup;
