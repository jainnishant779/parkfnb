import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import WizardHeader from '../../../components/wizard/WizardHeader';
import WizardFooter from '../../../components/wizard/WizardFooter';
import { useSpaceWizard } from '../../../context/ListingWizardContext';
import type { SpaceVehicleType, BookingMode } from '../../../types/api';

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
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <WizardHeader
        title={data.editSpaceId ? 'Edit Space' : 'Add Space'}
        step={5}
        totalSteps={5}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>Rules & amenities</Text>
        <Text style={styles.sub}>Who can park here and how bookings work.</Text>

        <Text style={styles.sectionTitle}>Allowed vehicle types *</Text>
        <View style={styles.chipGrid}>
          {VEHICLE_TYPES.map((v) => {
            const selected = data.allowedVehicleTypes.includes(v.value);
            return (
              <Pressable
                key={v.value}
                onPress={() => toggleVehicle(v.value)}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Ionicons
                  name={v.icon as any}
                  size={18}
                  color={selected ? '#FFFFFF' : '#0D7377'}
                />
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {v.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Booking mode</Text>
        <View>
          {BOOKING_MODES.map((m) => {
            const selected = data.bookingMode === m.value;
            return (
              <Pressable
                key={m.value}
                onPress={() => updateField('bookingMode', m.value)}
                style={[styles.modeRow, selected && styles.modeRowSelected]}
              >
                <View style={styles.modeRadio}>
                  {selected && <View style={styles.modeRadioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modeLabel}>{m.label}</Text>
                  <Text style={styles.modeDesc}>{m.description}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Amenities</Text>
        <View style={styles.amenityRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.amenityLabel}>EV charging available</Text>
            <Text style={styles.amenityHint}>Attract EV-driving renters</Text>
          </View>
          <Switch
            value={data.hasEvCharging}
            onValueChange={(v) => updateField('hasEvCharging', v)}
            trackColor={{ false: '#D1D5DB', true: '#7FC5BF' }}
            thumbColor={data.hasEvCharging ? '#0D7377' : '#F3F4F6'}
          />
        </View>
      </ScrollView>
      <WizardFooter primaryLabel="Review" onPrimary={handleNext} errorText={errorText} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 80 },
  h1: { fontSize: 22, fontWeight: '700', color: '#1F2937', marginBottom: 6 },
  sub: { fontSize: 14, color: '#6B7280', marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#1F2937', marginTop: 16, marginBottom: 10 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#0D7377',
    backgroundColor: '#FFFFFF',
  },
  chipSelected: { backgroundColor: '#0D7377' },
  chipText: { marginLeft: 6, color: '#0D7377', fontSize: 13, fontWeight: '500' },
  chipTextSelected: { color: '#FFFFFF' },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 8,
  },
  modeRowSelected: { borderColor: '#0D7377', backgroundColor: '#E8F5F4' },
  modeRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#0D7377',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  modeRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0D7377',
  },
  modeLabel: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  modeDesc: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  amenityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
  },
  amenityLabel: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  amenityHint: { fontSize: 12, color: '#6B7280', marginTop: 2 },
});
