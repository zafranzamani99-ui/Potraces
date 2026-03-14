import React, { useRef, useState, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Keyboard } from 'react-native';
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameDay,
  isBefore,
  setMonth,
  setYear,
  getMonth,
  getYear,
  format,
  startOfDay,
} from 'date-fns';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';

interface CalendarPickerProps {
  value: Date;
  minimumDate?: Date;
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

const CalendarPicker = React.memo(function CalendarPicker({ value, minimumDate, onChange }: CalendarPickerProps) {
  const [viewMonth, setViewMonth] = useState(startOfMonth(value));
  const [showPicker, setShowPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(getYear(value));
  const [editingYear, setEditingYear] = useState(false);
  const [yearInputText, setYearInputText] = useState('');
  const yearInputRef = useRef<TextInput>(null);

  const today = useMemo(() => startOfDay(new Date()), []);
  const minDate = useMemo(
    () => (minimumDate ? startOfDay(minimumDate) : undefined),
    [minimumDate],
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

  const startEditYear = useCallback(() => {
    setYearInputText(String(pickerYear));
    setEditingYear(true);
  }, [pickerYear]);

  const commitYear = useCallback(() => {
    const y = parseInt(yearInputText, 10);
    if (y >= 1900 && y <= 2100) setPickerYear(y);
    setEditingYear(false);
    Keyboard.dismiss();
  }, [yearInputText]);

  const onYearBlur = useCallback(() => {
    const y = parseInt(yearInputText, 10);
    if (y >= 1900 && y <= 2100) setPickerYear(y);
    setEditingYear(false);
  }, [yearInputText]);

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
            onPress={decrementYear}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.navBtn}
          >
            <Feather name="chevron-left" size={18} color={CALM.accent} />
          </TouchableOpacity>

          {editingYear ? (
            <TextInput
              ref={yearInputRef}
              style={styles.yearInput}
              value={yearInputText}
              onChangeText={setYearInputText}
              keyboardType="number-pad"
              maxLength={4}
              returnKeyType="done"
              onSubmitEditing={commitYear}
              onBlur={onYearBlur}
              autoFocus
            />
          ) : (
            <TouchableOpacity
              onPress={startEditYear}
              hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
              style={styles.yearPill}
            >
              <Text style={styles.yearPillText}>{pickerYear}</Text>
              <Feather name="edit-2" size={11} color={CALM.accent} style={EDIT_ICON_STYLE} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={incrementYear}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.navBtn}
          >
            <Feather name="chevron-right" size={18} color={CALM.accent} />
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

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
          <Feather name="chevron-left" size={18} color={CALM.accent} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.monthLabelBtn}
          onPress={openPicker}
          activeOpacity={0.7}
        >
          <Text style={styles.monthLabel}>{format(viewMonth, 'MMMM yyyy')}</Text>
          <Feather name="chevron-down" size={14} color={CALM.accent} style={CHEVRON_STYLE} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={goToNextMonth}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.navBtn}
        >
          <Feather name="chevron-right" size={18} color={CALM.accent} />
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
            const disabled = !!(minDate && isBefore(startOfDay(day), minDate));
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

const styles = StyleSheet.create({
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
    backgroundColor: withAlpha(CALM.accent, 0.08),
    marginHorizontal: SPACING.xs,
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(CALM.accent, 0.07),
  },
  monthLabelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  monthLabel: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
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
    color: CALM.textMuted,
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
    backgroundColor: CALM.accent,
  },
  cellToday: {
    backgroundColor: withAlpha(CALM.accent, 0.1),
  },
  cellText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  cellTextDisabled: {
    color: withAlpha(CALM.textPrimary, 0.25),
    fontWeight: TYPOGRAPHY.weight.regular,
  },
  cellTextToday: {
    color: CALM.accent,
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  cellTextSelected: {
    color: '#FFFFFF',
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  todayDot: {
    position: 'absolute',
    bottom: 5,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: CALM.accent,
  },
  // Year picker
  yearPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(CALM.accent, 0.08),
  },
  yearPillText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.accent,
  },
  yearInput: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.accent,
    borderBottomWidth: 2,
    borderBottomColor: CALM.accent,
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
    backgroundColor: withAlpha(CALM.accent, 0.05),
  },
  monthCellSelected: {
    backgroundColor: CALM.accent,
  },
  monthCellText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    letterSpacing: 0.3,
  },
  monthCellTextSelected: {
    color: '#FFFFFF',
    fontWeight: TYPOGRAPHY.weight.bold,
  },
});

export default CalendarPicker;
