/*
 * Hallmark · component: business-card (4 layouts) · genre: modern-minimal (Cobalt register)
 * flat colour · hairline rules · tight radii · no gradients · curated white-text-safe palette
 * pre-emit critique: P4 H4 E4 S4 R5 V4
 */
/**
 * BusinessCard — the shareable shop card, rendered off a BusinessProfile.
 *
 * Always light/theme-independent: the rendered card is captured to PNG for
 * sharing, so it must look identical regardless of the app's dark/light mode.
 * All styling decisions (layout, colour, font, logo shape) come from the
 * profile — customise UI lives in the BusinessProfile screen's bottom sheet.
 *
 * Fonts are real files (expo-google-fonts) loaded at runtime via expo-font —
 * no native rebuild needed. Until a family finishes loading the card renders
 * in the system face; no synthetic bold anywhere (serif ships 400 only).
 */
import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { SpaceGrotesk_400Regular, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { PlusJakartaSans_400Regular, PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans';
import { Sora_400Regular, Sora_700Bold } from '@expo-google-fonts/sora';
import { DMSerifDisplay_400Regular } from '@expo-google-fonts/dm-serif-display';
import { JetBrainsMono_400Regular, JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono';
import { SPACING, RADIUS, withAlpha } from '../../constants';
import type { BusinessProfile } from '../../store/settingsStore';

// ─── Customisation tokens ─────────────────────────────────────────────

/**
 * Curated flat card colours — every one is dark enough for white text
 * (≥ 4.5:1), so any choice is readable by construction. First entry is the
 * default (the long-standing business bronze). No gradients, ever.
 */
export const CARD_COLORS = [
  '#5C3D0A', // bronze (default)
  '#18181B', // ink
  '#27272A', // charcoal
  '#3F3F46', // zinc
  '#1F2937', // slate
  '#334155', // steel
  '#1E3A5F', // navy
  '#1E40AF', // cobalt
  '#0F3D3E', // deep teal
  '#14532D', // forest
  '#3F4A1E', // moss
  '#7C2D12', // rust
  '#7F1D1D', // maroon
  '#3B2F63', // aubergine
];
export const DEFAULT_CARD_COLOR = CARD_COLORS[0];

export interface CardFont {
  key: string;
  label: string;
  /** Registered expo-font family names. Undefined → platform system face. */
  regular?: string;
  bold?: string;
}
export const CARD_FONTS: CardFont[] = [
  { key: 'system', label: 'System' },
  { key: 'grotesk', label: 'Grotesk', regular: 'SpaceGrotesk_400Regular', bold: 'SpaceGrotesk_700Bold' },
  { key: 'jakarta', label: 'Jakarta', regular: 'PlusJakartaSans_400Regular', bold: 'PlusJakartaSans_700Bold' },
  { key: 'sora', label: 'Sora', regular: 'Sora_400Regular', bold: 'Sora_700Bold' },
  { key: 'serif', label: 'Serif', regular: 'DMSerifDisplay_400Regular' },
  { key: 'mono', label: 'Mono', regular: 'JetBrainsMono_400Regular', bold: 'JetBrainsMono_700Bold' },
];

export const CARD_LAYOUTS = [
  { key: 'band', labelKey: 'layoutBand' },
  { key: 'split', labelKey: 'layoutSplit' },
  { key: 'minimal', labelKey: 'layoutMinimal' },
  { key: 'solid', labelKey: 'layoutSolid' },
] as const;
export type CardLayoutKey = (typeof CARD_LAYOUTS)[number]['key'];

export const LOGO_SHAPES = [
  { key: 'rounded', labelKey: 'shapeRounded' },
  { key: 'square', labelKey: 'shapeSquare' },
  { key: 'circle', labelKey: 'shapeCircle' },
  { key: 'none', labelKey: 'shapeNone' },
] as const;
export type LogoShapeKey = (typeof LOGO_SHAPES)[number]['key'];

/** Load every card family once. Safe to call in any screen that shows a card. */
export function useBusinessCardFonts(): boolean {
  const [loaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_700Bold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_700Bold,
    Sora_400Regular,
    Sora_700Bold,
    DMSerifDisplay_400Regular,
    JetBrainsMono_400Regular,
    JetBrainsMono_700Bold,
  });
  return loaded;
}

// ─── Helpers ──────────────────────────────────────────────────────────

/** Word-initials for the logo fallback (up to 2 letters). */
function initialsOf(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function fontFor(key: string): CardFont {
  return CARD_FONTS.find((f) => f.key === key) ?? CARD_FONTS[0];
}

// Card ink/paper — fixed, theme-independent (the PNG must not follow dark mode).
const PAPER = '#FFFFFF';
const INK = '#18181B';
const INK_SOFT = '#52525B';
const INK_FAINT = '#71717A';
const RULE = '#EBEBE8';

const ROW_ICONS = [
  { icon: 'phone' as const, key: 'whatsapp' as const },
  { icon: 'map-pin' as const, key: 'address' as const },
  { icon: 'mail' as const, key: 'email' as const },
  { icon: 'clock' as const, key: 'hours' as const },
  { icon: 'hash' as const, key: 'ssm' as const },
];

// ─── Component ────────────────────────────────────────────────────────

interface Props {
  profile: BusinessProfile;
  /** Placeholder shown when no shop name is set yet. */
  shopPlaceholder: string;
  /** Hint shown in the body when the card is still empty. */
  emptyHint: string;
}

const BusinessCard: React.FC<Props> = ({ profile, shopPlaceholder, emptyHint }) => {
  const accent = profile.cardColor || DEFAULT_CARD_COLOR;
  const layout: CardLayoutKey = (CARD_LAYOUTS.some((l) => l.key === profile.cardStyle)
    ? profile.cardStyle
    : 'band') as CardLayoutKey;
  const shape: LogoShapeKey = (LOGO_SHAPES.some((s) => s.key === profile.logoShape)
    ? profile.logoShape
    : 'rounded') as LogoShapeKey;
  const font = fontFor(profile.cardFont);

  const rows = ROW_ICONS.map((r) => ({ icon: r.icon, value: profile[r.key]?.trim() })).filter((r) => r.value);
  const hasAny = rows.length > 0 || !!profile.shopName?.trim() || !!profile.ownerName?.trim() || !!profile.logoUri;
  const initials = initialsOf(profile.shopName || '');

  // Type styles for this family. Serif ships a single weight — never fake bold:
  // when a custom family is in use, drop fontWeight so RN can't synthesise it
  // (the loaded file carries its own weight). System keeps its real bold.
  const displayFont = font.bold ? { fontFamily: font.bold } : font.regular ? { fontFamily: font.regular } : null;
  const bodyFont = font.regular ? { fontFamily: font.regular } : null;
  const syntheticGuard = font.regular ? ({ fontWeight: '400' } as const) : null;

  const logoRadius =
    shape === 'circle' ? 999 : shape === 'square' ? 6 : RADIUS.lg;

  /** Logo chip — on `onAccent` panels it inverts to translucent white. */
  const renderLogo = (onAccent: boolean) => {
    if (shape === 'none') return null;
    const size = layout === 'split' ? 56 : 60;
    if (profile.logoUri) {
      return (
        <Image
          source={{ uri: profile.logoUri }}
          style={[
            styles.logoImg,
            {
              width: size,
              height: size,
              borderRadius: logoRadius,
              borderColor: onAccent ? 'rgba(255,255,255,0.55)' : RULE,
            },
          ]}
          resizeMode="cover"
        />
      );
    }
    return (
      <View
        style={[
          styles.logoFallback,
          {
            width: size,
            height: size,
            borderRadius: logoRadius,
            backgroundColor: onAccent ? 'rgba(255,255,255,0.16)' : withAlpha(accent, 0.08),
            borderColor: onAccent ? 'rgba(255,255,255,0.32)' : withAlpha(accent, 0.22),
          },
        ]}
      >
        {initials ? (
          <Text
            style={[
              styles.initials,
              displayFont,
              syntheticGuard,
              { color: onAccent ? '#FFFFFF' : accent },
            ]}
          >
            {initials}
          </Text>
        ) : (
          <Feather name="shopping-bag" size={22} color={onAccent ? '#FFFFFF' : accent} />
        )}
      </View>
    );
  };

  /** Contact rows — hairline-divided on white, translucent chips on colour. */
  const renderRows = (onAccent: boolean) => (
    <View style={onAccent ? styles.rowsOnAccent : styles.rows}>
      {rows.map((r, i) => (
        <View
          key={r.icon}
          style={[
            styles.row,
            i > 0 && (onAccent ? styles.rowRuleOnAccent : styles.rowRule),
          ]}
        >
          <Feather
            name={r.icon}
            size={14}
            color={onAccent ? 'rgba(255,255,255,0.85)' : accent}
            style={styles.rowIcon}
          />
          <Text
            style={[styles.rowText, bodyFont, { color: onAccent ? '#FFFFFF' : INK }]}
            numberOfLines={2}
          >
            {r.value}
          </Text>
        </View>
      ))}
    </View>
  );

  const shopName = profile.shopName?.trim();
  const ownerName = profile.ownerName?.trim();

  // ── Layout: minimal — all white, one accent note (the name rule). ──
  if (layout === 'minimal') {
    return (
      <View style={styles.card}>
        <View style={styles.minimalHead}>
          {renderLogo(false)}
          <View style={styles.headText}>
            <Text
              style={[styles.shop, displayFont, syntheticGuard, { color: shopName ? INK : INK_FAINT }]}
              numberOfLines={2}
            >
              {shopName || shopPlaceholder}
            </Text>
            <View style={[styles.nameRule, { backgroundColor: accent }]} />
            {!!ownerName && (
              <Text style={[styles.owner, bodyFont, { color: INK_SOFT }]} numberOfLines={1}>
                {ownerName}
              </Text>
            )}
          </View>
        </View>
        {rows.length > 0 && renderRows(false)}
        {!hasAny && <Text style={styles.hint}>{emptyHint}</Text>}
      </View>
    );
  }

  // ── Layout: solid — full-bleed colour, white type, tonal rules. ──
  if (layout === 'solid') {
    return (
      <View style={[styles.card, { backgroundColor: accent }]}>
        <View style={styles.solidHead}>
          {renderLogo(true)}
          <View style={styles.headText}>
            <Text
              style={[styles.shop, displayFont, syntheticGuard, { color: shopName ? '#FFFFFF' : 'rgba(255,255,255,0.55)' }]}
              numberOfLines={2}
            >
              {shopName || shopPlaceholder}
            </Text>
            {!!ownerName && (
              <Text style={[styles.owner, bodyFont, { color: 'rgba(255,255,255,0.85)' }]} numberOfLines={1}>
                {ownerName}
              </Text>
            )}
          </View>
        </View>
        {rows.length > 0 && renderRows(true)}
        {!hasAny && <Text style={[styles.hint, { color: 'rgba(255,255,255,0.7)' }]}>{emptyHint}</Text>}
      </View>
    );
  }

  // ── Layout: split — colour panel left, content right. Swiss register. ──
  if (layout === 'split') {
    return (
      <View style={[styles.card, styles.splitCard]}>
        <View style={[styles.splitPanel, { backgroundColor: accent }]}>
          {renderLogo(true)}
          {!!ownerName && (
            <Text style={[styles.splitOwner, bodyFont]} numberOfLines={2}>
              {ownerName}
            </Text>
          )}
        </View>
        <View style={styles.splitBody}>
          <Text
            style={[styles.shopSplit, displayFont, syntheticGuard, { color: shopName ? INK : INK_FAINT }]}
            numberOfLines={3}
          >
            {shopName || shopPlaceholder}
          </Text>
          {rows.length > 0 && renderRows(false)}
          {!hasAny && <Text style={styles.hint}>{emptyHint}</Text>}
        </View>
      </View>
    );
  }

  // ── Layout: band — flat colour band on white (the default). ──
  return (
    <View style={styles.card}>
      <View style={[styles.bandHead, { backgroundColor: accent }]}>
        {renderLogo(true)}
        <View style={styles.headText}>
          <Text
            style={[styles.shop, displayFont, syntheticGuard, { color: shopName ? '#FFFFFF' : 'rgba(255,255,255,0.55)' }]}
            numberOfLines={2}
          >
            {shopName || shopPlaceholder}
          </Text>
          {!!ownerName && (
            <Text style={[styles.owner, bodyFont, { color: 'rgba(255,255,255,0.85)' }]} numberOfLines={1}>
              {ownerName}
            </Text>
          )}
        </View>
      </View>
      {rows.length > 0 && <View style={styles.bandBody}>{renderRows(false)}</View>}
      {!hasAny && (
        <View style={styles.bandBody}>
          <Text style={styles.hint}>{emptyHint}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: PAPER,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: RULE,
  },
  // shared header composition (band + solid)
  bandHead: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  solidHead: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  minimalHead: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  headText: { flex: 1 },
  logoImg: {
    borderWidth: 2,
    backgroundColor: PAPER,
  },
  logoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  initials: {
    fontSize: 22,
    fontWeight: '700',
  },
  shop: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 27,
  },
  shopSplit: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 25,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  owner: {
    fontSize: 13,
    marginTop: 3,
  },
  nameRule: {
    width: 28,
    height: 3,
    borderRadius: 2,
    marginTop: 8,
  },
  // split layout
  splitCard: {
    flexDirection: 'row',
  },
  splitPanel: {
    width: 108,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.sm,
    gap: SPACING.sm,
  },
  splitOwner: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },
  splitBody: {
    flex: 1,
    paddingBottom: SPACING.sm,
  },
  // contact rows
  bandBody: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  rows: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  rowsOnAccent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: 7,
  },
  rowRule: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: RULE,
  },
  rowRuleOnAccent: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.22)',
  },
  rowIcon: {
    width: 20,
    textAlign: 'center',
  },
  rowText: {
    flex: 1,
    fontSize: 13.5,
    lineHeight: 19,
  },
  hint: {
    fontSize: 13,
    color: INK_SOFT,
    lineHeight: 19,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
});

export default BusinessCard;
