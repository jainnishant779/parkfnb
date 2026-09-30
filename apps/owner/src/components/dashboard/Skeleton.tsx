import React, { useEffect, memo } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { palette, radii } from '../../theme/kit';

// Shimmer animation duration
const SHIMMER_DURATION = 1200;

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: object;
}

// Base Skeleton component with shimmer animation
export const Skeleton = memo(function Skeleton({
  width = '100%',
  height = 16,
  borderRadius: radius = borderRadius.md,
  style,
}: SkeletonProps) {
  const shimmerProgress = useSharedValue(0);

  useEffect(() => {
    shimmerProgress.value = withRepeat(
      withTiming(1, { duration: SHIMMER_DURATION }),
      -1,
      false
    );
  }, [shimmerProgress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmerProgress.value, [0, 0.5, 1], [0.3, 0.6, 0.3]),
  }));

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: palette.fill,
        },
        animatedStyle,
        style,
      ]}
    />
  );
});

// KPI Card Skeleton
export const KpiCardSkeleton = memo(function KpiCardSkeleton() {
  // Force light mode
  const theme = getTheme(false);

  return (
    <View style={[styles.kpiCard, { backgroundColor: theme.surface }]}>
      <Skeleton width={36} height={36} borderRadius={18} />
      <Skeleton width={70} height={24} style={styles.kpiValue} />
      <Skeleton width={50} height={10} />
    </View>
  );
});

// Booking Row Skeleton
export const BookingRowSkeleton = memo(function BookingRowSkeleton() {
  // Force light mode
  const theme = getTheme(false);

  return (
    <View style={[styles.bookingRow, { borderBottomColor: theme.borderLight }]}>
      <Skeleton width={40} height={40} borderRadius={20} />
      <View style={styles.bookingContent}>
        <Skeleton width={120} height={14} />
        <Skeleton width={80} height={12} style={styles.mt4} />
      </View>
      <View style={styles.bookingRight}>
        <Skeleton width={50} height={14} />
        <Skeleton width={60} height={20} style={styles.mt4} />
      </View>
    </View>
  );
});

// Listing Row Skeleton
export const ListingRowSkeleton = memo(function ListingRowSkeleton() {
  // Force light mode
  const theme = getTheme(false);

  return (
    <View style={[styles.listingRow, { borderBottomColor: theme.borderLight }]}>
      <Skeleton width={58} height={58} borderRadius={radii.md} />
      <View style={styles.listingContent}>
        <Skeleton width={140} height={14} />
        <Skeleton width={100} height={12} style={styles.mt4} />
        <Skeleton width={80} height={12} style={styles.mt4} />
      </View>
      <Skeleton width={44} height={24} borderRadius={12} />
    </View>
  );
});

// Alert Row Skeleton
export const AlertRowSkeleton = memo(function AlertRowSkeleton() {
  // Force light mode
  const theme = getTheme(false);

  return (
    <View style={[styles.alertRow, { backgroundColor: theme.surface }]}>
      <Skeleton width={36} height={36} borderRadius={18} />
      <View style={styles.alertContent}>
        <Skeleton width={160} height={14} />
        <Skeleton width={200} height={12} style={styles.mt4} />
      </View>
      <Skeleton width={60} height={34} borderRadius={17} />
    </View>
  );
});

// Dashboard Section Skeleton (generic)
export const SectionSkeleton = memo(function SectionSkeleton() {
  // Force light mode
  const theme = getTheme(false);

  return (
    <View style={[styles.section, { backgroundColor: theme.surface }]}>
      <Skeleton width={100} height={18} style={styles.mb12} />
      <Skeleton height={60} style={styles.mb8} />
      <Skeleton height={60} style={styles.mb8} />
      <Skeleton height={60} />
    </View>
  );
});

const styles = StyleSheet.create({
  skeleton: {
    overflow: 'hidden',
  },
  kpiCard: {
    width: 128,
    padding: 14,
    borderRadius: radii.lg,
    alignItems: 'flex-start',
    gap: spacing[1],
  },
  kpiValue: {
    marginTop: spacing[1],
  },
  bookingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bookingContent: {
    flex: 1,
    marginLeft: spacing[3],
  },
  bookingRight: {
    alignItems: 'flex-end',
  },
  listingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listingContent: {
    flex: 1,
    marginLeft: spacing[3],
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: radii.lg,
    marginBottom: 10,
  },
  alertContent: {
    flex: 1,
    marginLeft: spacing[3],
  },
  section: {
    padding: 20,
    borderRadius: radii.xl,
    marginBottom: 16,
  },
  mt4: {
    marginTop: spacing[1],
  },
  mb8: {
    marginBottom: spacing[2],
  },
  mb12: {
    marginBottom: spacing[3],
  },
});

export default Skeleton;
