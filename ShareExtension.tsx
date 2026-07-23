import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { close, type InitialProps } from 'expo-share-extension';
import * as Notifications from 'expo-notifications';
import { recognizeRows, isLocalOcrAvailable, extractReceiptFromRows } from './src/services/localReceiptOcr';
import { parsePaymentScreenshot } from './src/services/paymentScreenshotParser';
import { dedupeKeyFor } from './src/utils/paymentDedupeKey';
import { hasSharedKey, addSharedKey } from './src/utils/sharedPaymentDedupe';
import { addPendingReceipt } from './src/utils/sharedReceiptInbox';

/**
 * iOS share-extension root — Flow C. iOS blocks a share extension from launching its host
 * app, so this extension does the work itself: OCR + parse the shared screenshot RIGHT HERE
 * (ML Kit + expo-notifications are linked into the extension target), fire the "Logged RM…"
 * notification immediately (no app-open needed), and show a small confirmation card so the
 * popup isn't a blank sheet. The screenshot stays staged in the app-group container; the main
 * app writes it into the ledger (wallet deduction, dedupe) on next foreground — silently,
 * since this extension already notified.
 */

type Status =
  | 'loading'
  | 'success'
  | 'not_payment'
  | 'failed'
  | 'error'
  | 'checking'
  | 'already'
  | 'receipt';

const C = {
  scrim: '#0E0E0E',
  card: '#1C1C1C',
  text: '#F2F2F2',
  sub: '#9A9A9A',
  accent: '#8A9A5B',
  green: '#5B9A6B',
  amber: '#C9A24B',
  blue: '#5B7A9A',
  red: '#C7644E',
};

// Only a SUCCESSFUL payment logs. Everything else shows the olive ✕ "not a successful
// payment" card — the share never records random screens.
const VIEW: Record<Exclude<Status, 'loading'>, { color: string; glyph: string; title: string }> = {
  success: { color: C.green, glyph: '✓', title: 'Logged' },
  not_payment: { color: C.accent, glyph: '✕', title: 'Not a successful payment' },
  failed: { color: C.accent, glyph: '✕', title: 'Not a successful payment' },
  error: { color: C.accent, glyph: '✕', title: "Couldn't read it" },
  // Uncertain: the rules can't tell. The extension can't run AI, so it hands off — the app
  // takes a closer look (AI) when opened. Neutral, not a ✓ or ✕.
  checking: { color: C.amber, glyph: '…', title: 'Needs a closer look' },
  // Already logged (this exact payment was recorded before) — a grey ✓, no notification.
  already: { color: C.sub, glyph: '✓', title: 'Already logged' },
  // A store receipt — a real expense, but richer than a one-tap payment. Nothing is logged
  // here; the app opens the full receipt review so the user confirms items/total and saves.
  receipt: { color: C.blue, glyph: '🧾', title: 'Receipt' },
};

function toFileUri(p: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(p)) return p;
  return p.startsWith('/') ? `file://${p}` : p;
}

