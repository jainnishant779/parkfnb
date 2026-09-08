import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import WizardHeader from '../../../components/wizard/WizardHeader';
import WizardFooter from '../../../components/wizard/WizardFooter';
import { useSpaceWizard } from '../../../context/ListingWizardContext';

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
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <WizardHeader
        title={data.editSpaceId ? 'Edit Space' : 'Add Space'}
        step={4}
        totalSteps={5}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>When is it available?</Text>
        <Text style={styles.sub}>
          Most owners leave this as 24/7. Set specific hours if you only rent part of the day.
        </Text>

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Available 24/7</Text>
            <Text style={styles.toggleHint}>No specific hours — anyone can book any time</Text>
          </View>
          <Switch
            value={data.availability.is24_7}
            onValueChange={(v) => updateAvailability({ is24_7: v })}
            trackColor={{ false: '#D1D5DB', true: '#7FC5BF' }}
            thumbColor={data.availability.is24_7 ? '#0D7377' : '#F3F4F6'}
          />
        </View>

        {!data.availability.is24_7 && (
          <>
            <Pressable style={styles.presetBtn} onPress={applyWeekdayPreset}>
              <Ionicons name="calendar-outline" size={16} color="#0D7377" />
              <Text style={styles.presetText}>Preset: Weekdays 9 AM–6 PM</Text>
            </Pressable>

            {data.availability.schedules.map((s, i) => (
              <View key={i} style={styles.dayRow}>
                <View style={styles.dayLabelWrap}>
                  <Switch
                    value={s.enabled}
                    onValueChange={(v) => updateAvailabilitySlot(i, { enabled: v })}
                    trackColor={{ false: '#D1D5DB', true: '#7FC5BF' }}
                    thumbColor={s.enabled ? '#0D7377' : '#F3F4F6'}
                  />
                  <Text style={styles.dayLabel}>{DAY_LABELS[i]}</Text>
                </View>
                {s.enabled && (
                  <View style={styles.timesRow}>
                    <Pressable
                      style={styles.timeBtn}
                      onPress={() => setPickerOpen({ index: i, field: 'from' })}
                    >
                      <Text style={styles.timeText}>{s.availableFrom}</Text>
                    </Pressable>
                    <Text style={styles.dash}>–</Text>
                    <Pressable
                      style={styles.timeBtn}
                      onPress={() => setPickerOpen({ index: i, field: 'to' })}
                    >
                      <Text style={styles.timeText}>{s.availableTo}</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>
      <WizardFooter primaryLabel="Next" onPrimary={handleNext} errorText={errorText} />

      {/* Simple inline time picker modal */}
      {pickerOpen && (
        <View style={styles.pickerOverlay}>
          <Pressable style={styles.pickerBackdrop} onPress={() => setPickerOpen(null)} />
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>
              Select {pickerOpen.field === 'from' ? 'start' : 'end'} time
            </Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {TIMES.map((t) => (
                <Pressable
                  key={t}
                  style={styles.pickerItem}
                  onPress={() => {
                    updateAvailabilitySlot(pickerOpen.index, {
                      [pickerOpen.field === 'from' ? 'availableFrom' : 'availableTo']: t,
                    } as any);
                    setPickerOpen(null);
                  }}
                >
                  <Text style={styles.pickerItemText}>{t}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 80 },
  h1: { fontSize: 22, fontWeight: '700', color: '#1F2937', marginBottom: 6 },
  sub: { fontSize: 14, color: '#6B7280', marginBottom: 20 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    marginBottom: 16,
  },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  toggleHint: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  presetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#E8F5F4',
    borderRadius: 8,
    marginBottom: 12,
  },
  presetText: { color: '#0D7377', fontSize: 13, fontWeight: '500', marginLeft: 6 },
  dayRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  dayLabelWrap: { flexDirection: 'row', alignItems: 'center' },
  dayLabel: { fontSize: 15, color: '#1F2937', marginLeft: 12, fontWeight: '500' },
  timesRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginLeft: 60 },
  timeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  timeText: { fontSize: 14, color: '#1F2937', fontWeight: '500' },
  dash: { color: '#6B7280', marginHorizontal: 10 },
  pickerOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'flex-end',
  },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  pickerSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  pickerTitle: { fontSize: 16, fontWeight: '600', color: '#1F2937', marginBottom: 12 },
  pickerItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  pickerItemText: { fontSize: 15, color: '#1F2937', textAlign: 'center' },
});
