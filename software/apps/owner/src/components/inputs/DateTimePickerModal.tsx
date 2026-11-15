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
import { palette, radii, fonts } from '../../theme/kit';
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
        // A real <Modal> renders in its own window, so it can never be
        // painted under a sibling or clipped by a collapsed parent.
        <Modal
          visible
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={onClose}
        >
        <View style={styles.backdrop}>
          <View pointerEvents="none" style={styles.backdropTint} />
          <Pressable style={styles.backdropPressable} onPress={onClose} />
          <View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.grabber} />
          <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <Pressable onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={palette.text} />
              </Pressable>
            </View>

            <Pressable onPress={() => setOpenDate(true)} style={styles.row}>
              <View style={styles.rowIcon}>
                <Ionicons name="calendar-outline" size={20} color={palette.text} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>Date</Text>
                <Text style={styles.rowValue}>{formatHumanDate(date)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.textSubtle} />
            </Pressable>

            <Pressable onPress={() => setOpenTime(true)} style={styles.row}>
              <View style={styles.rowIcon}>
                <Ionicons name="time-outline" size={20} color={palette.text} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>Time</Text>
                <Text style={styles.rowValue}>{formatHumanTime(time, mode24h)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.textSubtle} />
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
        </Modal>
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
  // Absolutely positioned, not flex:1 — this is rendered inline next to the
  // field that opens it (no RN <Modal>, which does not present on this build).
  // With flex:1 alone it laid out *inside* the form's scroll flow, so the
  // picker appeared below the fold instead of over the screen and tapping
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
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  backdropPressable: { flex: 1 },
  container: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingTop: 10,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.12, shadowRadius: 20 },
      android: { elevation: 24 },
    }),
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.line,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 8,
  },
  title: { ...fonts.semibold, fontSize: 20, letterSpacing: -0.3, color: palette.text },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: palette.fill,
    justifyContent: 'center', alignItems: 'center',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginTop: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: radii.lg, backgroundColor: palette.surfaceDim,
  },
  rowIcon: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: palette.peachSoft, justifyContent: 'center', alignItems: 'center',
    marginRight: 12,
  },
  rowText: { flex: 1 },
  rowLabel: { ...fonts.medium, fontSize: 12, color: palette.textMuted },
  rowValue: { ...fonts.semibold, fontSize: 16, color: palette.text, marginTop: 2 },
  actions: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 20, paddingTop: 18,
  },
  cancelBtn: {
    flex: 1, height: 52, borderRadius: radii.pill,
    backgroundColor: palette.fill, alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { ...fonts.semibold, fontSize: 15, color: palette.text },
  confirmBtn: {
    flex: 1, height: 52, borderRadius: radii.pill,
    backgroundColor: palette.ink, alignItems: 'center', justifyContent: 'center',
  },
  confirmBtnText: { ...fonts.semibold, fontSize: 15, color: palette.textInverse },
});

export default memo(DateTimePickerModalImpl);
