import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Dimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { format } from 'date-fns';
import { useNotesStore } from '../../store/notesStore';
import { useAppStore } from '../../store/appStore';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { NotePage } from '../../types';
import ScreenGuide from '../../components/common/ScreenGuide';
import { lightTap, mediumTap, warningNotification } from '../../services/haptics';

const NotesHome: React.FC = () => {
  const C = useCalm();
  const t = useT();
  // ScreenGuide spotlight target — the + FAB (hidden in select mode; the
  // guide falls back to inline points if it can't be measured).
  const guideTargetRef = useRef<any>(null);
  const styles = useMemo(() => makeStyles(C), [C]);
  const pages = useNotesStore((s) => s.pages);
  const isFirstWrite = useNotesStore((s) => s.isFirstWrite);
  const createPage = useNotesStore((s) => s.createPage);
  const deletePages = useNotesStore((s) => s.deletePages);
  const markFirstWriteComplete = useNotesStore((s) => s.markFirstWriteComplete);
  const mode = useAppStore((s) => s.mode);
  const navigation = useNavigation<any>();

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const modePages = useMemo(
    () => pages.filter((p) => p.mode === mode),
    [pages, mode]
  );

  const handleNewNote = useCallback(() => {
    mediumTap();
    if (isFirstWrite) markFirstWriteComplete();
    const id = createPage(mode);
    navigation.navigate('NoteEditor', { pageId: id });
  }, [createPage, mode, navigation, isFirstWrite, markFirstWriteComplete]);

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
    [handleOpenNote, handleLongPress, toggleSelect, selectMode, selectedIds]
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
          <TouchableOpacity
            style={styles.emptyCTA}
            activeOpacity={0.7}
            onPress={handleNewNote}
          >
            <Feather name="plus" size={18} color={C.onAccent} />
            <Text style={styles.emptyCTAText}>{t.notes.startWriting}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={modePages}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        extraData={selectMode ? selectedIds.size : 0}
        removeClippedSubviews
        maxToRenderPerBatch={10}
        windowSize={5}
        initialNumToRender={10}
      />
      {selectMode && (
        <View style={styles.selectBar}>
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
          <TouchableOpacity
            style={styles.selectBarDeleteBtn}
            onPress={handleBulkDelete}
            activeOpacity={0.7}
          >
            <Feather name="trash-2" size={15} color={C.textMuted} />
            <Text style={styles.selectBarDeleteText}>{t.common.delete}</Text>
          </TouchableOpacity>
        </View>
      )}
      {!selectMode && (
        <TouchableOpacity
          ref={guideTargetRef}
          style={styles.fab}
          activeOpacity={0.8}
          onPress={handleNewNote}
        >
          <Feather name="plus" size={22} color={C.onAccent} />
        </TouchableOpacity>
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
    bottom: SPACING.xl,
    left: SPACING.lg,
    right: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.border,
    ...(C === CALM_DARK ? SHADOWS.xs : SHADOWS.md),
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
  },
  selectBarDeleteText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
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

  // FAB
  fab: {
    position: 'absolute',
    bottom: SPACING.xl,
    right: SPACING.xl,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...(C === CALM_DARK ? SHADOWS.sm : SHADOWS.lg),
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
  emptyCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: C.accent,
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING['2xl'],
    marginTop: SPACING.lg,
    ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.sm),
  },
  emptyCTAText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },
});
