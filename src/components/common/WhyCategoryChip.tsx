import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useCalm } from '../../hooks/useCalm';
import { SPACING, TYPOGRAPHY, RADIUS, withAlpha, CALM } from '../../constants';
import { lightTap } from '../../services/haptics';
import { explainCategorization } from '../../services/explainCategory';

interface Props {
  description: string;
  category: string;
  cached?: string;
  onExplained?: (text: string) => void;
}

export default function WhyCategoryChip({ description, category, cached, onExplained }: Props) {
  const C = useCalm();
  const s = makeStyles(C);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string | null>(cached ?? null);
  const [error, setError] = useState<string | null>(null);

  // Reset local text if caller switches to a new transaction (cached changes).
  useEffect(() => {
    setText(cached ?? null);
    setError(null);
  }, [cached]);

  const onPress = async () => {
    if (loading) return;
    if (text) return; // already explained; chip just displays it
    if (!description.trim() || !category.trim()) {
      setError('need a description and a category first');
      return;
    }
    lightTap();
    setLoading(true);
    setError(null);
    const result = await explainCategorization(description, category);
    setLoading(false);
    if (!result) {
      setError("couldn't reach AI — try again later");
      return;
    }
    setText(result);
    onExplained?.(result);
  };

  if (text) {
    return (
      <View style={s.explained}>
        <Feather name="info" size={12} color={C.textSecondary} />
        <Text style={s.explainedText}>{text}</Text>
      </View>
    );
  }

  return (
    <View style={{ alignItems: 'flex-start', marginTop: 4, marginBottom: SPACING.sm }}>
      <TouchableOpacity onPress={onPress} disabled={loading} style={s.chip}>
        {loading ? (
          <ActivityIndicator size="small" color={C.accent} />
        ) : (
          <Feather name="help-circle" size={12} color={C.accent} />
        )}
        <Text style={s.chipText}>why this category?</Text>
      </TouchableOpacity>
      {error && <Text style={s.errorText}>{error}</Text>}
    </View>
  );
}

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: withAlpha(C.accent, 0.3),
    backgroundColor: withAlpha(C.accent, 0.08),
  },
  chipText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  explained: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(C.accent, 0.06),
    marginTop: 4,
    marginBottom: SPACING.sm,
  },
  explainedText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    lineHeight: 18,
  },
  errorText: {
    marginTop: 4,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
  },
});
