import { useEffect } from 'react';
import { View } from 'react-native';
import { close, openHostApp, type InitialProps } from 'expo-share-extension';

/**
 * Thin iOS share-extension root: receives the shared content, hands it to the main
 * Potraces app via a `potraces://share` deep link, then closes. All real work (OCR,
 * Echo parsing) lives in the main app — which is OTA-updatable — so this extension
 * bundle (which is NOT OTA-updatable) stays minimal and stable.
 */
export default function ShareExtension({ images, files, text, url }: InitialProps) {
  useEffect(() => {
    const payload = {
      image: images?.[0] ?? files?.[0] ?? null,
      text: text ?? null,
      url: url ?? null,
    };
    const qs = encodeURIComponent(JSON.stringify(payload));
    try {
      openHostApp(`share?payload=${qs}`);
    } catch {
      // ignore — fall through to close
    }
    // Safety: if opening the host app didn't dismiss us, close after a beat.
    const t = setTimeout(() => close(), 1500);
    return () => clearTimeout(t);
  }, [images, files, text, url]);

  // @ts-ignore react-native's View type isn't always assignable to React 19's stricter
  // JSX.ElementType (share-extension entry only). @ts-ignore (not expect-error) so it's a
  // no-op when the types DO align — otherwise CI flags an "unused" expect-error directive.
  return <View />;
}
