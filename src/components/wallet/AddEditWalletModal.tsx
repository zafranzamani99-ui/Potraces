import React, { useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Image,
  Pressable,
  StyleSheet,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { Gesture, GestureDetector, GestureHandlerRootView, ScrollView, ComposedGesture, GestureType } from 'react-native-gesture-handler';
import ModalToastHost from '../common/ModalToastHost';
import CategoryIcon from '../common/CategoryIcon';
import NeuButton from '../common/NeuButton';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
  SharedValue,
} from 'react-native-reanimated';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useNeu } from '../common/neu';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { useT } from '../../i18n';
import { lightTap } from '../../services/haptics';
import { WalletType } from '../../types';

type AddStep = 'type' | 'credit_card' | 'details';
type CreditCardStep = 'bank' | 'network';
type CardNetwork = 'visa' | 'mastercard' | 'amex';

interface WalletPreset {
  id: string;
  name: string;
  type: WalletType;
  color: string;
}

interface WalletTypeConfigEntry {
  label: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  editingWallet: string | null;
  addStep: AddStep;
  setAddStep: (s: AddStep) => void;
  creditCardStep: CreditCardStep;
  setCreditCardStep: (s: CreditCardStep) => void;

  // form fields
  name: string;
  setName: (v: string) => void;
  balance: string;
  setBalance: (v: string) => void;
  creditLimit: string;
  setCreditLimit: (v: string) => void;
  selectedIcon: string;
  setSelectedIcon: (v: string) => void;
  selectedColor: string;
  setSelectedColor: (v: string) => void;
  selectedType: WalletType;
  setSelectedType: (v: WalletType) => void;
  selectedPresetId: string | null;
  setSelectedPresetId: (v: string | null) => void;
  selectedCreditBank: string | null;
  setSelectedCreditBank: (v: string | null) => void;
  selectedNetwork: CardNetwork | null;
  setSelectedNetwork: (v: CardNetwork | null) => void;

  // handlers
  resetForm: () => void;
  onSave: () => void;
  canAddType: (t: WalletType) => boolean;
  showTypePaywall: (t: WalletType) => void;
  handleChooseTypeAndPreset: (t: WalletType, presetId: string | null) => void;
  goToType: (t: WalletType) => void;

  // animation refs/values from parent
  panelWidth: number;
  setPanelWidth: (w: number) => void;
  panelWidthRef: React.MutableRefObject<number>;
  typeRailX: SharedValue<number>;
  typeSwipeGesture: ComposedGesture | GestureType;
  creditCardBackGesture: ComposedGesture | GestureType;

  // currency + insets
  currency: string;
  insets: { bottom: number };

  // constants from parent
  WALLET_TYPE_CONFIG: Record<WalletType, WalletTypeConfigEntry>;
  WALLET_PRESETS: WalletPreset[];
  WALLET_ICONS_BY_TYPE: Record<WalletType, string[]>;
  WALLET_COLORS: string[];
  BANK_LOGOS: Record<string, any>;
  CARD_NETWORK_LOGOS: Record<CardNetwork, any>;
  LOGO_SIZE: Record<string, [number, number]>;
}

