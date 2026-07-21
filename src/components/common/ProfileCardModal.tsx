// ─── PROFILE CARD (floating, social-app style) ─────────────────────────
// Tap the greeting avatar on the Dashboard → centered card with the big avatar
// + editable name. Tapping the avatar opens the existing AvatarPicker sheet
// (stacked Modal presented on user action — the CategoryPicker-over-
// CommitmentForm pattern, presents on top on iOS). Name writes straight to
// settingsStore.userName, same as PersonalSettings.
//
// Onyx rule 2: no border on the card — separation comes from raisedModal.

import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { KeyboardAvoidingView as KAView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useSettingsStore } from '../../store/settingsStore';
import { lightTap } from '../../services/haptics';
import { useNeu } from './neu';
import Avatar from './Avatar';
import AvatarPicker from './AvatarPicker';
import NeuButton from './NeuButton';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const ProfileCardModal: React.FC<Props> = ({ visible, onClose }) => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const neu = useNeu();
  const userName = useSettingsStore((s) => s.userName);
  const setUserName = useSettingsStore((s) => s.setUserName);
  const [pickerVisible, setPickerVisible] = useState(false);

  const openPicker = () => {
    lightTap();
    setPickerVisible(true);
  };

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <KAView behavior="padding" style={styles.center}>
          <View
            style={[styles.card, { backgroundColor: C.background }, neu.raisedModal]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.header}>
              <Text style={[styles.title, { color: C.textPrimary }]}>{t.settings.name}</Text>
              <Pressable
                onPress={onClose}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t.common.close}
              >
                <Feather name="x" size={22} color={C.textPrimary} />
              </Pressable>
            </View>

            {/* Big avatar — tap to change (opens the preset picker sheet) */}
            <Pressable
              onPress={openPicker}
              style={styles.avatarWrap}
              accessibilityRole="button"
              accessibilityLabel={t.settings.avatarTitle}
            >
              <Avatar size={96} />
              <View style={[styles.badge, { backgroundColor: C.accent }]}>
                <Feather name="camera" size={13} color={C.onAccent} />
              </View>
            </Pressable>
            <Pressable onPress={openPicker} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.changeLink, { color: C.accent }]}>{t.settings.avatarTitle}</Text>
            </Pressable>

            {/* Name — same direct-write pattern as PersonalSettings */}
            <Text style={[styles.fieldLabel, { color: C.textMuted }]}>{t.settings.name}</Text>
            {/* Neu inset well (insetSoft) — the debossed input idiom; no fill
                or border needed since the shadow carves it out of the card. */}
            <View style={[styles.inputBox, neu.insetSoft]}>
              <Feather name="user" size={16} color={C.textMuted} />
              <TextInput
                value={userName}
                onChangeText={setUserName}
                placeholder={t.settings.enterYourName}
                placeholderTextColor={C.neutral}
                style={[styles.input, { color: C.textPrimary }]}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={withAlpha(C.accent, 0.25)}
                maxLength={40}
              />
            </View>

            <NeuButton
              label={t.common.done}
              icon="check"
              onPress={onClose}
              style={styles.doneBtn}
            />
          </View>
        </KAView>
      </TouchableOpacity>

      {/* Preset picker — declared INSIDE this Modal's children so it presents
          above the card on iOS (a plain sibling Modal presents behind). */}
      <AvatarPicker visible={pickerVisible} onClose={() => setPickerVisible(false)} />
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING['2xl'],
  },
  card: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: 16,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  avatarWrap: {
    alignSelf: 'center',
    marginTop: SPACING.xs,
  },
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeLink: {
    alignSelf: 'center',
    marginTop: SPACING.sm,
    fontSize: 12,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: TYPOGRAPHY.weight.semibold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: SPACING.lg,
    marginBottom: 2,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: TYPOGRAPHY.weight.medium,
    paddingVertical: SPACING.md,
  },
  doneBtn: { marginTop: SPACING.md },
});

export default React.memo(ProfileCardModal);
