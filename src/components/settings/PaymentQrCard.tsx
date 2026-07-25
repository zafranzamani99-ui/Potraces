import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
  Image,
  Dimensions,
  LayoutChangeEvent,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Feather } from '@expo/vector-icons';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import Button from '../common/Button';
import ModalToastHost from '../common/ModalToastHost';
import NeuButton from '../common/NeuButton';
import { useNeu } from '../common/neu';
import { newstOutline } from '../business/NewstInput';
import QrCaptureModal, { type QrCaptureResult } from '../common/QrCaptureModal';
import { useToast } from '../../context/ToastContext';
import { lightTap } from '../../services/haptics';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';

/**
 * Payment-QR manager block, shared by Personal and Business Settings.
 * The `mode` prop decides which QR list it reads/writes (paymentQrs vs
 * businessPaymentQrs) — the store actions are mode-parameterised, so the two
 * screens call the same actions with their own mode. `onLayout` lets the
 * parent capture this block's y-position for the scrollTo:'qr' deep-link.
 */
const PaymentQrCard: React.FC<{ mode: 'personal' | 'business'; onLayout?: (e: LayoutChangeEvent) => void }> = ({ mode, onLayout }) => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = React.useMemo(() => makeStyles(C), [C]);
  const neu = useNeu();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [qrLabelFocused, setQrLabelFocused] = useState(false);

  const personalQrs = useSettingsStore((s) => s.paymentQrs) || [];
  const businessQrs = useSettingsStore((s) => s.businessPaymentQrs) || [];
  const paymentQrs = mode === 'business' ? businessQrs : personalQrs;
  const addPaymentQr = useSettingsStore((s) => s.addPaymentQr);
  const removePaymentQr = useSettingsStore((s) => s.removePaymentQr);
  const replacePaymentQr = useSettingsStore((s) => s.replacePaymentQr);
  const updatePaymentQrLabel = useSettingsStore((s) => s.updatePaymentQrLabel);

  const [qrActionIndex, setQrActionIndex] = useState<number | null>(null);
  const [qrLoadingIndex, setQrLoadingIndex] = useState<number | null>(null);
  const [qrLabelModal, setQrLabelModal] = useState<{ visible: boolean; uri?: string; replaceIndex?: number; renameIndex?: number; defaultLabel: string }>({ visible: false, defaultLabel: '' });
  const [qrLabelInput, setQrLabelInput] = useState('');
  const [qrPreviewIndex, setQrPreviewIndex] = useState<number | null>(null);
  const [scanModalVisible, setScanModalVisible] = useState(false);

  const handlePickQrImage = useCallback(async (replaceIndex?: number) => {
    lightTap();
    setQrLoadingIndex(replaceIndex ?? paymentQrs.length);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.[0]) { setQrLoadingIndex(null); return; }
      const srcUri = result.assets[0].uri;
      let destUri = srcUri;
      try {
        const dir = `${FileSystem.documentDirectory}payment-qrs/`;
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
        const filename = `qr_${Date.now()}.jpg`;
        destUri = `${dir}${filename}`;
        await FileSystem.copyAsync({ from: srcUri, to: destUri });
      } catch {
        destUri = srcUri;
      }
      const defaultLabel = replaceIndex !== undefined ? (paymentQrs[replaceIndex]?.label || '') : '';
      setQrLoadingIndex(null);
      setTimeout(() => {
        setQrLabelInput(defaultLabel);
        setQrLabelModal({ visible: true, uri: destUri, replaceIndex, defaultLabel });
      }, 50);
    } catch {
      setQrLoadingIndex(null);
    }
  }, [paymentQrs]);

  const handleQrLongPress = useCallback((index: number) => {
    lightTap();
    setQrActionIndex(index);
  }, []);

  const handleQrAction = useCallback((action: 'replace' | 'rename' | 'delete') => {
    const index = qrActionIndex;
    if (index === null) return;
    const qr = paymentQrs[index];
    if (!qr) return;
    setQrActionIndex(null);

    if (action === 'replace') {
      // Close modal first, then launch picker after delay (onDismiss is iOS-only)
      setTimeout(() => handlePickQrImage(index), 100);
    } else if (action === 'rename') {
      setQrLabelInput(qr.label);
      setQrLabelModal({ visible: true, renameIndex: index, defaultLabel: qr.label });
    } else if (action === 'delete') {
      removePaymentQr(index, mode);
      showToast(t.settings.qrRemoved, 'success');
    }
  }, [qrActionIndex, paymentQrs, handlePickQrImage, removePaymentQr, showToast, mode, t]);

  const handleScannedQr = useCallback((r: QrCaptureResult) => {
    setScanModalVisible(false);
    addPaymentQr(r.uri, r.label, mode, { payload: r.payload, network: r.network, merchantName: r.merchantName });
    showToast(t.qrPay.qrSaved, 'success');
  }, [addPaymentQr, mode, showToast, t]);

  return (
    <View onLayout={onLayout}>
      <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.md }}>
        <View style={styles.settingLabelRow}>
          <View style={{ width: 34, height: 34, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha('#B2780A', isDark ? 0.2 : 0.12) }}>
            <Feather name="credit-card" size={18} color="#B2780A" />
          </View>
          <Text style={[styles.settingLabel, { color: C.textPrimary, marginLeft: 0 }]}>{t.settings.paymentQr}</Text>
        </View>
        <Text style={[styles.qrSubtitle, { marginTop: SPACING.sm }]}>{t.settings.qrSubtitle}</Text>
      </View>
      <View style={[styles.qrSlots, { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md }]}>
        {[0, 1].map((idx) => {
          const qr = paymentQrs[idx];
          return (
            <View key={idx} style={styles.qrSlot}>
              {qr ? (
                <TouchableOpacity
                  style={styles.qrSlotFilled}
                  onPress={() => setQrPreviewIndex(idx)}
                  onLongPress={() => handleQrLongPress(idx)}
                  delayLongPress={400}
                  activeOpacity={0.7}
                  disabled={qrLoadingIndex !== null}
                >
                  <View style={styles.qrSlotIcon}>
                    {qrLoadingIndex === idx ? (
                      <ActivityIndicator size="small" color={C.accent} />
                    ) : (
                      <Feather name="check-circle" size={20} color={C.accent} />
                    )}
                  </View>
                  <Text style={styles.qrSlotLabel} numberOfLines={1}>
                    {qrLoadingIndex === idx ? t.settings.qrOpening : qr.label}
                  </Text>
                  {qrLoadingIndex !== idx && (
                    <Feather name="more-vertical" size={16} color={C.textMuted} />
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.qrSlotEmpty}
                  onPress={() => handlePickQrImage()}
                  activeOpacity={0.6}
                  disabled={qrLoadingIndex !== null}
                >
                  {qrLoadingIndex === idx ? (
                    <ActivityIndicator size="small" color={C.accent} />
                  ) : (
                    <Feather name="plus" size={22} color={C.accent} />
                  )}
                  <Text style={styles.qrSlotAddText}>
                    {qrLoadingIndex === idx ? t.settings.qrOpening : t.settings.addQrShort}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>
      {/* Scan-standee: BUSINESS ONLY — a printed DuitNow standee is a seller
          thing; personal users add QRs from bank-app screenshots (owner call,
          2026-07-22). */}
      {mode === 'business' && paymentQrs.length < 2 && (
        <View style={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm }}>
          <Button
            title={t.qrPay.scanStandee}
            onPress={() => { lightTap(); setScanModalVisible(true); }}
            variant="outline"
            icon="camera"
            fullWidth
            style={{ marginTop: SPACING.xs }}
          />
          <Text style={[styles.qrSubtitle, { marginTop: SPACING.sm, marginBottom: 0 }]}>
            {t.qrPay.scanStandeeHint}
          </Text>
        </View>
      )}
      <Text style={[styles.qrSubtitle, { marginHorizontal: SPACING.lg, marginTop: SPACING.xs, marginBottom: SPACING.md }]}>
        {t.qrPay.bankAppNote}
      </Text>

      <QrCaptureModal
        visible={scanModalVisible}
        onClose={() => setScanModalVisible(false)}
        onCaptured={handleScannedQr}
      />

      {/* QR Action Sheet — animationType="none" so dismiss is instant before image picker */}
      <Modal
        visible={qrActionIndex !== null}
        transparent
        statusBarTranslucent
        animationType="none"
        onRequestClose={() => setQrActionIndex(null)}
      >
        <Pressable style={styles.qrActionOverlay} onPress={() => setQrActionIndex(null)}>
          <View style={[styles.qrActionSheet, { backgroundColor: C.surface }]} onStartShouldSetResponder={() => true}>
            <Text style={styles.qrActionTitle}>
              {qrActionIndex !== null ? paymentQrs[qrActionIndex]?.label ?? '' : ''}
            </Text>

            <TouchableOpacity
              style={styles.qrActionItem}
              onPress={() => handleQrAction('replace')}
              activeOpacity={0.6}
            >
              <View style={[styles.qrActionIconBg, { backgroundColor: withAlpha(C.accent, 0.1) }]}>
                <Feather name="image" size={18} color={C.accent} />
              </View>
              <Text style={styles.qrActionText}>{t.settings.qrReplaceImage}</Text>
              <Feather name="chevron-right" size={16} color={C.textMuted} />
            </TouchableOpacity>

            <View style={styles.qrActionDivider} />

            <TouchableOpacity
              style={styles.qrActionItem}
              onPress={() => handleQrAction('rename')}
              activeOpacity={0.6}
            >
              <View style={[styles.qrActionIconBg, { backgroundColor: withAlpha(C.accent, 0.1) }]}>
                <Feather name="edit-2" size={18} color={C.accent} />
              </View>
              <Text style={styles.qrActionText}>{t.settings.qrRename}</Text>
              <Feather name="chevron-right" size={16} color={C.textMuted} />
            </TouchableOpacity>

            <View style={styles.qrActionDivider} />

            <TouchableOpacity
              style={styles.qrActionItem}
              onPress={() => handleQrAction('delete')}
              activeOpacity={0.6}
            >
              <View style={[styles.qrActionIconBg, { backgroundColor: withAlpha(C.neutral, 0.1) }]}>
                <Feather name="trash-2" size={18} color={C.neutral} />
              </View>
              <Text style={[styles.qrActionText, { color: C.neutral }]}>{t.settings.qrDelete}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
        <ModalToastHost />
      </Modal>

      {/* QR Label Prompt Modal (cross-platform Alert.prompt replacement).
          Onyx/neu rules: C.background card + neu.raisedModal (no border, no
          surface slab), 0.4 backdrop, no open animation, newstOutline input,
          Neu Select save. Anchored LOW — it was centering in the
          keyboard-shrunk space, which read as "too high". */}
      <Modal
        visible={qrLabelModal.visible}
        transparent
        statusBarTranslucent
        animationType="none"
        onRequestClose={() => setQrLabelModal((s) => ({ ...s, visible: false }))}
      >
        <KeyboardAvoidingView behavior="padding" style={styles.qrLabelKav}>
        <Pressable style={[styles.qrLabelOverlay, { paddingBottom: insets.bottom + SPACING['2xl'] }]} onPress={() => setQrLabelModal((s) => ({ ...s, visible: false }))}>
          <Pressable style={[styles.qrLabelCard, neu.raisedModal]} onStartShouldSetResponder={() => true}>
            <Text style={styles.qrLabelTitle}>
              {qrLabelModal.renameIndex !== undefined ? t.settings.qrRenameTitle : t.settings.qrNameTitle}
            </Text>
            <TextInput
              style={[styles.qrLabelInput, newstOutline(C, qrLabelFocused)]}
              value={qrLabelInput}
              onChangeText={setQrLabelInput}
              onFocus={() => setQrLabelFocused(true)}
              onBlur={() => setQrLabelFocused(false)}
              placeholder={t.settings.qrNamePlaceholder}
              placeholderTextColor={C.neutral}
              autoFocus
              selectTextOnFocus
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={withAlpha(C.accent, 0.25)}
            />
            <View style={styles.qrLabelBtnRow}>
              <TouchableOpacity
                style={styles.qrLabelCancel}
                onPress={() => setQrLabelModal((s) => ({ ...s, visible: false }))}
                accessibilityRole="button"
                accessibilityLabel={t.settings.qrCancel}
              >
                <Text style={{ color: C.textSecondary, fontWeight: TYPOGRAPHY.weight.medium }}>{t.settings.qrCancel}</Text>
              </TouchableOpacity>
              {/* flex:1 wrapper — NeuButton is width:'100%' of its parent; without
                  this it shrinks to its label (same confirmCol trick as StallProducts). */}
              <View style={{ flex: 1 }}>
                <NeuButton
                  icon="check"
                  label={t.settings.qrSave}
                  color={C.accent}
                  onPress={() => {
                    const label = qrLabelInput.trim();
                    if (qrLabelModal.renameIndex !== undefined) {
                      if (label) updatePaymentQrLabel(qrLabelModal.renameIndex, label, mode);
                    } else if (qrLabelModal.uri) {
                      const qrLabel = label || `QR ${qrLabelModal.replaceIndex !== undefined ? qrLabelModal.replaceIndex + 1 : paymentQrs.length + 1}`;
                      if (qrLabelModal.replaceIndex !== undefined) {
                        replacePaymentQr(qrLabelModal.replaceIndex, qrLabelModal.uri, qrLabel, mode);
                        showToast(t.settings.qrUpdated, 'success');
                      } else {
                        addPaymentQr(qrLabelModal.uri, qrLabel, mode);
                        showToast(t.settings.qrAdded, 'success');
                      }
                    }
                    setQrLabelModal((s) => ({ ...s, visible: false }));
                  }}
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
        <ModalToastHost />
      </Modal>

      {/* QR Fullscreen Preview */}
      <Modal
        visible={qrPreviewIndex !== null}
        transparent
        statusBarTranslucent
        animationType="none"
        onRequestClose={() => setQrPreviewIndex(null)}
      >
        <View style={styles.qrPreviewOverlay}>
          <TouchableOpacity
            style={styles.qrPreviewClose}
            onPress={() => setQrPreviewIndex(null)}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          >
            <Feather name="x" size={28} color="#fff" />
          </TouchableOpacity>

          {qrPreviewIndex !== null && paymentQrs[qrPreviewIndex] && (
            <Text style={styles.qrPreviewLabel}>{paymentQrs[qrPreviewIndex].label}</Text>
          )}

          {qrPreviewIndex !== null && paymentQrs[qrPreviewIndex] && (
            <Image
              source={{ uri: paymentQrs[qrPreviewIndex].uri }}
              style={styles.qrPreviewImage}
              resizeMode="contain"
            />
          )}

          {paymentQrs.length > 1 && (
            <View style={styles.qrPreviewTabs}>
              {paymentQrs.map((qr, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.qrPreviewTab, qrPreviewIndex === i && styles.qrPreviewTabActive]}
                  onPress={() => { lightTap(); setQrPreviewIndex(i); }}
                >
                  <Text style={[styles.qrPreviewTabText, qrPreviewIndex === i && styles.qrPreviewTabTextActive]}>
                    {qr.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
        <ModalToastHost />
      </Modal>
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: SPACING.xs,
  },
  settingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  settingLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  qrSubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginBottom: SPACING.md,
  },
  qrSlots: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  qrSlot: {
    flex: 1,
  },
  qrSlotFilled: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withAlpha(C.accent, 0.06),
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  qrSlotIcon: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    backgroundColor: withAlpha(C.accent, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrSlotLabel: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  qrSlotEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: C.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.lg,
    gap: SPACING.xs,
  },
  qrSlotAddText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.accent,
  },
  qrActionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: SPACING['2xl'],
  },
  qrActionSheet: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: C.border,
  },
  qrActionTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  qrActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  qrActionIconBg: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrActionText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  qrActionDivider: {
    height: 1,
    backgroundColor: C.border,
  },
  qrLabelKav: {
    flex: 1,
    // Onyx rule 4 — every scrim is 0.4, no 0.35 variants.
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  qrLabelOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: SPACING['2xl'],
  },
  // Onyx/neu modal card: C.background (never C.surface slab), radius xl,
  // neu.raisedModal supplies separation — NO border outline (Onyx rule 2).
  qrLabelCard: {
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
    padding: SPACING['2xl'],
    width: '100%',
    maxWidth: 340,
    gap: SPACING.lg,
  },
  qrLabelTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  // Layout + type only; the ONE input border comes from newstOutline in the JSX.
  qrLabelInput: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    minHeight: 48,
  },
  qrLabelBtnRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    alignItems: 'center',
  },
  qrLabelCancel: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    minHeight: 44,
    justifyContent: 'center',
  },
  qrPreviewOverlay: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrPreviewClose: {
    position: 'absolute',
    top: 72,
    right: SPACING.xl,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  qrPreviewLabel: {
    position: 'absolute',
    top: 80,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: '#fff',
    zIndex: 10,
  },
  qrPreviewImage: {
    width: Dimensions.get('window').width - SPACING['2xl'] * 2,
    height: Dimensions.get('window').width - SPACING['2xl'] * 2,
    borderRadius: RADIUS.lg,
    backgroundColor: '#fff',
  },
  qrPreviewTabs: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
    zIndex: 10,
  },
  qrPreviewTab: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  qrPreviewTabActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  qrPreviewTabText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: 'rgba(255,255,255,0.5)',
  },
  qrPreviewTabTextActive: {
    color: '#fff',
  },
});

export default PaymentQrCard;
