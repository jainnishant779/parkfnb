import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  type TextStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Kit from '../../theme/kit';
import * as UI from '../../components/ui';

// The UI kit is plain JS; give it loose component types and typed font tokens.
const {
  T,
  Card,
  PillButton,
  SearchPill,
  ScreenHeader,
  StatusTag,
  InfoGrid,
  Chip,
  EmptyState,
  IsoBlock,
} = UI as unknown as Record<string, React.ComponentType<any>>;
const { palette, radii } = Kit;
const fonts = Kit.fonts as Record<keyof typeof Kit.fonts, TextStyle>;

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
}

function FleetCard({ vehicle }: FleetCardProps) {
  const getStatusTone = () => {
    switch (vehicle.status) {
      case 'active':
        return 'success';
      case 'maintenance':
        return 'warning';
      default:
        return 'grey';
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

  const fuelColor =
    vehicle.fuelLevel > 50
      ? palette.success
      : vehicle.fuelLevel > 25
      ? palette.warning
      : palette.danger;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      accessibilityLabel={`Fleet vehicle ${vehicle.name}`}
      accessibilityRole="button"
    >
      <Animated.View entering={FadeIn.duration(200)} style={styles.fleetCard}>
        <View style={styles.fleetCardHeader}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="truck-outline" size={22} color={palette.text} />
          </View>
          <View style={styles.fleetCardHeaderContent}>
            <Text style={styles.vehicleName} numberOfLines={1}>{vehicle.name}</Text>
            <Text style={styles.vehicleType} numberOfLines={1}>{vehicle.type}</Text>
          </View>
          <StatusTag label={getStatusLabel()} tone={getStatusTone()} />
        </View>

        <InfoGrid
          columns={3}
          items={[
            { label: 'License', value: vehicle.licensePlate },
            { label: 'Driver', value: vehicle.driver },
            { label: 'Mileage', value: `${vehicle.mileage.toLocaleString()} km` },
          ]}
          style={styles.detailsGrid}
        />

        {/* Fuel Level */}
        <View style={styles.fuelContainer}>
          <View style={styles.fuelHeader}>
            <Ionicons name="water-outline" size={15} color={palette.textMuted} />
            <Text style={styles.fuelLabel}>Fuel Level</Text>
            <Text style={styles.fuelPercent}>{vehicle.fuelLevel}%</Text>
          </View>
          <View style={styles.fuelBar}>
            <View
              style={[
                styles.fuelFill,
                { width: `${vehicle.fuelLevel}%`, backgroundColor: fuelColor },
              ]}
            />
          </View>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function FleetManagementScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

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
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Fleet Management" onBack={() => navigation.goBack()} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Stats hero */}
        <Card tone="peach" style={styles.hero}>
          <T variant="bodySmall" style={styles.heroLabel}>Vehicles in your fleet</T>
          <Text style={styles.heroValue}>{stats.total}</Text>
          <View style={styles.heroArt} pointerEvents="none">
            <IsoBlock size={140} tone="peach" />
          </View>
        </Card>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.active}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.maintenance}</Text>
            <Text style={styles.statLabel}>Service</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.inactive}</Text>
            <Text style={styles.statLabel}>Inactive</Text>
          </View>
        </View>

        {/* Search */}
        <SearchPill
          placeholder="Search vehicles, drivers..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.search}
          right={
            searchQuery.length > 0 ? (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={10}>
                <Ionicons name="close-circle" size={20} color={palette.textMuted} />
              </TouchableOpacity>
            ) : null
          }
        />

        {/* Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterContainer}
        >
          {['all', 'active', 'maintenance', 'inactive'].map(status => (
            <Chip
              key={status}
              label={status.charAt(0).toUpperCase() + status.slice(1)}
              selected={(status === 'all' && !filterStatus) || filterStatus === status}
              onPress={() => setFilterStatus(status === 'all' ? null : status)}
              style={styles.chip}
            />
          ))}
        </ScrollView>

        {/* Fleet List */}
        <View style={styles.fleetList}>
          {filteredFleet.map(vehicle => (
            <FleetCard key={vehicle.id} vehicle={vehicle} />
          ))}
        </View>

        {filteredFleet.length === 0 && (
          <Card padded={false}>
            <EmptyState title="No vehicles found" tone="grey" />
          </Card>
        )}

        {/* Add Vehicle Button (Placeholder) */}
        <PillButton
          label="Add Vehicle"
          icon="plus"
          variant="ink"
          style={styles.addButton}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },

  // Hero
  hero: {
    minHeight: 150,
    overflow: 'hidden',
  },
  heroLabel: {
    color: palette.inkSoft,
  },
  heroValue: {
    ...fonts.semibold,
    fontSize: 48,
    letterSpacing: -1.4,
    color: palette.text,
    marginTop: 4,
  },
  heroArt: {
    position: 'absolute',
    right: -30,
    bottom: -26,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  statCard: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: radii.lg,
    backgroundColor: palette.surface,
  },
  statValue: {
    ...fonts.semibold,
    fontSize: 28,
    letterSpacing: -1,
    color: palette.text,
  },
  statLabel: {
    ...fonts.medium,
    fontSize: 12.5,
    color: palette.textMuted,
    marginTop: 2,
  },

  // Search + filters
  search: {
    marginTop: 20,
    backgroundColor: palette.surface,
  },
  filterScroll: {
    marginTop: 12,
    marginHorizontal: -20,
  },
  filterContainer: {
    paddingHorizontal: 20,
    gap: 8,
  },
  chip: {
    backgroundColor: palette.surface,
  },

  // Fleet list
  fleetList: {
    gap: 12,
    marginTop: 16,
    marginBottom: 12,
  },
  fleetCard: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    padding: 18,
  },
  fleetCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: palette.fill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fleetCardHeaderContent: {
    flex: 1,
    marginHorizontal: 12,
  },
  vehicleName: {
    ...fonts.semibold,
    fontSize: 16,
    color: palette.text,
  },
  vehicleType: {
    ...fonts.medium,
    fontSize: 12.5,
    color: palette.textMuted,
    marginTop: 2,
  },
  detailsGrid: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.line,
  },
  fuelContainer: {
    marginTop: 4,
  },
  fuelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  fuelLabel: {
    ...fonts.medium,
    flex: 1,
    fontSize: 12.5,
    color: palette.textMuted,
  },
  fuelPercent: {
    ...fonts.semibold,
    fontSize: 13,
    color: palette.text,
  },
  fuelBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.fill,
    overflow: 'hidden',
  },
  fuelFill: {
    height: '100%',
    borderRadius: 4,
  },

  addButton: {
    marginTop: 16,
  },
});
