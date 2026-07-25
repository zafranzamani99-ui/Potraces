import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Switch,
  Modal,
  Pressable,
  Keyboard,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import ReAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing as ReEasing,
  runOnJS,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useStallStore } from '../../store/stallStore';
import { useSettingsStore } from '../../store/settingsStore';
import { lightTap } from '../../services/haptics';
import NewstInput, { newstOutline } from '../../components/business/NewstInput';
import { useNeu } from '../../components/common/neu';
import NeuButton from '../../components/common/NeuButton';
import PageScrollView from '../../components/common/PageScrollView';

// Expanding search in the all-sessions modal (same UI as the Sell screen) —
// collapsed circle width + the shared ease curve, UI-thread via Reanimated.
const SEARCH_COLLAPSED = 40;
const SEARCH_EASING = ReEasing.bezier(0.16, 1, 0.3, 1);
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const dayLabel = (d: Date) => `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;

interface ProductSetupItem {
  productId: string;
  name: string;
  price: number;
  included: boolean;
  startQty: string;
}

const SessionSetup: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const neu = useNeu(undefined, { faintDark: true });
  const { products, startSession, getRecentSpots, setStartingFloat, getPreOrderStock, preOrders, categories } = useStallStore();
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();

  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [whereInput, setWhereInput] = useState('');
  const [floatInput, setFloatInput] = useState('');

  // Build editable product list from active products
  const activeProducts = useMemo(
    () => products.filter((p) => p.isActive),
    [products]
  );

  const [productSetup, setProductSetup] = useState<ProductSetupItem[]>(() =>
    activeProducts.map((p) => ({
      productId: p.id,
      name: p.name,
      price: p.price,
      included: true,
      // Prefill with the product's default starting stock if set
      startQty: p.defaultStartQty ? String(p.defaultStartQty) : '',
    }))
  );

  // Pre-order demand → stock planner
  const preOrderStock = useMemo(() => getPreOrderStock(), [getPreOrderStock, preOrders]);
  const preOrderDemand = useMemo(
    () => activeProducts.filter((p) => (preOrderStock[p.id] || 0) > 0).map((p) => ({ id: p.id, name: p.name, qty: preOrderStock[p.id] })),
    [activeProducts, preOrderStock],
  );
  const preOrderSummary = preOrderDemand.map((d) => `${d.qty} ${d.name}`).join(', ');
  const coverPreOrders = () => {
    lightTap();
    setProductSetup((prev) =>
      prev.map((item) => {
        const demand = preOrderStock[item.productId] || 0;
        if (demand <= 0) return item;
        const current = parseInt(item.startQty, 10) || 0;
        return { ...item, included: true, startQty: String(Math.max(current, demand)) };
      }),
    );
  };

  // One-tap "recent spots" — refill name + where + products from a past session.
  const recentSpots = useMemo(() => getRecentSpots(3), [getRecentSpots, products]);

  // ── "See all" sessions modal: full spot list + date filter + expanding search ──
  const allSpots = useMemo(() => getRecentSpots(100), [getRecentSpots, products]);
  const [spotsModalOpen, setSpotsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [spotSearch, setSpotSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [spotsRowWidth, setSpotsRowWidth] = useState(0);
  const searchWidth = useSharedValue(SEARCH_COLLAPSED);
  const searchAnimStyle = useAnimatedStyle(() => ({ width: searchWidth.value }));
  const searchInputRef = useRef<TextInput>(null);

  const expandSearch = useCallback(() => {
    setSearchOpen(true);
    lightTap();
    searchWidth.value = withTiming(
      Math.max(spotsRowWidth - SPACING.sm, SEARCH_COLLAPSED),
      { duration: 380, easing: SEARCH_EASING },
    );
    setTimeout(() => searchInputRef.current?.focus(), 80);
  }, [searchWidth, spotsRowWidth]);

  const collapseSearch = useCallback(() => {
    Keyboard.dismiss();
    searchWidth.value = withTiming(
      SEARCH_COLLAPSED,
      { duration: 380, easing: SEARCH_EASING },
      (finished) => {
        'worklet';
        if (finished) runOnJS(setSearchOpen)(false);
      },
    );
  }, [searchWidth]);

  const handleSpotsRowLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number } } }) => {
      const w = e.nativeEvent.layout.width;
      setSpotsRowWidth(w);
      if (searchOpen) searchWidth.value = w - SPACING.sm;
    },
    [searchOpen, searchWidth],
  );

  // Unique dates present in the spot list (already most-recent-first) → chips.
  const dateChips = useMemo(() => {
    const seen = new Map<string, string>();
    allSpots.forEach((s) => {
      if (!s.closedAt) return;
      const d = new Date(s.closedAt);
      const k = dayKey(d);
      if (!seen.has(k)) seen.set(k, dayLabel(d));
    });
    return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
  }, [allSpots]);

  // Date filter first, then the search query (name or where).
  const filteredSpots = useMemo(() => {
    let list = allSpots;
    if (selectedDate !== 'all') {
      list = list.filter((s) => s.closedAt && dayKey(new Date(s.closedAt)) === selectedDate);
    }
    if (!spotSearch.trim()) return list;
    const q = spotSearch.trim().toLowerCase();
    return list.filter(
      (s) => (s.name || '').toLowerCase().includes(q) || (s.where || '').toLowerCase().includes(q),
    );
  }, [allSpots, selectedDate, spotSearch]);

  const closeSpotsModal = useCallback(() => {
    Keyboard.dismiss();
    setSpotsModalOpen(false);
    setSearchOpen(false);
    searchWidth.value = SEARCH_COLLAPSED;
    setSpotSearch('');
    setSelectedDate('all');
  }, [searchWidth]);

  // ── Product list: category filter (same dropdown as Sell) + select all ──
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);

  const categoryPills = useMemo(
    () => (categories || []).map((c) => ({ value: c.name.toLowerCase(), label: c.name, icon: c.icon })),
    [categories],
  );
  const effectiveCategory = categoryPills.some((p) => p.value === selectedCategory) ? selectedCategory : 'all';
  const selectedPill = categoryPills.find((p) => p.value === effectiveCategory);
  const selectedCatLabel = effectiveCategory === 'all' ? t.stall.allCategories : (selectedPill?.label ?? t.stall.allCategories);
  const selectedCatIcon = (effectiveCategory === 'all' ? 'layers' : (selectedPill?.icon ?? 'layers')) as keyof typeof Feather.glyphMap;

  const openCatDropdown = useCallback(() => {
    lightTap();
    setCatDropdownOpen(true);
  }, []);

  // productId → category (setup items don't carry it; filter is display-only)
  const productCategoryMap = useMemo(() => {
    const m = new Map<string, string>();
    products.forEach((p) => m.set(p.id, (p.category || '').trim().toLowerCase()));
    return m;
  }, [products]);

  const visibleProductSetup = useMemo(
    () =>
      effectiveCategory === 'all'
        ? productSetup
        : productSetup.filter((item) => productCategoryMap.get(item.productId) === effectiveCategory),
    [productSetup, effectiveCategory, productCategoryMap],
  );

  const allIncluded = productSetup.length > 0 && productSetup.every((p) => p.included);
  const toggleSelectAll = useCallback(() => {
    lightTap();
    setProductSetup((prev) => prev.map((item) => ({ ...item, included: !allIncluded })));
  }, [allIncluded]);

  const applySpot = (spot: { name?: string; where?: string; setup: { productId: string; startQty: number }[] }) => {
    setSessionName(spot.name || '');
    setWhereInput(spot.where || '');
    const qtyMap = new Map(spot.setup.map((s) => [s.productId, s.startQty]));
    setProductSetup((prev) =>
      prev.map((item) => {
        const q = qtyMap.get(item.productId);
        return q != null
          ? { ...item, included: true, startQty: String(q) }
          : { ...item, included: false };
      })
    );
    lightTap();
  };

  const toggleProduct = (productId: string) => {
    setProductSetup((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? { ...item, included: !item.included }
          : item
      )
    );
  };

  const setQuantity = (productId: string, qty: string) => {
    // Only allow digits
    const cleaned = qty.replace(/[^0-9]/g, '');
    setProductSetup((prev) =>
      prev.map((item) =>
        item.productId === productId ? { ...item, startQty: cleaned } : item
      )
    );
  };

  const applyFloat = () => {
    const f = parseFloat(floatInput);
    if (!isNaN(f) && f > 0) setStartingFloat(f);
  };

  const handleStartSelling = () => {
    const included = productSetup.filter((p) => p.included);
    const setup = included.map((p) => ({
      productId: p.productId,
      startQty: p.startQty ? parseInt(p.startQty, 10) : 0,
    }));

    const name = sessionName.trim() || undefined;
    const where = whereInput.trim() || undefined;
    startSession(name, setup.length > 0 ? setup : undefined, where);
    applyFloat();
    navigation.goBack();
  };

  const handleSkipSetup = () => {
    const name = sessionName.trim() || undefined;
    const where = whereInput.trim() || undefined;
    startSession(name, undefined, where);
    applyFloat();
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      {/* PageScrollView = KeyboardAwareScrollView over RNGH — follows the caret
          so a tapped field (e.g. "starting cash") never hides behind the
          keyboard. No outer KeyboardAvoidingView — double handling janks (mac22). */}
      <PageScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Nav header already shows the "New Session" title + back button. */}

        {/* Recent spots — one tap refills name + where + products from a past session */}
        {recentSpots.length > 0 && (
          <View style={styles.recentSection}>
            <View style={styles.recentHeadingRow}>
              <Text style={styles.recentHeading}>{t.stall.recentSpotsHeading}</Text>
              <TouchableOpacity
                onPress={() => { lightTap(); setSpotsModalOpen(true); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t.stall.seeAll}
              >
                <Text style={styles.seeAllText}>{t.stall.seeAll}</Text>
              </TouchableOpacity>
            </View>
            {recentSpots.map((spot, i) => {
              const title = spot.name?.trim() || spot.where?.trim() || t.stall.recentSpotFallback;
              const subParts: string[] = [];
              if (spot.where?.trim() && spot.where.trim() !== title) subParts.push(spot.where.trim());
              if (spot.setup.length > 0) subParts.push(t.stall.spotProductsCount.replace('{n}', String(spot.setup.length)));
              const subtitle = subParts.join(' · ');
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.spotRow, neu.raisedSoft]}
                  onPress={() => applySpot(spot)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
                >
                  <Feather name="rotate-ccw" size={18} color={C.bronze} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.spotTitle}>{title}</Text>
                    {subtitle ? <Text style={styles.spotSub}>{subtitle}</Text> : null}
                  </View>
                  <Feather name="chevron-right" size={18} color={C.textMuted} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Session name input */}
        <View style={styles.inputSection}>
          <NewstInput
            label={t.stall.sessionNameLabel}
            value={sessionName}
            onChangeText={setSessionName}
            accessibilityLabel="Session name, optional"
            accessibilityHint="Enter a name for this selling session"
          />
        </View>

        {/* Where (the spot) input */}
        <View style={styles.inputSection}>
          <NewstInput
            label={t.stall.whereLabel}
            value={whereInput}
            onChangeText={setWhereInput}
            accessibilityLabel="Where you're selling, optional"
          />
        </View>

        {/* Starting cash float (optional) */}
        <View style={styles.inputSection}>
          <NewstInput
            label={t.stall.floatLabel}
            value={floatInput}
            onChangeText={(v) => setFloatInput(v.replace(/[^0-9.]/g, ''))}
            prefix={currency}
            hint={t.stall.floatHint}
            keyboardType="decimal-pad"
            accessibilityLabel="Starting cash float, optional"
          />
        </View>

        {/* Pre-order stock planner */}
        {preOrderDemand.length > 0 && (
          <View style={styles.preOrderBanner}>
            <Feather name="clipboard" size={16} color={C.bronze} />
            <Text style={styles.preOrderBannerText}>
              {t.stall.preOrderNeedStock.replace('{summary}', preOrderSummary)}
            </Text>
            <TouchableOpacity style={styles.coverBtn} onPress={coverPreOrders} accessibilityRole="button" accessibilityLabel={t.stall.preOrderCoverStock}>
              <Text style={styles.coverBtnText}>{t.stall.preOrderCoverStock}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Product list */}
        {activeProducts.length > 0 && (
          <View style={styles.productsSection}>
            <View style={styles.productsLabelRow}>
              <Text style={[styles.inputLabel, { marginBottom: 0 }]}>{t.stall.products}</Text>
              <Text style={styles.productCountBadge}>
                {t.stall.selectedCount
                  .replace('{selected}', String(productSetup.filter((p) => p.included).length))
                  .replace('{total}', String(productSetup.length))}
              </Text>
            </View>

            {/* Controls: category filter (same dropdown as Sell) + select all */}
            <View style={styles.productsControlRow}>
              <TouchableOpacity
                style={[styles.catDropdownBtn, neu.raised]}
                onPress={openCatDropdown}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t.stall.selectCategory}
              >
                <Feather name={selectedCatIcon} size={14} color={C.bronze} />
                <Text style={styles.catDropdownText} numberOfLines={1}>{selectedCatLabel}</Text>
                <Feather name="chevron-down" size={16} color={C.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={toggleSelectAll}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={allIncluded ? t.stall.clearSelection : t.stall.selectAll}
              >
                <Text style={styles.selectAllText}>
                  {allIncluded ? t.stall.clearSelection : t.stall.selectAll}
                </Text>
              </TouchableOpacity>
            </View>

            {visibleProductSetup.map((item) => (
              <View key={item.productId} style={[styles.productRow, neu.raisedSoft, item.included && styles.productRowIncluded]}>
                <TouchableOpacity
                  style={styles.productToggleArea}
                  onPress={() => toggleProduct(item.productId)}
                  accessibilityRole="switch"
                  accessibilityLabel={`${item.name}, ${currency} ${item.price.toFixed(2)}`}
                  accessibilityState={{ checked: item.included }}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.checkbox,
                      item.included && styles.checkboxActive,
                    ]}
                  >
                    {item.included && (
                      <Feather name="check" size={14} color={C.onAccent} />
                    )}
                  </View>
                  <View style={styles.productInfo}>
                    <Text
                      style={[
                        styles.productName,
                        !item.included && styles.productNameDisabled,
                      ]}
                    >
                      {item.name}
                    </Text>
                    <Text style={styles.productPrice}>
                      {currency} {item.price.toFixed(2)}
                    </Text>
                  </View>
                </TouchableOpacity>

                {item.included && (
                  <TextInput
                    style={[styles.qtyInput, newstOutline(C, focusedField === 'qty-' + item.productId)]}
                    onFocus={() => setFocusedField('qty-' + item.productId)}
                    onBlur={() => setFocusedField((f) => (f === 'qty-' + item.productId ? null : f))}
                    value={item.startQty}
                    onChangeText={(val) => setQuantity(item.productId, val)}
                    placeholder={t.stall.qtyPlaceholder}
                    placeholderTextColor={C.neutral}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    accessibilityLabel={`Starting quantity for ${item.name}`}
                    accessibilityHint="Optional. Enter how many you brought to sell"
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                    selectionColor={withAlpha(C.accent, 0.25)}
                  />
                )}
              </View>
            ))}
            {visibleProductSetup.length === 0 && (
              <Text style={styles.spotsEmpty}>{t.stall.emptyCategory}</Text>
            )}
          </View>
        )}

        {activeProducts.length === 0 && (
          <TouchableOpacity
            style={[styles.noProducts, neu.raised]}
            onPress={() => navigation.navigate('StallProducts')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t.stall.setupProductsCta}
          >
            <Feather name="package" size={24} color={C.bronze} />
            <Text style={styles.noProductsText}>
              {t.stall.noProductsMsg}
            </Text>
            <View style={styles.setupProductsRow}>
              <Feather name="plus" size={16} color={C.bronze} />
              <Text style={styles.setupProductsText}>{t.stall.setupProductsCta}</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Start selling button */}
        <NeuButton
          icon="arrow-right"
          label={t.stall.startSelling}
          color={C.bronze}
          onPress={handleStartSelling}
          accessibilityLabel="Start selling session"
          style={{ marginBottom: SPACING.lg }}
        />

        {/* Skip setup link */}
        <TouchableOpacity
          style={styles.skipLink}
          onPress={handleSkipSetup}
          accessibilityRole="button"
          accessibilityLabel="Skip setup and start with defaults"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.skipLinkText}>{t.stall.skipSetup}</Text>
        </TouchableOpacity>
      </PageScrollView>

      {/* ═══ All sessions — every spot, date filter, expanding search (Sell UI) ═══ */}
      <Modal
        visible={spotsModalOpen}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={closeSpotsModal}
      >
        <Pressable style={styles.spotsOverlay} onPress={closeSpotsModal}>
          <View style={styles.spotsCard} onStartShouldSetResponder={() => true}>
            {/* Header — title + close on the left, expanding search on the right */}
            <View style={styles.spotsHeaderRow} onLayout={handleSpotsRowLayout}>
              <View style={styles.spotsTitleWrap}>
                {!searchOpen && (
                  <>
                    <Text style={styles.spotsTitle} numberOfLines={1}>{t.stall.allSessionsTitle}</Text>
                    <TouchableOpacity
                      onPress={closeSpotsModal}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      accessibilityRole="button"
                      accessibilityLabel={t.common.close}
                    >
                      <Feather name="x" size={18} color={C.textMuted} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
              <ReAnimated.View style={[styles.searchWrap, neu.raised, searchAnimStyle]}>
                <View style={styles.searchClip}>
                  {searchOpen ? (
                    <>
                      <Feather name="search" size={16} color={C.textSecondary} />
                      <TextInput
                        ref={searchInputRef}
                        style={styles.searchInput}
                        value={spotSearch}
                        onChangeText={setSpotSearch}
                        onBlur={() => { if (!spotSearch) collapseSearch(); }}
                        placeholder="search spots..."
                        placeholderTextColor={C.neutral}
                        returnKeyType="search"
                        onSubmitEditing={Keyboard.dismiss}
                        keyboardAppearance={isDark ? 'dark' : 'light'}
                        selectionColor={withAlpha(C.accent, 0.25)}
                      />
                      {spotSearch.length > 0 && (
                        <TouchableOpacity onPress={() => setSpotSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Feather name="x" size={16} color={C.textSecondary} />
                        </TouchableOpacity>
                      )}
                    </>
                  ) : (
                    <TouchableOpacity
                      style={styles.searchCollapsedBtn}
                      onPress={expandSearch}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                      accessibilityRole="button"
                      accessibilityLabel="Search sessions"
                    >
                      <Feather name="search" size={16} color={C.textSecondary} />
                    </TouchableOpacity>
                  )}
                </View>
              </ReAnimated.View>
            </View>

            {/* Date filter chips — [all] + each date present in the list */}
            {dateChips.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.dateChipsRow}
                style={styles.dateChipsScroll}
              >
                <TouchableOpacity
                  style={[styles.dateChip, neu.raised, selectedDate === 'all' && styles.dateChipActive]}
                  onPress={() => { lightTap(); setSelectedDate('all'); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedDate === 'all' }}
                >
                  <Text style={[styles.dateChipText, selectedDate === 'all' && styles.dateChipTextActive]}>{t.stall.allCategories}</Text>
                </TouchableOpacity>
                {dateChips.map((chip) => {
                  const active = selectedDate === chip.key;
                  return (
                    <TouchableOpacity
                      key={chip.key}
                      style={[styles.dateChip, neu.raised, active && styles.dateChipActive]}
                      onPress={() => { lightTap(); setSelectedDate(active ? 'all' : chip.key); }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.dateChipText, active && styles.dateChipTextActive]}>{chip.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* All spots — tap to refill the setup form */}
            <ScrollView
              style={[styles.spotsList, styles.spotsListBleed]}
              contentContainerStyle={styles.spotsListContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {filteredSpots.map((spot, i) => {
                const title = spot.name?.trim() || spot.where?.trim() || t.stall.recentSpotFallback;
                const subParts: string[] = [];
                if (spot.where?.trim() && spot.where.trim() !== title) subParts.push(spot.where.trim());
                if (spot.closedAt) subParts.push(dayLabel(new Date(spot.closedAt)));
                if (spot.setup.length > 0) subParts.push(t.stall.spotProductsCount.replace('{n}', String(spot.setup.length)));
                const subtitle = subParts.join(' · ');
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.spotRow, neu.raisedSoft]}
                    onPress={() => { applySpot(spot); closeSpotsModal(); }}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
                  >
                    <Feather name="rotate-ccw" size={18} color={C.bronze} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.spotTitle}>{title}</Text>
                      {subtitle ? <Text style={styles.spotSub}>{subtitle}</Text> : null}
                    </View>
                    <Feather name="chevron-right" size={18} color={C.textMuted} />
                  </TouchableOpacity>
                );
              })}
              {filteredSpots.length === 0 && (
                <Text style={styles.spotsEmpty}>
                  {spotSearch.trim() ? `no spots match "${spotSearch.trim()}"` : t.stall.emptyCategory}
                </Text>
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Category dropdown — same UI as Sell's browse row filter. */}
      <Modal
        visible={catDropdownOpen}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setCatDropdownOpen(false)}
      >
        <Pressable style={styles.spotsOverlay} onPress={() => setCatDropdownOpen(false)}>
          <View style={[styles.spotsCard, neu.raisedModal]} onStartShouldSetResponder={() => true}>
            <View style={styles.spotsHeaderRow}>
              <Text style={[styles.spotsTitle, { flex: 1 }]}>{t.stall.selectCategory}</Text>
              <TouchableOpacity
                onPress={() => setCatDropdownOpen(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={t.common.close}
              >
                <Feather name="x" size={20} color={C.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.catDropdownList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <TouchableOpacity
                style={styles.catDropdownItem}
                onPress={() => { lightTap(); setSelectedCategory('all'); setCatDropdownOpen(false); }}
                accessibilityRole="button"
                accessibilityState={{ selected: effectiveCategory === 'all' }}
              >
                <Feather name="layers" size={14} color={effectiveCategory === 'all' ? C.bronze : C.textSecondary} />
                <Text style={[styles.catDropdownItemText, effectiveCategory === 'all' && styles.catDropdownItemTextActive]}>
                  {t.stall.allCategories}
                </Text>
                {effectiveCategory === 'all' && <Feather name="check" size={14} color={C.bronze} style={{ marginLeft: 'auto' }} />}
              </TouchableOpacity>
              {categoryPills.map((pill) => {
                const active = effectiveCategory === pill.value;
                return (
                  <TouchableOpacity
                    key={pill.value}
                    style={styles.catDropdownItem}
                    onPress={() => { lightTap(); setSelectedCategory(pill.value); setCatDropdownOpen(false); }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Feather name={pill.icon as keyof typeof Feather.glyphMap} size={14} color={active ? C.bronze : C.textSecondary} />
                    <Text style={[styles.catDropdownItemText, active && styles.catDropdownItemTextActive]} numberOfLines={1}>
                      {pill.label}
                    </Text>
                    {active && <Feather name="check" size={14} color={C.bronze} style={{ marginLeft: 'auto' }} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING['2xl'],
    paddingBottom: SPACING['4xl'],
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center' as const,
  },
  // ─── Repeat last session ─────────────────────────────────────
  recentSection: {
    marginBottom: SPACING['2xl'],
  },
  recentHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  recentHeading: {
    ...TYPE.label,
  },
  seeAllText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
  },
  spotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    minHeight: 56,
  },
  spotTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  spotSub: {
    ...TYPE.muted,
    marginTop: 2,
  },

  // ─── All-sessions modal ──────────────────────────────────
  spotsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  // Established modal-card rule: scrim separates, hairline outlines, no shadow.
  spotsCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.12),
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  spotsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  spotsTitleWrap: {
    flex: 1,
    minWidth: 0,
    marginRight: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  spotsTitle: {
    flexShrink: 1,
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  dateChipsScroll: {
    flexGrow: 0,
    // Bleed so first/last pills' side shadows aren't sliced at the card edge.
    marginHorizontal: -SPACING.lg,
    marginTop: -16,
    marginBottom: -8,
  },
  dateChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    // Neu-seam slack (docs/neu-vertical-error.md): neu pills' top/bottom
    // shadows fade into this padding instead of being clipped by the
    // horizontal ScrollView (TimeRangePills contentNeu precedent).
    paddingVertical: SPACING.md,
  },
  // Neu Pills (LOCKED, CLAUDE.md): faintDark neu.raised over a faint base;
  // bronze fill when selected. neu.raised is spread in the JSX.
  dateChip: {
    paddingHorizontal: SPACING.md,
    height: 32,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textPrimary, 0.03),
    justifyContent: 'center',
  },
  dateChipActive: {
    backgroundColor: C.bronze,
  },
  dateChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
  },
  dateChipTextActive: {
    color: C.onAccent,
  },
  spotsList: {
    maxHeight: 380,
    flexGrow: 0,
  },
  // Neu-seam fix (docs/neu-vertical-error.md): the ScrollView clips the rows'
  // soft shadows into a hard vertical line at its bounds. Bleed the viewport
  // past the card padding and pad the CONTENT instead, so shadows fade into
  // the slack — same listBleed pattern as StallCategoryManager.
  spotsListBleed: {
    marginHorizontal: -SPACING.lg,
    marginVertical: -12,
  },
  spotsListContent: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: 12,
  },
  spotsEmpty: {
    ...TYPE.muted,
    textAlign: 'center',
    paddingVertical: SPACING['2xl'],
  },
  // Expanding search (same as Sell) — shadow on the OUTER view, clip on the
  // INNER one so iOS masksToBounds never slices the view's own shadow.
  searchWrap: {
    height: 40,
    borderRadius: RADIUS.full,
  },
  searchClip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: SPACING.xs,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  searchCollapsedBtn: {
    width: 40,
    height: 40,
    marginHorizontal: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    padding: 0,
  },

  // ─── Session name input ──────────────────────────────────────
  inputSection: {
    marginBottom: SPACING['3xl'],
  },
  inputLabel: {
    ...TYPE.label,
    marginBottom: SPACING.sm,
  },

  // ─── Pre-order stock planner ─────────────────────────────────
  preOrderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: withAlpha(C.bronze, 0.06),
    borderWidth: 1,
    borderColor: withAlpha(C.bronze, 0.3),
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING['2xl'],
  },
  preOrderBannerText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
  },
  coverBtn: {
    backgroundColor: C.bronze,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    minHeight: 36,
    justifyContent: 'center',
  },
  coverBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },

  // ─── Product list ────────────────────────────────────────────
  productsSection: {
    marginBottom: SPACING['3xl'],
  },
  productsControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  selectAllText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
  },
  // Category dropdown button (same as Sell's browse row)
  catDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    maxWidth: '70%',
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: C.background,
  },
  catDropdownText: {
    flexShrink: 1,
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  catDropdownList: {
    maxHeight: 360,
    flexGrow: 0,
  },
  catDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    minHeight: 44,
  },
  catDropdownItemText: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
  },
  catDropdownItemTextActive: {
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  productsLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  productCountBadge: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
    backgroundColor: withAlpha(C.bronze, 0.10),
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    minHeight: 56,
  },
  productRowIncluded: {
    backgroundColor: withAlpha(C.bronze, 0.03),
  },
  productToggleArea: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minHeight: 44,
    gap: SPACING.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: RADIUS.xs,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: C.bronze,
    borderColor: C.bronze,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  productNameDisabled: {
    color: C.neutral,
  },
  productPrice: {
    ...TYPE.muted,
    marginTop: 2,
  },
  qtyInput: {
    width: 60,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    textAlign: 'center',
    minHeight: 36,
  },
  noProducts: {
    alignItems: 'center',
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING['2xl'],
    paddingHorizontal: SPACING.lg,
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  noProductsText: {
    ...TYPE.insight,
    color: C.textSecondary,
    textAlign: 'center',
  },
  setupProductsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  setupProductsText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
  },

  // ─── Actions ─────────────────────────────────────────────────
  skipLink: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  skipLinkText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
});

export default SessionSetup;
