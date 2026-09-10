import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeIn,
} from 'react-native-reanimated';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import AppHeader from '../../components/headers/AppHeader';

// Mock fleet data
const MOCK_FLEET = [
  {
    id: '1',
    name: 'Truck 101',
    type: 'Heavy Truck',
    licensePlate: 'ABC-1234',
    driver: 'John Smith',
    status: 'active',
    fuelLevel: 75,
    mileage: 45230,
  },
  {
    id: '2',
    name: 'Van 202',
    type: 'Delivery Van',
    licensePlate: 'XYZ-5678',
    driver: 'Sarah Johnson',
    status: 'maintenance',
    fuelLevel: 30,
    mileage: 32100,
  },
  {
    id: '3',
    name: 'Truck 103',
    type: 'Medium Truck',
    licensePlate: 'DEF-9012',
    driver: 'Mike Brown',
    status: 'active',
    fuelLevel: 90,
    mileage: 28500,
  },
  {
    id: '4',
    name: 'Forklift 01',
    type: 'Forklift',
    licensePlate: 'N/A',
    driver: 'Unassigned',
    status: 'inactive',
    fuelLevel: 100,
    mileage: 1200,
  },
];

interface FleetVehicle {
  id: string;
  name: string;
  type: string;
  licensePlate: string;
  driver: string;
  status: 'active' | 'maintenance' | 'inactive';
  fuelLevel: number;
  mileage: number;
}

interface FleetCardProps {
  vehicle: FleetVehicle;
  theme: ReturnType<typeof getTheme>;
}

