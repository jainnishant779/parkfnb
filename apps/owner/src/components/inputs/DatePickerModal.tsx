import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';

// ============================================================================
// Shared date picker modal — pure JS, no native module dependency.
//
// UX features:
//  • Month grid with weekday headers, today indicator, selected highlight.
//  • Min/max date constraints.
//  • Tap the month/year header → opens a fast year picker (essential for
//    DOB-style use cases where the user needs to scroll back decades).
//  • Confirm/Cancel actions; "Today" shortcut.
//
// The component returns the selected date as ISO 8601 (YYYY-MM-DD…) via
// `onSelect`. Time component is set to 12:00 local time so toISO date
// truncation works predictably on either side of UTC.
// ============================================================================

export interface DatePickerModalProps {
  visible: boolean;
  onClose: () => void;
  /** Receives a date in YYYY-MM-DD format. */
  onSelect: (dateISO: string) => void;
  /** YYYY-MM-DD or full ISO string; defaults to today. */
  initialDate?: string;
  title?: string;
  minDate?: Date;
  maxDate?: Date;
  /** Hide the "Today" shortcut (e.g., when selecting DOB and "today" makes no sense). */
  hideToday?: boolean;
  testID?: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const startOfDay = (d: Date): Date => {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
};

const formatYMD = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseYMD = (s: string | undefined): Date | null => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return isNaN(d.getTime()) ? null : d;
};

const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const isDisabled = (d: Date, min?: Date, max?: Date): boolean => {
  if (min && startOfDay(d) < startOfDay(min)) return true;
  if (max && startOfDay(d) > startOfDay(max)) return true;
  return false;
};

