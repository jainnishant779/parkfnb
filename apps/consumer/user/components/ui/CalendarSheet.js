/**
 * CalendarSheet — month calendar in a bottom sheet (no native date-picker
 * dependency). Days before `minDate` or after `maxDate` are disabled.
 *
 *   <CalendarSheet visible value={date} minDate={today} maxDate={limit}
 *     onClose={...} onSelect={(date) => ...} />
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import SheetModal from './SheetModal';
import { PillButton } from './index';
import { palette, fonts } from '../../theme';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a, b) =>
  a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Grid of weeks for a month; Monday-first, null for padding cells.
const buildMonth = (year, month) => {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
};

const CalendarSheet = ({ visible, value, minDate, maxDate, onClose, onSelect }) => {
  const min = minDate ? startOfDay(minDate) : null;
  const max = maxDate ? startOfDay(maxDate) : null;
  const [cursor, setCursor] = useState(() => startOfDay(value || new Date()));
  const [picked, setPicked] = useState(value ? startOfDay(value) : null);

  // Re-sync with the current booking date each time the sheet opens.
  useEffect(() => {
    if (visible) {
      const v = startOfDay(value || new Date());
      setCursor(v);
      setPicked(v);
    }
  }, [visible, value]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const weeks = useMemo(() => buildMonth(year, month), [year, month]);
  const title = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const canPrev = !min || new Date(year, month, 0) >= min;
  const canNext = !max || new Date(year, month + 1, 1) <= max;
  const isDisabled = (d) => (min && d < min) || (max && d > max);
  const today = startOfDay(new Date());

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.nav}>
          <TouchableOpacity
            style={[styles.navBtn, !canPrev && styles.navBtnOff]}
            disabled={!canPrev}
            onPress={() => setCursor(new Date(year, month - 1, 1))}
            activeOpacity={0.7}
          >
            <Icon name="chevron-left" size={20} color={palette.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navBtn, !canNext && styles.navBtnOff]}
            disabled={!canNext}
            onPress={() => setCursor(new Date(year, month + 1, 1))}
            activeOpacity={0.7}
          >
            <Icon name="chevron-right" size={20} color={palette.text} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.week}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={styles.weekday}>{w}</Text>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={styles.week}>
          {week.map((d, di) => {
            if (!d) return <View key={di} style={styles.cell} />;
            const off = isDisabled(d);
            const active = sameDay(d, picked);
            const isToday = sameDay(d, today);
            return (
              <TouchableOpacity
                key={di}
                style={styles.cell}
                disabled={off}
                onPress={() => setPicked(d)}
                activeOpacity={0.7}
              >
                {/* Circle always mounted; only its colour changes (Android keeps the radius). */}
                <View
                  style={[
                    styles.dayCircle,
                    active ? styles.dayActive : isToday ? styles.dayToday : styles.dayPlain,
                  ]}
                >
                  <Text style={[styles.dayText, off && styles.dayTextOff, active && styles.dayTextActive]}>
                    {d.getDate()}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      <PillButton
        label={picked ? `Book for ${picked.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : 'Pick a date'}
        variant="ink"
        disabled={!picked}
        onPress={() => {
          onSelect && onSelect(picked);
          onClose && onClose();
        }}
        style={styles.cta}
      />
    </SheetModal>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { ...fonts.semibold, fontSize: 20, color: palette.text },
  nav: { flexDirection: 'row' },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  navBtnOff: { opacity: 0.35 },
  week: { flexDirection: 'row' },
  weekday: {
    ...fonts.medium,
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    color: palette.textMuted,
    marginBottom: 6,
  },
  cell: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' },
  dayCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPlain: { backgroundColor: 'transparent', borderColor: 'transparent' },
  dayToday: { backgroundColor: 'transparent', borderColor: palette.ink },
  dayActive: { backgroundColor: palette.ink, borderColor: palette.ink },
  dayText: { ...fonts.semibold, fontSize: 15, color: palette.text },
  dayTextOff: { color: palette.textSubtle },
  dayTextActive: { color: palette.textInverse },
  cta: { marginTop: 16 },
});

export default CalendarSheet;