function FleetCard({ vehicle, theme }: FleetCardProps) {
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.98, { damping: 15, stiffness: 200 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 200 });
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const getStatusColor = () => {
    switch (vehicle.status) {
      case 'active':
        return theme.success;
      case 'maintenance':
        return theme.warning;
      default:
        return theme.textMuted;
    }
  };

  const getStatusLabel = () => {
    switch (vehicle.status) {
      case 'active':
        return 'Active';
      case 'maintenance':
        return 'Maintenance';
      default:
        return 'Inactive';
    }
  };

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityLabel={`Fleet vehicle ${vehicle.name}`}
      accessibilityRole="button"
    >
      <Animated.View
        entering={FadeIn.duration(200)}
        style={[styles.fleetCard, { backgroundColor: theme.surface }, animatedStyle]}
      >
        <View style={styles.fleetCardHeader}>
          <View style={[styles.iconContainer, { backgroundColor: theme.primaryLight }]}>
            <MaterialCommunityIcons name="truck" size={24} color={theme.primary} />
          </View>
          <View style={styles.fleetCardHeaderContent}>
            <Text style={[styles.vehicleName, { color: theme.text }]}>{vehicle.name}</Text>
            <Text style={[styles.vehicleType, { color: theme.textMuted }]}>{vehicle.type}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor() + '20' }]}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
            <Text style={[styles.statusText, { color: getStatusColor() }]}>
              {getStatusLabel()}
            </Text>
          </View>
        </View>

        <View style={styles.fleetCardDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="card-outline" size={16} color={theme.textMuted} />
            <Text style={[styles.detailLabel, { color: theme.textMuted }]}>License:</Text>
            <Text style={[styles.detailValue, { color: theme.text }]}>{vehicle.licensePlate}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="person-outline" size={16} color={theme.textMuted} />
            <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Driver:</Text>
            <Text style={[styles.detailValue, { color: theme.text }]}>{vehicle.driver}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="speedometer-outline" size={16} color={theme.textMuted} />
            <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Mileage:</Text>
            <Text style={[styles.detailValue, { color: theme.text }]}>
              {vehicle.mileage.toLocaleString()} km
            </Text>
          </View>
        </View>

        {/* Fuel Level */}
        <View style={styles.fuelContainer}>
          <View style={styles.fuelHeader}>
            <Ionicons name="water-outline" size={16} color={theme.textMuted} />
            <Text style={[styles.fuelLabel, { color: theme.textMuted }]}>Fuel Level</Text>
            <Text style={[styles.fuelPercent, { color: theme.text }]}>{vehicle.fuelLevel}%</Text>
          </View>
          <View style={[styles.fuelBar, { backgroundColor: theme.borderLight }]}>
            <View
              style={[
                styles.fuelFill,
                {
                  width: `${vehicle.fuelLevel}%`,
                  backgroundColor:
                    vehicle.fuelLevel > 50
                      ? theme.success
                      : vehicle.fuelLevel > 25
                      ? theme.warning
                      : theme.danger,
                },
              ]}
            />
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default function FleetManagementScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const theme = useMemo(() => getTheme(false), []);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  // TODO: replace MOCK_FLEET with fleet data fetched from API
  const filteredFleet = useMemo<FleetVehicle[]>(() => {
    // return MOCK_FLEET.filter(vehicle => {
    //   const matchesSearch = ...
    //   const matchesFilter = !filterStatus || vehicle.status === filterStatus;
    //   return matchesSearch && matchesFilter;
    // });
    return [];
  }, [searchQuery, filterStatus]);

  const stats = useMemo(() => ({
    // total: MOCK_FLEET.length,
    // active: MOCK_FLEET.filter(v => v.status === 'active').length,
    // maintenance: MOCK_FLEET.filter(v => v.status === 'maintenance').length,
    // inactive: MOCK_FLEET.filter(v => v.status === 'inactive').length,
    total: 0,
    active: 0,
    maintenance: 0,
    inactive: 0,
  }), []);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <AppHeader
        variant="standard"
        title="Fleet Management"
        leftAction={{
          icon: 'back',
          label: 'Back',
          onPress: () => navigation.goBack(),
          showBackground: true,
        }}
        showDivider={false}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + spacing[6] },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.statValue, { color: theme.primary }]}>{stats.total}</Text>
            <Text style={[styles.statLabel, { color: theme.textMuted }]}>Total</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.statValue, { color: theme.success }]}>{stats.active}</Text>
            <Text style={[styles.statLabel, { color: theme.textMuted }]}>Active</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.statValue, { color: theme.warning }]}>{stats.maintenance}</Text>
            <Text style={[styles.statLabel, { color: theme.textMuted }]}>Service</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.statValue, { color: theme.textMuted }]}>{stats.inactive}</Text>
            <Text style={[styles.statLabel, { color: theme.textMuted }]}>Inactive</Text>
          </View>
        </View>

        {/* Search */}
        <View style={[styles.searchContainer, { backgroundColor: theme.surface }]}>
          <Ionicons name="search-outline" size={20} color={theme.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search vehicles, drivers..."
            placeholderTextColor={theme.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={theme.textMuted} />
            </Pressable>
          )}
        </View>

        {/* Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterContainer}
        >
          {['all', 'active', 'maintenance', 'inactive'].map(status => (
            <Pressable
              key={status}
              onPress={() => setFilterStatus(status === 'all' ? null : status)}
              style={[
                styles.filterChip,
                {
                  backgroundColor:
                    (status === 'all' && !filterStatus) || filterStatus === status
                      ? theme.primary
                      : theme.surface,
                  borderColor: theme.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  {
                    color:
                      (status === 'all' && !filterStatus) || filterStatus === status
                        ? '#FFFFFF'
                        : theme.textSecondary,
                  },
                ]}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Fleet List */}
        <View style={styles.fleetList}>
          {filteredFleet.map(vehicle => (
            <FleetCard key={vehicle.id} vehicle={vehicle} theme={theme} />
          ))}
        </View>

        {filteredFleet.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="truck-outline" size={48} color={theme.textMuted} />
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              No vehicles found
            </Text>
          </View>
        )}

        {/* Add Vehicle Button (Placeholder) */}
        <Pressable
          style={[styles.addButton, { backgroundColor: theme.primary }]}
          accessibilityLabel="Add new vehicle"
          accessibilityRole="button"
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Add Vehicle</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginBottom: spacing[4],
  },
  statCard: {
    flex: 1,
    padding: spacing[3],
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold as any,
  },
  statLabel: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.lg,
    gap: spacing[2],
    marginBottom: spacing[3],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    paddingVertical: spacing[2],
  },
  filterScroll: {
    marginBottom: spacing[4],
  },
  filterContainer: {
    gap: spacing[2],
  },
  filterChip: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  fleetList: {
    gap: spacing[3],
  },
  fleetCard: {
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  fleetCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fleetCardHeaderContent: {
    flex: 1,
    marginLeft: spacing[3],
  },
  vehicleName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  vehicleType: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
    gap: spacing[1],
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },
  fleetCardDetails: {
    gap: spacing[2],
    marginBottom: spacing[4],
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  detailLabel: {
    fontSize: fontSize.sm,
  },
  detailValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    flex: 1,
  },
  fuelContainer: {
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  fuelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[2],
  },
  fuelLabel: {
    fontSize: fontSize.sm,
    flex: 1,
  },
  fuelPercent: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
  },
  fuelBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fuelFill: {
    height: '100%',
    borderRadius: 3,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing[10],
    gap: spacing[3],
  },
  emptyText: {
    fontSize: fontSize.base,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[4],
    borderRadius: borderRadius.lg,
    gap: spacing[2],
    marginTop: spacing[4],
    minHeight: 56,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
});
