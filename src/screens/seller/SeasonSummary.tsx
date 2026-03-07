import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Animated,
  Modal,
  Pressable,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import * as Clipboard from 'expo-clipboard';
import * as XLSX from 'xlsx';
import { Paths, File as ExpoFile } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useSellerStore } from '../../store/sellerStore';
import { useBusinessStore } from '../../store/businessStore';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { createTransfer } from '../../utils/transferBridge';
import { lightTap, mediumTap, successNotification } from '../../services/haptics';
import { useToast } from '../../context/ToastContext';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha, BIZ } from '../../constants';

// -- Count-up animation hook ----------------------------------------
const useCountUp = (target: number, duration: number = 300) => {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    animatedValue.setValue(0);
    Animated.timing(animatedValue, {
      toValue: target,
      duration,
      useNativeDriver: false,
    }).start();
  }, [target]);

  return animatedValue;
};

// -- Stagger fade-in wrapper ----------------------------------------
const FadeInSection: React.FC<{ delay: number; children: React.ReactNode }> = React.memo(({
  delay,
  children,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 250,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 250,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
});

// -- Animated kept amount display -----------------------------------
const AnimatedKeptAmount: React.FC<{ value: number; currency: string }> = React.memo(({
  value,
  currency,
}) => {
  const animatedValue = useCountUp(value, 300);
  const [displayText, setDisplayText] = React.useState(`${currency} 0`);

  useEffect(() => {
    const id = animatedValue.addListener(({ value: v }) => {
      setDisplayText(`${currency} ${v.toFixed(0)}`);
    });
    return () => animatedValue.removeListener(id);
  }, [animatedValue, currency]);

  return <Text style={[styles.keptAmount, { color: value >= 0 ? BIZ.profit : BIZ.loss }]}>{displayText}</Text>;
});

const SeasonSummary: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { seasons, orders, ingredientCosts, endSeason, addSeason, markOrdersTransferred, unmarkOrdersTransferred, deleteSeason, updateSeasonName, updateSeasonTarget } = useSellerStore();
  const addTransfer = useBusinessStore((s) => s.addTransfer);
  const deleteTransfer = useBusinessStore((s) => s.deleteTransfer);
  const addTransferIncome = usePersonalStore((s) => s.addTransferIncome);
  const deletePersonalTransaction = usePersonalStore((s) => s.deleteTransaction);
  const currency = useSettingsStore((s) => s.currency);
  const { showToast } = useToast();

  // Get season -- either from route params or active season
  const seasonId = route.params?.seasonId;
  const season = seasonId
    ? seasons.find((s) => s.id === seasonId)
    : seasons.find((s) => s.isActive);

  // Filtered lists for inline display
  const seasonOrders = useMemo(() => {
    if (!season) return [];
    return orders.filter((o) => o.seasonId === season.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [season, orders]);

  const seasonCosts = useMemo(() => {
    if (!season) return [];
    return ingredientCosts.filter((c) => c.seasonId === season.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [season, ingredientCosts]);

  const stats = useMemo(() => {
    if (!season) return null;
    const seasonOrders = orders.filter((o) => o.seasonId === season.id);
    const seasonCosts = ingredientCosts.filter((c) => c.seasonId === season.id);
    const paidOrders = seasonOrders.filter((o) => o.isPaid);
    const unpaidOrders = seasonOrders.filter((o) => !o.isPaid);

    const totalIncome = paidOrders.reduce((s, o) => s + o.totalAmount, 0);
    const totalCosts = seasonCosts.reduce((s, c) => s + c.amount, 0);
    const kept = totalIncome - totalCosts;

    // Top products
    const productCounts: Record<string, { name: string; qty: number; revenue: number }> = {};
    for (const order of seasonOrders) {
      for (const item of order.items) {
        if (!productCounts[item.productName]) {
          productCounts[item.productName] = { name: item.productName, qty: 0, revenue: 0 };
        }
        productCounts[item.productName].qty += item.quantity;
        productCounts[item.productName].revenue += item.unitPrice * item.quantity;
      }
    }
    const topProducts = Object.values(productCounts)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Unique customers
    const customers = new Set(
      seasonOrders.filter((o) => o.customerName).map((o) => o.customerName!)
    );

    return {
      totalOrders: seasonOrders.length,
      paidOrders: paidOrders.length,
      unpaidOrders: unpaidOrders.length,
      unpaidAmount: unpaidOrders.reduce((s, o) => s + o.totalAmount, 0),
      totalIncome,
      totalCosts,
      kept,
      topProducts,
      customerCount: customers.size,
    };
  }, [season, orders, ingredientCosts]);

  // ─── Transfer bridge ───────────────────────────────────────
  const untransferredOrders = useMemo(() => {
    if (!season) return [];
    return orders.filter(
      (o) => o.seasonId === season.id && o.isPaid && !o.transferredToPersonal
    );
  }, [season, orders]);

  const untransferredAmount = useMemo(
    () => untransferredOrders.reduce((s, o) => s + o.totalAmount, 0),
    [untransferredOrders]
  );

  const [transferAmount, setTransferAmount] = useState('');
  const [showTransfer, setShowTransfer] = useState(false);

  // ─── Modal states ───
  const [showEndModal, setShowEndModal] = useState(false);
  const [showOrdersModal, setShowOrdersModal] = useState(false);
  const [showCostsModal, setShowCostsModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [showTargetInput, setShowTargetInput] = useState(false);
  const [targetInput, setTargetInput] = useState('');
  const [showCompare, setShowCompare] = useState(false);
  const [compareSeasonId, setCompareSeasonId] = useState<string | null>(null);

  // Past seasons (excluding current) sorted newest-first
  const pastSeasons = useMemo(() =>
    seasons
      .filter((s) => !s.isActive && s.id !== season?.id)
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()),
    [seasons, season]
  );

  // Auto-select the most recent past season for comparison
  useEffect(() => {
    if (pastSeasons.length === 0) {
      setCompareSeasonId(null);
    } else if (compareSeasonId === null || !pastSeasons.find((s) => s.id === compareSeasonId)) {
      // Auto-select or recover if selected season was deleted
      setCompareSeasonId(pastSeasons[0].id);
    }
  }, [pastSeasons]);

  const compareStats = useMemo(() => {
    if (!compareSeasonId) return null;
    const cOrders = orders.filter((o) => o.seasonId === compareSeasonId);
    const cCosts = ingredientCosts.filter((c) => c.seasonId === compareSeasonId);
    const cPaid = cOrders.filter((o) => o.isPaid);
    const totalIncome = cPaid.reduce((s, o) => s + o.totalAmount, 0);
    const totalCosts = cCosts.reduce((s, c) => s + c.amount, 0);
    const customers = new Set(cOrders.filter((o) => o.customerName).map((o) => o.customerName!));
    return {
      totalOrders: cOrders.length,
      totalIncome,
      totalCosts,
      kept: totalIncome - totalCosts,
      customerCount: customers.size,
    };
  }, [compareSeasonId, orders, ingredientCosts]);

  useEffect(() => {
    if (untransferredAmount > 0) {
      setTransferAmount(untransferredAmount.toFixed(2));
    }
  }, [untransferredAmount]);

  const handleTransferToPersonal = useCallback(() => {
    const amount = parseFloat(transferAmount);
    if (!amount || amount <= 0 || !season) return;
    if (amount > untransferredAmount) {
      showToast('cannot transfer more than untransferred amount', 'error');
      return;
    }

    const transfer = createTransfer(
      amount,
      'business',
      'personal',
      `seller: ${season.name} (${untransferredOrders.length} orders)`
    );
    addTransfer(transfer);
    addTransferIncome(transfer);
    markOrdersTransferred(
      untransferredOrders.map((o) => o.id),
      transfer.id
    );
    successNotification();
    showToast('transferred to personal', 'success');
    setShowTransfer(false);
  }, [transferAmount, season, untransferredOrders, addTransfer, addTransferIncome, markOrdersTransferred, showToast]);

  const handleEndSeason = useCallback(() => {
    mediumTap();
    if (!season) return;
    setShowEndModal(true);
  }, [season]);

  const confirmEndSeason = useCallback(() => {
    if (!season) return;
    endSeason(season.id);
    successNotification();
    showToast('season ended', 'success');
    setShowEndModal(false);
  }, [season, endSeason, showToast]);

  const handleStartNewSeason = () => {
    Alert.prompt
      ? Alert.prompt('New season', 'What do you want to call it?', (name) => {
          if (name?.trim()) {
            addSeason({ name: name.trim(), startDate: new Date(), isActive: true });
          }
        })
      : Alert.alert('New season', 'Use the seasons tab to start a new season.');
  };

  const generateReportText = useCallback(() => {
    if (!season || !stats) return '';
    const startDate = format(season.startDate instanceof Date ? season.startDate : new Date(season.startDate), 'dd MMM yyyy, h:mm a');
    const endDate = season.endDate
      ? format(season.endDate instanceof Date ? season.endDate : new Date(season.endDate), 'dd MMM yyyy, h:mm a')
      : 'now';
    const line = '\u2500'.repeat(30);
    let text = `LAPORAN MUSIM / SEASON REPORT\n${line}\n`;
    text += `Musim: ${season.name}\n`;
    text += `Tempoh: ${startDate} \u2013 ${endDate}\n${line}\n`;
    text += `Pesanan / Orders: ${stats.totalOrders}\n`;
    text += `Pelanggan / Customers: ${stats.customerCount}\n${line}\n`;
    text += `Pendapatan / Income:  ${currency} ${stats.totalIncome.toFixed(2)}\n`;
    text += `Kos Bahan / Costs:    ${currency} ${stats.totalCosts.toFixed(2)}\n`;
    text += `Untung / Kept:        ${currency} ${stats.kept.toFixed(2)}\n${line}\n`;
    if (stats.topProducts.length > 0) {
      text += `PRODUK TERLARIS / TOP PRODUCTS:\n`;
      stats.topProducts.forEach((p, i) => {
        text += `${i + 1}. ${p.name} \u2014 ${p.qty} unit \u2014 ${currency} ${p.revenue.toFixed(0)}\n`;
      });
      text += `${line}\n`;
    }
    if (stats.unpaidOrders > 0) {
      text += `Belum Bayar / Unpaid: ${stats.unpaidOrders} pesanan (${currency} ${stats.unpaidAmount.toFixed(0)})\n`;
    }
    return text;
  }, [season, stats, currency]);

  const handleCopyReport = useCallback(async () => {
    const text = generateReportText();
    if (!text) return;
    await Clipboard.setStringAsync(text);
    lightTap();
    showToast('report copied', 'info');
  }, [generateReportText, showToast]);

  const handleExportXlsx = useCallback(async () => {
    if (!season || !stats) return;
    try {
      const seasonOrders = orders.filter((o) => o.seasonId === season.id);
      const startDate = format(season.startDate instanceof Date ? season.startDate : new Date(season.startDate), 'dd MMM yyyy, h:mm a');
      const endDate = season.endDate
        ? format(season.endDate instanceof Date ? season.endDate : new Date(season.endDate), 'dd MMM yyyy, h:mm a')
        : 'ongoing';

      // Summary sheet
      const summaryData = [
        ['SEASON REPORT'],
        [''],
        ['Season', season.name],
        ['Period', `${startDate} - ${endDate}`],
        [''],
        ['Orders', stats.totalOrders],
        ['Customers', stats.customerCount],
        [''],
        ['Income', stats.totalIncome],
        ['Costs', stats.totalCosts],
        ['Kept', stats.kept],
        [''],
        ['TOP PRODUCTS'],
        ['Product', 'Quantity', 'Revenue'],
        ...stats.topProducts.map((p) => [p.name, p.qty, p.revenue]),
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);

      // Orders sheet
      const ordersData = [
        ['Date', 'Order #', 'Customer', 'Phone', 'Items', 'Amount', 'Status', 'Paid', 'Payment Method'],
        ...seasonOrders.map((o) => [
          format(o.date instanceof Date ? o.date : new Date(o.date), 'dd/MM/yyyy'),
          o.orderNumber || '',
          o.customerName || '',
          o.customerPhone || '',
          o.items.map((i) => `${i.productName} x${i.quantity}`).join(', '),
          o.totalAmount,
          o.status,
          o.isPaid ? 'Yes' : 'No',
          o.paymentMethod || '',
        ]),
      ];
      const ordersSheet = XLSX.utils.aoa_to_sheet(ordersData);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
      XLSX.utils.book_append_sheet(wb, ordersSheet, 'Orders');

      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const fileName = `${season.name.replace(/[^a-zA-Z0-9]/g, '_')}_report.xlsx`;
      const file = new ExpoFile(Paths.cache, fileName);
      file.write(wbout, { encoding: 'base64' });
      const filePath = file.uri;

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: `${season.name} Report`,
        });
      } else {
        showToast('sharing not available on this device', 'error');
      }
    } catch (e) {
      showToast('failed to export report', 'error');
    }
  }, [season, stats, orders, currency, showToast]);

  if (!season || !stats) {
    return (
      <View style={styles.container}>
        <View style={styles.noSeason}>
          <Feather name="calendar" size={48} color={CALM.border} />
          <Text style={styles.noSeasonTitle}>no active season</Text>
          <Text style={styles.noSeasonText}>
            start a season when you begin taking orders for an event, like Raya or CNY.
          </Text>
          <TouchableOpacity
            style={styles.startSeasonButton}
            activeOpacity={0.7}
            onPress={handleStartNewSeason}
            accessibilityRole="button"
            accessibilityLabel="Start a season"
          >
            <Feather name="plus" size={18} color="#fff" />
            <Text style={styles.startSeasonButtonText}>start a season</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Emotional messaging based on results
  const emotionalMessage = getEmotionalMessage(stats.kept, stats.totalOrders, stats.customerCount);

  // Max qty for proportional bars
  const maxQty = stats.topProducts.length > 0
    ? Math.max(...stats.topProducts.map((p) => p.qty))
    : 1;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Season header */}
        <FadeInSection delay={0}>
          <TouchableOpacity
            style={styles.seasonNameRow}
            activeOpacity={0.7}
            onPress={() => {
              setRenameValue(season.name);
              setShowRenameModal(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Edit season name"
          >
            <Text style={styles.seasonName}>{season.name}</Text>
            <Feather name="edit-2" size={14} color={CALM.textMuted} />
          </TouchableOpacity>
          <Text style={styles.seasonDates}>
            {format(season.startDate instanceof Date ? season.startDate : new Date(season.startDate), 'dd MMM yyyy, h:mm a')}
            {season.endDate
              ? ` \u2013 ${format(season.endDate instanceof Date ? season.endDate : new Date(season.endDate), 'dd MMM yyyy, h:mm a')}`
              : ' \u2013 now'}
          </Text>
        </FadeInSection>

        {/* The emotional number -- framed with ledger lines */}
        <FadeInSection delay={50}>
          <View style={styles.keptSection}>
            <View style={styles.ledgerLine} />
            <View style={styles.keptInner}>
              <Text style={styles.keptLabel}>you kept</Text>
              <AnimatedKeptAmount value={stats.kept} currency={currency} />
              <Text style={styles.keptSubtext}>
                after {currency} {stats.totalCosts.toFixed(0)} in ingredients
              </Text>
            </View>
            <View style={styles.ledgerLine} />
          </View>
        </FadeInSection>

        {/* Emotional message */}
        {emotionalMessage && (
          <FadeInSection delay={100}>
            <Text style={styles.emotionalText}>{emotionalMessage}</Text>
          </FadeInSection>
        )}

        {/* Stats grid: enhanced with icon circles and larger numbers */}
        <FadeInSection delay={150}>
          <View style={styles.statsRow}>
            <View style={styles.statBox} accessible={true} accessibilityLabel={`${stats.totalOrders} orders`}>
              <View style={[styles.statIconCircle, { backgroundColor: withAlpha(CALM.gold, 0.1) }]}>
                <Feather name="clipboard" size={16} color={CALM.gold} />
              </View>
              <Text style={styles.statNumber}>{stats.totalOrders}</Text>
              <Text style={styles.statLabel}>orders</Text>
            </View>
            <View style={styles.statBoxDivider} />
            <View style={styles.statBox} accessible={true} accessibilityLabel={`${stats.customerCount} customers`}>
              <View style={[styles.statIconCircle, { backgroundColor: withAlpha(BIZ.success, 0.1) }]}>
                <Feather name="users" size={16} color={BIZ.success} />
              </View>
              <Text style={styles.statNumber}>{stats.customerCount}</Text>
              <Text style={styles.statLabel}>customers</Text>
            </View>
          </View>
          <View style={styles.statsWideRow}>
            <View style={styles.statBoxWide} accessible={true} accessibilityLabel={`Total income ${currency} ${stats.totalIncome.toFixed(0)}`}>
              <View style={[styles.statIconCircle, { backgroundColor: withAlpha(BIZ.profit, 0.1) }]}>
                <Feather name="trending-up" size={16} color={BIZ.profit} />
              </View>
              <Text style={[styles.statNumber, { color: BIZ.profit }]}>
                {currency} {stats.totalIncome.toFixed(0)}
              </Text>
              <Text style={styles.statLabel}>came in</Text>
            </View>
          </View>
        </FadeInSection>

        {/* Revenue target progress */}
        <FadeInSection delay={175}>
          {season.revenueTarget ? (
            <View style={styles.targetCard}>
              <View style={styles.targetRow}>
                <Feather name="target" size={14} color={CALM.accent} />
                <Text style={styles.targetLabel}>
                  {currency} {stats.totalIncome.toFixed(0)} / {currency} {season.revenueTarget.toFixed(0)} target
                </Text>
                <TouchableOpacity onPress={() => { setTargetInput(String(season.revenueTarget)); setShowTargetInput(true); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="edit-2" size={12} color={CALM.textMuted} />
                </TouchableOpacity>
              </View>
              <View style={styles.targetBarBg}>
                <View style={[styles.targetBarFill, { width: `${Math.min(100, (stats.totalIncome / season.revenueTarget) * 100)}%` as any, backgroundColor: stats.totalIncome >= season.revenueTarget ? BIZ.profit : CALM.accent }]} />
              </View>
              <Text style={styles.targetPct}>
                {stats.totalIncome >= season.revenueTarget
                  ? `target reached \u2714`
                  : `${((stats.totalIncome / season.revenueTarget) * 100).toFixed(0)}% · need ${currency} ${(season.revenueTarget - stats.totalIncome).toFixed(0)} more`}
              </Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.setTargetBtn} onPress={() => { setTargetInput(''); setShowTargetInput(true); }} activeOpacity={0.7}>
              <Feather name="target" size={14} color={CALM.textMuted} />
              <Text style={styles.setTargetText}>set season target</Text>
            </TouchableOpacity>
          )}
        </FadeInSection>

        {/* Season comparison */}
        {pastSeasons.length > 0 && (
          <FadeInSection delay={190}>
            <TouchableOpacity
              style={styles.compareToggle}
              onPress={() => { lightTap(); setShowCompare((v) => !v); }}
              activeOpacity={0.7}
            >
              <Feather name="bar-chart-2" size={14} color={CALM.textMuted} />
              <Text style={styles.compareToggleText}>compare with previous season</Text>
              <Feather name={showCompare ? 'chevron-up' : 'chevron-down'} size={14} color={CALM.textMuted} />
            </TouchableOpacity>
            {showCompare && (
              <View style={styles.compareCard}>
                {/* Season picker pills */}
                {pastSeasons.length > 1 && (
                  <View style={styles.comparePickerRow}>
                    {pastSeasons.slice(0, 4).map((s) => (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.comparePill, compareSeasonId === s.id && styles.comparePillActive]}
                        onPress={() => setCompareSeasonId(s.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.comparePillText, compareSeasonId === s.id && styles.comparePillTextActive]} numberOfLines={1}>
                          {s.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {compareStats && (
                  <View style={styles.compareGrid}>
                    <View style={styles.compareHeaderRow}>
                      <Text style={styles.compareHeaderLabel} />
                      <Text style={styles.compareHeaderThis}>this</Text>
                      <Text style={styles.compareHeaderPrev}>{seasons.find((s) => s.id === compareSeasonId)?.name ?? 'prev'}</Text>
                      <Text style={styles.compareHeaderDelta}>Δ</Text>
                    </View>
                    {([
                      { label: 'orders', cur: stats.totalOrders, prev: compareStats.totalOrders, fmt: (v: number) => String(v) },
                      { label: 'customers', cur: stats.customerCount, prev: compareStats.customerCount, fmt: (v: number) => String(v) },
                      { label: 'came in', cur: stats.totalIncome, prev: compareStats.totalIncome, fmt: (v: number) => `${currency} ${v.toFixed(0)}` },
                      { label: 'costs', cur: stats.totalCosts, prev: compareStats.totalCosts, fmt: (v: number) => `${currency} ${v.toFixed(0)}` },
                      { label: 'kept', cur: stats.kept, prev: compareStats.kept, fmt: (v: number) => `${currency} ${v.toFixed(0)}` },
                    ] as const).map(({ label, cur, prev, fmt }) => {
                      const diff = cur - prev;
                      const pct = prev !== 0 ? Math.abs(diff / prev) * 100 : null;
                      const up = diff > 0;
                      const same = diff === 0;
                      const isGood = label === 'costs' ? !up : up;
                      return (
                        <View key={label} style={styles.compareRow}>
                          <Text style={styles.compareRowLabel}>{label}</Text>
                          <Text style={styles.compareRowCur}>{fmt(cur)}</Text>
                          <Text style={styles.compareRowPrev}>{fmt(prev)}</Text>
                          <View style={styles.compareRowDelta}>
                            {!same && (
                              <>
                                <Feather name={up ? 'arrow-up' : 'arrow-down'} size={10} color={isGood ? BIZ.profit : CALM.bronze} />
                                <Text style={[styles.compareRowDeltaText, { color: isGood ? BIZ.profit : CALM.bronze }]}>
                                  {pct != null ? `${pct.toFixed(0)}%` : (up ? '+' : '−')}
                                </Text>
                              </>
                            )}
                            {same && <Text style={styles.compareRowDeltaText}>—</Text>}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
          </FadeInSection>
        )}

        {/* Unpaid notice */}
        {stats.unpaidOrders > 0 && (
          <FadeInSection delay={200}>
            <View
              style={styles.unpaidCard}
              accessible={true}
              accessibilityLabel={`${stats.unpaidOrders} unpaid orders totalling ${currency} ${stats.unpaidAmount.toFixed(2)}`}
            >
              <Text style={styles.unpaidText}>
                {stats.unpaidOrders} order{stats.unpaidOrders !== 1 ? 's' : ''} still unpaid {'\u00B7'}{' '}
                {currency} {stats.unpaidAmount.toFixed(0)}
              </Text>
            </View>
          </FadeInSection>
        )}

        {/* Transfer to personal wallet */}
        {untransferredAmount > 0 && (
          <FadeInSection delay={225}>
            <View style={styles.transferCard}>
              <View style={styles.transferHeader}>
                <Feather name="refresh-cw" size={16} color={CALM.bronze} />
                <Text style={styles.transferTitle}>
                  {currency} {untransferredAmount.toFixed(0)} untransferred
                </Text>
              </View>
              <Text style={styles.transferSubtext}>
                {untransferredOrders.length} paid order{untransferredOrders.length !== 1 ? 's' : ''} not yet in your personal wallet
              </Text>
              {showTransfer ? (
                <View style={styles.transferInputRow}>
                  <View style={styles.transferInputWrapper}>
                    <Text style={styles.transferCurrencyPrefix}>{currency}</Text>
                    <TextInput
                      style={styles.transferInput}
                      value={transferAmount}
                      onChangeText={setTransferAmount}
                      keyboardType="decimal-pad"
                      selectTextOnFocus
                    />
                  </View>
                  <TouchableOpacity
                    style={styles.transferConfirmButton}
                    activeOpacity={0.7}
                    onPress={handleTransferToPersonal}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.transferConfirmText}>transfer</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.transferButton}
                  activeOpacity={0.7}
                  onPress={() => { lightTap(); setShowTransfer(true); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.transferButtonText}>transfer to personal</Text>
                  <Feather name="arrow-right" size={14} color={CALM.bronze} />
                </TouchableOpacity>
              )}
            </View>
          </FadeInSection>
        )}

        {/* Top products */}
        {stats.topProducts.length > 0 && (
          <FadeInSection delay={250}>
            <View style={styles.topSection}>
              <Text style={styles.sectionTitle}>what people ordered most</Text>
              {stats.topProducts.map((p, i) => {
                const proportion = maxQty > 0 ? p.qty / maxQty : 0;
                return (
                  <View key={p.name} style={styles.topProductItem}>
                    <View style={styles.topProductRow}>
                      <View style={styles.rankCircle}>
                        <Text style={styles.rankText}>{i + 1}</Text>
                      </View>
                      <Text style={styles.topName}>{p.name}</Text>
                      <Text style={styles.topQty}>{p.qty} units</Text>
                    </View>
                    {/* Proportional bar */}
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          { width: `${Math.max(proportion * 100, 2)}%` },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          </FadeInSection>
        )}

        {/* ─── Season actions ─── */}
        <FadeInSection delay={300}>
          {season.isActive ? (
            <View style={styles.actionsCard}>
              {/* Orders row */}
              <TouchableOpacity
                style={styles.actionRow}
                activeOpacity={0.7}
                onPress={() => { lightTap(); setShowOrdersModal(true); }}
              >
                <View style={styles.actionRowLeft}>
                  <View style={[styles.actionIconCircle, { backgroundColor: withAlpha(CALM.gold, 0.1) }]}>
                    <Feather name="clipboard" size={16} color={CALM.gold} />
                  </View>
                  <Text style={styles.actionRowText}>orders</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={styles.inlineListBadge}>
                    <Text style={styles.inlineListBadgeText}>{seasonOrders.length}</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={CALM.textMuted} />
                </View>
              </TouchableOpacity>

              <View style={styles.actionDivider} />

              {/* Costs row */}
              <TouchableOpacity
                style={styles.actionRow}
                activeOpacity={0.7}
                onPress={() => { lightTap(); setShowCostsModal(true); }}
              >
                <View style={styles.actionRowLeft}>
                  <View style={[styles.actionIconCircle, { backgroundColor: withAlpha(CALM.accent, 0.1) }]}>
                    <Feather name="dollar-sign" size={16} color={CALM.accent} />
                  </View>
                  <Text style={styles.actionRowText}>costs</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={styles.inlineListBadge}>
                    <Text style={styles.inlineListBadgeText}>{seasonCosts.length}</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={CALM.textMuted} />
                </View>
              </TouchableOpacity>

              <View style={styles.actionDivider} />

              {/* Copy report row */}
              <TouchableOpacity
                style={styles.actionRow}
                activeOpacity={0.7}
                onPress={handleCopyReport}
                accessibilityRole="button"
                accessibilityLabel="Copy season report"
              >
                <View style={styles.actionRowLeft}>
                  <View style={[styles.actionIconCircle, { backgroundColor: withAlpha(BIZ.success, 0.08) }]}>
                    <Feather name="copy" size={16} color={BIZ.success} />
                  </View>
                  <Text style={styles.actionRowText}>copy report</Text>
                </View>
                <Feather name="copy" size={14} color={CALM.textMuted} />
              </TouchableOpacity>

              <View style={styles.actionDivider} />

              {/* Export report row */}
              <TouchableOpacity
                style={styles.actionRow}
                activeOpacity={0.7}
                onPress={handleExportXlsx}
                accessibilityRole="button"
                accessibilityLabel="Export season report as spreadsheet"
              >
                <View style={styles.actionRowLeft}>
                  <View style={[styles.actionIconCircle, { backgroundColor: withAlpha(BIZ.success, 0.08) }]}>
                    <Feather name="download" size={16} color={BIZ.success} />
                  </View>
                  <Text style={styles.actionRowText}>export report</Text>
                </View>
                <Feather name="download" size={14} color={CALM.textMuted} />
              </TouchableOpacity>

              <View style={styles.actionDivider} />

              {/* End season row */}
              <TouchableOpacity
                style={styles.actionRow}
                activeOpacity={0.7}
                onPress={handleEndSeason}
                accessibilityRole="button"
                accessibilityLabel="End this season"
              >
                <View style={styles.actionRowLeft}>
                  <View style={[styles.actionIconCircle, { backgroundColor: withAlpha(BIZ.warning, 0.1) }]}>
                    <Feather name="x-circle" size={16} color={BIZ.warning} />
                  </View>
                  <Text style={[styles.actionRowText, { color: BIZ.warning }]}>end this season</Text>
                </View>
                <Feather name="chevron-right" size={16} color={BIZ.warning} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.seasonCompleteSection}>
              {/* Season complete badge */}
              <View style={styles.completeBadge}>
                <View style={styles.completeIconCircle}>
                  <Feather name="check-circle" size={20} color={BIZ.success} />
                </View>
                <View style={styles.completeBadgeText}>
                  <Text style={styles.completeTitle}>season complete</Text>
                  {season.endDate && (
                    <Text style={styles.completeDate}>
                      ended {format(
                        season.endDate instanceof Date ? season.endDate : new Date(season.endDate),
                        'dd MMM yyyy, h:mm a'
                      )}
                    </Text>
                  )}
                </View>
              </View>

              {/* Report buttons for completed season */}
              <View style={styles.reportButtonsRow}>
                <TouchableOpacity
                  style={styles.reportButton}
                  activeOpacity={0.7}
                  onPress={handleCopyReport}
                  accessibilityRole="button"
                  accessibilityLabel="Copy season report"
                >
                  <Feather name="copy" size={16} color={BIZ.success} />
                  <Text style={styles.reportButtonText}>copy report</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.reportButton}
                  activeOpacity={0.7}
                  onPress={handleExportXlsx}
                  accessibilityRole="button"
                  accessibilityLabel="Export report as spreadsheet"
                >
                  <Feather name="download" size={16} color={BIZ.success} />
                  <Text style={styles.reportButtonText}>export xlsx</Text>
                </TouchableOpacity>
              </View>

              {/* Undo transfers (only if some orders were transferred) */}
              {seasonOrders.some((o) => o.transferredToPersonal) && (
                <TouchableOpacity
                  style={styles.undoTransfersBtn}
                  activeOpacity={0.7}
                  onPress={() => {
                    const transferred = seasonOrders.filter((o) => o.transferredToPersonal);
                    const transferIds = [...new Set(transferred.map((o) => o.transferId).filter(Boolean))];
                    const totalAmount = transferred.reduce((s, o) => s + o.totalAmount, 0);

                    Alert.alert(
                      'Undo transfers?',
                      `This will reverse ${transferred.length} order${transferred.length !== 1 ? 's' : ''} (${currency} ${totalAmount.toFixed(2)}) transferred to your personal account.\n\nThe money will be removed from your personal wallet.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Undo',
                          style: 'destructive',
                          onPress: () => {
                            for (const tid of transferIds) {
                              unmarkOrdersTransferred(tid!);
                              deleteTransfer(tid!);
                              deletePersonalTransaction(`transfer-${tid}`);
                            }
                            showToast('transfers undone', 'success');
                          },
                        },
                      ]
                    );
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Undo transfers to personal"
                >
                  <Feather name="rotate-ccw" size={16} color={CALM.bronze} />
                  <Text style={styles.undoTransfersText}>undo transfers</Text>
                </TouchableOpacity>
              )}

              {/* Delete season */}
              <TouchableOpacity
                style={styles.deleteSeasonBtn}
                activeOpacity={0.7}
                onPress={() => {
                  const transferredOrders = seasonOrders.filter((o) => o.transferredToPersonal);
                  if (transferredOrders.length > 0) {
                    const totalTransferred = transferredOrders.reduce((s, o) => s + o.totalAmount, 0);
                    Alert.alert(
                      'Season can\'t be deleted',
                      `${transferredOrders.length} order${transferredOrders.length !== 1 ? 's' : ''} (${currency} ${totalTransferred.toFixed(2)}) from this season have already been transferred to your personal account.\n\nTo delete this season, you need to undo those transfers first.`,
                      [{ text: 'OK' }]
                    );
                    return;
                  }
                  Alert.alert(
                    `Delete ${season.name}?`,
                    `This will permanently remove this season and all its ${stats?.totalOrders ?? 0} orders and costs. This cannot be undone.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () => {
                          deleteSeason(season.id);
                          navigation.goBack();
                        },
                      },
                    ]
                  );
                }}
                accessibilityRole="button"
                accessibilityLabel="Delete this season"
              >
                <Feather name="trash-2" size={16} color={BIZ.error} />
                <Text style={styles.deleteSeasonText}>delete this season</Text>
              </TouchableOpacity>
            </View>
          )}
        </FadeInSection>
      </ScrollView>

      {/* ─── End Season Modal ─── */}
      <Modal visible={showEndModal} transparent animationType="fade" onRequestClose={() => setShowEndModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowEndModal(false)}>
          <Pressable style={styles.endModalContent} onPress={() => {}}>
            <View style={styles.endModalHeader}>
              <Feather name="calendar" size={20} color={CALM.bronze} />
              <Text style={styles.endModalTitle}>end {season?.name}?</Text>
            </View>

            <View style={styles.endModalStats}>
              <View style={styles.endModalStatItem}>
                <Text style={styles.endModalStatValue}>{stats?.totalOrders ?? 0}</Text>
                <Text style={styles.endModalStatLabel}>orders</Text>
              </View>
              <View style={styles.endModalStatItem}>
                <Text style={styles.endModalStatValue}>{stats?.customerCount ?? 0}</Text>
                <Text style={styles.endModalStatLabel}>customers</Text>
              </View>
              <View style={styles.endModalStatItem}>
                <Text style={[styles.endModalStatValue, { color: BIZ.profit }]}>{currency} {(stats?.kept ?? 0).toFixed(0)}</Text>
                <Text style={styles.endModalStatLabel}>kept</Text>
              </View>
            </View>

            <Text style={styles.endModalWarning}>this will mark the season as complete. you can still view it in past seasons.</Text>

            {(stats?.unpaidOrders ?? 0) > 0 && (
              <View style={[styles.endModalInfoBox, { borderLeftColor: BIZ.unpaid }]}>
                <Text style={styles.endModalInfoText}>
                  {stats!.unpaidOrders} order{stats!.unpaidOrders !== 1 ? 's' : ''} still unpaid ({currency} {stats!.unpaidAmount.toFixed(0)}) — you can still collect after ending
                </Text>
              </View>
            )}

            {untransferredAmount > 0 && (
              <View style={[styles.endModalInfoBox, { borderLeftColor: CALM.bronze }]}>
                <Text style={styles.endModalInfoText}>
                  {currency} {untransferredAmount.toFixed(0)} not yet transferred to personal
                </Text>
              </View>
            )}

            <View style={styles.endModalActions}>
              <TouchableOpacity
                style={styles.endModalCancelBtn}
                onPress={() => setShowEndModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.endModalCancelText}>not yet</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.endModalConfirmBtn}
                onPress={confirmEndSeason}
                activeOpacity={0.7}
              >
                <Text style={styles.endModalConfirmText}>end season</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Orders Modal ─── */}
      <Modal visible={showOrdersModal} transparent animationType="fade" onRequestClose={() => setShowOrdersModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowOrdersModal(false)}>
          <Pressable style={styles.listModalContent} onPress={() => {}}>
            <View style={styles.listModalHeader}>
              <View style={[styles.inlineListIconCircle, { backgroundColor: withAlpha(CALM.gold, 0.1) }]}>
                <Feather name="clipboard" size={14} color={CALM.gold} />
              </View>
              <Text style={styles.listModalTitle}>orders</Text>
              <View style={styles.inlineListBadge}>
                <Text style={styles.inlineListBadgeText}>{seasonOrders.length}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowOrdersModal(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={styles.listModalClose}
              >
                <Feather name="x" size={20} color={CALM.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.listModalScroll} showsVerticalScrollIndicator={false}>
              {seasonOrders.length === 0 ? (
                <View style={styles.inlineListEmpty}>
                  <Text style={styles.inlineListEmptyText}>no orders yet</Text>
                </View>
              ) : (
                seasonOrders.map((order, i) => (
                  <View key={order.id}>
                    {i > 0 && <View style={styles.inlineListDivider} />}
                    <View style={styles.orderItemRow}>
                      <View style={styles.orderItemLeft}>
                        <Text style={styles.orderItemName} numberOfLines={1}>
                          {order.customerName || `Order ${order.orderNumber || '#' + (i + 1)}`}
                        </Text>
                        <Text style={styles.orderItemMeta}>
                          {order.items.map((it) => `${it.productName} ×${it.quantity}`).join(', ')}
                        </Text>
                      </View>
                      <View style={styles.orderItemRight}>
                        <Text style={styles.orderItemAmount}>{currency} {order.totalAmount.toFixed(0)}</Text>
                        <View style={[
                          styles.orderStatusDot,
                          { backgroundColor: order.isPaid ? BIZ.profit : BIZ.unpaid },
                        ]} />
                      </View>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Costs Modal ─── */}
      <Modal visible={showCostsModal} transparent animationType="fade" onRequestClose={() => setShowCostsModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowCostsModal(false)}>
          <Pressable style={styles.listModalContent} onPress={() => {}}>
            <View style={styles.listModalHeader}>
              <View style={[styles.inlineListIconCircle, { backgroundColor: withAlpha(CALM.accent, 0.1) }]}>
                <Feather name="dollar-sign" size={14} color={CALM.accent} />
              </View>
              <Text style={styles.listModalTitle}>costs</Text>
              <View style={styles.inlineListBadge}>
                <Text style={styles.inlineListBadgeText}>{seasonCosts.length}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowCostsModal(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={styles.listModalClose}
              >
                <Feather name="x" size={20} color={CALM.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.listModalScroll} showsVerticalScrollIndicator={false}>
              {seasonCosts.length === 0 ? (
                <View style={styles.inlineListEmpty}>
                  <Text style={styles.inlineListEmptyText}>no costs logged</Text>
                </View>
              ) : (
                seasonCosts.map((cost, i) => (
                  <View key={cost.id}>
                    {i > 0 && <View style={styles.inlineListDivider} />}
                    <View style={styles.costItemRow}>
                      <View style={styles.costItemAvatar}>
                        <Text style={styles.costItemAvatarText}>{cost.description.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={styles.costItemContent}>
                        <Text style={styles.costItemDesc} numberOfLines={1}>{cost.description}</Text>
                        <Text style={styles.costItemDate}>
                          {format(cost.date instanceof Date ? cost.date : new Date(cost.date), 'dd MMM')}
                        </Text>
                      </View>
                      <Text style={styles.costItemAmount}>{currency} {cost.amount.toFixed(2)}</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Rename Season Modal ─── */}
      <Modal visible={showRenameModal} transparent animationType="fade" onRequestClose={() => setShowRenameModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowRenameModal(false)}>
          <Pressable style={styles.renameModalContent} onPress={() => {}}>
            <Text style={styles.renameModalTitle}>rename season</Text>
            <TextInput
              style={styles.renameModalInput}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Season name"
              placeholderTextColor={CALM.textSecondary}
              autoFocus
              selectTextOnFocus
            />
            <View style={styles.renameModalActions}>
              <TouchableOpacity
                onPress={() => setShowRenameModal(false)}
                style={styles.renameModalCancel}
                activeOpacity={0.7}
              >
                <Text style={styles.renameModalCancelText}>cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const trimmed = renameValue.trim();
                  if (trimmed && trimmed !== season.name) {
                    updateSeasonName(season.id, trimmed);
                    showToast('season renamed', 'success');
                  }
                  setShowRenameModal(false);
                }}
                style={styles.renameModalConfirm}
                activeOpacity={0.7}
              >
                <Text style={styles.renameModalConfirmText}>save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Season Target Modal ─── */}
      <Modal visible={showTargetInput} transparent animationType="fade" onRequestClose={() => setShowTargetInput(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowTargetInput(false)}>
          <Pressable style={styles.renameModalContent} onPress={() => {}}>
            <Text style={styles.renameModalTitle}>season target</Text>
            <TextInput
              style={styles.renameModalInput}
              value={targetInput}
              onChangeText={setTargetInput}
              placeholder="e.g. 2000"
              placeholderTextColor={CALM.textSecondary}
              keyboardType="numeric"
              autoFocus
              selectTextOnFocus
            />
            <View style={styles.renameModalActions}>
              <TouchableOpacity
                onPress={() => { if (season) updateSeasonTarget(season.id, undefined); setShowTargetInput(false); }}
                style={styles.renameModalCancel}
                activeOpacity={0.7}
              >
                <Text style={[styles.renameModalCancelText, { color: CALM.textMuted }]}>clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const val = parseFloat(targetInput);
                  if (!isNaN(val) && val > 0 && season) {
                    updateSeasonTarget(season.id, val);
                  }
                  setShowTargetInput(false);
                }}
                style={[styles.renameModalConfirm, { backgroundColor: CALM.accent }]}
                activeOpacity={0.7}
              >
                <Text style={styles.renameModalConfirmText}>save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

function getEmotionalMessage(
  kept: number,
  totalOrders: number,
  customerCount: number
): string | null {
  if (totalOrders === 0) return null;

  if (kept > 0 && totalOrders >= 10) {
    return `${totalOrders} orders. That's a lot of work \u2014 and you showed up for every one.`;
  }

  if (kept > 0 && customerCount >= 5) {
    return `${customerCount} different people trusted your food this season. That matters.`;
  }

  if (kept > 0) {
    return "You made something, people wanted it, and you kept some of it. That's real.";
  }

  if (kept <= 0 && totalOrders > 0) {
    return "Costs were high this time. That doesn't take away from the work you put in.";
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,   // #F9F9F7
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING['2xl'],   // 24pt horizontal
    paddingTop: SPACING['2xl'],          // 24pt top
    paddingBottom: SPACING['5xl'],       // 48pt bottom
  },

  // -- No season state ----------------------------------------------
  noSeason: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING['2xl'],             // 24pt
    gap: SPACING.md,                     // 16pt
  },
  noSeasonTitle: {
    fontSize: TYPOGRAPHY.size.xl,        // 20
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: CALM.textPrimary,             // #1A1A1A
  },
  noSeasonText: {
    ...TYPE.insight,                     // fontSize 14, lineHeight 22
    color: CALM.textSecondary,           // #6B6B6B
    textAlign: 'center',
    lineHeight: 22,
  },
  startSeasonButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: CALM.deepOlive,
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING['2xl'],
    marginTop: SPACING.lg,
    ...SHADOWS.sm,
  },
  startSeasonButtonText: {
    fontSize: TYPOGRAPHY.size.base,      // 15
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: '#fff',
  },

  // -- Season header ------------------------------------------------
  seasonNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,                     // 8pt
    marginBottom: SPACING.xs,            // 4pt
  },
  seasonName: {
    fontSize: TYPOGRAPHY.size['2xl'],    // 24
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: CALM.textPrimary,             // #1A1A1A
  },
  seasonDates: {
    ...TYPE.muted,                       // fontSize 12, color #A0A0A0
    marginBottom: SPACING['2xl'],        // 24pt
  },

  // -- Kept section -- the emotional center -------------------------
  keptSection: {
    marginBottom: SPACING['2xl'],        // 24pt
  },
  ledgerLine: {
    height: 1,
    backgroundColor: CALM.border,        // #EBEBEB
  },
  keptInner: {
    alignItems: 'center',
    paddingVertical: SPACING['2xl'],     // 24pt
  },
  keptLabel: {
    ...TYPE.label,                       // fontSize 12, uppercase, letterSpacing 1
    marginBottom: SPACING.sm,            // 8pt
  },
  keptAmount: {
    fontSize: 56,                        // LARGEST element on screen
    fontWeight: TYPOGRAPHY.weight.light,  // 300
    color: CALM.textPrimary,             // #1A1A1A
    fontVariant: ['tabular-nums'],
    marginBottom: SPACING.sm,            // 8pt
  },
  keptSubtext: {
    ...TYPE.muted,                       // fontSize 12, color #A0A0A0
    color: CALM.textSecondary,           // #6B6B6B
    fontVariant: ['tabular-nums'],
  },

  // -- Emotional message --------------------------------------------
  emotionalText: {
    ...TYPE.insight,                     // fontSize 14, lineHeight 22
    color: CALM.textSecondary,           // #6B6B6B
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING['2xl'],        // 24pt
    paddingHorizontal: SPACING.lg,       // 16pt
  },

  // -- Stats grid: enhanced with icon circles -----------------------
  statsRow: {
    flexDirection: 'row',
    backgroundColor: CALM.surface,       // #FFFFFF
    borderRadius: RADIUS.lg,             // 14
    borderWidth: 1,
    borderColor: CALM.border,            // #EBEBEB
    marginBottom: SPACING.md,            // 16pt
    ...SHADOWS.sm,
  },
  statBox: {
    flex: 1,
    paddingVertical: SPACING.lg,         // 16pt
    paddingHorizontal: SPACING.lg,       // 16pt
    alignItems: 'flex-start',
    gap: SPACING.xs,                     // 4pt between elements
  },
  statBoxDivider: {
    width: 1,
    backgroundColor: CALM.border,        // #EBEBEB
    marginVertical: SPACING.md,          // 16pt top/bottom inset
  },
  statsWideRow: {
    marginBottom: SPACING.xl,            // 24pt
  },
  statBoxWide: {
    backgroundColor: CALM.surface,       // #FFFFFF
    borderRadius: RADIUS.lg,             // 14
    borderWidth: 1,
    borderColor: CALM.border,            // #EBEBEB
    paddingVertical: SPACING.lg,         // 16pt
    paddingHorizontal: SPACING.lg,       // 16pt
    alignItems: 'flex-start',
    gap: SPACING.xs,                     // 4pt
    ...SHADOWS.sm,
  },
  statIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: withAlpha(CALM.gold, 0.1), // gold at 10% opacity
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,            // 4pt below icon circle
  },
  statNumber: {
    fontSize: TYPOGRAPHY.size.xl,        // 20 (upgraded from 17)
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: CALM.textPrimary,             // #1A1A1A
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    ...TYPE.muted,                       // fontSize 12, color #A0A0A0
  },

  // -- Unpaid card -- actionable ------------------------------------
  unpaidCard: {
    backgroundColor: CALM.surface,       // #FFFFFF
    borderRadius: RADIUS.lg,             // 14
    borderWidth: 1,
    borderColor: CALM.border,            // #EBEBEB
    borderLeftWidth: 3,
    borderLeftColor: BIZ.unpaid,          // warm sand — unpaid semantic
    padding: SPACING.lg,                 // 16pt
    marginBottom: SPACING.xl,            // 24pt
    ...SHADOWS.sm,
  },
  unpaidContent: {
    gap: SPACING.md,                     // 16pt between text and action
  },
  unpaidText: {
    ...TYPE.insight,                     // fontSize 14, lineHeight 22
    color: CALM.textPrimary,             // #1A1A1A
    fontVariant: ['tabular-nums'],
  },
  unpaidAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,                     // 4pt
  },
  unpaidActionText: {
    fontSize: TYPOGRAPHY.size.sm,        // 13
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: BIZ.unpaid,                    // warm sand — unpaid semantic
  },

  // -- Transfer bridge -----------------------------------------------
  transferCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  transferHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: 4,
  },
  transferTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: CALM.textPrimary,
  },
  transferSubtext: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    marginBottom: SPACING.md,
  },
  transferButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
  },
  transferButtonText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: CALM.bronze,
  },
  transferInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  transferInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    height: 40,
  },
  transferCurrencyPrefix: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
    marginRight: 4,
  },
  transferInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: CALM.textPrimary,
    padding: 0,
    fontVariant: ['tabular-nums'] as any,
  },
  transferConfirmButton: {
    backgroundColor: CALM.bronze,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    height: 40,
    justifyContent: 'center',
  },
  transferConfirmText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: '#fff',
  },

  // -- Top products -------------------------------------------------
  topSection: {
    marginBottom: SPACING.xl,            // 24pt
  },
  sectionTitle: {
    ...TYPE.label,                       // fontSize 12, uppercase, letterSpacing 1
    marginBottom: SPACING.md,            // 16pt
  },
  topProductItem: {
    marginBottom: SPACING.md,            // 16pt gap between product rows
  },
  topProductRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,                     // 16pt
  },
  rankCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: CALM.accent,        // #4F5104 olive
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 12,
    fontWeight: TYPOGRAPHY.weight.bold,  // 700
    color: '#fff',
  },
  topName: {
    ...TYPE.insight,                     // fontSize 14, lineHeight 22
    color: CALM.textPrimary,             // #1A1A1A
    flex: 1,
  },
  topQty: {
    ...TYPE.muted,                       // fontSize 12, color #A0A0A0
    fontVariant: ['tabular-nums'],
  },
  // Proportional bar
  barTrack: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'transparent',
    marginTop: SPACING.xs,              // 4pt
    marginLeft: 44,                      // 28 (circle) + 16 (gap) offset
  },
  barFill: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: withAlpha(CALM.accent, 0.15), // CALM.accent at 0.15 opacity
  },

  // -- Inline orders & costs lists -----------------------------------
  inlineListCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  inlineListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  inlineListIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineListTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.textSecondary,
    flex: 1,
  },
  inlineListBadge: {
    backgroundColor: withAlpha(CALM.bronze, 0.1),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 1,
    minWidth: 22,
    alignItems: 'center',
  },
  inlineListBadgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.bronze,
    fontVariant: ['tabular-nums'] as any,
  },
  inlineListEmpty: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  inlineListEmptyText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
  },
  inlineListDivider: {
    height: 1,
    backgroundColor: CALM.border,
    marginLeft: 40,
  },
  // -- Clickable list tap rows
  listTapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  listTapLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.textPrimary,
    flex: 1,
  },
  // -- List detail modal
  listModalContent: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    width: '100%',
    maxHeight: '70%',
    ...SHADOWS.lg,
  },
  listModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  listModalTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.textPrimary,
    flex: 1,
  },
  listModalClose: {
    padding: SPACING.xs,
  },
  listModalScroll: {
    flexGrow: 0,
  },
  // -- Order items
  orderItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  orderItemLeft: {
    flex: 1,
    gap: 2,
  },
  orderItemName: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.textPrimary,
  },
  orderItemMeta: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },
  orderItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  orderItemAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  orderStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  // -- Cost items
  costItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  costItemAvatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: withAlpha(BIZ.loss, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  costItemAvatarText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.bold as '700',
    color: BIZ.loss,
  },
  costItemContent: {
    flex: 1,
    gap: 1,
  },
  costItemDesc: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.textPrimary,
  },
  costItemDate: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },
  costItemAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },

  // -- Season actions card ------------------------------------------
  actionsCard: {
    backgroundColor: CALM.surface,       // #FFFFFF
    borderRadius: RADIUS.lg,             // 14
    borderWidth: 1,
    borderColor: CALM.border,            // #EBEBEB
    marginTop: SPACING.lg,              // 16pt
    ...SHADOWS.sm,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,         // 16pt
    paddingHorizontal: SPACING.lg,       // 16pt
    minHeight: 56,                       // comfortable touch target
  },
  actionRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,                     // 16pt
  },
  actionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: withAlpha(CALM.bronze, 0.08), // bronze at 8% opacity
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRowText: {
    fontSize: TYPOGRAPHY.size.base,      // 15
    fontWeight: TYPOGRAPHY.weight.medium, // 500
    color: CALM.textPrimary,             // #1A1A1A
  },
  actionDivider: {
    height: 1,
    backgroundColor: CALM.border,        // #EBEBEB
    marginHorizontal: SPACING.lg,        // 16pt inset from edges
  },

  // -- Season complete state ----------------------------------------
  seasonCompleteSection: {
    marginTop: SPACING.lg,              // 16pt
    gap: SPACING.lg,                     // 16pt between badge and button
  },
  completeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,                     // 16pt
    backgroundColor: CALM.surface,       // #FFFFFF
    borderRadius: RADIUS.lg,             // 14
    borderWidth: 1,
    borderColor: CALM.border,            // #EBEBEB
    padding: SPACING.lg,                // 16pt
  },
  completeIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withAlpha(BIZ.success, 0.1), // success at 10% opacity
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeBadgeText: {
    flex: 1,
    gap: SPACING.xs,                     // 4pt
  },
  completeTitle: {
    fontSize: TYPOGRAPHY.size.base,      // 15
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: CALM.textPrimary,             // #1A1A1A
  },
  completeDate: {
    ...TYPE.muted,                       // fontSize 12, color #A0A0A0
  },
  newSeasonButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: CALM.deepOlive,
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.lg,
    minHeight: 52,
    ...SHADOWS.sm,
  },
  newSeasonButtonText: {
    fontSize: TYPOGRAPHY.size.base,      // 15
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: '#fff',
  },

  // -- Report buttons (completed season) ---------------------------------
  reportButtonsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  reportButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: withAlpha(BIZ.success, 0.08),
    minHeight: 48,
  },
  reportButtonText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: BIZ.success,
  },

  // -- Undo transfers button (completed seasons) -------------------------
  undoTransfersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: withAlpha(CALM.bronze, 0.2),
    backgroundColor: withAlpha(CALM.bronze, 0.04),
  },
  undoTransfersText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.bronze,
  },

  // -- Delete season button (completed seasons) -------------------------
  deleteSeasonBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: withAlpha(BIZ.error, 0.2),
    backgroundColor: withAlpha(BIZ.error, 0.04),
  },
  deleteSeasonText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: BIZ.error,
  },

  // -- Season target -----------------------------------------------
  targetCard: {
    backgroundColor: withAlpha(CALM.accent, 0.06),
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: withAlpha(CALM.accent, 0.2),
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  targetLabel: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.accent,
    fontVariant: ['tabular-nums'],
  },
  targetBarBg: {
    height: 6,
    backgroundColor: withAlpha(CALM.accent, 0.15),
    borderRadius: 3,
    overflow: 'hidden',
  },
  targetBarFill: {
    height: '100%',
    borderRadius: 3,
    minWidth: 4,
  },
  targetPct: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'],
  },
  setTargetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    justifyContent: 'center',
  },
  setTargetText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },

  // -- Rename season modal -----------------------------------------------
  renameModalContent: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    width: '100%',
    gap: SPACING.lg,
  },
  renameModalTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.textPrimary,
  },
  renameModalInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  renameModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.md,
  },
  renameModalCancel: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    minHeight: 44,
    justifyContent: 'center',
  },
  renameModalCancelText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  renameModalConfirm: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    backgroundColor: CALM.bronze,
    borderRadius: RADIUS.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  renameModalConfirmText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: '#fff',
  },

  // -- Modal overlay ----------------------------------------------------
  modalOverlay: {
    flex: 1,
    backgroundColor: withAlpha(CALM.textPrimary, 0.5),
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING['2xl'],
  },
  // -- End season modal --------------------------------------------------
  endModalContent: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    gap: SPACING.lg,
    width: '100%',
    ...SHADOWS.lg,
  },
  endModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  endModalTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.textPrimary,
  },
  endModalStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: SPACING.md,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
  },
  endModalStatItem: {
    alignItems: 'center',
    gap: SPACING.xs,
  },
  endModalStatValue: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  endModalStatLabel: {
    ...TYPE.muted,
  },
  endModalWarning: {
    ...TYPE.insight,
    color: CALM.textSecondary,
    lineHeight: 20,
  },
  endModalInfoBox: {
    borderLeftWidth: 3,
    paddingLeft: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  endModalInfoText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    lineHeight: 20,
  },
  endModalActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  endModalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: CALM.background,
    minHeight: 48,
  },
  endModalCancelText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.textSecondary,
  },
  endModalConfirmBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: CALM.deepOlive,
    minHeight: 48,
  },
  endModalConfirmText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: '#fff',
  },

  // ─── Season comparison ────────────────────────────────────
  compareToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  compareToggleText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
  },
  compareCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  comparePickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  comparePill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    maxWidth: 110,
  },
  comparePillActive: {
    backgroundColor: withAlpha(CALM.accent, 0.12),
  },
  comparePillText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },
  comparePillTextActive: {
    color: CALM.accent,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
  },
  compareGrid: {
    gap: 2,
  },
  compareHeaderRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
    marginBottom: 4,
  },
  compareHeaderLabel: {
    flex: 1.2,
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },
  compareHeaderThis: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    textAlign: 'right',
    fontWeight: TYPOGRAPHY.weight.semibold as any,
  },
  compareHeaderPrev: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    textAlign: 'right',
  },
  compareHeaderDelta: {
    width: 36,
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    textAlign: 'right',
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CALM.border,
  },
  compareRowLabel: {
    flex: 1.2,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  compareRowCur: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    textAlign: 'right',
  },
  compareRowPrev: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
    textAlign: 'right',
  },
  compareRowDelta: {
    width: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  compareRowDeltaText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },
});

export default SeasonSummary;
