// ─── ECHO EXTRACTING LOADER ─────────────────────────────────────────────────
// Shown while a note is being extracted. Instead of exposing the technical
// pipeline ("scanning → AI / local parser"), it reads as Echo doing the work:
// the Echo bolt + a spinner + a phrase that advances as it goes.

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';

const EchoExtractingLoader: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const phrases = useMemo(
    () => [t.notes.loadReading, t.notes.loadAmounts, t.notes.loadSorting, t.notes.loadAlmost],
    [t]
  );
  const [idx, setIdx] = useState(0);

  // Advance through the phrases and settle on the last one (no looping back —
  // reads as steady progress, not a spinner going in circles).
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => Math.min(i + 1, phrases.length - 1)), 1300);
    return () => clearInterval(id);
  }, [phrases.length]);

  return (
    <View style={styles.row}>
      <View style={styles.badge}>
        <Feather name="zap" size={13} color={C.bronze} />
      </View>
      <ActivityIndicator size="small" color={C.bronze} />
      <Text style={styles.text} numberOfLines={1}>{phrases[idx]}</Text>
    </View>
  );
};

export default EchoExtractingLoader;

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
  },
  badge: {
    width: 26,
    height: 26,
    borderRadius: RADIUS.sm,
    backgroundColor: withAlpha(C.bronze, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.bronze,
    fontStyle: 'italic',
    letterSpacing: 0.1,
  },
});
