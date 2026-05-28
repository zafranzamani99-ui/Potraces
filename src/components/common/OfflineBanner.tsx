import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import RAnimated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useCalm } from '../../hooks/useCalm';
import { CALM, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { useT } from '../../i18n';

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: SPACING.xs + 2,
      paddingHorizontal: SPACING.md,
      backgroundColor: C.highlight,
      borderRadius: RADIUS.md,
      marginBottom: SPACING.sm,
      gap: SPACING.xs + 2,
      borderWidth: 1,
      borderColor: C.border,
    },
    text: {
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: TYPOGRAPHY.weight.medium,
      color: C.bronze,
    },
  });

const OfflineBanner: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = React.useMemo(() => makeStyles(C), [C]);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!(state.isConnected && state.isInternetReachable !== false));
    });
    return () => unsubscribe();
  }, []);

  if (!isOffline) return null;

  return (
    <RAnimated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)}>
      <View style={styles.container}>
        <Feather name="wifi-off" size={14} color={C.bronze} />
        <Text style={styles.text}>{t.common.offline}</Text>
      </View>
    </RAnimated.View>
  );
};

export default OfflineBanner;
