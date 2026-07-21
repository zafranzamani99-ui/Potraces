/**
 * MapPreviewCard — the venue map shown on Collectz create/join/detail.
 *
 * Parses lat/lon out of a Google Maps / Waze link (src/utils/mapLink):
 *  - coords found → static map image via the `map-preview` edge function
 *    (Google key lives server-side; 24h cache headers make repeat views free)
 *  - short link (maps.app.goo.gl / waze.com/ul) → same edge function with
 *    ?u=<link>; the server follows the redirect and reads coords off the
 *    final URL
 *  - neither works (name query, image failure) → link card
 * Both shapes get "Open in Google Maps" / "Open in Waze" buttons.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useNeu } from '../common/neu';
import { parseMapCoords, googleMapsUrl, wazeUrl, wazeSearchUrl, isMapsLink } from '../../utils/mapLink';
import { SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../constants';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';

interface MapPreviewCardProps {
  mapsUrl: string;
  /** Optional venue label for the fallback card (defaults to the URL's host). */
  venue?: string | null;
  /** Slimmer height for form contexts (create/edit). */
  compact?: boolean;
}

export default function MapPreviewCard({ mapsUrl, venue, compact }: MapPreviewCardProps) {
  const C = useCalm();
  const t = useT();
  const neu = useNeu();
  const neuF = useNeu(undefined, { faintDark: true });
  const [imgFailed, setImgFailed] = useState(false);

  const coords = useMemo(() => parseMapCoords(mapsUrl), [mapsUrl]);
  // Waze can only be opened by a waze.com/ul link. With no parseable coords the
  // old code fell back to the raw Google URL, so "Waze" silently opened Google
  // Maps — search by venue name instead so the button actually reaches Waze.
  const searchQuery = venue?.trim() || null;
  const gUrl = coords ? googleMapsUrl(coords) : mapsUrl;
  const wUrl = coords
    ? wazeUrl(coords)
    : searchQuery
      ? wazeSearchUrl(searchQuery)
      : mapsUrl;
  const h = compact ? 220 : 300;
  // v=2: cache-buster — the server caches images 24h (immutable), so a style
  // change (olive→red pin, 2026-07-21) needs a new URL to bypass stale copies.
  const staticUrl = coords
    ? `${SUPABASE_URL}/functions/v1/map-preview?lat=${coords.lat}&lon=${coords.lon}&w=600&h=${h}&v=2`
    : isMapsLink(mapsUrl)
      ? `${SUPABASE_URL}/functions/v1/map-preview?u=${encodeURIComponent(mapsUrl)}&w=600&h=${h}&v=2`
      : null;

  const open = (url: string) => Linking.openURL(url).catch(() => {});
  const height = compact ? 110 : 150;
  const host = useMemo(() => {
    try {
      return new URL(mapsUrl).host.replace(/^www\./, '');
    } catch {
      return mapsUrl;
    }
  }, [mapsUrl]);

  return (
    <View style={[styles.card, neu.raisedSoft]}>
      {/* Inner clip: boxShadow can't live on the same view as overflow:'hidden'
          (the map image needs the rounded clip), so the neu face stays outside. */}
      <View style={styles.clip}>
        {staticUrl && !imgFailed ? (
          <Image
            source={{ uri: staticUrl }}
            style={{ width: '100%', height }}
            resizeMode="cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <View style={[styles.fallback, { height, backgroundColor: withAlpha(C.accent, 0.07) }]}>
            <Feather name="map-pin" size={22} color={C.accent} />
            <Text style={[styles.fallbackText, { color: C.textSecondary }]} numberOfLines={1}>
              {venue?.trim() || host}
            </Text>
          </View>
        )}
        <View style={styles.btnRow}>
          <Pressable style={[styles.btn, { backgroundColor: withAlpha(C.textPrimary, 0.03) }, neuF.raised]} onPress={() => open(gUrl)} accessibilityRole="button">
            <Feather name="map" size={13} color={C.accent} />
            <Text style={[styles.btnText, { color: C.accent }]}>{t.collectz.mapsOpenGoogle}</Text>
          </Pressable>
          <Pressable style={[styles.btn, { backgroundColor: withAlpha(C.textPrimary, 0.03) }, neuF.raised]} onPress={() => open(wUrl)} accessibilityRole="button">
            <Feather name="navigation" size={13} color={C.accent} />
            <Text style={[styles.btnText, { color: C.accent }]}>{t.collectz.mapsOpenWaze}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.lg,
    marginTop: SPACING.xs,
  },
  clip: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  fallbackText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  btnRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    // Pad the INSIDE of the clip (neu vertical-error fix): md slack so the
    // pills' neu shadows render into padding instead of being sliced at the edge.
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
  },
  btnText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
});
