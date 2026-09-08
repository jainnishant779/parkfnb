import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable,
  StatusBar, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppAlert } from '../../components/common/AppAlert';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { listingService } from '../../services/listingService';
import { ApiRequestError } from '../../services/api';
import type { ApiSpace, ApiAvailabilitySlot } from '../../types/api';
import { resolveImageUri, isPlaceholderUrl } from '../../utils/imageUri';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ListingDetailsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const spaceId: string = route.params?.spaceId;

  const [space, setSpace] = useState<ApiSpace | null>(null);
  const [schedules, setSchedules] = useState<ApiAvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [s, sc] = await Promise.all([
        listingService.getSpace(spaceId),
        listingService.listAvailability(spaceId).catch(() => []),
      ]);
      setSpace(s);
      setSchedules(sc);
      setErrorText('');
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'NOT_FOUND') {
        setErrorText('This space was deleted.');
      } else {
        setErrorText(err instanceof ApiRequestError ? err.message : 'Failed to load.');
      }
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const togglePause = async () => {
    if (!space) return;
    try {
      const updated = await listingService.updateSpace(space.id, { isAvailable: !space.isAvailable });
      setSpace(updated);
    } catch (err) {
      AppAlert.alert('Error', err instanceof ApiRequestError ? err.message : 'Failed to update.');
    }
  };

  const handleDelete = () => {
    if (!space) return;
    AppAlert.alert(
      'Delete space?',
      `Space ${space.spaceNumber} will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await listingService.deleteSpace(space.id);
              navigation.goBack();
            } catch (err) {
              if (err instanceof ApiRequestError && err.code === 'BIZ_CONFLICT') {
                AppAlert.alert("Can't delete", 'Space has active bookings.');
              } else {
                AppAlert.alert('Error', err instanceof ApiRequestError ? err.message : 'Failed.');
              }
            }
          },
        },
      ],
    );
  };

  const handleEdit = () => {
    if (!space) return;
    const propertyId = typeof space.propertyId === 'string' ? space.propertyId : space.propertyId?.id;
    navigation.navigate('SpaceWizard', { propertyId, editSpaceId: space.id });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#0D7377" />
        </View>
      </SafeAreaView>
    );
  }

  if (!space) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loader}>
          <Text style={styles.errorText}>{errorText || 'Space not found'}</Text>
          <Pressable style={styles.backBtnCenter} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const statusColor = space.isAvailable ? '#059669' : '#D97706';
  const statusLabel = space.isAvailable ? 'Active' : 'Paused';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color="#1F2937" />
        </Pressable>
        <Text style={styles.headerTitle}>Space {space.spaceNumber}</Text>
        <Pressable onPress={handleEdit} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="create-outline" size={20} color="#0D7377" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Photo carousel */}
        {space.spaceImages.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
            {space.spaceImages.map((uri, i) => (
              <View key={i} style={styles.photo}>
                {isPlaceholderUrl(uri) ? (
                  <View style={styles.photoPlaceholder}>
                    <Ionicons name="image-outline" size={40} color="#9CA3AF" />
                  </View>
                ) : (
                  <Image source={{ uri: resolveImageUri(uri) }} style={styles.photoImg} />
                )}
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.photoEmpty}>
            <Ionicons name="image-outline" size={40} color="#9CA3AF" />
            <Text style={styles.photoEmptyText}>No photos</Text>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.statusRow}>
            <View style={[styles.pill, { backgroundColor: statusColor + '20' }]}>
              <View style={[styles.dot, { backgroundColor: statusColor }]} />
              <Text style={[styles.pillText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
            <Pressable onPress={togglePause} style={styles.toggleBtn}>
              <Text style={styles.toggleBtnText}>
                {space.isAvailable ? 'Pause space' : 'Resume space'}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.spaceType}>{space.spaceType}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pricing</Text>
          <Row label="Hourly" value={`₹${space.pricePerHour}`} />
          {space.pricePerDay ? <Row label="Daily" value={`₹${space.pricePerDay}`} /> : null}
          {space.pricePerMonth ? <Row label="Monthly" value={`₹${space.pricePerMonth}`} /> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dimensions</Text>
          <Row label="Length" value={`${space.lengthMeters} m`} />
          <Row label="Width" value={`${space.widthMeters} m`} />
          {space.heightMeters ? <Row label="Height clearance" value={`${space.heightMeters} m`} /> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rules</Text>
          <Row label="Vehicles" value={space.allowedVehicleTypes.join(', ')} />
          <Row label="Booking" value={space.bookingMode} />
          <Row label="EV charging" value={space.hasEvCharging ? 'Yes' : 'No'} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Availability</Text>
          {schedules.length === 0 ? (
            <Row label="Schedule" value="24/7" />
          ) : (
            schedules.map((s) => (
              <Row
                key={s.id}
                label={DAY_LABELS[s.dayOfWeek]}
                value={`${s.availableFrom} – ${s.availableTo}`}
              />
            ))
          )}
        </View>

        {space.spaceDescription ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.description}>{space.spaceDescription}</Text>
          </View>
        ) : null}

        <Pressable style={styles.deleteBtn} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={18} color="#EF4444" />
          <Text style={styles.deleteBtnText}>Delete space</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { color: '#EF4444', fontSize: 15, textAlign: 'center', marginBottom: 16 },
  backBtnCenter: { paddingHorizontal: 18, paddingVertical: 10, backgroundColor: '#0D7377', borderRadius: 8 },
  backBtnText: { color: '#FFFFFF', fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  iconBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: '#1F2937', textAlign: 'center' },
  content: { paddingBottom: 40 },
  photoRow: { backgroundColor: '#FFFFFF' },
  photo: { width: 280, height: 180, marginRight: 4 },
  photoImg: { width: '100%', height: '100%' },
  photoPlaceholder: { flex: 1, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  photoEmpty: {
    height: 120,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoEmptyText: { color: '#9CA3AF', marginTop: 8, fontSize: 13 },
  section: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    marginTop: 8,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  pillText: { fontSize: 12, fontWeight: '600' },
  toggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0D7377',
  },
  toggleBtnText: { color: '#0D7377', fontSize: 13, fontWeight: '600' },
  spaceType: { fontSize: 15, color: '#6B7280', marginTop: 8, textTransform: 'capitalize' },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  rowLabel: { flex: 1, fontSize: 13, color: '#6B7280' },
  rowValue: { flex: 2, fontSize: 14, color: '#1F2937' },
  description: { fontSize: 14, color: '#1F2937', lineHeight: 20 },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    marginTop: 16,
    marginHorizontal: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 10,
  },
  deleteBtnText: { color: '#EF4444', fontSize: 15, fontWeight: '600' },
});
