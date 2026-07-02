import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import Button from './Button';

interface Props {
  storeUrl?: string;
  message?: string;
}

/**
 * Full-screen, non-dismissible gate shown when the installed build is below the
 * remote `minVersion` (see services/appConfig.ts). There is no close affordance
 * by design — the only way forward is to update.
 */
const ForcedUpdateGate: React.FC<Props> = ({ storeUrl, message }) => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);

  const onUpdate = () => {
    if (storeUrl) Linking.openURL(storeUrl).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.iconWrap}>
          <Feather name="arrow-up-circle" size={40} color={C.accent} />
        </View>
        <Text style={styles.title}>{t.forcedUpdate.title}</Text>
        <Text style={styles.message}>{message || t.forcedUpdate.message}</Text>
        {!!storeUrl && (
          <View style={styles.btnWrap}>
            <Button title={t.forcedUpdate.button} onPress={onUpdate} icon="download" />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.background,
      alignItems: 'center',
      justifyContent: 'center',
      padding: SPACING.xl,
    },
    inner: {
      width: '100%',
      maxWidth: 420,
      alignItems: 'center',
    },
    iconWrap: {
      width: 80,
      height: 80,
      borderRadius: RADIUS.full,
      backgroundColor: withAlpha(C.accent, 0.1),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACING.lg,
    },
    title: {
      fontSize: TYPOGRAPHY.size.xl,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
      textAlign: 'center',
      marginBottom: SPACING.sm,
    },
    message: {
      fontSize: TYPOGRAPHY.size.base,
      color: C.textSecondary,
      textAlign: 'center',
      lineHeight: TYPOGRAPHY.size.base * 1.5,
      marginBottom: SPACING.xl,
    },
    btnWrap: {
      width: '100%',
    },
  });

export default ForcedUpdateGate;
