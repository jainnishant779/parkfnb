import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';

// ============================================================================
// Pure-JS time picker modal — three column wheel (hour / minute / am-pm)
// styled like iOS UIDatePicker. Snap-to-row scrolling using paginated
// vertical FlatList behavior (we use ScrollView with snapToInterval).
//
// The component returns time as "HH:MM" in 24-hour format via `onSelect`.
// Display defaults to 12-hour with AM/PM but can be set to 24-hour with
// the `mode24h` prop.
// ============================================================================

const ROW_HEIGHT = 44;
const VISIBLE_ROWS = 5; // odd number: middle row is the selected one
const COLUMN_PADDING = (VISIBLE_ROWS - 1) / 2; // padding rows above/below

export interface TimePickerModalProps {
  visible: boolean;
  onClose: () => void;
  /** Receives "HH:MM" in 24-hour format. */
  onSelect: (time: string) => void;
  /** Initial time in "HH:MM" 24-hour format. Defaults to 09:00. */
  initialTime?: string;
  title?: string;
  /** When true, shows hour 0–23 column without AM/PM. Default false (12-hour with AM/PM). */
  mode24h?: boolean;
  /** Step (minutes) between minute options. Default 1; common alternatives 5, 15, 30. */
  minuteStep?: number;
  testID?: string;
}

function parseHHMM(s?: string): { h: number; m: number } {
  if (!s) return { h: 9, m: 0 };
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return { h: 9, m: 0 };
  const h = Math.max(0, Math.min(23, Number(m[1])));
  const mm = Math.max(0, Math.min(59, Number(m[2])));
  return { h, m: mm };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

interface ColumnProps {
  values: number[];
  selectedValue: number;
  onChange: (value: number) => void;
  format?: (n: number) => string;
}

const WheelColumn = memo(function WheelColumn({ values, selectedValue, onChange, format }: ColumnProps) {
  const scrollRef = useRef<ScrollView | null>(null);
  const isProgrammaticRef = useRef(false);

  // Scroll to the selected value initially and whenever it changes externally.
  useEffect(() => {
    const idx = values.indexOf(selectedValue);
    if (idx < 0) return;
    isProgrammaticRef.current = true;
    scrollRef.current?.scrollTo({ y: idx * ROW_HEIGHT, animated: false });
    // Allow user-driven onMomentumScrollEnd shortly after.
    setTimeout(() => { isProgrammaticRef.current = false; }, 50);
  }, [selectedValue, values]);

  const handleMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isProgrammaticRef.current) return;
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.max(0, Math.min(values.length - 1, Math.round(y / ROW_HEIGHT)));
    const next = values[idx];
    if (next !== selectedValue) onChange(next);
  };

  return (
    <View style={styles.column}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ROW_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={handleMomentumEnd}
        contentContainerStyle={{
          paddingTop: ROW_HEIGHT * COLUMN_PADDING,
          paddingBottom: ROW_HEIGHT * COLUMN_PADDING,
        }}
      >
        {values.map((v) => {
          const isSelected = v === selectedValue;
          return (
            <View key={v} style={styles.row}>
              <Text style={[styles.rowText, isSelected && styles.rowTextSelected]}>
                {format ? format(v) : pad2(v)}
              </Text>
            </View>
          );
        })}
      </ScrollView>
      <View pointerEvents="none" style={styles.selectionLineTop} />
      <View pointerEvents="none" style={styles.selectionLineBottom} />
    </View>
  );
});

