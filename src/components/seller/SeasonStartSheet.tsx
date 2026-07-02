import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, TextInput, Pressable, Modal, StyleSheet, Keyboard } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useSellerStore } from '../../store/sellerStore';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { lightTap, successNotification } from '../../services/haptics';

interface Props {
  visible: boolean;
  onClose: () => void;
  onStarted?: () => void;
  onViewPast?: () => void;
}

const SeasonStartSheet: React.FC<Props> = ({ visible, onClose, onStarted, onViewPast }) => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { seasons, addSeason, useSeasonTemplate } = useSellerStore();

  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [templateId, setTemplateId] = useState<string | null>(null);

  const pastSeasons = useMemo(
    () => seasons.filter((s) => !s.isActive).slice(0, 3),
    [seasons],
  );

  useEffect(() => {
    if (visible) {
      setName('');
      setTarget('');
      setTemplateId(null);
    }
  }, [visible]);

  const handleStart = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    lightTap();
    addSeason({
      name: trimmed,
      startDate: new Date(),
      isActive: true,
      revenueTarget: target ? parseFloat(target) || undefined : undefined,
    });
    const newSeason = useSellerStore.getState().seasons[0];
    if (templateId && newSeason) {
      useSeasonTemplate(newSeason.id, templateId);
    }
    successNotification();
    onStarted?.();
    onClose();
  }, [name, target, templateId, addSeason, useSeasonTemplate, onClose, onStarted]);

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1, backgroundColor: withAlpha(C.dimBg, 0.4) }}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => { Keyboard.dismiss(); onClose(); }}
        >
          <Pressable style={styles.card} onPress={() => Keyboard.dismiss()}>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>
                  new <Text style={styles.titleAccent}>season</Text>
                </Text>
                <Text style={styles.subtitle}>track a selling period — bazaar, market, batch</Text>
              </View>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="x" size={16} color={C.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              bounces={false}
              scrollEventThrottle={16}
              contentContainerStyle={styles.scrollContent}
            >
              <View style={styles.fieldCard}>
                <Text style={styles.fieldLabel}>season name</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Hari Raya, Bazaar Ramadan"
                  placeholderTextColor={withAlpha(C.textMuted, 0.6)}
                  autoFocus
                  returnKeyType="next"
                  keyboardAppearance={C === CALM_DARK ? 'dark' : 'light'}
                />
              </View>

              <View style={styles.fieldCard}>
                <View style={styles.fieldLabelRow}>
                  <Text style={styles.fieldLabel}>income target</Text>
                  <Text style={styles.fieldHintInline}>optional</Text>
                </View>
                <TextInput
                  style={styles.fieldInput}
                  value={target}
                  onChangeText={setTarget}
                  placeholder="e.g. 5000"
                  placeholderTextColor={withAlpha(C.textMuted, 0.6)}
                  keyboardType="numeric"
                  returnKeyType="done"
                  keyboardAppearance={C === CALM_DARK ? 'dark' : 'light'}
                />
              </View>

              {pastSeasons.length > 0 && (
                <View style={styles.fieldCard}>
                  <Text style={styles.fieldLabel}>copy from previous</Text>
                  <View style={styles.templateRow}>
                    {pastSeasons.map((s) => (
                      <Pressable
                        key={s.id}
                        style={({ pressed }) => [
                          styles.templatePill,
                          templateId === s.id && styles.templatePillActive,
                          pressed && { opacity: 0.7 },
                        ]}
                        onPress={() => {
                          lightTap();
                          setTemplateId(templateId === s.id ? null : s.id);
                        }}
                      >
                        <Text
                          style={[
                            styles.templatePillText,
                            templateId === s.id && styles.templatePillTextActive,
                          ]}
                        >
                          {s.emoji ? `${s.emoji} ` : ''}{s.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={styles.templateHint}>
                    copies costs, budget, target, and product prices
                  </Text>
                </View>
              )}

              <Pressable
                style={({ pressed }) => [
                  styles.startButton,
                  pressed && { opacity: 0.85 },
                  !name.trim() && { opacity: 0.4 },
                ]}
                onPress={handleStart}
                disabled={!name.trim()}
              >
                <Feather name="play" size={18} color={C.onAccent} />
                <Text style={styles.startButtonText}>start season</Text>
              </Pressable>

              {onViewPast && (
                <Pressable
                  style={({ pressed }) => [styles.viewPastLink, pressed && { opacity: 0.5 }]}
                  onPress={() => { onClose(); onViewPast(); }}
                >
                  <Text style={styles.viewPastText}>view past seasons</Text>
                </Pressable>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.lg,
    },
    card: {
      backgroundColor: C.background,
      borderRadius: RADIUS.xl,
      paddingHorizontal: SPACING.xl,
      paddingTop: SPACING.lg,
      paddingBottom: SPACING.lg,
      width: '100%',
      maxWidth: 420,
      maxHeight: '85%',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
    },
    title: {
      fontSize: TYPOGRAPHY.size['2xl'],
      fontWeight: TYPOGRAPHY.weight.semibold as any,
      color: C.textPrimary,
      letterSpacing: C === CALM_DARK ? -0.2 : -0.4,
    },
    titleAccent: {
      fontStyle: 'italic',
      fontFamily: 'serif',
      fontWeight: TYPOGRAPHY.weight.regular as any,
      color: C.bronze,
    },
    subtitle: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      marginTop: 2,
      letterSpacing: 0.1,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.12 : 0.06),
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: -SPACING.sm - 2,
      marginTop: 2,
    },
    scrollContent: {
      paddingTop: SPACING.xs,
      paddingBottom: SPACING.md,
    },
    fieldCard: {
      backgroundColor: C.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: withAlpha(C.textPrimary, 0.08),
      paddingHorizontal: SPACING.md + 2,
      paddingVertical: SPACING.sm + 4,
      marginBottom: SPACING.sm + 2,
    },
    fieldLabel: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      fontWeight: TYPOGRAPHY.weight.medium as any,
      marginBottom: 4,
      letterSpacing: 0.2,
    },
    fieldLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      marginBottom: 4,
    },
    fieldInput: {
      fontSize: TYPOGRAPHY.size.base,
      color: C.textPrimary,
      fontWeight: TYPOGRAPHY.weight.medium as any,
      paddingVertical: SPACING.sm,
      minHeight: 22,
    },
    fieldHintInline: {
      fontSize: 10,
      color: C.textMuted,
    },
    templateRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
      marginTop: SPACING.xs,
    },
    templatePill: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.full,
      backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.06 : 0.03),
      borderWidth: 1,
      borderColor: withAlpha(C.textPrimary, 0.06),
    },
    templatePillActive: {
      backgroundColor: withAlpha(C.bronze, 0.12),
      borderColor: C.bronze,
    },
    templatePillText: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textSecondary,
    },
    templatePillTextActive: {
      color: C.bronze,
      fontWeight: TYPOGRAPHY.weight.medium as any,
    },
    templateHint: {
      fontSize: 10,
      color: C.textMuted,
      marginTop: SPACING.xs,
      lineHeight: 14,
    },
    startButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: C.deepOlive,
      borderRadius: RADIUS.full,
      paddingVertical: SPACING.md + 2,
      marginTop: SPACING.md,
      minHeight: 52,
    },
    startButtonText: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.semibold as any,
      color: C.onAccent,
      letterSpacing: 0.3,
    },
    viewPastLink: {
      alignItems: 'center',
      paddingVertical: SPACING.md,
      marginTop: SPACING.xs,
    },
    viewPastText: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.bronze,
    },
  });

export default SeasonStartSheet;
