import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Keyboard,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useOnTheRoadStore } from '../../../store/onTheRoadStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../../constants';
import { useCalm } from '../../../hooks/useCalm';
import { successNotification } from '../../../services/haptics';

type VehicleType = 'car' | 'motorcycle' | 'bicycle' | 'other';

const VEHICLES: { type: VehicleType; emoji: string; label: string }[] = [
  { type: 'car', emoji: '\u{1F697}', label: 'Car' },
  { type: 'motorcycle', emoji: '\u{1F3CD}', label: 'Motorcycle' },
  { type: 'bicycle', emoji: '\u{1F6B2}', label: 'Bicycle' },
];

const OnTheRoadSetup: React.FC = () => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation<any>();
  const { roadDetails, setRoadDetails } = useOnTheRoadStore();

  const [description, setDescription] = useState(roadDetails.description || '');
  const [vehicleType, setVehicleType] = useState<VehicleType>(roadDetails.vehicleType || 'motorcycle');
  const [vehicleOther, setVehicleOther] = useState(roadDetails.vehicleOther || '');
  const [showOtherInput, setShowOtherInput] = useState(roadDetails.vehicleType === 'other');

  const handleSave = () => {
    Keyboard.dismiss();
    setRoadDetails({
      description: description.trim(),
      vehicleType,
      vehicleOther: vehicleType === 'other' ? vehicleOther.trim() : undefined,
      setupComplete: true,
    });
    successNotification();
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  const handleVehicleSelect = (type: VehicleType) => {
    setVehicleType(type);
    setShowOtherInput(false);
  };

  const handleOtherTap = () => {
    setVehicleType('other');
    setShowOtherInput(true);
  };

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>what do you do on the road?</Text>

        <TextInput
          style={styles.input}
          value={description}
          onChangeText={setDescription}
          placeholder="Grab driver, Foodpanda rider, runner..."
          placeholderTextColor={C.textMuted}
          returnKeyType="next"
        />

        <Text style={styles.subHeading}>what do you drive?</Text>

        <View style={styles.vehicleRow}>
          {VEHICLES.map((v) => (
            <TouchableOpacity
              key={v.type}
              style={[
                styles.vehicleTile,
                vehicleType === v.type && styles.vehicleTileActive,
              ]}
              onPress={() => handleVehicleSelect(v.type)}
              activeOpacity={0.7}
            >
              <Text style={styles.vehicleEmoji}>{v.emoji}</Text>
              <Text
                style={[
                  styles.vehicleLabel,
                  vehicleType === v.type && styles.vehicleLabelActive,
                ]}
              >
                {v.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.otherLink}
          onPress={handleOtherTap}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.otherLinkText,
              vehicleType === 'other' && styles.otherLinkTextActive,
            ]}
          >
            other
          </Text>
        </TouchableOpacity>

        {showOtherInput && (
          <TextInput
            style={styles.otherInput}
            value={vehicleOther}
            onChangeText={setVehicleOther}
            placeholder="what do you use?"
            placeholderTextColor={C.textMuted}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
            autoFocus
          />
        )}

        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSave}
          activeOpacity={0.7}
        >
          <Text style={styles.saveButtonText}>let's go</Text>
        </TouchableOpacity>

        <Text style={styles.optionalNote}>
          all fields are optional — you can always come back and fill these in later.
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
  },

  heading: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.light,
    color: C.textPrimary,
    marginBottom: SPACING['3xl'],
    marginTop: SPACING.xl,
  },

  input: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: SPACING.lg,
    marginBottom: SPACING['2xl'],
    minHeight: 44,
  },

  subHeading: {
    ...TYPE.muted,
    marginBottom: SPACING.lg,
  },

  vehicleRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  vehicleTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.lg,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.bar,
    minHeight: 80,
  },
  vehicleTileActive: {
    borderColor: C.bronze,
    borderWidth: 2,
  },
  vehicleEmoji: {
    fontSize: 28,
    marginBottom: SPACING.xs,
  },
  vehicleLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },
  vehicleLabelActive: {
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  otherLink: {
    paddingVertical: SPACING.sm,
    marginBottom: SPACING['2xl'],
  },
  otherLinkText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    textDecorationLine: 'underline',
  },
  otherLinkTextActive: {
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  otherInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: SPACING.lg,
    marginBottom: SPACING['2xl'],
    minHeight: 44,
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
    color: '#FFFFFF',
  },

  optionalNote: {
    ...TYPE.muted,
    textAlign: 'center',
    marginTop: SPACING.xl,
  },
});

export default OnTheRoadSetup;