function TimePickerModalImpl({
  visible,
  onClose,
  onSelect,
  initialTime,
  title = 'Select time',
  mode24h = false,
  minuteStep = 1,
  testID,
}: TimePickerModalProps) {
  const insets = useSafeAreaInsets();
  const initial = useMemo(() => parseHHMM(initialTime), [initialTime]);

  const [hour24, setHour24] = useState<number>(initial.h);
  const [minute, setMinute] = useState<number>(initial.m);

  useEffect(() => {
    if (!visible) return;
    const p = parseHHMM(initialTime);
    setHour24(p.h);
    setMinute(p.m);
  }, [visible, initialTime]);

  const hourValues = useMemo(() => {
    if (mode24h) return Array.from({ length: 24 }, (_, i) => i);
    return Array.from({ length: 12 }, (_, i) => i + 1); // 1–12
  }, [mode24h]);
  const minuteValues = useMemo(() => {
    const arr: number[] = [];
    for (let m = 0; m < 60; m += minuteStep) arr.push(m);
    return arr;
  }, [minuteStep]);

  const isAm = hour24 < 12;
  const displayHour = mode24h
    ? hour24
    : ((hour24 % 12) === 0 ? 12 : hour24 % 12);

  const handleHourChange = (h: number) => {
    if (mode24h) {
      setHour24(h);
    } else {
      // Convert 12-hour selection back to 24-hour using current AM/PM.
      const h24 = (h % 12) + (isAm ? 0 : 12);
      setHour24(h24);
    }
  };

  const handleMinuteChange = (m: number) => setMinute(m);

  const handleAmPmToggle = (toAm: boolean) => {
    const h12 = (hour24 % 12) === 0 ? 12 : hour24 % 12;
    const h24 = (h12 % 12) + (toAm ? 0 : 12);
    setHour24(h24);
  };

  const handleConfirm = useCallback(() => {
    onSelect(`${pad2(hour24)}:${pad2(minute)}`);
    onClose();
  }, [hour24, minute, onSelect, onClose]);

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

          <View style={styles.wheelArea}>
            <WheelColumn
              values={hourValues}
              selectedValue={mode24h ? hour24 : displayHour}
              onChange={handleHourChange}
            />
            <Text style={styles.colon}>:</Text>
            <WheelColumn
              values={minuteValues}
              selectedValue={minute}
              onChange={handleMinuteChange}
            />
            {!mode24h ? (
              <View style={styles.ampmCol}>
                <Pressable
                  onPress={() => handleAmPmToggle(true)}
                  style={[styles.ampmBtn, isAm && styles.ampmBtnActive]}
                >
                  <Text style={[styles.ampmText, isAm && styles.ampmTextActive]}>AM</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleAmPmToggle(false)}
                  style={[styles.ampmBtn, !isAm && styles.ampmBtnActive]}
                >
                  <Text style={[styles.ampmText, !isAm && styles.ampmTextActive]}>PM</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

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
  wheelArea: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16,
    height: ROW_HEIGHT * VISIBLE_ROWS + 32,
  },
  column: {
    width: 70,
    height: ROW_HEIGHT * VISIBLE_ROWS,
    overflow: 'hidden',
  },
  row: { height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  rowText: { fontSize: 22, color: '#94A3B8', fontVariant: ['tabular-nums'] },
  rowTextSelected: { color: '#1E293B', fontWeight: '600' },
  selectionLineTop: {
    position: 'absolute', left: 0, right: 0,
    top: ROW_HEIGHT * COLUMN_PADDING, height: 1, backgroundColor: '#E2E8F0',
  },
  selectionLineBottom: {
    position: 'absolute', left: 0, right: 0,
    top: ROW_HEIGHT * (COLUMN_PADDING + 1), height: 1, backgroundColor: '#E2E8F0',
  },
  colon: {
    fontSize: 22, fontWeight: '600', color: '#1E293B',
    paddingHorizontal: 8, fontVariant: ['tabular-nums'],
  },
  ampmCol: { marginLeft: 12, justifyContent: 'center', gap: 6 },
  ampmBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  ampmBtnActive: { backgroundColor: '#0D7377' },
  ampmText: { fontSize: 13, fontWeight: '500', color: '#64748B' },
  ampmTextActive: { color: '#FFFFFF', fontWeight: '600' },
  actions: {
    flexDirection: 'row', justifyContent: 'flex-end', gap: 8,
    paddingHorizontal: 20, paddingTop: 4, paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E2E8F0',
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

export default memo(TimePickerModalImpl);
