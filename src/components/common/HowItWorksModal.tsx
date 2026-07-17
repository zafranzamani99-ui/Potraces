import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CALM, CALM_DARK, SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useNeu } from './neu';
import NeuButton from './NeuButton';

export interface HowItWorksSection {
  group: string;
  items: { icon: string; bold: string; rest: string }[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle: string;
  sections: HowItWorksSection[];
  dismissLabel?: string;
}

// Grouped "how it works" explainer — the shared pattern used by the Bills screen.
// Onyx card (C.background + faint-dark neu), tinted item rows with icon wells.
const HowItWorksModal: React.FC<Props> = ({ visible, onClose, title = 'how it works', subtitle, sections, dismissLabel = 'got it' }) => {
  const C = useCalm();
  const neu = useNeu(undefined, { faintDark: true });
  const s = useMemo(() => makeStyles(C), [C]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <View style={[s.card, neu.raisedSoft]} onStartShouldSetResponder={() => true}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled contentContainerStyle={{ paddingBottom: SPACING.sm }}>
            <View style={s.header}>
              <Text style={s.title}>{title}</Text>
              <Text style={s.subtitle}>{subtitle}</Text>
            </View>

            {sections.map((section) => (
              <View key={section.group}>
                <Text style={s.groupLabel}>{section.group}</Text>
                {section.items.map((item, ii) => (
                  <View key={ii} style={[s.item, neu.raised]}>
                    <View style={[s.iconCircle, neu.well]}>
                      <Feather name={item.icon as any} size={14} color={C.textSecondary} />
                    </View>
                    <Text style={s.text}>
                      <Text style={s.bold}>{item.bold}</Text>{' '}{item.rest}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>

          <View style={s.dismiss}>
            <NeuButton label={dismissLabel} onPress={onClose} />
          </View>
        </View>
      </Pressable>
    </Modal>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '75%',
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  header: { marginBottom: SPACING.md },
  title: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? -0.1 : -0.3,
  },
  subtitle: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginTop: 4,
    lineHeight: 16,
  },
  groupLabel: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm + 2,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.07 : 0.025),
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.sm + 2,
    marginBottom: 6,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.12 : 0.05),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  text: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
    lineHeight: 18,
  },
  bold: { fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary },
  dismiss: { marginTop: SPACING.md },
});

export default HowItWorksModal;
