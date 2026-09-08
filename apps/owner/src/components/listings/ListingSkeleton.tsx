import React, { memo, useMemo, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';

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

// Single listing card skeleton
export const ListingCardSkeleton = memo(() => {
  const theme = useMemo(() => getTheme(false), []);

  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      {/* Top Row */}
      <View style={styles.topRow}>
        {/* Thumbnail */}
        <SkeletonPulse style={styles.thumbnail} />

        {/* Info */}
        <View style={styles.info}>
          <SkeletonPulse style={styles.titleSkeleton} />
          <SkeletonPulse style={styles.locationSkeleton} />
          <View style={styles.badgeRow}>
            <SkeletonPulse style={styles.badgeSkeleton} />
            <SkeletonPulse style={styles.timeSkeleton} />
          </View>
        </View>
      </View>

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: theme.borderLight }]} />

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <SkeletonPulse style={styles.statLabelSkeleton} />
          <SkeletonPulse style={styles.statValueSkeleton} />
        </View>
        <View style={styles.stat}>
          <SkeletonPulse style={styles.statLabelSkeleton} />
          <SkeletonPulse style={styles.statValueSkeleton} />
        </View>
        <View style={styles.stat}>
          <SkeletonPulse style={styles.statLabelSkeleton} />
          <SkeletonPulse style={styles.statValueSkeleton} />
        </View>
        <View style={styles.stat}>
          <SkeletonPulse style={styles.statLabelSkeleton} />
          <SkeletonPulse style={styles.statValueSkeleton} />
        </View>
      </View>

      {/* Bottom Row */}
      <View style={styles.bottomRow}>
        <View style={styles.vehicleRow}>
          <SkeletonPulse style={styles.vehicleChip} />
          <SkeletonPulse style={styles.vehicleChip} />
          <SkeletonPulse style={styles.capacitySkeleton} />
        </View>
        <SkeletonPulse style={styles.toggleSkeleton} />
      </View>
    </View>
  );
});

// KPI Summary skeleton
export const KpiSummarySkeleton = memo(() => {
  const theme = useMemo(() => getTheme(false), []);

  return (
    <View style={styles.kpiContainer}>
      {[1, 2, 3, 4].map((i) => (
        <View key={i} style={[styles.kpiCard, { backgroundColor: theme.surface }]}>
          <SkeletonPulse style={styles.kpiLabelSkeleton} />
          <SkeletonPulse style={styles.kpiValueSkeleton} />
        </View>
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

// Full listings screen skeleton
export interface ListingsSkeletonProps {
  count?: number;
  showKpi?: boolean;
  showSearch?: boolean;
}

function ListingsSkeleton({
  count = 4,
  showKpi = true,
  showSearch = true,
}: ListingsSkeletonProps) {
  return (
    <View style={styles.container}>
      {showSearch && <SearchBarSkeleton />}
      {showKpi && <KpiSummarySkeleton />}
      {Array.from({ length: count }).map((_, index) => (
        <ListingCardSkeleton key={index} />
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.lg,
    marginRight: spacing[3],
  },
  info: {
    flex: 1,
  },
  titleSkeleton: {
    height: 20,
    borderRadius: borderRadius.sm,
    width: '80%',
    marginBottom: spacing[2],
  },
  locationSkeleton: {
    height: 14,
    borderRadius: borderRadius.sm,
    width: '60%',
    marginBottom: spacing[2],
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeSkeleton: {
    height: 24,
    width: 64,
    borderRadius: borderRadius.full,
  },
  timeSkeleton: {
    height: 12,
    width: 40,
    borderRadius: borderRadius.sm,
    marginLeft: spacing[2],
  },
  divider: {
    height: 1,
    marginVertical: spacing[3],
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stat: {
    alignItems: 'center',
    minWidth: 60,
  },
  statLabelSkeleton: {
    height: 10,
    width: 40,
    borderRadius: borderRadius.sm,
    marginBottom: spacing[1],
  },
  statValueSkeleton: {
    height: 16,
    width: 50,
    borderRadius: borderRadius.sm,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing[3],
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vehicleChip: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.md,
    marginRight: spacing[1],
  },
  capacitySkeleton: {
    height: 12,
    width: 48,
    borderRadius: borderRadius.sm,
    marginLeft: spacing[1],
  },
  toggleSkeleton: {
    height: 24,
    width: 60,
    borderRadius: borderRadius.full,
  },
  // KPI styles
  kpiContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing[4],
    marginBottom: spacing[3],
    gap: spacing[2],
  },
  kpiCard: {
    flex: 1,
    padding: spacing[3],
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  kpiLabelSkeleton: {
    height: 10,
    width: 32,
    borderRadius: borderRadius.sm,
    marginBottom: spacing[2],
  },
  kpiValueSkeleton: {
    height: 20,
    width: 24,
    borderRadius: borderRadius.sm,
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
});

export default memo(ListingsSkeleton);
