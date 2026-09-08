import React, { memo, useMemo, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { getTheme } from '../../../theme/colors';
import { spacing, borderRadius } from '../../../theme/spacing';

// Animated skeleton pulse component
const SkeletonPulse = memo(({ style }: { style?: any }) => {
  const theme = useMemo(() => getTheme(false), []);
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1200 }),
      -1,
      true
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.4, 0.8]),
  }));

  return (
    <Animated.View
      style={[
        { backgroundColor: theme.border },
        style,
        animatedStyle,
      ]}
    />
  );
});

// Single booking card skeleton
export const BookingCardSkeleton = memo(() => {
  const theme = useMemo(() => getTheme(false), []);

  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <SkeletonPulse style={styles.statusBadge} />
        <View style={styles.priceContainer}>
          <SkeletonPulse style={styles.priceSkeleton} />
          <SkeletonPulse style={styles.priceLabelSkeleton} />
        </View>
      </View>

      {/* Listing Name */}
      <SkeletonPulse style={styles.listingNameSkeleton} />

      {/* Address */}
      <SkeletonPulse style={styles.addressSkeleton} />

      {/* Time Row */}
      <View style={[styles.timeRow, { backgroundColor: theme.borderLight }]}>
        <View style={styles.timeBlock}>
          <SkeletonPulse style={styles.timeLabelSkeleton} />
          <SkeletonPulse style={styles.timeValueSkeleton} />
          <SkeletonPulse style={styles.dateSkeleton} />
        </View>
        <SkeletonPulse style={styles.durationSkeleton} />
        <View style={styles.timeBlock}>
          <SkeletonPulse style={styles.timeLabelSkeleton} />
          <SkeletonPulse style={styles.timeValueSkeleton} />
          <SkeletonPulse style={styles.dateSkeleton} />
        </View>
      </View>

      {/* Info Row */}
      <View style={styles.infoRow}>
        <SkeletonPulse style={styles.infoSkeleton} />
        <SkeletonPulse style={styles.infoSkeleton} />
      </View>

      {/* Action Row */}
      <View style={styles.actionRow}>
        <SkeletonPulse style={styles.actionButtonSkeleton} />
        <SkeletonPulse style={styles.actionButtonSkeleton} />
      </View>
    </View>
  );
});

// Tabs skeleton
export const TabsSkeleton = memo(() => {
  const theme = useMemo(() => getTheme(false), []);

  return (
    <View style={[styles.tabsContainer, { backgroundColor: theme.surface }]}>
      {[1, 2, 3, 4].map((i) => (
        <SkeletonPulse key={i} style={styles.tabSkeleton} />
      ))}
    </View>
  );
});

// Search bar skeleton
export const SearchBarSkeleton = memo(() => {
  const theme = useMemo(() => getTheme(false), []);

  return (
    <View style={[styles.searchContainer, { backgroundColor: theme.surface }]}>
      <SkeletonPulse style={styles.searchBar} />
    </View>
  );
});

// Filter chips skeleton
export const FilterChipsSkeleton = memo(() => {
  return (
    <View style={styles.chipsContainer}>
      {[1, 2, 3, 4].map((i) => (
        <SkeletonPulse key={i} style={styles.chipSkeleton} />
      ))}
    </View>
  );
});

// Full bookings screen skeleton
export interface BookingsSkeletonProps {
  count?: number;
  showTabs?: boolean;
  showSearch?: boolean;
  showFilters?: boolean;
}

function BookingsSkeleton({
  count = 4,
  showTabs = true,
  showSearch = true,
  showFilters = true,
}: BookingsSkeletonProps) {
  return (
    <View style={styles.container}>
      {showSearch && <SearchBarSkeleton />}
      {showFilters && <FilterChipsSkeleton />}
      {showTabs && <TabsSkeleton />}
      {Array.from({ length: count }).map((_, index) => (
        <BookingCardSkeleton key={index} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    borderRadius: borderRadius.xl,
    marginHorizontal: spacing[4],
    marginBottom: spacing[3],
    padding: spacing[4],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing[3],
  },
  statusBadge: {
    height: 24,
    width: 80,
    borderRadius: borderRadius.full,
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  priceSkeleton: {
    height: 20,
    width: 60,
    borderRadius: borderRadius.sm,
    marginBottom: spacing[1],
  },
  priceLabelSkeleton: {
    height: 12,
    width: 40,
    borderRadius: borderRadius.sm,
  },
  listingNameSkeleton: {
    height: 18,
    width: '80%',
    borderRadius: borderRadius.sm,
    marginBottom: spacing[2],
  },
  addressSkeleton: {
    height: 14,
    width: '65%',
    borderRadius: borderRadius.sm,
    marginBottom: spacing[3],
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing[3],
    borderRadius: borderRadius.lg,
    marginBottom: spacing[3],
  },
  timeBlock: {
    alignItems: 'center',
    flex: 1,
  },
  timeLabelSkeleton: {
    height: 10,
    width: 30,
    borderRadius: borderRadius.sm,
    marginBottom: spacing[1],
  },
  timeValueSkeleton: {
    height: 14,
    width: 50,
    borderRadius: borderRadius.sm,
    marginBottom: spacing[1],
  },
  dateSkeleton: {
    height: 10,
    width: 40,
    borderRadius: borderRadius.sm,
  },
  durationSkeleton: {
    height: 24,
    width: 40,
    borderRadius: borderRadius.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing[3],
  },
  infoSkeleton: {
    height: 14,
    width: 100,
    borderRadius: borderRadius.sm,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing[2],
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
  },
  actionButtonSkeleton: {
    height: 36,
    width: 100,
    borderRadius: borderRadius.lg,
  },
  // Tabs styles
  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: spacing[4],
    marginBottom: spacing[3],
    padding: spacing[1],
    borderRadius: borderRadius.lg,
    gap: spacing[1],
  },
  tabSkeleton: {
    flex: 1,
    height: 40,
    borderRadius: borderRadius.md,
  },
  // Search styles
  searchContainer: {
    marginHorizontal: spacing[4],
    marginBottom: spacing[3],
  },
  searchBar: {
    height: 44,
    borderRadius: borderRadius.lg,
  },
  // Filter chips styles
  chipsContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing[4],
    marginBottom: spacing[3],
    gap: spacing[2],
  },
  chipSkeleton: {
    height: 32,
    width: 70,
    borderRadius: borderRadius.full,
  },
});

export default memo(BookingsSkeleton);
