import React, { useRef, useState } from 'react';
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

export default function CalendarPicker({ value, minimumDate, onChange }: CalendarPickerProps) {
  const [viewMonth, setViewMonth] = useState(startOfMonth(value));
  const [showPicker, setShowPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(getYear(value));
  const [editingYear, setEditingYear] = useState(false);
  const [yearInputText, setYearInputText] = useState('');
  const yearInputRef = useRef<TextInput>(null);

  const today = startOfDay(new Date());
  const minDate = minimumDate ? startOfDay(minimumDate) : undefined;

  const isDisabled = (d: Date) => !!(minDate && isBefore(startOfDay(d), minDate));
  const isSelected = (d: Date) => isSameDay(d, value);
  const isToday = (d: Date) => isSameDay(d, today);

  // ── Month/year picker panel ──────────────────────────────
  if (showPicker) {
    return (
      <View style={styles.container}>
        {/* Year navigation */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => setPickerYear((y) => y - 1)}
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
              onSubmitEditing={() => {
                const y = parseInt(yearInputText, 10);
                if (y >= 1900 && y <= 2100) setPickerYear(y);
                setEditingYear(false);
                Keyboard.dismiss();
              }}
              onBlur={() => {
                const y = parseInt(yearInputText, 10);
                if (y >= 1900 && y <= 2100) setPickerYear(y);
                setEditingYear(false);
              }}
              autoFocus
            />
          ) : (
            <TouchableOpacity
              onPress={() => { setYearInputText(String(pickerYear)); setEditingYear(true); }}
              hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
              style={styles.yearPill}
            >
              <Text style={styles.yearPillText}>{pickerYear}</Text>
              <Feather name="edit-2" size={11} color={CALM.accent} style={{ marginLeft: 5 }} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={() => setPickerYear((y) => y + 1)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.navBtn}
          >
            <Feather name="chevron-right" size={18} color={CALM.accent} />
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        {/* Month grid — 3 rows of 4 */}
        <View style={{ marginTop: SPACING.md }}>
          {[0, 4, 8].map((start) => (
            <View key={start} style={styles.monthRow}>
              {MONTH_NAMES.slice(start, start + 4).map((name, offset) => {
                const idx = start + offset;
                const isCurrentView = getYear(viewMonth) === pickerYear && getMonth(viewMonth) === idx;
                return (
                  <TouchableOpacity
                    key={name}
                    style={[styles.monthCell, isCurrentView && styles.monthCellSelected]}
                    onPress={() => {
                      const next = setMonth(setYear(viewMonth, pickerYear), idx);
                      setViewMonth(startOfMonth(next));
                      setShowPicker(false);
                    }}
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

  // ── Calendar grid ────────────────────────────────────────
  const monthStart = startOfMonth(viewMonth);
  const days = eachDayOfInterval({ start: monthStart, end: endOfMonth(viewMonth) });
  const leadingBlanks = getDay(monthStart);

  const cells: (Date | null)[] = [...Array(leadingBlanks).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);

  const rows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <View style={styles.container}>
      {/* Header: < [MMM YYYY ▾] > */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setViewMonth(startOfMonth(new Date(getYear(viewMonth), getMonth(viewMonth) - 1)))}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.navBtn}
        >
          <Feather name="chevron-left" size={18} color={CALM.accent} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.monthLabelBtn}
          onPress={() => { setPickerYear(getYear(viewMonth)); setShowPicker(true); }}
          activeOpacity={0.7}
        >
          <Text style={styles.monthLabel}>{format(viewMonth, 'MMMM yyyy')}</Text>
          <Feather name="chevron-down" size={14} color={CALM.accent} style={{ marginLeft: 5 }} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setViewMonth(startOfMonth(new Date(getYear(viewMonth), getMonth(viewMonth) + 1)))}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.navBtn}
        >
          <Feather name="chevron-right" size={18} color={CALM.accent} />
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      {/* Day labels */}
      <View style={[styles.row, { marginTop: SPACING.sm, marginBottom: SPACING.xs }]}>
        {DAY_LABELS.map((d) => (
          <View key={d} style={styles.cell}>
            <Text style={styles.dayLabel}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Date rows */}
      {rows.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((day, di) => {
            if (!day) return <View key={di} style={styles.cell} />;
            const disabled = isDisabled(day);
            const selected = isSelected(day);
            const todayCell = isToday(day);
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
}

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
  yearTappable: {
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
    color: CALM.accent,
  },
  // Month/year picker grid
  monthRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: SPACING.sm,
  },
  monthCell: {
    width: 80,
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
