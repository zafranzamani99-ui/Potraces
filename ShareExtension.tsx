import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { close, type InitialProps } from 'expo-share-extension';
import * as Notifications from 'expo-notifications';
import { readAsStringAsync, deleteAsync } from 'expo-file-system/legacy';
import { recognizeRows, isLocalOcrAvailable, extractReceiptFromRows } from './src/services/localReceiptOcr';
import { parsePaymentScreenshot } from './src/services/paymentScreenshotParser';
import { extractPdfTextRows, base64ToBytes } from './src/services/pdfTextExtract';
import { dedupeKeyFor } from './src/utils/paymentDedupeKey';
import { hasSharedKey, addSharedKey } from './src/utils/sharedPaymentDedupe';
import { addPendingReceipt } from './src/utils/sharedReceiptInbox';
import { addPendingText } from './src/utils/sharedTextInbox';
import { markFileNotified, stagedBasename } from './src/utils/shareExtBridge';

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
  | 'receipt'
  | 'pdf';

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
  // A PDF invoice/receipt — the extension can't read it (the app does the JS extraction on
  // foreground and notifies the outcome there). Neutral "handed off", not a ✓ or ✕.
  pdf: { color: C.blue, glyph: '📄', title: 'PDF received' },
};

function toFileUri(p: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(p)) return p;
  return p.startsWith('/') ? `file://${p}` : p;
}