const AddEditWalletModal: React.FC<Props> = ({
  visible,
  onClose,
  editingWallet,
  addStep,
  setAddStep,
  creditCardStep,
  setCreditCardStep,
  name,
  setName,
  balance,
  setBalance,
  creditLimit,
  setCreditLimit,
  selectedIcon,
  setSelectedIcon,
  selectedColor,
  setSelectedColor,
  selectedType,
  setSelectedType,
  selectedPresetId,
  setSelectedPresetId,
  selectedCreditBank,
  setSelectedCreditBank,
  selectedNetwork,
  setSelectedNetwork,
  resetForm,
  onSave,
  canAddType,
  showTypePaywall,
  handleChooseTypeAndPreset,
  goToType,
  panelWidth,
  setPanelWidth,
  panelWidthRef,
  typeRailX,
  typeSwipeGesture,
  creditCardBackGesture,
  currency,
  insets,
  WALLET_TYPE_CONFIG,
  WALLET_PRESETS,
  WALLET_ICONS_BY_TYPE,
  WALLET_COLORS,
  BANK_LOGOS,
  CARD_NETWORK_LOGOS,
  LOGO_SIZE,
}) => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const { height: SCREEN_H } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(C), [C]);
  // Tiles sit on the modal sheet (C.surface), not the screen — base the neu on it.
  const neu = useNeu(C.surface);
  const balanceInputRef = useRef<TextInput>(null);

  const isBottomSheet = addStep === 'details' || !!editingWallet;

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    onClose();
    resetForm();
  }, [onClose, resetForm]);

  // Reanimated UI-thread style for the bank/ewallet/credit type rail.
  const railAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: typeRailX.value }],
  }));

  // ── Drag-to-dismiss (active only in bottom sheet mode) ──
  const sheetY = useSharedValue(SCREEN_H);
  const dragStart = useSharedValue(0);
  const closingRef = useRef(false);

  useEffect(() => {
    if (visible && isBottomSheet) {
      closingRef.current = false;
      sheetY.value = SCREEN_H;
      sheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
    }
  }, [visible, isBottomSheet, SCREEN_H, sheetY]);

  const finishClose = useCallback(() => {
    if (!closingRef.current) return;
    closingRef.current = false;
    handleClose();
  }, [handleClose]);

  const closeSheet = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    Keyboard.dismiss();
    sheetY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
  }, [SCREEN_H, sheetY, finishClose]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([10, 9999])
        .onStart(() => {
          'worklet';
          dragStart.value = sheetY.value;
        })
        .onUpdate((e) => {
          'worklet';
          let newY = dragStart.value + e.translationY;
          if (newY < 0) newY = newY / 3;
          sheetY.value = newY;
        })
        .onEnd((e) => {
          'worklet';
          if (e.translationY > 100 || e.velocityY > 800) {
            runOnJS(closeSheet)();
          } else {
            sheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [SCREEN_H, closeSheet]
  );

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));
  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));

  if (!visible) return null;

  const titleText = editingWallet
    ? <>edit <Text style={styles.sheetTitleAccent}>wallet</Text></>
    : addStep === 'type'
    ? <>add <Text style={styles.sheetTitleAccent}>wallet</Text></>
    : addStep === 'credit_card'
    ? (creditCardStep === 'network'
      ? <>card <Text style={styles.sheetTitleAccent}>network</Text></>
      : <>which <Text style={styles.sheetTitleAccent}>bank</Text></>)
    : <>wallet <Text style={styles.sheetTitleAccent}>details</Text></>;

  // Formatted (thousand-separator) display value for the balance/credit-limit hero input.
  // Precomputed here (rather than inline in the TextInput's `value` prop) so the same
  // string is available in the onFocus handler for imperative select-all.
  const heroAmountRaw = selectedType === 'credit' ? creditLimit : balance;
  const heroAmountDisplay = (() => {
    if (!heroAmountRaw) return '';
    const dotIdx = heroAmountRaw.indexOf('.');
    const intRaw = dotIdx === -1 ? heroAmountRaw : heroAmountRaw.slice(0, dotIdx);
    const fracRaw = dotIdx === -1 ? null : heroAmountRaw.slice(dotIdx + 1);
    const intFmt = intRaw ? Number(intRaw).toLocaleString('en-US') : '';
    return fracRaw === null ? intFmt : `${intFmt}.${fracRaw}`;
  })();

  const scrollContent = (
    <KeyboardAwareScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      contentContainerStyle={{ paddingHorizontal: SPACING.xl, paddingBottom: SPACING.lg }}
      keyboardDismissMode="on-drag"
    >
      {/* Step 1: Choose Type + Provider */}
      {addStep === 'type' && !editingWallet && (
        <GestureDetector gesture={typeSwipeGesture}>
        <View>
          {/* Wallet-type toggle — the real iOS 26 glass segmented control (draggable
              bubble), same as the Personal/Business mode toggle. */}
          <SegmentedControl
            style={styles.typeSegmented}
            values={(['bank', 'ewallet', 'credit', 'cash'] as WalletType[]).map((type) => WALLET_TYPE_CONFIG[type].label.split(' ')[0])}
            selectedIndex={(['bank', 'ewallet', 'credit', 'cash'] as WalletType[]).indexOf(selectedType)}
            onChange={(e) => goToType((['bank', 'ewallet', 'credit', 'cash'] as WalletType[])[e.nativeEvent.selectedSegmentIndex])}
            fontStyle={{ color: C.textSecondary, fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.medium as any }}
            activeFontStyle={{ color: C.accent, fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold as any }}
          />

          <View
            style={{ overflow: 'hidden' }}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              panelWidthRef.current = w;
              if (panelWidth === 0) setPanelWidth(w);
            }}
          >
            {panelWidth > 0 && (
              <Reanimated.View style={[{ flexDirection: 'row' }, railAnimatedStyle]}>
                {(['bank', 'ewallet', 'credit', 'cash'] as WalletType[]).map((panelType) => (
                  <View key={panelType} style={{ width: panelWidth }}>
                    <ScrollView style={{ maxHeight: 332 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                      <View style={styles.providerGrid}>
                        {WALLET_PRESETS.filter((p) => p.type === panelType && p.id !== 'credit_card').map((preset) => {
                          const logo = BANK_LOGOS[preset.id];
                          return (
                            <TouchableOpacity
                              key={preset.id}
                              style={[styles.providerTile, neu.raised]}
                              onPress={() => {
                                if (!canAddType(panelType)) { showTypePaywall(panelType); return; }
                                handleChooseTypeAndPreset(panelType, preset.id);
                              }}
                              activeOpacity={0.7}
                              accessibilityRole="button"
                              accessibilityLabel={preset.name.toLowerCase()}
                            >
                              {logo ? (
                                <ExpoImage
                                  source={logo}
                                  style={LOGO_SIZE[preset.id]
                                    ? {
                                        width: '85%',
                                        height: '70%',
                                        maxWidth: LOGO_SIZE[preset.id][0],
                                        maxHeight: LOGO_SIZE[preset.id][1],
                                      }
                                    : styles.providerLogo}
                                  contentFit="contain"
                                  cachePolicy="memory-disk"
                                  transition={0}
                                />
                              ) : (
                                <Text style={styles.providerName} numberOfLines={2}>{preset.name}</Text>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                        {panelType === 'credit' && (
                          <TouchableOpacity
                            style={[styles.providerTile, neu.raised]}
                            onPress={() => {
                              if (!canAddType('credit')) { showTypePaywall('credit'); return; }
                              lightTap();
                              setCreditCardStep('network');
                              setSelectedCreditBank(null);
                              setSelectedNetwork(null);
                              setAddStep('credit_card');
                            }}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel={t.wallets.creditCardLabel.toLowerCase()}
                          >
                            <ExpoImage source={BANK_LOGOS['credit_card']} style={styles.providerLogo} contentFit="contain" cachePolicy="memory-disk" transition={0} />
                            <Text style={[styles.providerName, { marginTop: SPACING.xs, fontSize: TYPOGRAPHY.size.xs }]}>{t.wallets.creditCardLabel}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </ScrollView>
                    <TouchableOpacity
                      style={styles.otherOption}
                      onPress={() => {
                        if (!canAddType(panelType)) { showTypePaywall(panelType); return; }
                        handleChooseTypeAndPreset(panelType, null);
                      }}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={t.wallets.enterManually.toLowerCase()}
                    >
                      <Text style={styles.otherOptionText}>{t.wallets.enterManually}</Text>
                      <Feather name="arrow-right" size={13} color={C.textMuted} />
                    </TouchableOpacity>
                  </View>
                ))}
              </Reanimated.View>
            )}
          </View>
        </View>
        </GestureDetector>
      )}

      {/* Step 2: Credit Card bank + network picker */}
      {addStep === 'credit_card' && (
        <GestureDetector gesture={creditCardBackGesture}>
        <View>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              if (creditCardStep === 'bank') { setCreditCardStep('network'); } else { setAddStep('type'); setSelectedType('credit'); }
            }}
            accessibilityRole="button"
            accessibilityLabel={t.common.back.toLowerCase()}
          >
            <Feather name="arrow-left" size={18} color={C.textSecondary} />
            <Text style={styles.backBtnText}>{creditCardStep === 'bank' ? 'Change network' : 'Back'}</Text>
          </TouchableOpacity>

          {creditCardStep === 'network' && (
            <View style={[styles.providerGrid, { justifyContent: 'center' }]}>
              {(['visa', 'mastercard', 'amex'] as const).map((network) => (
                <TouchableOpacity
                  key={network}
                  style={[styles.providerTile, styles.networkTile, neu.raised]}
                  onPress={() => {
                    lightTap();
                    setSelectedNetwork(network);
                    setCreditCardStep('bank');
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={network}
                >
                  <ExpoImage source={CARD_NETWORK_LOGOS[network]} style={styles.providerLogo} contentFit="contain" cachePolicy="memory-disk" transition={0} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {creditCardStep === 'bank' && (
            <ScrollView style={{ maxHeight: 332 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            <View style={styles.providerGrid}>
              {WALLET_PRESETS.filter((p) => p.type === 'bank').map((preset) => {
                const logo = BANK_LOGOS[preset.id];
                return (
                  <TouchableOpacity
                    key={preset.id}
                    style={[styles.providerTile, neu.raised]}
                    onPress={() => {
                      lightTap();
                      const networkLabel = selectedNetwork === 'visa' ? 'Visa' : selectedNetwork === 'mastercard' ? 'Mastercard' : 'Amex';
                      setSelectedCreditBank(preset.id);
                      setSelectedType('credit');
                      setSelectedPresetId('credit_card');
                      setName(`${preset.name} ${networkLabel}`);
                      setSelectedColor(preset.color);
                      setSelectedIcon('credit-card');
                      setAddStep('details');
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={preset.name.toLowerCase()}
                  >
                    {logo ? (
                      <ExpoImage
                        source={logo}
                        style={LOGO_SIZE[preset.id] ? { width: LOGO_SIZE[preset.id][0], height: LOGO_SIZE[preset.id][1] } : styles.providerLogo}
                        contentFit="contain"
                        cachePolicy="memory-disk"
                        transition={0}
                      />
                    ) : (
                      <Text style={styles.providerName} numberOfLines={2}>{preset.name}</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
            </ScrollView>
          )}
        </View>
        </GestureDetector>
      )}

      {/* Step 3: Details */}
      {addStep === 'details' && (
        <View>
          {!editingWallet && (
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => selectedNetwork ? setAddStep('credit_card') : setAddStep('type')}
              accessibilityRole="button"
              accessibilityLabel={t.common.back.toLowerCase()}
            >
              <Feather name="arrow-left" size={18} color={C.textSecondary} />
              <Text style={styles.backBtnText}>{t.common.back}</Text>
            </TouchableOpacity>
          )}

          <View style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>{t.wallets.walletName.toLowerCase()}</Text>
            <TextInput
              style={styles.fieldInput}
              value={name}
              onChangeText={setName}
              placeholder={`e.g. ${WALLET_TYPE_CONFIG[selectedType].label}`}
              placeholderTextColor={withAlpha(C.textPrimary, 0.25)}
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={withAlpha(C.accent, 0.25)}
              accessibilityLabel={t.wallets.walletName.toLowerCase()}
            />
          </View>

          <View style={styles.heroCard}>
            <Text style={styles.fieldLabel}>
              {(selectedType === 'credit' ? t.wallets.creditLimit : editingWallet ? t.wallets.currentBalance : t.wallets.initialBalance2).toLowerCase()}
            </Text>
            <View style={styles.heroAmountRow}>
              <Text style={styles.heroCurrency} numberOfLines={1}>{currency}</Text>
              <TextInput
                ref={balanceInputRef}
                style={styles.heroAmountInput}
                value={heroAmountDisplay}
                onChangeText={(raw: string) => {
                  const stripped = raw.replace(/,/g, '').replace(/[^\d.]/g, '');
                  const fd = stripped.indexOf('.');
                  let normalized = stripped;
                  if (fd !== -1) {
                    normalized = stripped.slice(0, fd + 1) + stripped.slice(fd + 1).replace(/\./g, '');
                    const [ip, fp = ''] = normalized.split('.');
                    normalized = ip + '.' + fp.slice(0, 2);
                  }
                  (selectedType === 'credit' ? setCreditLimit : setBalance)(normalized);
                }}
                onFocus={() => {
                  // Select-all-on-focus, done imperatively (once per focus event) instead of via
                  // the `selectTextOnFocus` prop — on Android, that prop reselects the whole
                  // value after every keystroke (since `value` changes on each render while
                  // still focused), so a second digit typed replaces the first instead of
                  // appending to it.
                  if (heroAmountDisplay) {
                    balanceInputRef.current?.setNativeProps({ selection: { start: 0, end: heroAmountDisplay.length } });
                  }
                }}
                placeholder="0.00"
                placeholderTextColor={withAlpha(C.textPrimary, 0.12)}
                keyboardType="decimal-pad"
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={withAlpha(C.accent, 0.25)}
                accessibilityLabel={selectedType === 'credit' ? t.wallets.creditLimit.toLowerCase() : t.wallets.currentBalance.toLowerCase()}
              />
            </View>
          </View>

          {selectedPresetId === 'credit_card' && selectedCreditBank && selectedNetwork ? (
            <View>
              <Text style={styles.formLabelCompact}>{t.wallets.cardLabel}</Text>
              <View style={[styles.logoPreviewBox, { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm - 2 }]}>
                <View style={{ flexShrink: 1, maxWidth: '45%', alignItems: 'center' }}>
                  <Image source={BANK_LOGOS[selectedCreditBank]} style={{ width: 70, height: 36, maxWidth: '100%' }} resizeMode="contain" />
                </View>
                <Text style={{ color: C.border, fontSize: TYPOGRAPHY.size.lg + 1 }}>|</Text>
                <View style={{ flexShrink: 1, maxWidth: '40%', alignItems: 'center' }}>
                  <Image source={CARD_NETWORK_LOGOS[selectedNetwork]} style={{ width: 48, height: 30, maxWidth: '100%' }} resizeMode="contain" />
                </View>
              </View>
            </View>
          ) : selectedPresetId && BANK_LOGOS[selectedPresetId] ? (
            <View>
              <Text style={styles.formLabelCompact}>{t.wallets.iconLabel}</Text>
              <View style={styles.logoPreviewBox}>
                <Image source={BANK_LOGOS[selectedPresetId]} style={styles.logoPreview} resizeMode="contain" />
              </View>
            </View>
          ) : (
            <View style={styles.pickerRow}>
              <View style={styles.pickerCol}>
                <Text style={styles.formLabelCompact}>{t.wallets.iconLabel}</Text>
                <View style={styles.pickerGrid}>
                  {WALLET_ICONS_BY_TYPE[selectedType].map((icon) => (
                    <TouchableOpacity
                      key={icon}
                      style={[styles.pickerItem, selectedIcon === icon ? neu.inset : neu.raised, selectedIcon === icon && { backgroundColor: withAlpha(selectedColor, 0.15) }]}
                      onPress={() => { lightTap(); setSelectedIcon(icon); }}
                      accessibilityRole="button"
                      accessibilityLabel={icon}
                      accessibilityState={{ selected: selectedIcon === icon }}
                    >
                      <CategoryIcon icon={icon} size={20} color={selectedIcon === icon ? selectedColor : C.textSecondary} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={styles.pickerCol}>
                <Text style={styles.formLabelCompact}>{t.wallets.colorLabel}</Text>
                <View style={styles.pickerGrid}>
                  {WALLET_COLORS.map((color) => (
                    <TouchableOpacity
                      key={color}
                      style={[styles.colorItem, { backgroundColor: color }, selectedColor === color && styles.colorSelected]}
                      onPress={() => { lightTap(); setSelectedColor(color); }}
                      accessibilityRole="button"
                      accessibilityLabel={`${t.wallets.colorLabel.toLowerCase()} ${color}`}
                      accessibilityState={{ selected: selectedColor === color }}
                    >
                      {selectedColor === color && <Feather name="check" size={14} color={C.onAccent} />}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          )}
        </View>
      )}
    </KeyboardAwareScrollView>
  );

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={isBottomSheet ? closeSheet : handleClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        {isBottomSheet ? (
          <>
            <Reanimated.View style={[styles.backdrop, backdropAnimatedStyle]}>
              <Pressable style={{ flex: 1 }} onPress={closeSheet} />
            </Reanimated.View>

            <Reanimated.View style={[styles.sheetContainer, sheetAnimatedStyle]}>
              <GestureDetector gesture={panGesture}>
                <View collapsable={false}>
                  <View style={styles.sheetTopRow}>
                    <View style={styles.sheetHandle} />
                  </View>
                  <View style={styles.sheetTitleZone}>
                    <Text style={styles.sheetTitle}>{titleText}</Text>
                  </View>
                </View>
              </GestureDetector>

              {scrollContent}

              <View style={[styles.saveZone, { paddingBottom: Math.max(SPACING.lg, insets.bottom + SPACING.sm) }]}>
                <NeuButton
                  onPress={onSave}
                  icon={editingWallet ? 'check' : 'plus'}
                  label={(editingWallet ? t.wallets.saveChanges : t.wallets.createWallet).toLowerCase()}
                  accessibilityLabel={editingWallet ? 'save' : 'create'}
                />
                <Pressable style={styles.closeLink} onPress={closeSheet} hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}>
                  {({ pressed }: { pressed: boolean }) => (
                    <View style={[styles.closeLinkInner, pressed && { opacity: 0.55 }]}>
                      <Feather name="x" size={12} color={C.textMuted} />
                      <Text style={styles.closeLinkText}>close</Text>
                    </View>
                  )}
                </Pressable>
              </View>
            </Reanimated.View>
          </>
        ) : (
          <Pressable
            style={[styles.floatingOverlay, styles.typePickerOverlay]}
            onPress={handleClose}
          >
            <View
              style={styles.floatingContent}
              onStartShouldSetResponder={() => true}
            >
              <View style={styles.sheetTopRow}>
                <View style={styles.sheetHandle} />
              </View>
              <View style={styles.sheetTitleZone}>
                <Text style={styles.sheetTitle}>{titleText}</Text>
              </View>

              {scrollContent}
            </View>
          </Pressable>
        )}
      </GestureHandlerRootView>
      <ModalToastHost />
    </Modal>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: withAlpha(C.dimBg, 0.4),
  },
  sheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    maxHeight: '92%',
  },
  floatingOverlay: {
    flex: 1,
    backgroundColor: withAlpha(C.dimBg, 0.4),
    justifyContent: 'center',
    alignItems: 'center',
  },
  typePickerOverlay: {
    paddingHorizontal: SPACING.lg,
  },
  floatingContent: {
    backgroundColor: C.surface,
    borderRadius: RADIUS['2xl'],
    width: '100%',
    maxHeight: '85%',
  },
  sheetTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: withAlpha(C.textPrimary, 0.15),
  },
  sheetTitleZone: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  sheetTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  sheetTitleAccent: {
    fontStyle: 'italic',
    fontFamily: 'serif',
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.accent,
  },
  typeSegmented: {
    marginBottom: SPACING.md,
    height: 34,
  },
  providerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  providerTile: {
    flexBasis: '31%',
    flexGrow: 0,
    flexShrink: 1,
    maxWidth: '32%',
    aspectRatio: 1,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.sm - 2,
  },
  networkTile: {
    flexBasis: '30%',
    flexGrow: 0,
    flexShrink: 1,
    maxWidth: '32%',
  },
  providerLogo: {
    width: '85%',
    height: '70%',
  },
  providerName: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
    textAlign: 'center',
  },
  otherOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm - 2,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.sm,
  },
  otherOptionText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm - 2,
    paddingVertical: SPACING.sm - 2,
    marginBottom: SPACING.sm,
    alignSelf: 'flex-start',
  },
  backBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  formLabelCompact: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
    letterSpacing: 0.2,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm - 2,
  },
  fieldLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginBottom: 4,
    letterSpacing: 0.2,
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
  fieldInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
    paddingVertical: 2,
    minHeight: 22,
  },
  heroCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    marginBottom: SPACING.sm + 2,
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: SPACING.xs,
  },
  heroCurrency: {
    fontSize: 22,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.accent,
    fontVariant: ['tabular-nums'] as any,
    marginRight: SPACING.xs,
    letterSpacing: -0.2,
    maxWidth: '40%',
  },
  heroAmountInput: {
    flex: 1,
    fontSize: 36,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
    fontVariant: ['tabular-nums'] as any,
    letterSpacing: -0.8,
    paddingVertical: 0,
  },
  logoPreviewBox: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    padding: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
  },
  logoPreview: {
    width: 90,
    height: 40,
  },
  pickerRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  pickerCol: {
    flex: 1,
  },
  pickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm - 2,
  },
  pickerItem: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    // neu.raised (bg + shadow) spread at the call site
  },
  colorItem: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSelected: {
    borderWidth: 2,
    borderColor: C.surface,
  },
  saveZone: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(C.textPrimary, 0.06),
    backgroundColor: C.surface,
  },
  closeLink: {
    marginTop: SPACING.lg,
    alignSelf: 'center',
  },
  closeLinkInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  closeLinkText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
  },
});

export default AddEditWalletModal;
