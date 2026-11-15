import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import WizardHeader from '../../../components/wizard/WizardHeader';
import WizardFooter from '../../../components/wizard/WizardFooter';
import { useSpaceWizard } from '../../../context/ListingWizardContext';
import { palette, radii, fonts } from '../../../theme/kit';

const SWITCH_TRACK = { false: palette.bgSoft, true: palette.ink };

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// 30-minute grid from 00:00 to 23:30
const TIMES = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = (i % 2) * 30;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

export default function StepAvailabilityScreen() {
  const navigation = useNavigation<any>();
  const { data, updateAvailability, updateAvailabilitySlot } = useSpaceWizard();
  const [errorText, setErrorText] = useState('');
  const [pickerOpen, setPickerOpen] = useState<{ index: number; field: 'from' | 'to' } | null>(null);
  const insets = useSafeAreaInsets();

  const validate = () => {
    if (data.availability.is24_7) return true;
    const enabled = data.availability.schedules.filter((s) => s.enabled);
    if (enabled.length === 0) {
      setErrorText('Enable at least one day or switch back to 24/7.');
      return false;
    }
    for (const s of enabled) {
      if (s.availableFrom >= s.availableTo) {
        setErrorText(`${DAY_LABELS[s.dayOfWeek]}: end time must be after start time.`);
        return false;
      }
    }
    setErrorText('');
    return true;
  };

  const handleNext = () => {
    if (!validate()) return;
    navigation.navigate('StepRules');
  };

  const applyWeekdayPreset = () => {
    // Mon-Fri, 9am-6pm
    data.availability.schedules.forEach((_, i) => {
      const isWeekday = i >= 1 && i <= 5;
      updateAvailabilitySlot(i, {
        enabled: isWeekday,
        availableFrom: '09:00',
        availableTo: '18:00',
      });
    });
  };

  return (
    <View style={styles.screen}>
      <WizardHeader
        title={data.editSpaceId ? 'Edit Space' : 'Add Space'}
        step={4}
        totalSteps={5}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>When is it available?</Text>
        <Text style={styles.sub}>
          Most owners leave this as 24/7. Set specific hours if you only rent part of the day.
        </Text>

        <View style={[styles.card, styles.toggleRow]}>
          <View style={styles.toggleIcon}>
            <Ionicons name="time-outline" size={20} color={palette.text} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.toggleLabel}>Available 24/7</Text>
            <Text style={styles.toggleHint}>No specific hours — anyone can book any time</Text>
          </View>
          <Switch
            value={data.availability.is24_7}
            onValueChange={(v) => updateAvailability({ is24_7: v })}
            trackColor={SWITCH_TRACK}
            thumbColor={palette.surface}
            ios_backgroundColor={palette.bgSoft}
          />
        </View>

        {!data.availability.is24_7 && (
          <>
            <TouchableOpacity style={styles.presetBtn} onPress={applyWeekdayPreset} activeOpacity={0.8}>
              <Ionicons name="calendar-outline" size={16} color={palette.text} />
              <Text style={styles.presetText}>Preset: Weekdays 9 AM–6 PM</Text>
            </TouchableOpacity>

            <View style={styles.card}>
              {data.availability.schedules.map((s, i) => (
                <View
                  key={i}
                  style={[
                    styles.dayRow,
                    i !== data.availability.schedules.length - 1 && styles.dayDivider,
                  ]}
                >
                  <View style={styles.dayLabelWrap}>
                    <Text style={[styles.dayLabel, !s.enabled && styles.dayLabelOff]}>
                      {DAY_LABELS[i]}
                    </Text>
                    <Switch
                      value={s.enabled}
                      onValueChange={(v) => updateAvailabilitySlot(i, { enabled: v })}
                      trackColor={SWITCH_TRACK}
                      thumbColor={palette.surface}
                      ios_backgroundColor={palette.bgSoft}
                    />
                  </View>
                  {s.enabled && (
                    <View style={styles.timesRow}>
                      <TouchableOpacity
                        style={styles.timeBtn}
                        activeOpacity={0.8}
                        onPress={() => setPickerOpen({ index: i, field: 'from' })}
                      >
                        <Text style={styles.timeCaption}>From</Text>
                        <Text style={styles.timeText}>{s.availableFrom}</Text>
                      </TouchableOpacity>
                      <Ionicons name="arrow-forward" size={16} color={palette.textMuted} style={styles.dash} />
                      <TouchableOpacity
                        style={styles.timeBtn}
                        activeOpacity={0.8}
                        onPress={() => setPickerOpen({ index: i, field: 'to' })}
                      >
                        <Text style={styles.timeCaption}>To</Text>
                        <Text style={styles.timeText}>{s.availableTo}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
      <WizardFooter primaryLabel="Next" onPrimary={handleNext} errorText={errorText} />

      {/* Simple inline time picker sheet */}
      {pickerOpen && (
        <View style={styles.pickerOverlay}>
          <TouchableOpacity
            style={styles.pickerBackdrop}
            activeOpacity={1}
            onPress={() => setPickerOpen(null)}
          />
          <View style={[styles.pickerSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.grabber} />
            <Text style={styles.pickerTitle}>
              Select {pickerOpen.field === 'from' ? 'start' : 'end'} time
            </Text>
            <ScrollView style={styles.pickerList} showsVerticalScrollIndicator={false}>
              {TIMES.map((t) => {
                const current =
                  data.availability.schedules[pickerOpen.index]?.[
                    pickerOpen.field === 'from' ? 'availableFrom' : 'availableTo'
                  ] === t;
                return (
                  <TouchableOpacity
                    key={t}
                    activeOpacity={0.7}
                    style={[styles.pickerItem, current && styles.pickerItemActive]}
                    onPress={() => {
                      updateAvailabilitySlot(pickerOpen.index, {
                        [pickerOpen.field === 'from' ? 'availableFrom' : 'availableTo']: t,
                      } as any);
                      setPickerOpen(null);
                    }}
                  >
                    <Text style={[styles.pickerItemText, current && styles.pickerItemTextActive]}>
                      {t}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 80 },
  h1: { ...fonts.semibold, fontSize: 26, letterSpacing: -0.6, color: palette.text, marginBottom: 6 },
  sub: { ...fonts.medium, fontSize: 14.5, lineHeight: 20, color: palette.textMuted, marginBottom: 18 },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    paddingHorizontal: 18,
    paddingVertical: 6,
    marginBottom: 12,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
  toggleIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  toggleLabel: { ...fonts.semibold, fontSize: 16, color: palette.text },
  toggleHint: { ...fonts.medium, fontSize: 12.5, color: palette.textMuted, marginTop: 2 },
  presetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    height: 40,
    backgroundColor: palette.surface,
    borderRadius: radii.pill,
    marginBottom: 12,
  },
  presetText: { ...fonts.semibold, color: palette.text, fontSize: 14, marginLeft: 8 },
  dayRow: { paddingVertical: 12 },
  dayDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  dayLabelWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayLabel: { ...fonts.semibold, fontSize: 15.5, color: palette.text },
  dayLabelOff: { color: palette.textMuted },
  timesRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  timeBtn: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: palette.fill,
    borderRadius: radii.lg,
  },
  timeCaption: { ...fonts.medium, fontSize: 11.5, color: palette.textMuted },
  timeText: { ...fonts.semibold, fontSize: 16, color: palette.text, marginTop: 1 },
  dash: { marginHorizontal: 10 },
  pickerOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'flex-end',
  },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  pickerSheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.line,
    alignSelf: 'center',
    marginBottom: 16,
  },
  pickerTitle: {
    ...fonts.semibold,
    fontSize: 20,
    letterSpacing: -0.3,
    color: palette.text,
    marginBottom: 10,
  },
  pickerList: { maxHeight: 320 },
  pickerItem: {
    height: 48,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  pickerItemActive: { backgroundColor: palette.ink },
  pickerItemText: { ...fonts.semibold, fontSize: 16, color: palette.text },
  pickerItemTextActive: { color: palette.textInverse },
});
