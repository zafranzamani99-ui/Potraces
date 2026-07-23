import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Modal,
  Pressable,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Button from '../../components/common/Button';
import PaywallModal from '../../components/common/PaywallModal';
import { useNeu } from '../../components/common/neu';
import NewstInput from '../../components/business/NewstInput';
import BusinessCard, {
  CARD_COLORS,
  CARD_FONTS,
  CARD_LAYOUTS,
  LOGO_SHAPES,
  DEFAULT_CARD_COLOR,
  useBusinessCardFonts,
  type CardLayoutKey,
} from '../../components/business/BusinessCard';
import { useSettingsStore, type BusinessProfile as BizProfile, type BusinessBankDetails } from '../../store/settingsStore';
import { usePremiumStore } from '../../store/premiumStore';
import { shareCapturedView } from '../../services/receiptImageExport';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useToast } from '../../context/ToastContext';
import { lightTap } from '../../services/haptics';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';

type FieldKey = Exclude<keyof BizProfile, 'logoUri' | 'cardColor' | 'cardFont' | 'cardStyle' | 'logoShape'>;

/**
 * Schematic mini-preview of a card layout for the picker — a flat wireframe in
 * the selected colour, not a re-drawn card. Selected state = bronze ring.
 */
const LayoutThumb: React.FC<{ layout: CardLayoutKey; color: string; selected: boolean; C: ReturnType<typeof useCalm> }> = ({
  layout,
  color,
  selected,
  C,
}) => {
  const lineGrey = { backgroundColor: withAlpha(C.textPrimary, 0.18) };
  const lineWhite = { backgroundColor: 'rgba(255,255,255,0.75)' };
  return (
    <View style={[thumb.box, { borderColor: selected ? C.bronze : C.border }, selected && thumb.boxSelected]}>
      {layout === 'band' && (
        <>
          <View style={[thumb.band, { backgroundColor: color }]}>
            <View style={thumb.dotWhite} />
            <View style={[thumb.line, thumb.w60, lineWhite]} />
          </View>
          <View style={thumb.pad}>
            <View style={[thumb.line, thumb.w80, lineGrey]} />
            <View style={[thumb.line, thumb.w55, lineGrey]} />
          </View>
        </>
      )}
      {layout === 'split' && (
        <View style={thumb.row}>
          <View style={[thumb.split, { backgroundColor: color }]}>
            <View style={thumb.dotWhite} />
          </View>
          <View style={[thumb.pad, { flex: 1 }]}>
            <View style={[thumb.line, thumb.w80, { backgroundColor: withAlpha(C.textPrimary, 0.5) }]} />
            <View style={[thumb.line, thumb.w60, lineGrey]} />
            <View style={[thumb.line, thumb.w60, lineGrey]} />
          </View>
        </View>
      )}
      {layout === 'minimal' && (
        <View style={thumb.pad}>
          <View style={[thumb.line, thumb.w80, { backgroundColor: withAlpha(C.textPrimary, 0.55) }]} />
          <View style={[thumb.accentRule, { backgroundColor: color }]} />
          <View style={[thumb.line, thumb.w60, lineGrey]} />
          <View style={[thumb.line, thumb.w55, lineGrey]} />
        </View>
      )}
      {layout === 'solid' && (
        <View style={[thumb.fill, { backgroundColor: color }]}>
          <View style={thumb.dotWhite} />
          <View style={[thumb.line, thumb.w80, lineWhite]} />
          <View style={[thumb.line, thumb.w60, lineWhite]} />
          <View style={[thumb.line, thumb.w55, lineWhite]} />
        </View>
      )}
    </View>
  );
};

