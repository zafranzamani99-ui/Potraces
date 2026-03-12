import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { QueryAnswer } from '../../services/queryEngine';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useFadeSlide } from '../../utils/fadeSlide';

interface QueryResultCardProps {
  answer: QueryAnswer;
}

const QueryResultCard: React.FC<QueryResultCardProps> = ({ answer }) => {
  const fadeSlide = useFadeSlide(50);

  return (
    <Animated.View style={[styles.card, { opacity: fadeSlide.opacity, transform: fadeSlide.transform }]}>
      <View style={styles.iconWrap}>
        <Feather
          name={answer.icon as any}
          size={16}
          color={CALM.bronze}
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

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: withAlpha(CALM.bronze, 0.06),
    borderWidth: 1,
    borderColor: withAlpha(CALM.bronze, 0.12),
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: withAlpha(CALM.bronze, 0.1),
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
    color: CALM.textMuted,
  },
  value: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  detail: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    marginTop: 2,
  },
});
