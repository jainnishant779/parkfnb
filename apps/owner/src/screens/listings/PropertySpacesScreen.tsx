import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator,
  RefreshControl, Modal, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppAlert } from '../../components/common/AppAlert';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { listingService } from '../../services/listingService';
import { ApiRequestError } from '../../services/api';
import type { ApiProperty, ApiSpace } from '../../types/api';

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

  const renderSpace = ({ item }: { item: ApiSpace }) => {
    const statusColor = item.isAvailable ? '#059669' : '#D97706';
    const statusLabel = item.isAvailable ? 'Active' : 'Paused';
    return (
      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate('ListingDetails', { spaceId: item.id })}
      >
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.spaceNum}>Space {item.spaceNumber}</Text>
            <Text style={styles.spaceType}>{item.spaceType}</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: statusColor + '20' }]}>
            <View style={[styles.dot, { backgroundColor: statusColor }]} />
            <Text style={[styles.pillText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          <Pressable onPress={() => setMenuSpace(item)} style={styles.menuBtn} hitSlop={8}>
            <Ionicons name="ellipsis-vertical" size={18} color="#6B7280" />
          </Pressable>
        </View>
        <View style={styles.cardBody}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Hourly</Text>
            <Text style={styles.metricValue}>₹{item.pricePerHour}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Dimensions</Text>
            <Text style={styles.metricValue}>
              {item.lengthMeters}×{item.widthMeters}m
            </Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Booking</Text>
            <Text style={styles.metricValue}>{item.bookingMode}</Text>
          </View>
        </View>
        {item.hasEvCharging && (
          <View style={styles.evBadge}>
            <Ionicons name="flash" size={12} color="#059669" />
            <Text style={styles.evText}>EV charging</Text>
          </View>
        )}
      </Pressable>
    );
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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color="#1F2937" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.propertyName} numberOfLines={1}>{property?.propertyName || 'Property'}</Text>
          <Text style={styles.propertyAddress} numberOfLines={1}>
            {property?.address}, {property?.city}
          </Text>
        </View>
      </View>

      {errorText ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorText}</Text>
        </View>
      ) : null}

      <FlatList
        data={spaces}
        keyExtractor={(s) => s.id}
        renderItem={renderSpace}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="car-outline" size={48} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No spaces yet</Text>
            <Text style={styles.emptySub}>Add your first parking space to start receiving bookings.</Text>
          </View>
        }
      />

      <Pressable
        style={styles.fab}
        onPress={() => navigation.navigate('SpaceWizard', { propertyId })}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </Pressable>

      {/* Menu modal */}
      {!!menuSpace ? (

        <Pressable style={styles.modalOverlay} onPress={() => setMenuSpace(null)}>
          <View style={styles.menuSheet}>
            <Text style={styles.menuTitle}>Space {menuSpace?.spaceNumber}</Text>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuSpace(null);
                navigation.navigate('ListingDetails', { spaceId: menuSpace!.id });
              }}
            >
              <Ionicons name="eye-outline" size={20} color="#1F2937" />
              <Text style={styles.menuItemText}>View details</Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                const space = menuSpace!;
                setMenuSpace(null);
                navigation.navigate('SpaceWizard', { propertyId, editSpaceId: space.id });
              }}
            >
              <Ionicons name="create-outline" size={20} color="#1F2937" />
              <Text style={styles.menuItemText}>Edit</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={() => handleTogglePause(menuSpace!)}>
              <Ionicons
                name={menuSpace?.isAvailable ? 'pause-outline' : 'play-outline'}
                size={20}
                color="#1F2937"
              />
              <Text style={styles.menuItemText}>
                {menuSpace?.isAvailable ? 'Pause' : 'Resume'}
              </Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={() => handleDelete(menuSpace!)}>
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
              <Text style={[styles.menuItemText, { color: '#EF4444' }]}>Delete</Text>
            </Pressable>
          </View>
        </Pressable>
      
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  propertyName: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
  propertyAddress: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  errorBanner: { padding: 10, backgroundColor: '#FEE2E2' },
  errorText: { color: '#991B1B', fontSize: 13, textAlign: 'center' },
  list: { padding: 12, paddingBottom: 80 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  spaceNum: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
  spaceType: { fontSize: 12, color: '#6B7280', marginTop: 2, textTransform: 'capitalize' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  pillText: { fontSize: 11, fontWeight: '600' },
  menuBtn: { padding: 6 },
  cardBody: { flexDirection: 'row', gap: 16 },
  metric: { flex: 1 },
  metricLabel: { fontSize: 11, color: '#6B7280' },
  metricValue: { fontSize: 14, fontWeight: '600', color: '#1F2937', marginTop: 2 },
  evBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#D1FAE5',
    marginTop: 10,
  },
  evText: { color: '#059669', fontSize: 11, marginLeft: 4, fontWeight: '500' },
  empty: { paddingVertical: 60, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#1F2937', marginTop: 12 },
  emptySub: { fontSize: 13, color: '#6B7280', marginTop: 4, textAlign: 'center', paddingHorizontal: 40 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0D7377',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  modalOverlay: {
    // Absolutely positioned rather than flex:1 — no longer inside a
    // <Modal>, which does not present on this build.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 24,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 14,
  },
  menuItemText: { fontSize: 16, color: '#1F2937', marginLeft: 4 },
});