/** Styles for LayoutThumb — fixed sizes (it's a wireframe, not theme-typed). */
const thumb = StyleSheet.create({
  box: {
    width: 58,
    height: 72,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  boxSelected: { borderWidth: 2 },
  band: {
    height: 34,
    padding: 7,
    gap: 4,
  },
  fill: {
    flex: 1,
    padding: 7,
    gap: 4,
  },
  split: {
    width: 22,
    alignItems: 'center',
    paddingTop: 8,
  },
  row: { flexDirection: 'row', flex: 1 },
  pad: { padding: 7, gap: 5 },
  dotWhite: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  line: { height: 3, borderRadius: 2 },
  accentRule: { width: 12, height: 3, borderRadius: 2 },
  w80: { width: '80%' },
  w60: { width: '60%' },
  w55: { width: '55%' },
});

/**
 * Business Profile — the shop's premium "business card". Edits
 * settingsStore.businessProfile (business-only; survives sign-out, wiped by
 * Delete Account). Live-saves each field; the pencil on the card opens a
 * bottom sheet that restyles it (layout / colour / font / logo shape). The
 * card itself is rendered by BusinessCard (always light) and captured to a
 * PNG to share (WhatsApp etc.).
 */
const BusinessProfile: React.FC = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const C = useCalm();
  const t = useT();
  const neu = useNeu(undefined, { faintDark: true });
  const styles = useMemo(() => makeStyles(C), [C]);
  const { showToast } = useToast();
  const cardRef = useRef<View>(null);
  const { height: winHeight } = useWindowDimensions();
  // Bottom sheet never covers the whole screen — the live card stays visible.
  const sheetMaxHeight = Math.min(winHeight * 0.78, 620);
  const [styleModalVisible, setStyleModalVisible] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [bankCopied, setBankCopied] = useState(false);

  const profile = useSettingsStore((s) => s.businessProfile);
  const setBusinessProfile = useSettingsStore((s) => s.setBusinessProfile);
  const profiles = useSettingsStore((s) => s.businessProfiles);
  const activeProfileId = useSettingsStore((s) => s.activeBusinessProfileId);
  const addProfile = useSettingsStore((s) => s.addBusinessProfile);
  const selectProfile = useSettingsStore((s) => s.setActiveBusinessProfile);
  const deleteProfile = useSettingsStore((s) => s.deleteBusinessProfile);
  const canCreateProfile = usePremiumStore((s) => s.canCreateBusinessProfile);
  // Bank-transfer details are SHARED across the account (not per-profile).
  const bankDetails = useSettingsStore((s) => s.businessBankDetails);
  const setBankDetails = useSettingsStore((s) => s.setBusinessBankDetails);

  const bankFields: { key: keyof BusinessBankDetails; label: string; keyboardType?: 'default' | 'phone-pad'; autoCapitalize?: 'none' | 'words' | 'characters' }[] = [
    { key: 'bankName', label: t.businessProfile.bankName, autoCapitalize: 'words' },
    { key: 'accountNumber', label: t.businessProfile.accountNumber, keyboardType: 'phone-pad' },
    { key: 'accountHolder', label: t.businessProfile.accountHolder, autoCapitalize: 'words' },
    { key: 'duitnowId', label: t.businessProfile.duitnowId },
  ];

  const copyBank = useCallback(async () => {
    lightTap();
    const lines = bankFields
      .map((f) => (bankDetails[f.key].trim() ? `${f.label}: ${bankDetails[f.key].trim()}` : null))
      .filter(Boolean);
    if (lines.length === 0) {
      showToast(t.businessProfile.bankEmpty, 'error');
      return;
    }
    await Clipboard.setStringAsync(lines.join('\n'));
    // Inline "Copied" feedback (icon → check, label → Copied) like Collectz — no toast.
    setBankCopied(true);
    setTimeout(() => setBankCopied(false), 1400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankDetails, showToast, t]);

  // Add is tier-gated (free 1 / pro 2 / premium 4). Over the cap → paywall.
  const handleAddProfile = useCallback(() => {
    lightTap();
    if (!canCreateProfile(profiles.length)) { setPaywallVisible(true); return; }
    addProfile();
  }, [canCreateProfile, profiles.length, addProfile]);

  const confirmDelete = useCallback(() => {
    if (profiles.length <= 1) return;
    Alert.alert(t.businessProfile.removeProfile, t.businessProfile.removeProfileMsg, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.common.delete,
        style: 'destructive',
        onPress: () => { lightTap(); deleteProfile(activeProfileId); },
      },
    ]);
  }, [profiles.length, activeProfileId, deleteProfile, t]);

  useEffect(() => {
    navigation.setOptions({ title: t.businessProfile.title });
  }, [navigation, t]);

  // Load the card's font families once for this screen (card + font picker rows).
  useBusinessCardFonts();

  // Selected customisation (mirrors BusinessCard's own fallbacks).
  const selectedColor = profile.cardColor || DEFAULT_CARD_COLOR;
  const activeFontKey = profile.cardFont || 'system';
  const activeLayout = (profile.cardStyle || 'band') as CardLayoutKey;
  const activeShape = profile.logoShape || 'rounded';

  const pickLogo = useCallback(async () => {
    lightTap();
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const srcUri = result.assets[0].uri;
      let destUri = srcUri;
      try {
        const dir = `${FileSystem.documentDirectory}business-logo/`;
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
        destUri = `${dir}logo_${Date.now()}.jpg`;
        await FileSystem.copyAsync({ from: srcUri, to: destUri });
      } catch {
        destUri = srcUri;
      }
      setBusinessProfile({ logoUri: destUri });
    } catch {
      /* ignore */
    }
  }, [setBusinessProfile]);

  const removeLogo = useCallback(() => {
    lightTap();
    setBusinessProfile({ logoUri: '' });
  }, [setBusinessProfile]);

  // Close the modal first, then launch the picker — image pickers can fail to
  // present over an open RN Modal on iOS (same guard the QR flow uses).
  const handleLogoPress = useCallback(() => {
    setStyleModalVisible(false);
    setTimeout(() => pickLogo(), 120);
  }, [pickLogo]);

  const fields: { key: FieldKey; label: string; keyboardType?: 'default' | 'phone-pad' | 'email-address'; multiline?: boolean; autoCapitalize?: 'none' | 'words' | 'sentences' }[] = [
    { key: 'shopName', label: t.businessProfile.shopName, autoCapitalize: 'words' },
    { key: 'ownerName', label: t.businessProfile.ownerName, autoCapitalize: 'words' },
    { key: 'whatsapp', label: t.businessProfile.whatsapp, keyboardType: 'phone-pad' },
    { key: 'address', label: t.businessProfile.address, multiline: true },
    { key: 'email', label: t.businessProfile.email, keyboardType: 'email-address', autoCapitalize: 'none' },
    { key: 'hours', label: t.businessProfile.hours },
    { key: 'ssm', label: t.businessProfile.ssm },
  ];

  const hasAny = fields.some((f) => profile[f.key]?.trim()) || !!profile.logoUri;

  const shareCard = useCallback(async () => {
    lightTap();
    if (!hasAny) {
      showToast(t.businessProfile.shareEmpty, 'error');
      return;
    }
    try {
      await shareCapturedView(cardRef, {
        fileBaseName: profile.shopName || 'business-card',
        dialogTitle: t.businessProfile.shareCard,
      });
    } catch (e) {
      console.warn('[BusinessProfile] share card failed:', e);
      showToast(t.businessProfile.shareFailed, 'error');
    }
  }, [hasAny, profile.shopName, showToast, t]);

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 88 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bottomOffset={80}
      >
          {/* ── Profile switcher — the shop's saved "faces" ── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.profilesRow}
            contentContainerStyle={styles.profilesRowContent}
            keyboardShouldPersistTaps="handled"
          >
            {profiles.map((p) => {
              const selected = p.id === activeProfileId;
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => { lightTap(); selectProfile(p.id); }}
                  style={[styles.profileChip, neu.raised, selected && styles.profileChipActive]}
                  activeOpacity={0.8}
                >
                  {selected && <Feather name="check" size={13} color={C.onAccent} />}
                  <Text
                    style={[styles.profileChipText, selected && styles.profileChipTextActive]}
                    numberOfLines={1}
                  >
                    {p.shopName?.trim() || t.businessProfile.untitled}
                  </Text>
                  {selected && <Text style={styles.defaultTag}>{t.businessProfile.defaultBadge}</Text>}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              onPress={handleAddProfile}
              style={[styles.profileAdd, neu.raised]}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t.businessProfile.newProfile}
            >
              <Feather name="plus" size={16} color={C.bronze} />
              <Text style={styles.profileAddText}>{t.businessProfile.newProfile}</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* ── Shareable business card + floating edit button ── */}
          <View style={styles.cardContainer}>
            <View ref={cardRef} collapsable={false}>
              <BusinessCard
                profile={profile}
                shopPlaceholder={t.businessProfile.shopNamePlaceholder}
                emptyHint={t.businessProfile.cardHint}
              />
            </View>

            {/* Edit button — sibling of the captured card, so it's NOT in the shared image */}
            <TouchableOpacity
              style={[styles.editBtn, { backgroundColor: C.bronze }]}
              onPress={() => { lightTap(); setStyleModalVisible(true); }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t.businessProfile.customise}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="edit-2" size={15} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Share (outside the captured view) */}
          <View style={styles.actions}>
            <Button
              title={t.businessProfile.shareCard}
              onPress={shareCard}
              variant="primary"
              accentColor={C.bronze}
              icon="share-2"
              fullWidth
              disabled={!hasAny}
            />
            {profiles.length > 1 && (
              <TouchableOpacity
                onPress={confirmDelete}
                style={styles.removeProfile}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t.businessProfile.removeProfile}
              >
                <Feather name="trash-2" size={13} color={C.neutral} />
                <Text style={styles.removeProfileText}>{t.businessProfile.removeProfile}</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.subtitle}>{t.businessProfile.subtitle}</Text>

          {/* ── Editable fields (Newst Input — the business-mode standard) ── */}
          {fields.map((f) => (
            <NewstInput
              key={f.key}
              label={f.label}
              value={profile[f.key]}
              onChangeText={(v) => setBusinessProfile({ [f.key]: v } as Partial<BizProfile>)}
              keyboardType={f.keyboardType}
              autoCapitalize={f.autoCapitalize}
              multiline={f.multiline}
              style={styles.fieldSpacing}
            />
          ))}

          {/* ── Payment details (bank transfer) — shared, screen-only, copyable ── */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>{t.businessProfile.paymentSection}</Text>
            <TouchableOpacity
              onPress={copyBank}
              style={[styles.copyBtn, bankCopied && styles.copyBtnActive]}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t.businessProfile.copyPayment}
            >
              <Feather name={bankCopied ? 'check' : 'copy'} size={14} color={C.bronze} />
              <Text style={styles.copyBtnText}>{bankCopied ? t.common.copied : t.businessProfile.copyPayment}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.sectionHint}>{t.businessProfile.paymentHint}</Text>
          {bankFields.map((f) => (
            <NewstInput
              key={f.key}
              label={f.label}
              value={bankDetails[f.key]}
              onChangeText={(v) => setBankDetails({ [f.key]: v } as Partial<BusinessBankDetails>)}
              keyboardType={f.keyboardType}
              autoCapitalize={f.autoCapitalize}
              style={styles.fieldSpacing}
            />
          ))}
      </KeyboardAwareScrollView>

      {/* ── Card-style bottom sheet (layout / colour / font / logo) ── */}
      <Modal
        visible={styleModalVisible}
        transparent
        statusBarTranslucent
        animationType="slide"
        onRequestClose={() => setStyleModalVisible(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setStyleModalVisible(false)}>
          <Pressable
            style={[styles.sheet, { maxHeight: sheetMaxHeight, paddingBottom: insets.bottom + SPACING.md }]}
            onPress={() => {}}
          >
            <View style={styles.grabber} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t.businessProfile.customise}</Text>
              <TouchableOpacity
                onPress={() => setStyleModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={t.common.close}
              >
                <Feather name="x" size={20} color={C.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Layout */}
              <Text style={styles.styleLabel}>{t.businessProfile.layout}</Text>
              <View style={styles.thumbRow}>
                {CARD_LAYOUTS.map((l) => {
                  const selected = activeLayout === l.key;
                  return (
                    <TouchableOpacity
                      key={l.key}
                      onPress={() => { lightTap(); setBusinessProfile({ cardStyle: l.key }); }}
                      style={styles.thumbItem}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={t.businessProfile[l.labelKey]}
                    >
                      <LayoutThumb layout={l.key} color={selectedColor} selected={selected} C={C} />
                      <Text style={[styles.thumbCaption, selected && styles.thumbCaptionActive]} numberOfLines={1}>
                        {t.businessProfile[l.labelKey]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.styleDivider} />

              {/* Colour */}
              <Text style={styles.styleLabel}>{t.businessProfile.colour}</Text>
              <View style={styles.swatchRow}>
                {CARD_COLORS.map((c) => {
                  const selected = selectedColor === c;
                  return (
                    <TouchableOpacity
                      key={c}
                      onPress={() => { lightTap(); setBusinessProfile({ cardColor: c }); }}
                      style={[styles.swatch, { backgroundColor: c }, selected && styles.swatchSelected]}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={c}
                    >
                      {selected && <Feather name="check" size={15} color="#FFFFFF" />}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.styleDivider} />

              {/* Font */}
              <Text style={styles.styleLabel}>{t.businessProfile.font}</Text>
              <View style={styles.fontList}>
                {CARD_FONTS.map((f, i) => {
                  const selected = activeFontKey === f.key;
                  const face = f.bold ?? f.regular;
                  return (
                    <TouchableOpacity
                      key={f.key}
                      onPress={() => { lightTap(); setBusinessProfile({ cardFont: f.key === 'system' ? '' : f.key }); }}
                      style={[styles.fontListRow, i > 0 && styles.fontListRowBorder, selected && styles.fontListRowSelected]}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={f.label}
                    >
                      <Text style={[styles.fontSample, face ? { fontFamily: face } : styles.fontSampleSystem]}>Ag</Text>
                      <Text style={[styles.fontName, f.regular ? { fontFamily: f.regular } : null]}>{f.label}</Text>
                      {selected && <Feather name="check" size={16} color={C.bronze} />}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.styleDivider} />

              {/* Logo */}
              <Text style={styles.styleLabel}>{t.businessProfile.logoShape}</Text>
              <View style={styles.shapeRow}>
                {LOGO_SHAPES.map((s) => {
                  const selected = activeShape === s.key;
                  return (
                    <TouchableOpacity
                      key={s.key}
                      onPress={() => { lightTap(); setBusinessProfile({ logoShape: s.key === 'rounded' ? '' : s.key }); }}
                      style={[styles.shapeBtn, selected && styles.shapeBtnSelected]}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={t.businessProfile[s.labelKey]}
                    >
                      {s.key === 'none' ? (
                        <Feather name="eye-off" size={16} color={selected ? C.bronze : C.textSecondary} />
                      ) : (
                        <View
                          style={[
                            styles.shapeGlyph,
                            s.key === 'circle' && styles.shapeGlyphCircle,
                            s.key === 'square' && styles.shapeGlyphSquare,
                            selected && { borderColor: C.bronze },
                          ]}
                        />
                      )}
                      <Text style={[styles.shapeCaption, selected && styles.shapeCaptionActive]} numberOfLines={1}>
                        {t.businessProfile[s.labelKey]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.logoRow}>
                {profile.logoUri ? (
                  <Image source={{ uri: profile.logoUri }} style={styles.logoThumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.logoThumb, styles.logoThumbEmpty]}>
                    <Feather name="image" size={20} color={C.textMuted} />
                  </View>
                )}
                <View style={styles.logoActions}>
                  <TouchableOpacity onPress={handleLogoPress} style={styles.logoBtn} activeOpacity={0.7}>
                    <Feather name="upload" size={15} color={C.bronze} />
                    <Text style={styles.logoBtnText}>{profile.logoUri ? t.businessProfile.changeLogo : t.businessProfile.addLogo}</Text>
                  </TouchableOpacity>
                  {!!profile.logoUri && (
                    <TouchableOpacity onPress={removeLogo} style={styles.logoRemove} activeOpacity={0.7}>
                      <Feather name="trash-2" size={14} color={C.neutral} />
                      <Text style={styles.logoRemoveText}>{t.businessProfile.removeLogo}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        feature="businessProfile"
      />
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  scrollContent: {
    padding: SPACING.lg,
  },
  profilesRow: {
    flexGrow: 0,
    marginBottom: SPACING.md,
  },
  profilesRowContent: {
    gap: SPACING.sm,
    // Vertical room so the horizontal scroller doesn't slice the neu shadow
    // into a faint line on device; xs of side room lifts the edge chips too.
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    alignItems: 'center',
  },
  profileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textPrimary, 0.03),
    maxWidth: 200,
  },
  defaultTag: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.onAccent,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  profileChipActive: {
    backgroundColor: C.bronze,
  },
  profileChipText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  profileChipTextActive: {
    color: C.onAccent,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  profileAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textPrimary, 0.03),
  },
  profileAddText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
  },
  removeProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  removeProfileText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.neutral,
  },
  cardContainer: {
    position: 'relative',
  },
  editBtn: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  logoThumb: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.md,
    backgroundColor: C.surface,
  },
  logoThumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  logoActions: {
    flex: 1,
    gap: SPACING.xs,
  },
  logoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    alignSelf: 'flex-start',
  },
  logoBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
  },
  logoRemove: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    alignSelf: 'flex-start',
  },
  logoRemoveText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.neutral,
  },
  subtitle: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    lineHeight: 18,
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },
  fieldSpacing: {
    marginBottom: SPACING.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.lg,
    marginBottom: SPACING.xs,
  },
  sectionHeader: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },
  sectionHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    lineHeight: 18,
    marginBottom: SPACING.md,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.full,
  },
  copyBtnActive: {
    backgroundColor: withAlpha(C.bronze, 0.12),
  },
  copyBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
  },

  // ── Card-style bottom sheet ──
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.background,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginBottom: SPACING.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  sheetTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },
  styleLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.md,
  },
  thumbRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  thumbItem: {
    alignItems: 'center',
    gap: SPACING.xs,
  },
  thumbCaption: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  thumbCaptionActive: {
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchSelected: {
    borderColor: C.textPrimary,
  },
  styleDivider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: SPACING.lg,
  },
  fontList: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  fontListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 13,
  },
  fontListRowBorder: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  fontListRowSelected: {
    backgroundColor: withAlpha(C.bronze, 0.08),
  },
  fontSample: {
    width: 28,
    fontSize: 17,
    color: C.textPrimary,
    textAlign: 'center',
  },
  fontSampleSystem: {
    fontWeight: '700',
  },
  fontName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
  },
  shapeRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  shapeBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 56,
  },
  shapeBtnSelected: {
    borderColor: C.bronze,
    backgroundColor: withAlpha(C.bronze, 0.08),
  },
  shapeGlyph: {
    width: 18,
    height: 18,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: C.textSecondary,
  },
  shapeGlyphCircle: {
    borderRadius: 9,
  },
  shapeGlyphSquare: {
    borderRadius: 2,
  },
  shapeCaption: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  shapeCaptionActive: {
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
});

export default BusinessProfile;
