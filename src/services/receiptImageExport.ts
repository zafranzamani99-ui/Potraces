import { captureRef } from 'react-native-view-shot';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

/**
 * Capture any laid-out view to a PNG and open the share sheet. Generic sibling
 * of shareCapturedReceipt — used for the shareable business card.
 */
export async function shareCapturedView(
  viewRef: React.RefObject<any>,
  opts: { fileBaseName?: string; dialogTitle?: string } = {},
): Promise<void> {
  const { fileBaseName = 'card', dialogTitle = 'Share' } = opts;
  const uri = await captureRef(viewRef, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
    useRenderInContext: true,
  });
  const safeName = fileBaseName.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40) || 'card';
  const destUri = `${FileSystem.cacheDirectory}${safeName}_${Date.now()}.png`;
  await FileSystem.copyAsync({ from: uri, to: destUri });

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(destUri, {
    mimeType: 'image/png',
    dialogTitle,
    UTI: 'public.png',
  });
}

export async function shareCapturedReceipt(viewRef: React.RefObject<any>, fileBaseName = 'receipt'): Promise<void> {
  const uri = await captureRef(viewRef, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
    // Use renderInContext instead of drawViewHierarchyInRect on iOS.
    // drawViewHierarchyInRect captures "as visible onscreen" and skips
    // text color/style rendering for views outside the visible viewport
    // (e.g. position: absolute, left: -9999). renderInContext traverses
    // the CALayer tree directly and renders all attributes faithfully.
    useRenderInContext: true,
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
