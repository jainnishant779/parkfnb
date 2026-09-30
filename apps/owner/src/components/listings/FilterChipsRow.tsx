import React, { memo, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../theme/colors';
import { palette, radii, fonts } from '../../theme/kit';
import type { VehicleType, ListingSortOption } from '../../types/models';

// Vehicle type configuration
const VEHICLE_TYPE_CONFIG: Record<VehicleType, { label: string; icon: string }> = {
  CAR: { label: 'Car', icon: 'car-outline' },
  BIKE: { label: 'Bike', icon: 'bicycle-outline' },
  TRUCK: { label: 'Truck', icon: 'bus-outline' },
  VAN: { label: 'Van', icon: 'car-sport-outline' },
};

// Sort options configuration
const SORT_OPTIONS: { value: ListingSortOption; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'earnings', label: 'Top Earnings' },
  { value: 'price_high', label: 'Price: High' },
  { value: 'price_low', label: 'Price: Low' },
];

export interface FilterChipsRowProps {
  selectedVehicleTypes: VehicleType[];
  sortOption: ListingSortOption;
  onVehicleTypeToggle: (type: VehicleType) => void;
  onSortChange: (option: ListingSortOption) => void;
  onClearFilters: () => void;
}

// Individual chip component
interface ChipProps {
  label: string;
  icon?: string;
  isSelected: boolean;
  onPress: () => void;
}

const Chip = memo(({ label, icon, isSelected, onPress }: ChipProps) => {
  const theme = useMemo(() => getTheme(false), []);
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.95, { damping: 15, stiffness: 200 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 200 });
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          styles.chip,
          { backgroundColor: isSelected ? palette.ink : theme.surface },
        ]}
      >
        {icon && (
          <Ionicons
            name={icon}
            size={14}
            color={isSelected ? palette.textInverse : theme.text}
            style={styles.chipIcon}
          />
        )}
        <Text
          style={[
            styles.chipText,
            { color: isSelected ? palette.textInverse : theme.text },
          ]}
        >
          {label}
        </Text>
        {isSelected && (
          <Ionicons
            name="checkmark"
            size={14}
            color={palette.textInverse}
            style={styles.checkIcon}
          />
        )}
      </Pressable>
    </Animated.View>
  );
});

function FilterChipsRow({
  selectedVehicleTypes,
  sortOption,
  onVehicleTypeToggle,
  onSortChange,
  onClearFilters,
}: FilterChipsRowProps) {
  const theme = useMemo(() => getTheme(false), []);

  // Check if any filters are active
  const hasActiveFilters = selectedVehicleTypes.length > 0 || sortOption !== 'newest';

  // Vehicle type chips
  const vehicleTypes = Object.entries(VEHICLE_TYPE_CONFIG) as [VehicleType, { label: string; icon: string }][];

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Sort Dropdown Chip */}
        <View style={styles.sortContainer}>
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Sort</Text>
          <View style={styles.sortChips}>
            {SORT_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                isSelected={sortOption === option.value}
                onPress={() => onSortChange(option.value)}
              />
            ))}
          </View>
        </View>

        {/* Divider */}
        <View style={[styles.verticalDivider, { backgroundColor: theme.border }]} />

        {/* Vehicle Type Filter */}
        <View style={styles.filterContainer}>
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Vehicle</Text>
          <View style={styles.filterChips}>
            {vehicleTypes.map(([type, config]) => (
              <Chip
                key={type}
                label={config.label}
                icon={config.icon}
                isSelected={selectedVehicleTypes.includes(type)}
                onPress={() => onVehicleTypeToggle(type)}
              />
            ))}
          </View>
        </View>

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <Pressable
            onPress={onClearFilters}
            style={[styles.clearButton, { backgroundColor: palette.dangerSoft }]}
          >
            <Ionicons name="close-circle-outline" size={16} color={theme.danger} />
            <Text style={[styles.clearText, { color: theme.danger }]}>Clear</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  scrollContent: {
    paddingHorizontal: 16,
    alignItems: 'flex-start',
  },
  sortContainer: {
    marginRight: 12,
  },
  filterContainer: {
    marginLeft: 12,
  },
  sectionLabel: {
    ...fonts.semibold,
    fontSize: 12,
    marginBottom: 8,
    marginLeft: 4,
  },
  sortChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 40,
    borderRadius: radii.pill,
  },
  chipIcon: {
    marginRight: 6,
  },
  chipText: {
    ...fonts.semibold,
    fontSize: 14,
  },
  checkIcon: {
    marginLeft: 6,
  },
  verticalDivider: {
    width: 1,
    height: 48,
    alignSelf: 'center',
    marginHorizontal: 8,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 40,
    borderRadius: radii.pill,
    marginLeft: 12,
    alignSelf: 'flex-end',
  },
  clearText: {
    ...fonts.semibold,
    fontSize: 14,
    marginLeft: 4,
  },
});

export default memo(FilterChipsRow);
