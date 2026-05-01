import { captureRef } from 'react-native-view-shot';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export async function shareCapturedReceipt(viewRef: React.RefObject<any>, fileBaseName = 'receipt'): Promise<void> {
  const uri = await captureRef(viewRef, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
  });

  const safeName = fileBaseName.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40) || 'receipt';
  const destUri = `${FileSystem.cacheDirectory}${safeName}_${Date.now()}.png`;
  await FileSystem.copyAsync({ from: uri, to: destUri });

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(destUri, {
    mimeType: 'image/png',
    dialogTitle: 'Share receipt image',
    UTI: 'public.png',
  });
}
