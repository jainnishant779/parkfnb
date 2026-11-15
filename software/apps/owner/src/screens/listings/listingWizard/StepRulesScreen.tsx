import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import WizardHeader from '../../../components/wizard/WizardHeader';
import WizardFooter from '../../../components/wizard/WizardFooter';
import { useSpaceWizard } from '../../../context/ListingWizardContext';
import type { SpaceVehicleType, BookingMode } from '../../../types/api';
import { palette, radii, fonts } from '../../../theme/kit';

const VEHICLE_TYPES: { value: SpaceVehicleType; label: string; icon: string }[] = [
  { value: 'car', label: 'Car', icon: 'car-outline' },
  { value: 'suv', label: 'SUV', icon: 'car-sport-outline' },
  { value: 'truck', label: 'Truck', icon: 'bus-outline' },
  { value: 'van', label: 'Van', icon: 'car-outline' },
  { value: 'motorcycle', label: 'Motorcycle', icon: 'bicycle-outline' },
  { value: 'bicycle', label: 'Bicycle', icon: 'bicycle-outline' },
  { value: 'rv', label: 'RV', icon: 'bus-outline' },
  { value: 'trailer', label: 'Trailer', icon: 'cube-outline' },
];

const BOOKING_MODES: { value: BookingMode; label: string; description: string }[] = [
  { value: 'instant', label: 'Instant', description: 'Renters book immediately' },
  { value: 'request', label: 'Request', description: 'You approve each booking' },
  { value: 'both', label: 'Both', description: 'Let renters choose' },
];

export default function StepRulesScreen() {
  const navigation = useNavigation<any>();
  const { data, updateField } = useSpaceWizard();
  const [errorText, setErrorText] = useState('');

  const toggleVehicle = (v: SpaceVehicleType) => {
    const current = data.allowedVehicleTypes;
    if (current.includes(v)) {
      updateField('allowedVehicleTypes', current.filter((x) => x !== v));
    } else {
      updateField('allowedVehicleTypes', [...current, v]);
    }
  };

  const handleNext = () => {
    if (data.allowedVehicleTypes.length === 0) {
      setErrorText('Select at least one allowed vehicle type.');
      return;
    }
    setErrorText('');
    navigation.navigate('SpaceReview');
  };

  return (
    <View style={styles.screen}>
      <WizardHeader
        title={data.editSpaceId ? 'Edit Space' : 'Add Space'}
        step={5}
        totalSteps={5}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>Rules & amenities</Text>
        <Text style={styles.sub}>Who can park here and how bookings work.</Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Allowed vehicle types <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.chipGrid}>
            {VEHICLE_TYPES.map((v) => {
              const selected = data.allowedVehicleTypes.includes(v.value);
              return (
                <TouchableOpacity
                  key={v.value}
                  activeOpacity={0.75}
                  onPress={() => toggleVehicle(v.value)}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Ionicons
                    name={v.icon as any}
                    size={17}
                    color={selected ? palette.textInverse : palette.text}
                  />
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {v.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Booking mode</Text>
          {BOOKING_MODES.map((m) => {
            const selected = data.bookingMode === m.value;
            return (
              <TouchableOpacity
                key={m.value}
                activeOpacity={0.8}
                onPress={() => updateField('bookingMode', m.value)}
                style={[styles.modeRow, selected && styles.modeRowSelected]}
              >
                <View style={[styles.modeRadio, selected && styles.modeRadioOn]}>
                  {selected && <View style={styles.modeRadioDot} />}
                </View>
                <View style={styles.flex}>
                  <Text style={styles.modeLabel}>{m.label}</Text>
                  <Text style={styles.modeDesc}>{m.description}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[styles.card, styles.amenityRow]}>
          <View style={styles.amenityIcon}>
            <Ionicons name="flash-outline" size={20} color={palette.text} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.amenityLabel}>EV charging available</Text>
            <Text style={styles.amenityHint}>Attract EV-driving renters</Text>
          </View>
          <Switch
            value={data.hasEvCharging}
            onValueChange={(v) => updateField('hasEvCharging', v)}
            trackColor={{ false: palette.bgSoft, true: palette.ink }}
            thumbColor={palette.surface}
            ios_backgroundColor={palette.bgSoft}
          />
        </View>
      </ScrollView>
      <WizardFooter primaryLabel="Review" onPrimary={handleNext} errorText={errorText} />
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
    padding: 18,
    marginBottom: 12,
  },
  sectionTitle: { ...fonts.semibold, fontSize: 17, color: palette.text, marginBottom: 12 },
  required: { color: palette.danger },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: palette.fill,
  },
  chipSelected: { backgroundColor: palette.ink },
  chipText: { ...fonts.semibold, marginLeft: 6, color: palette.text, fontSize: 13.5 },
  chipTextSelected: { color: palette.textInverse },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: radii.lg,
    backgroundColor: palette.surfaceDim,
    marginBottom: 8,
  },
  modeRowSelected: { backgroundColor: palette.peachSoft },
  modeRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: palette.textSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  modeRadioOn: { borderColor: palette.ink },
  modeRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.ink,
  },
  modeLabel: { ...fonts.semibold, fontSize: 15.5, color: palette.text },
  modeDesc: { ...fonts.medium, fontSize: 12.5, color: palette.textMuted, marginTop: 2 },
  amenityRow: { flexDirection: 'row', alignItems: 'center' },
  amenityIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  amenityLabel: { ...fonts.semibold, fontSize: 15.5, color: palette.text },
  amenityHint: { ...fonts.medium, fontSize: 12.5, color: palette.textMuted, marginTop: 2 },
});
