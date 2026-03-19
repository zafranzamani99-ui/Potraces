import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Keyboard,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { usePartTimeStore } from '../../../store/partTimeStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../../constants';
import { useCalm } from '../../../hooks/useCalm';
import { successNotification } from '../../../services/haptics';

const PAY_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

const PartTimeSetup: React.FC = () => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation<any>();
  const { jobDetails, setJobDetails } = usePartTimeStore();
  const currency = useSettingsStore((s) => s.currency);

  const [jobName, setJobName] = useState(jobDetails.jobName || '');
  const [expectedPay, setExpectedPay] = useState(
    jobDetails.expectedMonthlyPay ? String(jobDetails.expectedMonthlyPay) : ''
  );
  const [payDay, setPayDay] = useState<number | undefined>(jobDetails.payDay);
  const [showPayDayPicker, setShowPayDayPicker] = useState(false);

  const handleSave = () => {
    Keyboard.dismiss();
    setJobDetails({
      jobName: jobName.trim(),
      expectedMonthlyPay: expectedPay ? parseFloat(expectedPay) || undefined : undefined,
      payDay,
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
        <Text style={styles.heading}>tell us about your main job</Text>

        <TextInput
          style={styles.input}
          value={jobName}
          onChangeText={setJobName}
          placeholder="what's your main job?"
          placeholderTextColor={C.textMuted}
          returnKeyType="next"
        />

        <View style={styles.amountRow}>
          <Text style={styles.currencyPrefix}>{currency}</Text>
          <TextInput
            style={styles.amountInput}
            value={expectedPay}
            onChangeText={setExpectedPay}
            placeholder="roughly how much per month?"
            placeholderTextColor={C.textMuted}
            keyboardType="decimal-pad"
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />
        </View>

        <TouchableOpacity
          style={styles.payDayButton}
          onPress={() => setShowPayDayPicker(!showPayDayPicker)}
          activeOpacity={0.7}
        >
          <Text style={payDay ? styles.payDayText : styles.payDayPlaceholder}>
            {payDay ? `pay day: ${payDay}` : 'when do you usually get paid?'}
          </Text>
        </TouchableOpacity>

        {showPayDayPicker && (
          <View style={styles.payDayGrid}>
            {PAY_DAYS.map((day) => (
              <TouchableOpacity
                key={day}
                style={[
                  styles.payDayOption,
                  payDay === day && styles.payDayOptionActive,
                ]}
                onPress={() => {
                  setPayDay(day);
                  setShowPayDayPicker(false);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.payDayOptionText,
                    payDay === day && styles.payDayOptionTextActive,
                  ]}
                >
                  {day}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSave}
          activeOpacity={0.7}
        >
          <Text style={styles.saveButtonText}>that's me</Text>
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

  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginBottom: SPACING['2xl'],
  },
  currencyPrefix: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textSecondary,
    marginRight: SPACING.sm,
  },
  amountInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    paddingVertical: SPACING.lg,
    minHeight: 44,
  },

  payDayButton: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: SPACING.lg,
    marginBottom: SPACING['2xl'],
    minHeight: 44,
    justifyContent: 'center',
  },
  payDayText: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
  },
  payDayPlaceholder: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textMuted,
  },

  payDayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING['2xl'],
  },
  payDayOption: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  payDayOptionActive: {
    backgroundColor: C.bronze,
    borderColor: C.bronze,
  },
  payDayOptionText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  payDayOptionTextActive: {
    color: '#FFFFFF',
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
    color: '#FFFFFF',
  },

  optionalNote: {
    ...TYPE.muted,
    textAlign: 'center',
    marginTop: SPACING.xl,
  },
});

export default PartTimeSetup;
