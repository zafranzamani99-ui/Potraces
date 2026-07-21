// ─── CONFIRM DIALOG ────────────────────────────────────────
// Shared "are you sure?" dialog — the in-app replacement for native
// Alert.alert on destructive / irreversible actions. Centered card on a 0.4
// scrim, matching the Onyx centered-dialog recipe (see debt/FabChoiceModal).
//
// `children` is an optional slot under the message for extra context — e.g.
// Collectz' settle summary listing who has paid and who hasn't.
//
// IMPORTANT (iOS): a dialog opened from inside an already-open RN <Modal>
// (BottomSheet / FloatingModal) presents BEHIND it and is invisible. Pass
// `asOverlay` in that case to skip our own <Modal> and render as an
// absolute-fill layer inside the host modal's window — the same escape hatch
// PaywallModal uses.

import React, { useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useNeu } from './neu';
import { lightTap } from '../../services/haptics';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Red confirm button for irreversible actions (delete / cancel / remove). */
  destructive?: boolean;
  /** Disables both buttons and shows a spinner in the confirm slot. */
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  /** Extra content between the message and the buttons. */
  children?: React.ReactNode;
  /** Render without a <Modal> — for use inside an already-open modal. */
  asOverlay?: boolean;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onClose,
  children,
  asOverlay = false,
}) => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const neuS = useNeu(undefined, { faintDark: true });

  if (!visible) return null;

  const confirmFill = destructive ? C.overdue : C.accent;

  const body = (
    <Pressable style={styles.scrim} onPress={busy ? undefined : onClose}>
      {/* Swallow taps on the card so they don't dismiss via the scrim. */}
      <Pressable style={[styles.card, SHADOWS.lg]} onPress={() => {}}>
        <Text style={styles.title}>{title}</Text>
        {!!message && <Text style={styles.message}>{message}</Text>}

        {children}

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.cancelBtn, neuS.raised, pressed && { opacity: 0.85 }]}
            onPress={onClose}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={styles.cancelText}>{cancelLabel ?? t.common.cancel}</Text>
          </Pressable>

          {/* Semantic filled CTA — accent, or overdue-red when destructive. Per the
              Neu rules an accent-filled button does NOT also get a neu face. */}
          <Pressable
            style={({ pressed }) => [
              styles.confirmBtn,
              { backgroundColor: confirmFill },
              pressed && { opacity: 0.9 },
              busy && { opacity: 0.7 },
            ]}
            onPress={() => { lightTap(); onConfirm(); }}
            disabled={busy}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator size="small" color={C.onAccent} />
            ) : (
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            )}
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  );

  if (asOverlay) return body;

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      {body}
    </Modal>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  title: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    marginBottom: SPACING.xs,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  message: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(C.textPrimary, 0.03),
  },
  cancelText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
  },
  confirmBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.onAccent,
  },
});

export default React.memo(ConfirmDialog);