export default function ShareExtension({ images, files }: InitialProps) {
  const [status, setStatus] = useState<Status>('loading');
  const [subtitle, setSubtitle] = useState('Reading your screenshot…');

  useEffect(() => {
    let done = false;
    const finishAfter = (ms: number) =>
      setTimeout(() => {
        if (!done) {
          done = true;
          close();
        }
      }, ms);

    (async () => {
      try {
        const raw = images?.[0] ?? files?.[0] ?? null;
        if (!raw || !isLocalOcrAvailable()) {
          setStatus('error');
          setSubtitle('Open Potraces to add it manually.');
          finishAfter(2400);
          return;
        }

        const rows = await recognizeRows(toFileUri(raw));
        const parsed = parsePaymentScreenshot(rows);

        if (parsed.reason === 'failed') {
          setStatus('failed');
          setSubtitle("This payment didn't go through — nothing logged.");
          finishAfter(2400);
          return;
        }

        if (parsed.isPaymentScreen && parsed.amount != null) {
          const verb = parsed.direction === 'in' ? 'received' : 'paid';
          const tail = parsed.payee ? ` · ${parsed.payee}` : '';
          const msg = `RM ${parsed.amount.toFixed(2)} ${verb}${tail}`;

          // Already logged this exact payment (and it still exists)? → show it, no duplicate
          // notification. The app removes the key when the transaction is deleted, so a
          // delete-then-reshare logs fresh again.
          const key = dedupeKeyFor({
            refId: parsed.refId,
            direction: parsed.direction,
            amount: parsed.amount,
            datetime: parsed.datetime,
            payee: parsed.payee,
          });
          if (await hasSharedKey(key)) {
            setStatus('already');
            setSubtitle(msg);
            finishAfter(1800);
            return;
          }

          const perm = await Notifications.getPermissionsAsync();
          if (perm.status === 'granted') {
            await Notifications.scheduleNotificationAsync({
              content: { title: 'Logged to Potraces', body: msg, data: { type: 'share_logged' } },
              trigger: null,
            });
          }
          await addSharedKey(key);
          setStatus('success');
          setSubtitle(msg);
          finishAfter(1800);
          return;
        }

        // Store receipt (an itemised list + a grand TOTAL + a vendor). Not a payment
        // confirmation, but a real expense — nothing is LOGGED here. Stash it (keyed by a random
        // rid) and fire a "tap to review" notification carrying that rid. The app scans it ONLY
        // when the notification is TAPPED (within 24h), never on a plain open. If notifications
        // are OFF there's no tap path, so we tell the user to open the app (the reconcile falls
        // back to opening it there). Skip in-app screens (debts/bills/paywall).
        const receipt =
          parsed.reason !== 'not_payment_screen' ? extractReceiptFromRows(rows) : null;
        if (receipt) {
          const rid = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
          if (raw) await addPendingReceipt(rid, toFileUri(raw));
          const tail = receipt.vendor ? ` · ${receipt.vendor}` : '';
          const perm = await Notifications.getPermissionsAsync();
          const notifsOn = perm.status === 'granted';
          if (notifsOn) {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: 'Receipt found',
                body: `RM ${receipt.total.toFixed(2)}${tail} — tap to review & save`,
                data: { type: 'share_receipt', rid },
              },
              trigger: null,
            });
          }
          setStatus('receipt');
          setSubtitle(
            notifsOn
              ? 'Tap the notification to review & save it.'
              : 'Open Potraces to review & save it.',
          );
          finishAfter(2600);
          return;
        }

        // Rules aren't sure (a price on screen but not clearly a payment or a list). The
        // extension can't run AI, so hand off: the app takes a closer look (AI) when opened,
        // and fires the final notification then. No notification here.
        if (parsed.uncertain) {
          setStatus('checking');
          setSubtitle('Open Potraces — this one needs a closer look.');
          finishAfter(2600);
          return;
        }

        setStatus('not_payment');
        setSubtitle("This isn't a successful payment — nothing logged.");
        finishAfter(2200);
      } catch {
        setStatus('error');
        setSubtitle('Open Potraces to add it manually.');
        finishAfter(2400);
      }
    })();

    // Safety: never leave the share sheet hanging open.
    const safety = setTimeout(() => {
      if (!done) {
        done = true;
        close();
      }
    }, 9000);
    return () => clearTimeout(safety);
  }, [images, files]);

  const v = status === 'loading' ? null : VIEW[status];

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        {status === 'loading' ? (
          <ActivityIndicator color={C.accent} size="large" style={styles.badge} />
        ) : (
          <View style={[styles.badge, styles.glyphBadge, { backgroundColor: v!.color }]}>
            <Text style={styles.glyph}>{v!.glyph}</Text>
          </View>
        )}
        <Text style={styles.title}>{status === 'loading' ? 'Reading…' : v!.title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <Text style={styles.brand}>Potraces</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: C.card,
    borderRadius: 22,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  badge: {
    width: 52,
    height: 52,
    marginBottom: 14,
  },
  glyphBadge: {
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38,
    textAlign: 'center',
  },
  title: {
    color: C.text,
    fontSize: 21,
    fontWeight: '700',
    marginBottom: 7,
    textAlign: 'center',
  },
  subtitle: {
    color: C.sub,
    fontSize: 15.5,
    textAlign: 'center',
    lineHeight: 21,
  },
  brand: {
    color: C.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 18,
    textTransform: 'uppercase',
  },
});
