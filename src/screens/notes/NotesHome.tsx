import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Pressable,
  Alert,
  Dimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { useNotesStore } from '../../store/notesStore';
import { useAppStore } from '../../store/appStore';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import NeuButton from '../../components/common/NeuButton';
import PullRefresh from '../../components/common/PullRefresh';
import NeuIconButton from '../../components/common/NeuIconButton';
import { useNeu } from '../../components/common/neu';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { NotePage } from '../../types';
import ScreenGuide, { whenStore, type GuideStep } from '../../components/common/ScreenGuide';
import { useSettingsStore } from '../../store/settingsStore';
import { lightTap, mediumTap, warningNotification } from '../../services/haptics';

// Delete is the one place we allow a true red — a clear, expected destructive
// signal that only appears while the user is actively pressing Delete.
const DELETE_RED = '#E5484D';

const NotesHome: React.FC = () => {
  const C = useCalm();
  const t = useT();
  // Onyx: faintDark neu for the floating select bar (soft raise, no outline).
  const neu = useNeu(undefined, { faintDark: true });
  // ScreenGuide spotlight target — the + FAB (hidden in select mode; the
  // guide falls back to inline points if it can't be measured).
  const guideTargetRef = useRef<any>(null);
  const emptyCtaRef = useRef<any>(null);
  const styles = useMemo(() => makeStyles(C), [C]);
  const pages = useNotesStore((s) => s.pages);
  const isFirstWrite = useNotesStore((s) => s.isFirstWrite);
  const createPage = useNotesStore((s) => s.createPage);
  const deletePages = useNotesStore((s) => s.deletePages);
  const markFirstWriteComplete = useNotesStore((s) => s.markFirstWriteComplete);
  const mode = useAppStore((s) => s.mode);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const modePages = useMemo(
    () => pages.filter((p) => p.mode === mode),
    [pages, mode]
  );

  const handleNewNote = useCallback(() => {
    mediumTap();
    if (isFirstWrite) markFirstWriteComplete();
    // The empty-state greeting + editor walk-through already introduce Notes;
    // retire the legacy FAB spotlight so returning here doesn't re-greet with
    // the identical card.
    useSettingsStore.getState().dismissHint('guide_notes');
    const id = createPage(mode);
    navigation.navigate('NoteEditor', { pageId: id });
  }, [createPage, mode, navigation, isFirstWrite, markFirstWriteComplete]);

  // Stable step list (memoized) — see the editor guide for why.
  const startGuideSteps = useMemo<GuideStep[]>(() => [
    { kind: 'intro', title: t.guide.yourMoneyNotes, body: t.guide.descNotes, icon: 'edit-3' },
    {
      kind: 'doWithMe',
      targetRef: emptyCtaRef,
      label: t.guide.notesStartStep,
      watch: whenStore(useNotesStore, (s) => s.pages.length, (n, base) => n > base),
    },
  ], [t]);

  const handleOpenNote = useCallback(
    (page: NotePage) => {
      lightTap();
      navigation.navigate('NoteEditor', { pageId: page.id });
    },
    [navigation]
  );

  const handleLongPress = useCallback((page: NotePage) => {
    mediumTap();
    setSelectMode(true);
    setSelectedIds(new Set([page.id]));
  }, []);

  const toggleSelect = useCallback((id: string) => {
    lightTap();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) setSelectMode(false);
      return next;
    });
  }, []);

  const cancelSelect = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleBulkDelete = useCallback(() => {
    const count = selectedIds.size;
    warningNotification();
    Alert.alert(
      t.notes.deleteNotes,
      t.notes.cannotUndo,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: () => {
            deletePages(Array.from(selectedIds));
            setSelectMode(false);
            setSelectedIds(new Set());
          },
        },
      ]
    );
  }, [selectedIds, deletePages]);

  const renderItem = useCallback(
    ({ item }: { item: NotePage }) => {
      const preview = item.content
        .split('\n')
        .slice(1)
        .join(' ')
        .trim()
        .slice(0, 80);
      const extractionCount = item.extractions.filter(
        (e) => e.status === 'confirmed'
      ).length;
      const isSelected = selectedIds.has(item.id);

      return (
        <TouchableOpacity
          style={[styles.pageRow, isSelected && styles.pageRowSelected]}
          activeOpacity={0.6}
          onPress={() => selectMode ? toggleSelect(item.id) : handleOpenNote(item)}
          onLongPress={() => !selectMode && handleLongPress(item)}
        >
          {selectMode && (
            <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
              {isSelected && <Feather name="check" size={12} color={C.onAccent} />}
            </View>
          )}
          <View style={styles.pageContent}>
            <Text style={styles.pageTitle} numberOfLines={1}>
              {item.title || t.notes.untitled}
            </Text>
            {preview ? (
              <Text style={styles.pagePreview} numberOfLines={1}>
                {preview}
              </Text>
            ) : null}
            <Text style={styles.pageDate}>
              {format(item.updatedAt, 'dd MMM')}
            </Text>
          </View>
          {!selectMode && extractionCount > 0 && (
            <View style={styles.extractionBadge}>
              <Text style={styles.extractionBadgeText}>{extractionCount}</Text>
            </View>
          )}
          {!selectMode && (
            <Feather name="chevron-right" size={16} color={C.textMuted} />
          )}
        </TouchableOpacity>
      );
    },
    // styles/C/t MUST be deps: they change on theme switch, and without them the
    // memoized renderItem keeps the previous theme's colors (near-white title text
    // painted on the light background = washed-out titles until an unrelated dep
    // like selectMode changes and forces a rebuild). See extraData below too.
    [handleOpenNote, handleLongPress, toggleSelect, selectMode, selectedIds, styles, C, t]
  );

  const keyExtractor = useCallback((p: NotePage) => p.id, []);

  // Guided first-write empty state
  if (isFirstWrite || modePages.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIconCircle}>
            <Feather name="edit-3" size={28} color={C.bronze} />
          </View>
          <Text style={styles.emptyTitle}>
            {isFirstWrite ? t.notes.justWrite : t.notes.noNotesYet}
          </Text>
          <Text style={styles.emptyHint}>
            {isFirstWrite ? t.notes.firstWriteHint : t.notes.startWritingHint}
          </Text>
          <View ref={emptyCtaRef} collapsable={false} style={styles.emptyCtaWrap}>
            <NeuButton
              onPress={handleNewNote}
              label={t.notes.startWriting}
              icon="plus"
              accessibilityLabel={t.notes.startWriting}
            />
          </View>
        </View>

        {/* First impression greets HERE, on arrival — not after "start writing".
            It points at the real CTA; tapping it (through the hole) opens the
            editor, where the type→extract walk-through continues. */}
        <ScreenGuide id="guide_notes_start" accent="#8B7355" steps={startGuideSteps} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <PullRefresh refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent}>
        <FlatList
          style={{ flex: 1 }}
          data={modePages}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 88 + (selectMode ? 72 : 0) }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          extraData={`${selectMode ? selectedIds.size : 0}|${C.textPrimary}`}
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={10}
        />
      </PullRefresh>
      {/* Selection bar — Onyx floating bar: cancel · N selected · delete (red on press).
          Separation comes from the neu raise, not a border. */}
      {selectMode && (
        <View style={[styles.selectBar, neu.raisedSoft, { bottom: insets.bottom + 80 }]}>
          <TouchableOpacity
            onPress={cancelSelect}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.selectBarCloseBtn}
          >
            <Feather name="x" size={18} color={C.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.selectBarCount}>
            {selectedIds.size} {t.notes.selected}
          </Text>
          <Pressable
            onPress={handleBulkDelete}
            style={({ pressed }) => [
              styles.selectBarDeleteBtn,
              pressed && styles.selectBarDeleteBtnPressed,
            ]}
          >
            {({ pressed }) => (
              <>
                <Feather name="trash-2" size={15} color={pressed ? DELETE_RED : C.textMuted} />
                <Text
                  style={[
                    styles.selectBarDeleteText,
                    pressed && styles.selectBarDeleteTextPressed,
                  ]}
                >
                  {t.common.delete}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      )}
      {!selectMode && (
        <View
          ref={guideTargetRef}
          collapsable={false}
          style={[styles.fabWrap, { bottom: insets.bottom + 88 + SPACING.md }]}
        >
          <NeuIconButton
            size={56}
            radius={28}
            onPress={handleNewNote}
            accessibilityLabel={t.notes.startWriting}
          >
            <Feather name="plus" size={24} color={C.accent} />
          </NeuIconButton>
        </View>
      )}
      <ScreenGuide
        id="guide_notes"
        title={t.guide.yourMoneyNotes}
        icon="edit-3"
        description={t.guide.descNotes}
        accent="#8B7355"
        points={[
          { icon: 'edit-3', text: t.guide.notesPoint1 },
          { icon: 'zap', text: t.guide.notesPoint2 },
        ]}
        spotlight={{ targetRef: guideTargetRef, label: t.guide.notesPoint1, sublabel: t.guide.notesPoint2 }}
      />
    </View>
  );
};

