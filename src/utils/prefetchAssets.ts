import { Asset } from 'expo-asset';
import { BANK_LOGOS, BANK_LOGOS_SMALL, CARD_NETWORK_LOGOS } from '../constants/premium';

export async function prefetchWalletLogos(): Promise<void> {
  const sources = [
    ...Object.values(BANK_LOGOS),
    ...Object.values(BANK_LOGOS_SMALL),
    ...Object.values(CARD_NETWORK_LOGOS),
  ];
  try {
    await Asset.loadAsync(sources);
  } catch {
    // non-fatal — logos still render, just not pre-decoded
  }
}
