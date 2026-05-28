import React, { memo } from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { BANK_LOGOS, BANK_LOGOS_SMALL, CARD_NETWORK_LOGOS } from '../../constants/premium';
import { Wallet } from '../../types';
import { useCalm } from '../../hooks/useCalm';

function WalletLogo({ wallet, size = 40 }: { wallet: Wallet; size?: number }) {
  const C = useCalm();
  if (wallet.presetId === 'credit_card' && wallet.creditBank && wallet.creditNetwork) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <Image
          source={BANK_LOGOS_SMALL[wallet.creditBank] ?? BANK_LOGOS[wallet.creditBank]}
          style={{ width: size * 0.7, height: size * 0.45 }}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={0}
        />
        <Text style={{ color: C.border, fontSize: 12, marginHorizontal: -1 }}>|</Text>
        <Image
          source={CARD_NETWORK_LOGOS[wallet.creditNetwork]}
          style={{ width: size * 0.55, height: size * 0.35 }}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={0}
        />
      </View>
    );
  }
  const logo = wallet.presetId ? (BANK_LOGOS_SMALL[wallet.presetId] ?? BANK_LOGOS[wallet.presetId]) : null;
  if (logo) {
    return (
      <Image
        source={logo}
        style={{ width: size, height: size }}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={0}
      />
    );
  }
  return <Feather name={wallet.icon as keyof typeof Feather.glyphMap} size={size * 0.6} color={wallet.color} />;
}

export default memo(WalletLogo);
