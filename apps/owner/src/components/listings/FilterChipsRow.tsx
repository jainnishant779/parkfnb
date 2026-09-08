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
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
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
          {
            backgroundColor: isSelected ? theme.primary : theme.surface,
            borderColor: isSelected ? theme.primary : theme.border,
          },
        ]}
      >
        {icon && (
          <Ionicons
            name={icon}
            size={14}
            color={isSelected ? '#FFFFFF' : theme.textSecondary}
            style={styles.chipIcon}
          />
        )}
        <Text
          style={[
            styles.chipText,
            { color: isSelected ? '#FFFFFF' : theme.textSecondary },
          ]}
        >
          {label}
        </Text>
        {isSelected && (
          <Ionicons
            name="checkmark"
            size={14}
            color="#FFFFFF"
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
            style={[styles.clearButton, { borderColor: theme.danger }]}
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
    paddingVertical: spacing[2],
  },
  scrollContent: {
    paddingHorizontal: spacing[4],
    alignItems: 'flex-start',
  },
  sortContainer: {
    marginRight: spacing[3],
  },
  filterContainer: {
    marginLeft: spacing[3],
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
    marginBottom: spacing[2],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sortChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  chipIcon: {
    marginRight: spacing[1],
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  checkIcon: {
    marginLeft: spacing[1],
  },
  verticalDivider: {
    width: 1,
    height: 48,
    alignSelf: 'center',
    marginHorizontal: spacing[2],
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    borderWidth: 1,
    marginLeft: spacing[3],
    alignSelf: 'center',
  },
  clearText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    marginLeft: spacing[1],
  },
});

export default memo(FilterChipsRow);
