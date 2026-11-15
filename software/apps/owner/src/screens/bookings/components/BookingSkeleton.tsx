import React, { memo, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { palette, radii } from '../../../theme/kit';

// Animated skeleton pulse component
const SkeletonPulse = memo(({ style }: { style?: any }) => {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1200 }),
      -1,
      true
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.45, 0.9]),
  }));

  return (
    <Animated.View
      style={[
        { backgroundColor: palette.bgSoft },
        style,
        animatedStyle,
      ]}
    />
  );
});

// Single booking card skeleton — mirrors the tracking-style card
export const BookingCardSkeleton = memo(() => {
  return (
    <View style={styles.card}>
      <View style={styles.cardBody}>
        <SkeletonPulse style={styles.statusBadge} />
        <SkeletonPulse style={styles.refSkeleton} />
        <SkeletonPulse style={styles.trackSkeleton} />
        <View style={styles.metaRow}>
          <View>
            <SkeletonPulse style={styles.metaTitle} />
            <SkeletonPulse style={styles.metaSub} />
          </View>
          <View style={styles.metaRight}>
            <SkeletonPulse style={styles.metaTitleShort} />
            <SkeletonPulse style={styles.metaSub} />
          </View>
        </View>
      </View>
      <SkeletonPulse style={styles.artSkeleton} />

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
  return (
    <View style={styles.tabsContainer}>
      {[1, 2, 3, 4].map((i) => (
        <SkeletonPulse key={i} style={styles.tabSkeleton} />
      ))}
    </View>
  );
});

// Search bar skeleton
export const SearchBarSkeleton = memo(() => {
  return (
    <View style={styles.searchContainer}>
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
      {showTabs && <TabsSkeleton />}
      {showFilters && <FilterChipsSkeleton />}
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
    borderRadius: radii.xl,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 18,
    backgroundColor: palette.surface,
    overflow: 'hidden',
  },
  cardBody: { width: '62%' },
  statusBadge: {
    height: 24,
    width: 76,
    borderRadius: radii.pill,
  },
  refSkeleton: {
    height: 26,
    width: '80%',
    borderRadius: radii.xs,
    marginTop: 12,
  },
  trackSkeleton: {
    height: 8,
    width: '100%',
    borderRadius: radii.pill,
    marginTop: 16,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  metaRight: { alignItems: 'flex-end' },
  metaTitle: { height: 13, width: 90, borderRadius: 6, marginBottom: 6 },
  metaTitleShort: { height: 13, width: 50, borderRadius: 6, marginBottom: 6 },
  metaSub: { height: 11, width: 60, borderRadius: 6 },
  artSkeleton: {
    position: 'absolute',
    right: 18,
    top: 44,
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  actionButtonSkeleton: {
    height: 40,
    width: 104,
    borderRadius: radii.pill,
  },
  // Tabs styles
  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 5,
    borderRadius: radii.pill,
    backgroundColor: palette.surface,
    gap: 4,
  },
  tabSkeleton: {
    flex: 1,
    height: 42,
    borderRadius: radii.pill,
  },
  // Search styles
  searchContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  searchBar: {
    height: 52,
    borderRadius: radii.pill,
  },
  // Filter chips styles
  chipsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 14,
    gap: 10,
  },
  chipSkeleton: {
    height: 42,
    width: 76,
    borderRadius: radii.pill,
  },
});

export default memo(BookingsSkeleton);