export default function ShareExtension({ images, files, text }: InitialProps) {
  const [status, setStatus] = useState<Status>('loading');
  const [subtitle, setSubtitle] = useState('Reading your screenshot…');

  useEffect(() => {
    let done = false;
    // Dev-only timing: how long each step takes on-device (bundle load happens BEFORE
    // this line — its cost is the gap between tapping Potraces and the first log).
    const t0 = Date.now();
    const tlog = (msg: string) => console.log(`[sharex] t+${Date.now() - t0}ms ${msg}`);
    tlog('extension JS running (bundle loaded)');
    // Permissions are needed only at notify time, but the async call is slow-ish — start
    // it NOW so it resolves in parallel with OCR instead of adding to the wait.
    const permP = Notifications.getPermissionsAsync();
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
        // TEXT share (bank SMS, WhatsApp receipt, emailed confirmation): no OCR needed —
        // the same parser reads the lines directly. Images win when both are present.
        const sharedText = !raw && typeof text === 'string' && text.trim().length > 0 ? text : null;
        // PDF: extract its text rows RIGHT HERE (pure JS) so a payment PDF notifies
        // immediately like a screenshot. The flow then continues exactly like a text share
        // (the app logs via the pending-text inbox). The staged file is DELETED for
        // payments/unclear shares (the app needs only the rows) but KEPT for receipts —
        // the app copies it into receipt storage as the archived document. On ANY failure
        // (no text layer, file unreadable) hand the staged file to the app, which extracts
        // and notifies there.
        let pdfRows: string[] | null = null;
        let pdfFile: string | null = null;
        if (raw && /\.pdf($|[?#])/i.test(raw) && !sharedText) {
          try {
            const b64 = await readAsStringAsync(toFileUri(raw), { encoding: 'base64' });
            const extracted = extractPdfTextRows(base64ToBytes(b64));
            if (extracted.length === 0) throw new Error('no text layer');
            pdfRows = extracted;
            pdfFile = toFileUri(raw);
            tlog(`pdf extracted (${extracted.length} rows)`);
          } catch (e) {
            tlog(`pdf extract failed: ${String(e).slice(0, 60)} — handing to app`);
            setStatus('pdf');
            setSubtitle('Open Potraces — it logs there in a moment.');
            finishAfter(2400);
            return;
          }
        }
        if ((!raw && !sharedText) || (!!raw && !pdfRows && !isLocalOcrAvailable())) {
          tlog(`error path (raw=${!!raw} text=${!!sharedText} ocrAvail=${isLocalOcrAvailable()})`);
          setStatus('error');
          setSubtitle('Open Potraces to add it manually.');
          finishAfter(2400);
          return;
        }

        const rows = sharedText
          ? sharedText.split(/\r?\n/).map((r) => r.trim()).filter(Boolean)
          : pdfRows ?? (await recognizeRows(toFileUri(raw!)));
        tlog(sharedText ? `text share (${rows.length} lines)` : pdfRows ? `pdf (${rows.length} rows)` : `ocr done (${rows.length} rows)`);
        // What the app logs from on foreground: shared text / extracted PDF rows, or null
        // for images (the app re-OCRs the staged image itself).
        const payload = sharedText ?? (pdfRows ? rows.join('\n') : null);
        // Receipts keep the staged PDF for archiving; payments/unclear shares don't need it.
        const consumePdfFile = () => {
          if (pdfFile) {
            deleteAsync(pdfFile, { idempotent: true }).catch(() => { /* app-side dedupe covers a leftover */ });
            pdfFile = null;
          }
        };
        const parsed = parsePaymentScreenshot(rows);
        tlog(`parsed pay=${parsed.isPaymentScreen} amt=${parsed.amount} reason=${parsed.reason}`);

        if (parsed.reason === 'failed') {
          consumePdfFile(); // nothing to log — the staged PDF isn't needed either
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
            tlog('already-logged');
            setStatus('already');
            setSubtitle(msg);
            finishAfter(1800);
            return;
          }

          const perm = await permP;
          if (perm.status === 'granted') {
            await Notifications.scheduleNotificationAsync({
              content: { title: 'Logged to Potraces', body: msg, data: { type: 'share_logged' } },
              trigger: null,
            });
            // Mark the staged IMAGE so the app's silent reconcile doesn't fire a duplicate
            // banner — and DOES fire one when this extension never ran (shareExtBridge).
            if (!payload && raw) await markFileNotified(stagedBasename(raw));
          }
          await addSharedKey(key);
          if (payload) {
            // The native side stages IMAGES in the app-group dir — for a TEXT share (or an
            // extracted PDF) the app needs only the rows, so stash them and drop the file.
            const tid = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
            await addPendingText(tid, payload, 'payment');
            consumePdfFile();
          }
          tlog('success card shown');
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
          const tail = receipt.vendor ? ` · ${receipt.vendor}` : '';
          if (payload) {
            // TEXT/PDF receipt → the app AUTO-LOGS the total (transactions screen) AND
            // archives the receipt in the Receipts screen (with the PDF attached). The PDF
            // file is LEFT staged so the app can copy it into receipt storage; the rows are
            // stashed so the app doesn't re-extract. Notify now, like a payment.
            const tid = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
            await addPendingText(tid, payload, 'receipt', pdfFile ?? undefined);
            const perm = await permP;
            if (perm.status === 'granted') {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: 'Logged to Potraces',
                  body: `RM ${receipt.total.toFixed(2)}${tail}`,
                  data: { type: 'share_logged' },
                },
                trigger: null,
              });
            }
            setStatus('receipt');
            tlog('receipt (text/pdf) card shown');
            setSubtitle(`RM ${receipt.total.toFixed(2)}${tail} — saved when you open Potraces.`);
            finishAfter(2600);
            return;
          }
          const rid = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
          if (raw) await addPendingReceipt(rid, toFileUri(raw));
          const perm = await permP;
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
          tlog('receipt card shown');
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
          if (payload) {
            const tid = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
            await addPendingText(tid, payload, 'other');
            consumePdfFile();
          }
          setStatus('checking');
          setSubtitle('Open Potraces — this one needs a closer look.');
          finishAfter(2600);
          return;
        }

        consumePdfFile(); // not a payment — the staged PDF isn't needed
        setStatus('not_payment');
        setSubtitle("This isn't a successful payment — nothing logged.");
        finishAfter(2200);
      } catch (e) {
        tlog(`THREW: ${String(e).slice(0, 80)}`);
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
