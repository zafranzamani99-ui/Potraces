import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  Keyboard,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import { useSettingsStore, type BusinessProfile as BizProfile } from '../../store/settingsStore';
import { shareCapturedView } from '../../services/receiptImageExport';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useToast } from '../../context/ToastContext';
import { lightTap } from '../../services/haptics';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';

type FieldKey = Exclude<keyof BizProfile, 'logoUri' | 'cardColor' | 'cardFont'>;

// Curated, professional card accent colours — all dark/muted so white text reads
// cleanly on them. First is the app's olive (default).
const CARD_COLORS = ['#4F5104', '#1F2937', '#0F3D3E', '#3B2F63', '#7C2D12', '#14532D', '#1E3A5F', '#3F3F46'];

// Professional system-font choices (graceful fallback to system if unavailable —
// no bundled font files, so no native rebuild needed).
const CARD_FONTS: { key: string; label: string; family?: string }[] = [
  { key: 'modern', label: 'Modern', family: undefined },
  { key: 'classic', label: 'Classic', family: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }) },
  { key: 'light', label: 'Light', family: Platform.select({ ios: 'HelveticaNeue-Light', android: 'sans-serif-light', default: undefined }) },
];

/** Darken a hex colour by multiplying each channel (for the gradient's low stop). */
function darken(hex: string, f = 0.72): string {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return hex;
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Word-initials for the logo fallback (up to 2 letters). */
function initialsOf(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

/**
 * Business Profile — the shop's premium "business card". Edits
 * settingsStore.businessProfile (business-only; survives sign-out, wiped by
 * Delete Account). Live-saves each field; tap the edit icon on the card to open
 * a floating modal that recolours / re-fonts it. The card is always light and is
 * captured to a PNG to share (WhatsApp etc.).
 */
const BusinessProfile: React.FC = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { showToast } = useToast();
  const cardRef = useRef<View>(null);
  const [styleModalVisible, setStyleModalVisible] = useState(false);

  const profile = useSettingsStore((s) => s.businessProfile);
  const setBusinessProfile = useSettingsStore((s) => s.setBusinessProfile);

  useEffect(() => {
    navigation.setOptions({ title: t.businessProfile.title });
  }, [navigation, t]);

  const headerColor = profile.cardColor || CARD_COLORS[0];
  const fontFamily = CARD_FONTS.find((f) => f.key === profile.cardFont)?.family;
  const activeFontKey = profile.cardFont || CARD_FONTS[0].key;

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

  const fields: { key: FieldKey; label: string; placeholder: string; keyboardType?: 'default' | 'phone-pad' | 'email-address'; multiline?: boolean; autoCapitalize?: 'none' | 'words' | 'sentences' }[] = [
    { key: 'shopName', label: t.businessProfile.shopName, placeholder: t.businessProfile.shopNamePlaceholder, autoCapitalize: 'words' },
    { key: 'ownerName', label: t.businessProfile.ownerName, placeholder: t.businessProfile.ownerNamePlaceholder, autoCapitalize: 'words' },
    { key: 'whatsapp', label: t.businessProfile.whatsapp, placeholder: t.businessProfile.whatsappPlaceholder, keyboardType: 'phone-pad' },
    { key: 'address', label: t.businessProfile.address, placeholder: t.businessProfile.addressPlaceholder, multiline: true },
    { key: 'email', label: t.businessProfile.email, placeholder: t.businessProfile.emailPlaceholder, keyboardType: 'email-address', autoCapitalize: 'none' },
    { key: 'hours', label: t.businessProfile.hours, placeholder: t.businessProfile.hoursPlaceholder },
    { key: 'ssm', label: t.businessProfile.ssm, placeholder: t.businessProfile.ssmPlaceholder },
  ];

  const hasAny = fields.some((f) => profile[f.key]?.trim()) || !!profile.logoUri;
  const initials = initialsOf(profile.shopName);

  const cardRows = ([
    { icon: 'phone' as const, value: profile.whatsapp },
    { icon: 'map-pin' as const, value: profile.address },
    { icon: 'mail' as const, value: profile.email },
    { icon: 'clock' as const, value: profile.hours },
    { icon: 'hash' as const, value: profile.ssm },
  ]).filter((r) => r.value?.trim());

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
    } catch {
      showToast(t.businessProfile.shareFailed, 'error');
    }
  }, [hasAny, profile.shopName, showToast, t]);

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 88 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Shareable business card + floating edit button ── */}
          <View style={styles.cardContainer}>
            <View ref={cardRef} collapsable={false} style={CARD.card}>
              <LinearGradient
                colors={[headerColor, darken(headerColor)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={CARD.header}
              >
                {profile.logoUri ? (
                  <Image source={{ uri: profile.logoUri }} style={CARD.logo} resizeMode="cover" />
                ) : (
                  <View style={CARD.logoFallback}>
                    {initials ? (
                      <Text style={[CARD.initials, fontFamily ? { fontFamily } : null]}>{initials}</Text>
                    ) : (
                      <Feather name="shopping-bag" size={22} color={CALM.onAccent} />
                    )}
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[CARD.shop, fontFamily ? { fontFamily } : null, !profile.shopName && CARD.shopMuted]} numberOfLines={2}>
                    {profile.shopName || t.businessProfile.shopNamePlaceholder}
                  </Text>
                  {!!profile.ownerName && (
                    <Text style={[CARD.owner, fontFamily ? { fontFamily } : null]} numberOfLines={1}>{profile.ownerName}</Text>
                  )}
                </View>
              </LinearGradient>

              {cardRows.length > 0 && (
                <View style={CARD.body}>
                  {cardRows.map((r) => (
                    <View key={r.icon} style={CARD.row}>
                      <View style={[CARD.rowChip, { backgroundColor: withAlpha(headerColor, 0.1) }]}>
                        <Feather name={r.icon} size={14} color={headerColor} />
                      </View>
                      <Text style={CARD.rowText} numberOfLines={2}>{r.value}</Text>
                    </View>
                  ))}
                </View>
              )}

              {!hasAny && (
                <View style={CARD.body}>
                  <Text style={CARD.hint}>{t.businessProfile.cardHint}</Text>
                </View>
              )}

              <View style={[CARD.footerBar, { backgroundColor: headerColor }]} />
            </View>

            {/* Edit button — sibling of the captured card, so it's NOT in the shared image */}
            <TouchableOpacity
              style={styles.editBtn}
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
              variant="outline"
              icon="share-2"
              fullWidth
            />
          </View>

          <Text style={styles.subtitle}>{t.businessProfile.subtitle}</Text>

          {/* ── Editable fields ── */}
          <Card style={styles.formCard}>
            {fields.map((f, i) => (
              <View key={f.key} style={[styles.field, i > 0 && styles.fieldDivider]}>
                <Text style={styles.fieldLabel}>{f.label}</Text>
                <TextInput
                  value={profile[f.key]}
                  onChangeText={(v) => setBusinessProfile({ [f.key]: v } as Partial<BizProfile>)}
                  placeholder={f.placeholder}
                  placeholderTextColor={C.textMuted}
                  style={[styles.fieldInput, f.multiline && styles.fieldInputMultiline]}
                  keyboardType={f.keyboardType ?? 'default'}
                  autoCapitalize={f.autoCapitalize ?? 'sentences'}
                  multiline={f.multiline}
                  returnKeyType={f.multiline ? 'default' : 'done'}
                  onSubmitEditing={f.multiline ? undefined : Keyboard.dismiss}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={withAlpha(C.accent, 0.25)}
                />
              </View>
            ))}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Card-style floating modal (colour + font) ── */}
      <Modal
        visible={styleModalVisible}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setStyleModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setStyleModalVisible(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t.businessProfile.customise}</Text>
              <TouchableOpacity
                onPress={() => setStyleModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={t.common.close}
              >
                <Feather name="x" size={22} color={C.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Logo */}
            <Text style={styles.styleLabel}>{t.businessProfile.logo}</Text>
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
                  <Feather name="upload" size={15} color={C.accent} />
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

            <View style={styles.styleDivider} />

            <Text style={styles.styleLabel}>{t.businessProfile.colour}</Text>
            <View style={styles.swatchRow}>
              {CARD_COLORS.map((c) => {
                const selected = headerColor === c;
                return (
                  <TouchableOpacity
                    key={c}
                    onPress={() => { lightTap(); setBusinessProfile({ cardColor: c }); }}
                    style={[styles.swatch, { backgroundColor: c }, selected && styles.swatchSelected]}
                    activeOpacity={0.8}
                  >
                    {selected && <Feather name="check" size={16} color="#FFFFFF" />}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.styleDivider} />

            <Text style={styles.styleLabel}>{t.businessProfile.font}</Text>
            <View style={styles.fontRow}>
              {CARD_FONTS.map((f) => {
                const selected = activeFontKey === f.key;
                return (
                  <TouchableOpacity
                    key={f.key}
                    onPress={() => { lightTap(); setBusinessProfile({ cardFont: f.key }); }}
                    style={[styles.fontPill, selected && styles.fontPillSelected]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.fontPillText, f.family ? { fontFamily: f.family } : null, selected && styles.fontPillTextSelected]}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

// Always-light business-card styles (theme-independent so the shared image looks
// the same regardless of the user's dark/light setting).
const CARD = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: CALM.border,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  logo: {
    width: 60,
    height: 60,
    borderRadius: RADIUS.lg,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  logoFallback: {
    width: 60,
    height: 60,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  initials: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.onAccent,
  },
  shop: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.onAccent,
    letterSpacing: 0.2,
  },
  shopMuted: {
    color: 'rgba(255,255,255,0.6)',
  },
  owner: {
    fontSize: TYPOGRAPHY.size.sm,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 3,
  },
  body: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: SPACING.md,
    backgroundColor: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  rowChip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
  },
  hint: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
    lineHeight: 20,
  },
  footerBar: {
    height: 6,
    width: '100%',
  },
});

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  scrollContent: {
    padding: SPACING.lg,
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
    color: C.accent,
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
  formCard: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs,
  },
  field: {
    paddingVertical: SPACING.md,
  },
  fieldDivider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  fieldLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    marginBottom: SPACING.xs,
  },
  fieldInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    paddingVertical: SPACING.xs,
  },
  fieldInputMultiline: {
    minHeight: 44,
    textAlignVertical: 'top',
  },

  // ── Card-style modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  modalTitle: {
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
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
  fontRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  fontPill: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: C.border,
  },
  fontPillSelected: {
    borderColor: C.accent,
    backgroundColor: withAlpha(C.accent, 0.1),
  },
  fontPillText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  fontPillTextSelected: {
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
});

export default BusinessProfile;
