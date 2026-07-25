import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Svg, { Path as SvgPath } from 'react-native-svg';
import type { SavedReceipt } from '../types';
import {
  REPLICA_WIDTH,
  REPLICA_PAPER,
  REPLICA_INK,
  REPLICA_DASH,
  barcodeBarWidths,
  buildTearPath,
  formatBareMoney,
  formatReplicaDate,
  receiptShortId,
  truncateItemName,
} from '../services/receiptReplicaHtml';

const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'Courier New' });

const Dash = () => (
  <Text style={st.dash} numberOfLines={1}>
    {REPLICA_DASH}
  </Text>
);

/**
 * Thermal-receipt REPLICA of a photographed paper receipt — the RN twin of
 * buildReceiptReplicaHtml (same helpers, same layout). Rendered off-screen
 * inside a ViewShot by ReceiptDetail for "share as image" on photo receipts.
 * NOTE: ReceiptItem carries only { name, amount } — QTY prints `1`, PRICE
 * mirrors the line amount.
 */
const ReceiptReplicaView: React.FC<{ receipt: SavedReceipt; currency: string }> = ({ receipt, currency }) => {
  const vendor = (receipt.vendor ?? receipt.title ?? '').toUpperCase();
  const locLines = (receipt.location ?? '')
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const shortId = receiptShortId(receipt.id);
  const bars = barcodeBarWidths(receipt.id);
  const tearPath = buildTearPath(REPLICA_WIDTH, 14);

  return (
    <View style={st.root}>
      <View style={st.paper}>
        {/* ── Header ── */}
        <View style={st.hdr}>
          <Text style={st.vendor}>{vendor}</Text>
          {locLines.map((l, i) => (
            <Text key={i} style={st.loc}>
              {l.toUpperCase()}
            </Text>
          ))}
        </View>

        <Dash />

        {/* ── Meta ── */}
        <View style={st.metaRow}>
          <Text style={st.mono}>{formatReplicaDate(receipt.date)}</Text>
          <Text style={st.mono}>RECEIPT # {shortId}</Text>
        </View>

        <Dash />

        {/* ── Items ── */}
        {receipt.items.length > 0 && (
          <>
            <View style={st.row}>
              <Text style={[st.th, st.colDesc]}>DESCRIPTION</Text>
              <Text style={[st.th, st.colPrice]}>PRICE</Text>
              <Text style={[st.th, st.colQty]}>QTY</Text>
              <Text style={[st.th, st.colTotal]}>TOTAL</Text>
            </View>
            <Dash />
            {receipt.items.map((it, i) => (
              <View key={i} style={st.row}>
                <Text style={[st.td, st.colDesc]} numberOfLines={1}>
                  {truncateItemName(it.name)}
                </Text>
                <Text style={[st.td, st.colPrice]}>{formatBareMoney(it.amount)}</Text>
                <Text style={[st.td, st.colQty]}>1</Text>
                <Text style={[st.td, st.colTotal]}>{formatBareMoney(it.amount)}</Text>
              </View>
            ))}
            <Dash />
          </>
        )}

        {/* ── Totals ── */}
        {receipt.subtotal != null && (
          <View style={st.row}>
            <Text style={st.subLabel}>SUBTOTAL</Text>
            <Text style={st.subValue}>{formatBareMoney(receipt.subtotal)}</Text>
          </View>
        )}
        {receipt.tax != null && (
          <View style={st.row}>
            <Text style={st.subLabel}>TAX</Text>
            <Text style={st.subValue}>{formatBareMoney(receipt.tax)}</Text>
          </View>
        )}
        <View style={st.row}>
          <Text style={st.grandLabel}>TOTAL AMOUNT</Text>
          <Text style={st.grandValue}>
            {currency} {formatBareMoney(receipt.total)}
          </Text>
        </View>

        <Dash />

        {/* ── Footer: barcode + tagline ── */}
        <View style={st.footer}>
          <View style={st.barcodeRow}>
            {bars.map((w, i) => (
              <View
                key={i}
                style={{
                  width: w,
                  height: 40,
                  backgroundColor: REPLICA_INK,
                  marginRight: i === bars.length - 1 ? 0 : 2,
                }}
              />
            ))}
          </View>
          <Text style={st.barcodeId}>{shortId}</Text>
          <Text style={st.tagline}>TRACKED WITH POTRACES</Text>
        </View>
      </View>

      {/* ── Torn edge (paper-colored teeth against transparency) ── */}
      <Svg width={REPLICA_WIDTH} height={14} viewBox={`0 0 ${REPLICA_WIDTH} 14`}>
        <SvgPath d={tearPath} fill={REPLICA_PAPER} />
      </Svg>
    </View>
  );
};

const PAD_H = 18;

const st = StyleSheet.create({
  root: {
    width: REPLICA_WIDTH,
    backgroundColor: 'transparent',
  },
  paper: {
    backgroundColor: REPLICA_PAPER,
    paddingTop: 22,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  hdr: {
    alignItems: 'center',
    paddingHorizontal: PAD_H,
    paddingBottom: 8,
  },
  vendor: {
    fontFamily: MONO,
    fontSize: 17,
    fontWeight: '700',
    color: REPLICA_INK,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  loc: {
    fontFamily: MONO,
    fontSize: 11,
    color: REPLICA_INK,
    lineHeight: 16,
    marginTop: 3,
    textAlign: 'center',
  },
  dash: {
    fontFamily: MONO,
    fontSize: 11,
    color: REPLICA_INK,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 6,
  },
  mono: {
    fontFamily: MONO,
    fontSize: 11,
    color: REPLICA_INK,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: PAD_H,
    paddingVertical: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: PAD_H,
    paddingVertical: 2.5,
  },
  th: {
    fontFamily: MONO,
    fontSize: 10,
    fontWeight: '700',
    color: REPLICA_INK,
  },
  td: {
    fontFamily: MONO,
    fontSize: 11,
    color: REPLICA_INK,
  },
  colDesc: { flex: 1, textAlign: 'left', marginRight: 6 },
  colPrice: { width: 56, textAlign: 'right' },
  colQty: { width: 28, textAlign: 'right' },
  colTotal: { width: 62, textAlign: 'right' },
  subLabel: {
    fontFamily: MONO,
    fontSize: 11,
    color: REPLICA_INK,
  },
  subValue: {
    fontFamily: MONO,
    fontSize: 11,
    color: REPLICA_INK,
  },
  grandLabel: {
    fontFamily: MONO,
    fontSize: 17,
    fontWeight: '700',
    color: REPLICA_INK,
  },
  grandValue: {
    fontFamily: MONO,
    fontSize: 17,
    fontWeight: '700',
    color: REPLICA_INK,
  },
  footer: {
    alignItems: 'center',
    paddingHorizontal: PAD_H,
    paddingTop: 8,
    paddingBottom: 14,
  },
  barcodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  barcodeId: {
    fontFamily: MONO,
    fontSize: 11,
    color: REPLICA_INK,
    letterSpacing: 3,
    marginTop: 5,
    textAlign: 'center',
  },
  tagline: {
    fontFamily: MONO,
    fontSize: 10,
    color: REPLICA_INK,
    letterSpacing: 1,
    marginTop: 9,
    textAlign: 'center',
  },
});

export default ReceiptReplicaView;