export default NotesHome;

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: 100,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center' as const,
  },

  // Page row
  pageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  pageContent: {
    flex: 1,
    gap: 2,
  },
  pageTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },
  pagePreview: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    lineHeight: 19,
  },
  pageDate: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as any,
    marginTop: 1,
  },
  extractionBadge: {
    backgroundColor: withAlpha(C.bronze, 0.12),
    borderRadius: RADIUS.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  extractionBadgeText: {
    fontSize: 11,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
    fontVariant: ['tabular-nums'] as any,
  },

  // Selection mode — bottom floating bar
  selectBar: {
    position: 'absolute',
    // `bottom` is set inline (insets.bottom + 80) so the bar rests just above the
    // floating tab bar (whose top is ~insets.bottom + 62) with a small gap — not
    // colliding with it, but not floating high like the FAB either.
    left: SPACING.lg,
    right: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
  },
  selectBarCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectBarCount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  selectBarDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.md,
  },
  selectBarDeleteBtnPressed: {
    backgroundColor: withAlpha(DELETE_RED, 0.12),
  },
  selectBarDeleteText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
  },
  selectBarDeleteTextPressed: {
    color: DELETE_RED,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  pageRowSelected: {
    backgroundColor: withAlpha(C.bronze, 0.06),
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: C.deepOlive,
    borderColor: C.deepOlive,
  },

  // FAB — Neu Key (NeuIconButton supplies the neu face; wrapper only positions it)
  fabWrap: {
    position: 'absolute',
    bottom: SPACING.xl,
    right: SPACING.xl,
  },

  // Empty / guided first write
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING['2xl'],
    gap: SPACING.md,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: withAlpha(C.bronze, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },
  emptyHint: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  // Width wrapper so the full-width Neu Select stays capped + centered (a
  // center-aligned parent would otherwise collapse NeuButton to content width).
  emptyCtaWrap: {
    width: '100%',
    maxWidth: 256,
    marginTop: SPACING.lg,
  },
});
