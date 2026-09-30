import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppAlert } from '../../components/common/AppAlert';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { listingService } from '../../services/listingService';
import { ApiRequestError } from '../../services/api';
import type { ApiProperty, ApiSpace } from '../../types/api';
import { palette, radii, fonts } from '../../theme/kit';
import { ScreenHeader, StatusTag, IsoBlock, EmptyState, ListRow, PillButton } from '../../components/ui';

export default function PropertySpacesScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const propertyId: string = route.params?.propertyId;

  const [property, setProperty] = useState<ApiProperty | null>(null);
  const [spaces, setSpaces] = useState<ApiSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [menuSpace, setMenuSpace] = useState<ApiSpace | null>(null);
  const [errorText, setErrorText] = useState('');
  const insets = useSafeAreaInsets();

  const loadData = useCallback(async () => {
    try {
      const { property, spaces } = await listingService.listSpacesByProperty(propertyId);
      setProperty(property);
      setSpaces(spaces);
      setErrorText('');
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.code === 'NOT_FOUND') {
          setErrorText('This property was deleted.');
        } else {
          setErrorText(err.message || 'Failed to load spaces.');
        }
      } else {
        setErrorText('Unable to connect.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [propertyId]);

  // Reload when screen gains focus (e.g., after wizard creates a space)
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleTogglePause = async (space: ApiSpace) => {
    setMenuSpace(null);
    try {
      const updated = await listingService.updateSpace(space.id, {
        isAvailable: !space.isAvailable,
      });
      setSpaces((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (err) {
      AppAlert.alert('Error', err instanceof ApiRequestError ? err.message : 'Failed to update.');
    }
  };

  const handleDelete = (space: ApiSpace) => {
    setMenuSpace(null);
    AppAlert.alert(
      'Delete space?',
      `Space ${space.spaceNumber} will be removed. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await listingService.deleteSpace(space.id);
              setSpaces((prev) => prev.filter((s) => s.id !== space.id));
            } catch (err) {
              if (err instanceof ApiRequestError && err.code === 'BIZ_CONFLICT') {
                AppAlert.alert(
                  "Can't delete",
                  'This space has active bookings. Cancel or complete them first.',
                );
              } else {
                AppAlert.alert('Error', err instanceof ApiRequestError ? err.message : 'Failed to delete.');
              }
            }
          },
        },
      ],
    );
  };

  const renderSpace = ({ item, index }: { item: ApiSpace; index: number }) => {
    const statusLabel = item.isAvailable ? 'Active' : 'Paused';
    const tone = index % 2 === 0 ? 'peach' : 'blue';
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        style={[
          styles.card,
          { backgroundColor: tone === 'peach' ? palette.peachSoft : palette.blueSoft },
        ]}
        onPress={() => navigation.navigate('ListingDetails', { spaceId: item.id })}
      >
        <View style={styles.cardArt} pointerEvents="none">
          <IsoBlock size={140} tone={tone} />
        </View>
        <View style={styles.cardTop}>
          <View style={styles.tagRow}>
            <StatusTag label={statusLabel} tone={item.isAvailable ? 'ink' : 'warning'} />
            {item.hasEvCharging ? (
              <StatusTag label="EV charging" tone="success" style={styles.tagGap} />
            ) : null}
          </View>
          <TouchableOpacity
            onPress={() => setMenuSpace(item)}
            style={styles.menuBtn}
            hitSlop={8}
            activeOpacity={0.7}
          >
            <Ionicons name="ellipsis-horizontal" size={17} color={palette.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.spaceNum}>Space {item.spaceNumber}</Text>
          <Text style={styles.spaceType}>{item.spaceType}</Text>
          <View style={styles.metaRow}>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>₹{item.pricePerHour}</Text>
              <Text style={styles.metricLabel}>Hourly</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>
                {item.lengthMeters}×{item.widthMeters}m
              </Text>
              <Text style={styles.metricLabel}>Dimensions</Text>
            </View>
            <View style={styles.metric}>
              <Text style={[styles.metricValue, styles.capitalize]} numberOfLines={1}>
                {item.bookingMode}
              </Text>
              <Text style={styles.metricLabel}>Booking</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.bg} />
      <ScreenHeader title="Spaces" onBack={() => navigation.goBack()} />

      <View style={styles.intro}>
        <Text style={styles.propertyName} numberOfLines={1}>{property?.propertyName || 'Property'}</Text>
        <Text style={styles.propertyAddress} numberOfLines={1}>
          {property?.address}, {property?.city}
        </Text>
        <Text style={styles.count}>
          {spaces.length} space{spaces.length === 1 ? '' : 's'}
        </Text>
      </View>

      {errorText ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={palette.danger} />
          <Text style={styles.errorText}>{errorText}</Text>
        </View>
      ) : null}

      <FlatList
        data={spaces}
        keyExtractor={(s) => s.id}
        renderItem={renderSpace}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.ink} />
        }
        ListEmptyComponent={
          <EmptyState
            title="No spaces yet"
            subtitle="Add your first parking space to start receiving bookings."
          />
        }
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <PillButton
          label="Add space"
          icon="plus"
          variant="ink"
          onPress={() => navigation.navigate('SpaceWizard', { propertyId })}
        />
      </View>

      {/* Menu sheet */}
      {menuSpace ? (
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setMenuSpace(null)}
          />
          <View style={[styles.menuSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.grabber} />
            <Text style={styles.menuTitle}>Space {menuSpace?.spaceNumber}</Text>
            <ListRow
              icon="eye"
              title="View details"
              onPress={() => {
                setMenuSpace(null);
                navigation.navigate('ListingDetails', { spaceId: menuSpace!.id });
              }}
            />
            <ListRow
              icon="edit-2"
              title="Edit"
              onPress={() => {
                const space = menuSpace!;
                setMenuSpace(null);
                navigation.navigate('SpaceWizard', { propertyId, editSpaceId: space.id });
              }}
            />
            <ListRow
              icon={menuSpace?.isAvailable ? 'pause' : 'play'}
              title={menuSpace?.isAvailable ? 'Pause' : 'Resume'}
              onPress={() => handleTogglePause(menuSpace!)}
            />
            <ListRow
              icon="trash-2"
              title="Delete"
              danger
              isLast
              onPress={() => handleDelete(menuSpace!)}
            />
            <PillButton
              label="Cancel"
              variant="grey"
              onPress={() => setMenuSpace(null)}
              style={styles.menuCancel}
            />
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  intro: { paddingHorizontal: 20, paddingBottom: 14 },
  propertyName: { ...fonts.semibold, fontSize: 28, letterSpacing: -0.7, color: palette.text },
  propertyAddress: { ...fonts.medium, fontSize: 14, color: palette.textMuted, marginTop: 3 },
  count: { ...fonts.semibold, fontSize: 13, color: palette.text, marginTop: 8 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.lg,
    backgroundColor: palette.dangerSoft,
  },
  errorText: { ...fonts.medium, color: palette.danger, fontSize: 13, marginLeft: 8, flex: 1 },
  list: { paddingHorizontal: 16, flexGrow: 1 },
  card: {
    borderRadius: radii.xl,
    padding: 18,
    marginBottom: 12,
    minHeight: 160,
    overflow: 'hidden',
  },
  cardArt: { position: 'absolute', right: -30, bottom: -26 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tagRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  tagGap: { marginLeft: 6 },
  menuBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { width: '70%' },
  spaceNum: {
    ...fonts.bold,
    fontSize: 22,
    letterSpacing: -0.5,
    color: palette.text,
    marginTop: 12,
  },
  spaceType: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  metaRow: { flexDirection: 'row', marginTop: 14 },
  metric: { flex: 1, paddingRight: 6 },
  metricValue: { ...fonts.semibold, fontSize: 13.5, color: palette.text },
  metricLabel: { ...fonts.medium, fontSize: 12, color: palette.textMuted, marginTop: 2 },
  capitalize: { textTransform: 'capitalize' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: palette.bg,
  },
  modalOverlay: {
    // Absolutely positioned rather than flex:1 — no longer inside a
    // <Modal>, which does not present on this build.
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
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
  menuTitle: {
    ...fonts.semibold,
    fontSize: 20,
    letterSpacing: -0.3,
    color: palette.text,
    marginBottom: 6,
  },
  menuCancel: { marginTop: 12 },
});
