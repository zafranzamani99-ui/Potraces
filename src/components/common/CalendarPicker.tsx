import React, { useRef, useState, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Keyboard } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameDay,
  isBefore,
  isAfter,
  setMonth,
  setYear,
  getMonth,
  getYear,
  format,
  startOfDay,
} from 'date-fns';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';

interface CalendarPickerProps {
  value: Date;
  minimumDate?: Date;
  maximumDate?: Date;
  onChange: (date: Date) => void;
}

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CELL_SIZE = 40;
const MONTH_ROWS = [0, 4, 8] as const;
const DAY_LABEL_STYLE = { marginTop: SPACING.sm, marginBottom: SPACING.xs };
const MONTH_GRID_STYLE = { marginTop: SPACING.md };
const EDIT_ICON_STYLE = { marginLeft: 5 };
const CHEVRON_STYLE = { marginLeft: 5 };

const CalendarPicker = React.memo(function CalendarPicker({ value, minimumDate, maximumDate, onChange }: CalendarPickerProps) {
  const C = useCalm();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [viewMonth, setViewMonth] = useState(startOfMonth(value));
  const [showPicker, setShowPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(getYear(value));
  const [showYearGrid, setShowYearGrid] = useState(false);
  const yearScrollRef = useRef<any>(null);

  const today = useMemo(() => startOfDay(new Date()), []);
  const minDate = useMemo(
    () => (minimumDate ? startOfDay(minimumDate) : undefined),
    [minimumDate],
  );
  const maxDate = useMemo(
    () => (maximumDate ? startOfDay(maximumDate) : undefined),
    [maximumDate],
  );

  // ── Memoized grid computation ──
  const rows = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const days = eachDayOfInterval({ start: monthStart, end: endOfMonth(viewMonth) });
    const leadingBlanks = getDay(monthStart);
    const cells: (Date | null)[] = [...Array(leadingBlanks).fill(null), ...days];
    while (cells.length % 7 !== 0) cells.push(null);
    const r: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) r.push(cells.slice(i, i + 7));
    return r;
  }, [viewMonth]);

  // ── Stable nav handlers ──
  const goToPrevMonth = useCallback(() => {
    setViewMonth((vm) => startOfMonth(new Date(getYear(vm), getMonth(vm) - 1)));
  }, []);

  const goToNextMonth = useCallback(() => {
    setViewMonth((vm) => startOfMonth(new Date(getYear(vm), getMonth(vm) + 1)));
  }, []);

  const openPicker = useCallback(() => {
    setPickerYear(getYear(viewMonth));
    setShowPicker(true);
  }, [viewMonth]);

  const decrementYear = useCallback(() => setPickerYear((y) => y - 1), []);
  const incrementYear = useCallback(() => setPickerYear((y) => y + 1), []);

  const [yearPageStart, setYearPageStart] = useState(() => {
    const base = minimumDate ? getYear(minimumDate) : getYear(value) - 4;
    return base;
  });
  const yearRange = useMemo(() => Array.from({ length: 16 }, (_, i) => yearPageStart + i), [yearPageStart]);

  const toggleYearGrid = useCallback(() => {
    setShowYearGrid(v => !v);
  }, []);

  const selectYear = useCallback((y: number) => {
    setPickerYear(y);
    setShowYearGrid(false);
  }, []);

  const selectMonth = useCallback(
    (idx: number) => {
      setViewMonth((vm) => startOfMonth(setMonth(setYear(vm, pickerYear), idx)));
      setShowPicker(false);
    },
    [pickerYear],
  );

  // ── Month/year picker panel ──
  if (showPicker) {
    const currentViewYear = getYear(viewMonth);
    const currentViewMonth = getMonth(viewMonth);

    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={showYearGrid ? () => setYearPageStart(p => p - 16) : decrementYear}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.navBtn}
          >
            <Feather name="chevron-left" size={18} color={C.accent} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={toggleYearGrid}
            hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
            style={styles.yearPill}
          >
            <Text style={styles.yearPillText}>
              {showYearGrid ? `${yearRange[0]}–${yearRange[yearRange.length - 1]}` : pickerYear}
            </Text>
            <Feather name={showYearGrid ? 'chevron-up' : 'chevron-down'} size={13} color={C.accent} style={EDIT_ICON_STYLE} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={showYearGrid ? () => setYearPageStart(p => p + 16) : incrementYear}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.navBtn}
          >
            <Feather name="chevron-right" size={18} color={C.accent} />
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        {showYearGrid ? (
          <ScrollView
            ref={yearScrollRef}
            style={styles.yearGridScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            contentContainerStyle={{ paddingVertical: SPACING.sm }}
            onLayout={() => {
              const idx = yearRange.indexOf(pickerYear);
              if (idx >= 0 && yearScrollRef.current) {
                yearScrollRef.current.scrollTo({ y: Math.max(0, Math.floor(idx / 4) * 48 - 48), animated: false });
              }
            }}
          >
            {Array.from({ length: Math.ceil(yearRange.length / 4) }, (_, row) => (
              <View key={row} style={styles.monthRow}>
                {yearRange.slice(row * 4, row * 4 + 4).map((year) => {
                  const sel = pickerYear === year;
                  return (
                    <TouchableOpacity
                      key={year}
                      style={[styles.monthCell, sel && styles.monthCellSelected]}
                      onPress={() => selectYear(year)}
                      activeOpacity={0.65}
                    >
                      <Text style={[styles.monthCellText, sel && styles.monthCellTextSelected]}>
                        {year}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={MONTH_GRID_STYLE}>
            {MONTH_ROWS.map((start) => (
              <View key={start} style={styles.monthRow}>
                {MONTH_NAMES.slice(start, start + 4).map((name, offset) => {
                  const idx = start + offset;
                  const isCurrentView = currentViewYear === pickerYear && currentViewMonth === idx;
                  return (
                    <TouchableOpacity
                      key={name}
                      style={[styles.monthCell, isCurrentView && styles.monthCellSelected]}
                      onPress={() => selectMonth(idx)}
                      activeOpacity={0.65}
                    >
                      <Text style={[styles.monthCellText, isCurrentView && styles.monthCellTextSelected]}>
                        {name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

  // ── Calendar grid ──
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={goToPrevMonth}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.navBtn}
        >
          <Feather name="chevron-left" size={18} color={C.accent} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.monthLabelBtn}
          onPress={openPicker}
          activeOpacity={0.7}
        >
          <Text style={styles.monthLabel}>{format(viewMonth, 'MMMM yyyy')}</Text>
          <Feather name="chevron-down" size={14} color={C.accent} style={CHEVRON_STYLE} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={goToNextMonth}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.navBtn}
        >
          <Feather name="chevron-right" size={18} color={C.accent} />
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      <View style={[styles.row, DAY_LABEL_STYLE]}>
        {DAY_LABELS.map((d) => (
          <View key={d} style={styles.cell}>
            <Text style={styles.dayLabel}>{d}</Text>
          </View>
        ))}
      </View>

      {rows.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((day, di) => {
            if (!day) return <View key={di} style={styles.cell} />;
            const disabled = !!(
              (minDate && isBefore(startOfDay(day), minDate)) ||
              (maxDate && isAfter(startOfDay(day), maxDate))
            );
            const selected = isSameDay(day, value);
            const todayCell = isSameDay(day, today);
            return (
              <TouchableOpacity
                key={di}
                style={[
                  styles.cell,
                  selected && styles.cellSelected,
                  !selected && todayCell && styles.cellToday,
                ]}
                onPress={() => !disabled && onChange(day)}
                disabled={disabled}
                activeOpacity={0.65}
              >
                <Text style={[
                  styles.cellText,
                  disabled && styles.cellTextDisabled,
                  !selected && todayCell && styles.cellTextToday,
                  selected && styles.cellTextSelected,
                ]}>
                  {format(day, 'd')}
                </Text>
                {todayCell && !selected && <View style={styles.todayDot} />}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
});

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    paddingTop: SPACING.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xs,
    paddingBottom: SPACING.sm,
  },
  divider: {
    height: 1,
    backgroundColor: withAlpha(C.accent, 0.08),
    marginHorizontal: SPACING.xs,
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(C.accent, 0.07),
  },
  monthLabelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  monthLabel: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    letterSpacing: 0.2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  dayLabel: {
    fontSize: 11,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textMuted,
    textAlign: 'center',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: CELL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellSelected: {
    backgroundColor: C.accent,
  },
  cellToday: {
    backgroundColor: withAlpha(C.accent, 0.1),
  },
  cellText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  cellTextDisabled: {
    color: withAlpha(C.textPrimary, 0.25),
    fontWeight: TYPOGRAPHY.weight.regular,
  },
  cellTextToday: {
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  cellTextSelected: {
    color: C.onAccent,
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  todayDot: {
    position: 'absolute',
    bottom: 5,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.accent,
  },
  // Year picker
  yearPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.accent, 0.08),
  },
  yearPillText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.accent,
  },
  yearInput: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.accent,
    borderBottomWidth: 2,
    borderBottomColor: C.accent,
    minWidth: 60,
    textAlign: 'center',
    paddingVertical: 2,
  },
  // Month/year picker grid
  monthRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginBottom: SPACING.sm,
  },
  monthCell: {
    width: 68,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    backgroundColor: withAlpha(C.accent, 0.05),
  },
  monthCellSelected: {
    backgroundColor: C.accent,
  },
  monthCellText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: 0.3,
  },
  monthCellTextSelected: {
    color: C.onAccent,
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  yearGridScroll: {
    maxHeight: 200,
    marginTop: SPACING.sm,
  },
});

export default CalendarPicker;