function DatePickerModalImpl({
  visible,
  onClose,
  onSelect,
  initialDate,
  title = 'Select date',
  minDate,
  maxDate,
  hideToday = false,
  testID,
}: DatePickerModalProps) {
  const insets = useSafeAreaInsets();
  const today = useMemo(() => new Date(), []);
  const initial = useMemo(() => parseYMD(initialDate) ?? today, [initialDate, today]);

  const [selected, setSelected] = useState<Date>(initial);
  const [viewYear, setViewYear] = useState<number>(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initial.getMonth());
  const [yearMode, setYearMode] = useState(false);
  const yearScrollRef = useRef<ScrollView | null>(null);

  // Reset to the latest `initialDate` each time the modal re-opens.
  useEffect(() => {
    if (!visible) return;
    const d = parseYMD(initialDate) ?? today;
    setSelected(d);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setYearMode(false);
  }, [visible, initialDate, today]);

  const grid = useMemo(() => {
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const firstDow = new Date(viewYear, viewMonth, 1).getDay();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [viewYear, viewMonth]);

  // Year list spans roughly 100 years before the maxDate (or today) and
  // up to maxDate (or 1 year ahead) — covers DOB use cases without lag.
  const years = useMemo(() => {
    const upper = maxDate ? maxDate.getFullYear() : today.getFullYear() + 1;
    const lower = minDate ? minDate.getFullYear() : upper - 100;
    const arr: number[] = [];
    for (let y = upper; y >= lower; y--) arr.push(y);
    return arr;
  }, [today, minDate, maxDate]);

  const handlePrevMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }, []);
  const handleNextMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }, []);

  const handlePickDay = useCallback(
    (day: number) => {
      const d = new Date(viewYear, viewMonth, day, 12, 0, 0);
      if (isDisabled(d, minDate, maxDate)) return;
      setSelected(d);
    },
    [viewYear, viewMonth, minDate, maxDate],
  );

  const handlePickYear = useCallback((y: number) => {
    setViewYear(y);
    setYearMode(false);
  }, []);

  const handleConfirm = useCallback(() => {
    onSelect(formatYMD(selected));
    onClose();
  }, [selected, onSelect, onClose]);

  const handleToday = useCallback(() => {
    setSelected(today);
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  }, [today]);

  // When entering year mode, scroll the selected year into view.
  useEffect(() => {
    if (!yearMode || !yearScrollRef.current) return;
    const idx = years.indexOf(viewYear);
    if (idx < 0) return;
    // Roughly: 4 columns × 56px per row.
    const row = Math.floor(idx / 4);
    yearScrollRef.current.scrollTo({ y: Math.max(0, row * 56 - 80), animated: false });
  }, [yearMode, years, viewYear]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >

      <View style={styles.backdrop}>
        <View pointerEvents="none" style={styles.backdropTint} />
        <Pressable style={styles.backdropPressable} onPress={onClose} />

        <View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#64748B" />
            </Pressable>
          </View>

          {!yearMode ? (
            <>
              <View style={styles.nav}>
                <Pressable onPress={handlePrevMonth} style={styles.navBtn}>
                  <Ionicons name="chevron-back" size={22} color="#1E293B" />
                </Pressable>
                <Pressable onPress={() => setYearMode(true)} style={styles.headerBtn}>
                  <Text style={styles.headerBtnText}>{MONTHS[viewMonth]} {viewYear}</Text>
                  <Ionicons name="chevron-down" size={16} color="#1E293B" />
                </Pressable>
                <Pressable onPress={handleNextMonth} style={styles.navBtn}>
                  <Ionicons name="chevron-forward" size={22} color="#1E293B" />
                </Pressable>
              </View>

              <View style={styles.weekdayRow}>
                {WEEKDAYS.map((w) => (
                  <View key={w} style={styles.weekdayCell}>
                    <Text style={styles.weekdayText}>{w}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.grid}>
                {grid.map((d, i) => {
                  if (d === null) return <View key={`e${i}`} style={styles.cell} />;
                  const date = new Date(viewYear, viewMonth, d, 12, 0, 0);
                  const isSel = isSameDay(date, selected);
                  const isTod = isSameDay(date, today);
                  const isDis = isDisabled(date, minDate, maxDate);
                  return (
                    <Pressable
                      key={d}
                      onPress={() => handlePickDay(d)}
                      disabled={isDis}
                      style={styles.cell}
                    >
                      <View style={[
                        styles.cellInner,
                        isSel && styles.cellSelected,
                        isTod && !isSel && styles.cellToday,
                        isDis && styles.cellDisabled,
                      ]}>
                        <Text style={[
                          styles.cellText,
                          isSel && styles.cellTextSelected,
                          isTod && !isSel && styles.cellTextToday,
                          isDis && styles.cellTextDisabled,
                        ]}>{d}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : (
            <ScrollView ref={yearScrollRef} style={styles.yearScroll} contentContainerStyle={styles.yearGrid}>
              {years.map((y) => {
                const isCurrent = y === viewYear;
                return (
                  <Pressable key={y} onPress={() => handlePickYear(y)} style={styles.yearCell}>
                    <View style={[styles.yearInner, isCurrent && styles.yearSelected]}>
                      <Text style={[styles.yearText, isCurrent && styles.yearTextSelected]}>{y}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.selectedBar}>
            <Text style={styles.selectedLabel}>Selected</Text>
            <Text style={styles.selectedValue}>
              {selected.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
            </Text>
          </View>

          <View style={styles.actions}>
            {!hideToday ? (
              <Pressable onPress={handleToday} style={styles.todayBtn}>
                <Text style={styles.todayBtnText}>Today</Text>
              </Pressable>
            ) : <View />}
            <View style={styles.confirmRow}>
              <Pressable onPress={onClose} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleConfirm} style={styles.confirmBtn}>
                <Text style={styles.confirmBtnText}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Absolutely positioned, not flex:1 — this is rendered inline next to the
  // field that opens it (no RN <Modal>, which does not present on this build).
  // With flex:1 alone it laid out *inside* the form's scroll flow, so the
  // calendar appeared below the fold instead of over the screen and tapping
  // the field looked like nothing happened.
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 24,
    justifyContent: 'flex-end',
  },
  backdropTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backdropPressable: { flex: 1 },
  container: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    maxHeight: '85%',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 16 },
      android: { elevation: 24 },
    }),
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0',
  },
  title: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9',
    justifyContent: 'center', alignItems: 'center',
  },
  nav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  navBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9',
    justifyContent: 'center', alignItems: 'center',
  },
  headerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
  },
  headerBtnText: { fontSize: 15, fontWeight: '600', color: '#1E293B', marginRight: 4 },
  weekdayRow: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 4 },
  weekdayCell: { flex: 1, alignItems: 'center' },
  weekdayText: { fontSize: 11, fontWeight: '500', color: '#94A3B8' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingBottom: 8 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 3 },
  cellInner: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    borderRadius: 999,
  },
  cellSelected: { backgroundColor: '#0D7377' },
  cellToday: { borderWidth: 1, borderColor: '#0D7377' },
  cellDisabled: { opacity: 0.3 },
  cellText: { fontSize: 14, color: '#1E293B' },
  cellTextSelected: { color: '#FFFFFF', fontWeight: '600' },
  cellTextToday: { color: '#0D7377', fontWeight: '500' },
  cellTextDisabled: { color: '#94A3B8' },
  yearScroll: { maxHeight: 320 },
  yearGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingBottom: 12 },
  yearCell: { width: '25%', padding: 4 },
  yearInner: {
    paddingVertical: 14, borderRadius: 8,
    backgroundColor: '#F8FAFC', alignItems: 'center',
  },
  yearSelected: { backgroundColor: '#0D7377' },
  yearText: { fontSize: 14, color: '#1E293B', fontWeight: '500' },
  yearTextSelected: { color: '#FFFFFF', fontWeight: '600' },
  selectedBar: {
    paddingHorizontal: 20, paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E2E8F0',
  },
  selectedLabel: { fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.4 },
  selectedValue: { fontSize: 14, color: '#1E293B', fontWeight: '500', marginTop: 2 },
  actions: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 12,
  },
  todayBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  todayBtnText: { fontSize: 14, color: '#0D7377', fontWeight: '500' },
  confirmRow: { flexDirection: 'row', gap: 8 },
  cancelBtn: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8,
    backgroundColor: '#F1F5F9', minHeight: 40, justifyContent: 'center',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '500', color: '#64748B' },
  confirmBtn: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8,
    backgroundColor: '#0D7377', minHeight: 40, justifyContent: 'center',
  },
  confirmBtnText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
});

export default memo(DatePickerModalImpl);
