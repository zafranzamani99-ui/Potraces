import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { QueryAnswer } from '../../services/queryEngine';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useFadeSlide } from '../../utils/fadeSlide';

interface QueryResultCardProps {
  answer: QueryAnswer;
}

const QueryResultCard: React.FC<QueryResultCardProps> = ({ answer }) => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const fadeSlide = useFadeSlide(50);

  return (
    <Animated.View style={[styles.card, { opacity: fadeSlide.opacity, transform: fadeSlide.transform }]}>
      <View style={styles.iconWrap}>
        <Feather
          name={answer.icon as keyof typeof Feather.glyphMap}
          size={16}
          color={C.bronze}
        />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{answer.title}</Text>
        <Text style={styles.value}>{answer.value}</Text>
        {answer.detail ? (
          <Text style={styles.detail}>{answer.detail}</Text>
        ) : null}
      </View>
    </Animated.View>
  );
};

export default React.memo(QueryResultCard);

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: withAlpha(C.bronze, 0.06),
    borderWidth: 1,
    borderColor: withAlpha(C.bronze, 0.12),
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: withAlpha(C.bronze, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  content: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  value: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  detail: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    marginTop: 2,
  },
});
