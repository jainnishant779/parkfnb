import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  StatusBar, Image, useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppAlert } from '../../components/common/AppAlert';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { listingService } from '../../services/listingService';
import { ApiRequestError } from '../../services/api';
import type { ApiSpace, ApiAvailabilitySlot } from '../../types/api';
import { resolveImageUri, isPlaceholderUrl } from '../../utils/imageUri';
import { palette, radii, fonts } from '../../theme/kit';
import { IconCircle, StatusTag, InfoGrid, PillButton, IsoBlock, EmptyState } from '../../components/ui';

const HERO_HEIGHT = 330;

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function SpacePhoto({ uri }: { uri: string }) {
  const [failed, setFailed] = useState(false);
  if (isPlaceholderUrl(uri) || failed) {
    return (
      <View style={styles.photoPlaceholder}>
        <Ionicons name="image-outline" size={40} color={palette.textSubtle} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: resolveImageUri(uri) }}
      style={styles.photoImg}
      onError={() => setFailed(true)}
    />
  );
}

export default function ListingDetailsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const spaceId: string = route.params?.spaceId;

  const [space, setSpace] = useState<ApiSpace | null>(null);
  const [schedules, setSchedules] = useState<ApiAvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

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
          <ActivityIndicator size="large" color={palette.ink} />
        </View>
      </SafeAreaView>
    );
  }

  if (!space) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loader}>
          <EmptyState
            title={errorText || 'Space not found'}
            action="Go back"
            onAction={() => navigation.goBack()}
            tone="grey"
          />
        </View>
      </SafeAreaView>
    );
  }

  const statusLabel = space.isAvailable ? 'Active' : 'Paused';

  const pricingItems = [
    { label: 'Hourly', value: `₹${space.pricePerHour}` },
    ...(space.pricePerDay ? [{ label: 'Daily', value: `₹${space.pricePerDay}` }] : []),
    ...(space.pricePerMonth ? [{ label: 'Monthly', value: `₹${space.pricePerMonth}` }] : []),
  ];
  const dimensionItems = [
    { label: 'Length', value: `${space.lengthMeters} m` },
    { label: 'Width', value: `${space.widthMeters} m` },
    ...(space.heightMeters ? [{ label: 'Height clearance', value: `${space.heightMeters} m` }] : []),
  ];
  const ruleItems = [
    { label: 'Vehicles', value: space.allowedVehicleTypes.join(', ') },
    { label: 'Booking', value: space.bookingMode },
    { label: 'EV charging', value: space.hasEvCharging ? 'Yes' : 'No' },
  ];

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Photo hero */}
        <View style={[styles.hero, { height: HERO_HEIGHT + insets.top }]}>
          {space.spaceImages.length > 0 ? (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
              {space.spaceImages.map((uri, i) => (
                <View key={i} style={{ width, height: HERO_HEIGHT + insets.top }}>
                  <SpacePhoto uri={uri} />
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.heroEmpty}>
              <IsoBlock size={170} tone="peach" />
              <Text style={styles.photoEmptyText}>No photos</Text>
            </View>
          )}
          {space.spaceImages.length > 0 ? (
            <View style={styles.scrim} pointerEvents="none" />
          ) : null}

          <View style={[styles.heroBar, { top: insets.top + 8 }]}>
            <IconCircle
              icon="arrow-left"
              variant={space.spaceImages.length > 0 ? 'glass' : 'white'}
              onPress={() => navigation.goBack()}
            />
            <IconCircle
              icon="edit-2"
              variant={space.spaceImages.length > 0 ? 'glass' : 'white'}
              onPress={handleEdit}
            />
          </View>

          {space.spaceImages.length > 1 ? (
            <View style={styles.photoCount}>
              <Ionicons name="images-outline" size={13} color={palette.textInverse} />
              <Text style={styles.photoCountText}>{space.spaceImages.length}</Text>
            </View>
          ) : null}
        </View>

        {/* Details card */}
        <View style={styles.sheet}>
          <View style={styles.statusRow}>
            <StatusTag label={statusLabel} tone={space.isAvailable ? 'success' : 'warning'} />
            <PillButton
              label={space.isAvailable ? 'Pause space' : 'Resume space'}
              icon={space.isAvailable ? 'pause' : 'play'}
              variant="grey"
              size="sm"
              onPress={togglePause}
            />
          </View>

          <Text style={styles.title}>Space {space.spaceNumber}</Text>
          <Text style={styles.spaceType}>{space.spaceType}</Text>

          <View style={styles.block}>
            <Text style={styles.sectionTitle}>Pricing</Text>
            <InfoGrid items={pricingItems} columns={3} />
          </View>

          <View style={styles.block}>
            <Text style={styles.sectionTitle}>Dimensions</Text>
            <InfoGrid items={dimensionItems} columns={3} />
          </View>

          <View style={styles.block}>
            <Text style={styles.sectionTitle}>Rules</Text>
            <InfoGrid items={ruleItems} columns={2} valueStyle={styles.capitalize} />
          </View>

          <View style={styles.block}>
            <Text style={styles.sectionTitle}>Availability</Text>
            {schedules.length === 0 ? (
              <Row label="Schedule" value="24/7" isLast />
            ) : (
              schedules.map((s, i) => (
                <Row
                  key={s.id}
                  label={DAY_LABELS[s.dayOfWeek]}
                  value={`${s.availableFrom} – ${s.availableTo}`}
                  isLast={i === schedules.length - 1}
                />
              ))
            )}
          </View>

          {space.spaceDescription ? (
            <View style={styles.block}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text style={styles.description}>{space.spaceDescription}</Text>
            </View>
          ) : null}

          <PillButton
            label="Delete space"
            icon="trash-2"
            variant="danger"
            onPress={handleDelete}
            style={styles.deleteBtn}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function Row({ label, value, isLast }: { label: string; value: string; isLast?: boolean }) {
  return (
    <View style={[styles.row, !isLast && styles.rowDivider]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  content: {},
  hero: { backgroundColor: palette.ink, overflow: 'hidden' },
  heroEmpty: {
    flex: 1,
    backgroundColor: palette.peachSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 30,
  },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.28)' },
  heroBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  photoCount: {
    position: 'absolute',
    right: 16,
    bottom: 44,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    height: 26,
  },
  photoCountText: { ...fonts.semibold, fontSize: 12, color: palette.textInverse, marginLeft: 5 },
  photoImg: { width: '100%', height: '100%' },
  photoPlaceholder: {
    flex: 1,
    backgroundColor: palette.fill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoEmptyText: { ...fonts.medium, color: palette.textMuted, marginTop: 4, fontSize: 13 },
  sheet: {
    marginTop: -30,
    backgroundColor: palette.surface,
    borderRadius: radii.xxl,
    marginHorizontal: 0,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 20,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: {
    ...fonts.bold,
    fontSize: 30,
    letterSpacing: -0.8,
    color: palette.text,
    marginTop: 16,
  },
  spaceType: {
    ...fonts.medium,
    fontSize: 15,
    color: palette.textMuted,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  block: {
    marginTop: 18,
    paddingTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.line,
  },
  sectionTitle: {
    ...fonts.semibold,
    fontSize: 17,
    color: palette.text,
    marginBottom: 8,
  },
  capitalize: { textTransform: 'capitalize' },
  row: { flexDirection: 'row', paddingVertical: 10 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  rowLabel: { ...fonts.medium, flex: 1, fontSize: 14, color: palette.textMuted },
  rowValue: { ...fonts.semibold, flex: 2, fontSize: 14, color: palette.text, textAlign: 'right' },
  description: { ...fonts.medium, fontSize: 14, color: palette.text, lineHeight: 21 },
  deleteBtn: { marginTop: 24 },
});
