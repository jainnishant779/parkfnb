// ============================================================================
// COMPLIANCE FILTER CHIPS - Filter Selection Component
// ============================================================================

import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { spacing, borderRadius } from '../../../theme/spacing';
import { fontSize, fontWeight } from '../../../theme/typography';
import type {
  StatusFilter,
  VehicleType,
  SlotTier,
  ComplianceFilters,
} from '../../../types/compliance';
import {
  VEHICLE_TYPE_LABELS,
  SLOT_TIER_LABELS,
} from '../../../types/compliance';

// ============================================================================
// TYPES
// ============================================================================

interface ComplianceFilterChipsProps {
  filters: ComplianceFilters;
  onFiltersChange: (filters: ComplianceFilters) => void;
  testID?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'missing', label: 'Missing' },
  { key: 'expiring', label: 'Expiring' },
  { key: 'pending', label: 'Pending' },
  { key: 'compliant', label: 'Compliant' },
];

const VEHICLE_OPTIONS: VehicleType[] = ['truck', 'trailer', 'van'];
const SLOT_OPTIONS: SlotTier[] = ['S', 'M', 'L'];

// ============================================================================
// FILTER CHIP COMPONENT
// ============================================================================

interface FilterChipProps {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
}

const FilterChip = memo(function FilterChip({
  label,
  isSelected,
  onPress,
  variant = 'primary',
}: FilterChipProps) {
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        isSelected && (isPrimary ? styles.chipSelectedPrimary : styles.chipSelectedSecondary),
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={`Filter: ${label}`}
    >
      <Text
        style={[
          styles.chipText,
          isSelected && (isPrimary ? styles.chipTextSelectedPrimary : styles.chipTextSelectedSecondary),
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
});

// ============================================================================
// ACTIVE FILTERS ROW
// ============================================================================

interface ActiveFiltersRowProps {
  filters: ComplianceFilters;
  onClearAll: () => void;
  onRemoveVehicle: (type: VehicleType) => void;
  onRemoveSlot: (tier: SlotTier) => void;
}

const ActiveFiltersRow = memo(function ActiveFiltersRow({
  filters,
  onClearAll,
  onRemoveVehicle,
  onRemoveSlot,
}: ActiveFiltersRowProps) {
  const hasActiveFilters =
    filters.status !== 'all' ||
    filters.vehicleTypes.length > 0 ||
    filters.slotTiers.length > 0 ||
    filters.searchQuery.length > 0;

  if (!hasActiveFilters) return null;

  return (
    <View style={styles.activeRow}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.activeScrollContent}
      >
        {filters.status !== 'all' && (
          <View style={styles.activePill}>
            <Text style={styles.activePillText}>
              {STATUS_OPTIONS.find((s) => s.key === filters.status)?.label}
            </Text>
          </View>
        )}

        {filters.vehicleTypes.map((type) => (
          <Pressable
            key={type}
            style={styles.activePill}
            onPress={() => onRemoveVehicle(type)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${VEHICLE_TYPE_LABELS[type]} filter`}
          >
            <Text style={styles.activePillText}>{VEHICLE_TYPE_LABELS[type]}</Text>
            <Ionicons name="close" size={14} color="#64748B" style={styles.pillIcon} />
          </Pressable>
        ))}

        {filters.slotTiers.map((tier) => (
          <Pressable
            key={tier}
            style={styles.activePill}
            onPress={() => onRemoveSlot(tier)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${SLOT_TIER_LABELS[tier]} filter`}
          >
            <Text style={styles.activePillText}>{SLOT_TIER_LABELS[tier]}</Text>
            <Ionicons name="close" size={14} color="#64748B" style={styles.pillIcon} />
          </Pressable>
        ))}

        {filters.searchQuery.length > 0 && (
          <View style={styles.activePill}>
            <Text style={styles.activePillText} numberOfLines={1}>
              "{filters.searchQuery}"
            </Text>
          </View>
        )}
      </ScrollView>

      <Pressable
        onPress={onClearAll}
        style={styles.clearButton}
        accessibilityRole="button"
        accessibilityLabel="Clear all filters"
      >
        <Text style={styles.clearButtonText}>Clear all</Text>
      </Pressable>
    </View>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function ComplianceFilterChips({
  filters,
  onFiltersChange,
  testID,
}: ComplianceFilterChipsProps) {
  // Status filter handler
  const handleStatusSelect = useCallback(
    (status: StatusFilter) => {
      onFiltersChange({ ...filters, status });
    },
    [filters, onFiltersChange]
  );

  // Vehicle type toggle handler
  const handleVehicleToggle = useCallback(
    (type: VehicleType) => {
      const current = filters.vehicleTypes;
      const updated = current.includes(type)
        ? current.filter((t) => t !== type)
        : [...current, type];
      onFiltersChange({ ...filters, vehicleTypes: updated });
    },
    [filters, onFiltersChange]
  );

  // Slot tier toggle handler
  const handleSlotToggle = useCallback(
    (tier: SlotTier) => {
      const current = filters.slotTiers;
      const updated = current.includes(tier)
        ? current.filter((t) => t !== tier)
        : [...current, tier];
      onFiltersChange({ ...filters, slotTiers: updated });
    },
    [filters, onFiltersChange]
  );

  // Clear all filters
  const handleClearAll = useCallback(() => {
    onFiltersChange({
      status: 'all',
      vehicleTypes: [],
      slotTiers: [],
      searchQuery: '',
    });
  }, [onFiltersChange]);

  // Remove specific vehicle filter
  const handleRemoveVehicle = useCallback(
    (type: VehicleType) => {
      onFiltersChange({
        ...filters,
        vehicleTypes: filters.vehicleTypes.filter((t) => t !== type),
      });
    },
    [filters, onFiltersChange]
  );

  // Remove specific slot filter
  const handleRemoveSlot = useCallback(
    (tier: SlotTier) => {
      onFiltersChange({
        ...filters,
        slotTiers: filters.slotTiers.filter((t) => t !== tier),
      });
    },
    [filters, onFiltersChange]
  );

  return (
    <View style={styles.container} testID={testID}>
      {/* Status filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {STATUS_OPTIONS.map((option) => (
          <FilterChip
            key={option.key}
            label={option.label}
            isSelected={filters.status === option.key}
            onPress={() => handleStatusSelect(option.key)}
            variant="primary"
          />
        ))}
      </ScrollView>

      {/* Secondary filters row */}
      <View style={styles.secondaryRow}>
        <Text style={styles.secondaryLabel}>Vehicle:</Text>
        {VEHICLE_OPTIONS.map((type) => (
          <FilterChip
            key={type}
            label={VEHICLE_TYPE_LABELS[type]}
            isSelected={filters.vehicleTypes.includes(type)}
            onPress={() => handleVehicleToggle(type)}
            variant="secondary"
          />
        ))}

        <View style={styles.divider} />

        <Text style={styles.secondaryLabel}>Size:</Text>
        {SLOT_OPTIONS.map((tier) => (
          <FilterChip
            key={tier}
            label={tier}
            isSelected={filters.slotTiers.includes(tier)}
            onPress={() => handleSlotToggle(tier)}
            variant="secondary"
          />
        ))}
      </View>

      {/* Active filters */}
      <ActiveFiltersRow
        filters={filters}
        onClearAll={handleClearAll}
        onRemoveVehicle={handleRemoveVehicle}
        onRemoveSlot={handleRemoveSlot}
      />
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing[3],
  },
  scrollContent: {
    paddingHorizontal: spacing[4],
    gap: spacing[2],
  },
  chip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    backgroundColor: '#F1F5F9',
    minHeight: 36,
    justifyContent: 'center',
  },
  chipSelectedPrimary: {
    backgroundColor: '#0D7377',
  },
  chipSelectedSecondary: {
    backgroundColor: '#E0E7FF',
    borderWidth: 1,
    borderColor: '#0D7377',
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: '#64748B',
  },
  chipTextSelectedPrimary: {
    color: '#FFFFFF',
  },
  chipTextSelectedSecondary: {
    color: '#0D7377',
  },
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    marginTop: spacing[2],
    flexWrap: 'wrap',
    gap: spacing[1],
  },
  secondaryLabel: {
    fontSize: fontSize.xs,
    color: '#94A3B8',
    marginRight: spacing[1],
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: '#E2E8F0',
    marginHorizontal: spacing[2],
  },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    marginTop: spacing[3],
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  activeScrollContent: {
    gap: spacing[2],
    paddingRight: spacing[2],
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.sm,
    backgroundColor: '#F1F5F9',
  },
  activePillText: {
    fontSize: fontSize.xs,
    color: '#64748B',
    maxWidth: 100,
  },
  pillIcon: {
    marginLeft: 4,
  },
  clearButton: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    marginLeft: 'auto',
  },
  clearButtonText: {
    fontSize: fontSize.xs,
    color: '#0D7377',
    fontWeight: fontWeight.medium as any,
  },
});

export default memo(ComplianceFilterChips);
