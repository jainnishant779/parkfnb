import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import DatePickerModal from './DatePickerModal';
import TimePickerModal from './TimePickerModal';

// ============================================================================
// Combined date+time picker. Renders a small two-row modal showing the
// chosen date and time as buttons; tapping each opens the dedicated
// date / time modal. The component returns an ISO string (YYYY-MM-DDTHH:MM)
// in *local* time via `onSelect`.
// ============================================================================

export interface DateTimePickerModalProps {
  visible: boolean;
  onClose: () => void;
  /** Receives "YYYY-MM-DDTHH:MM" (local). */
  onSelect: (isoLocal: string) => void;
  /** Initial value as "YYYY-MM-DDTHH:MM" or full ISO; defaults to now. */
  initial?: string | Date;
  title?: string;
  minDate?: Date;
  maxDate?: Date;
  mode24h?: boolean;
  minuteStep?: number;
  testID?: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toParts(input: string | Date | undefined): { date: string; time: string } {
  const d = input instanceof Date ? input : input ? new Date(input) : new Date();
  if (isNaN(d.getTime())) {
    const now = new Date();
    return {
      date: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`,
      time: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
    };
  }
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  };
}

function formatHumanDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatHumanTime(hhmm: string, mode24h: boolean): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  const mm = m[2];
  if (mode24h) return `${pad2(h)}:${mm}`;
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = (h % 12) === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${period}`;
}

function DateTimePickerModalImpl({
  visible,
  onClose,
  onSelect,
  initial,
  title = 'Select date & time',
  minDate,
  maxDate,
  mode24h = false,
  minuteStep = 5,
  testID,
}: DateTimePickerModalProps) {
  const insets = useSafeAreaInsets();
  const initialParts = useMemo(() => toParts(initial), [initial]);

  const [date, setDate] = useState(initialParts.date);
  const [time, setTime] = useState(initialParts.time);
  const [openDate, setOpenDate] = useState(false);
  const [openTime, setOpenTime] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const p = toParts(initial);
    setDate(p.date);
    setTime(p.time);
  }, [visible, initial]);

  const handleConfirm = useCallback(() => {
    onSelect(`${date}T${time}`);
    onClose();
  }, [date, time, onSelect, onClose]);

  if (!visible) return null;

  return (
    <>
      {visible && !openDate && !openTime ? (

        <View style={styles.backdrop}>
          <Pressable style={styles.backdropPressable} onPress={onClose} />
          <View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <Pressable onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color="#64748B" />
              </Pressable>
            </View>

            <Pressable onPress={() => setOpenDate(true)} style={styles.row}>
              <View style={styles.rowIcon}>
                <Ionicons name="calendar-outline" size={20} color="#0D7377" />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>Date</Text>
                <Text style={styles.rowValue}>{formatHumanDate(date)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </Pressable>

            <Pressable onPress={() => setOpenTime(true)} style={styles.row}>
              <View style={styles.rowIcon}>
                <Ionicons name="time-outline" size={20} color="#0D7377" />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>Time</Text>
                <Text style={styles.rowValue}>{formatHumanTime(time, mode24h)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </Pressable>

            <View style={styles.actions}>
              <Pressable onPress={onClose} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleConfirm} style={styles.confirmBtn}>
                <Text style={styles.confirmBtnText}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      
      ) : null}

      <DatePickerModal
        visible={openDate}
        onClose={() => setOpenDate(false)}
        onSelect={(d) => setDate(d)}
        initialDate={date}
        title="Select date"
        minDate={minDate}
        maxDate={maxDate}
      />
      <TimePickerModal
        visible={openTime}
        onClose={() => setOpenTime(false)}
        onSelect={(t) => setTime(t)}
        initialTime={time}
        title="Select time"
        mode24h={mode24h}
        minuteStep={minuteStep}
      />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  backdropPressable: { flex: 1 },
  container: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 16,
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
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F1F5F9',
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#E8F5F4', justifyContent: 'center', alignItems: 'center',
    marginRight: 12,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.4 },
  rowValue: { fontSize: 15, color: '#1E293B', fontWeight: '500', marginTop: 2 },
  actions: {
    flexDirection: 'row', justifyContent: 'flex-end', gap: 8,
    paddingHorizontal: 20, paddingTop: 12,
  },
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

export default memo(DateTimePickerModalImpl);
