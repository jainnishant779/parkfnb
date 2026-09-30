import React, { memo, useEffect } from 'react';
import {
  View,
  StyleSheet,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { palette, radii } from '../../../theme/kit';

// Animated skeleton pulse
function SkeletonPulse({ style }: { style?: any }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1000 }),
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
        { backgroundColor: palette.bgSoft },
        style,
        animatedStyle,
      ]}
    />
  );
}

// Summary card skeleton
export const SummaryCardSkeleton = memo(function SummaryCardSkeleton() {

  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryHeader}>
        <SkeletonPulse style={styles.summaryTitle} />
        <SkeletonPulse style={styles.summaryBadge} />
      </View>
      <View style={styles.summaryGrid}>
        <SkeletonPulse style={styles.summaryMetric} />
        <SkeletonPulse style={styles.summaryMetric} />
        <SkeletonPulse style={styles.summaryMetric} />
        <SkeletonPulse style={styles.summaryMetric} />
      </View>
    </View>
  );
});

// Chart skeleton
export const ChartSkeleton = memo(function ChartSkeleton() {

  return (
    <View style={styles.chartCard}>
      <View style={styles.chartHeader}>
        <SkeletonPulse style={styles.chartTitle} />
        <SkeletonPulse style={styles.chartTotal} />
      </View>
      <View style={styles.chartBars}>
        {Array.from({ length: 7 }).map((_, i) => (
          <View key={i} style={styles.chartBarColumn}>
            <SkeletonPulse
              style={[
                styles.chartBar,
                { height: 20 + Math.random() * 60 },
              ]}
            />
            <SkeletonPulse style={styles.chartLabel} />
          </View>
        ))}
      </View>
    </View>
  );
});

// Transaction item skeleton
export const TransactionSkeleton = memo(function TransactionSkeleton() {

  return (
    <View style={styles.transactionItem}>
      <View style={styles.transactionLeft}>
        <SkeletonPulse style={styles.typeIcon} />
      </View>
      <View style={styles.transactionMiddle}>
        <SkeletonPulse style={styles.listingName} />
        <SkeletonPulse style={styles.bookingRef} />
        <View style={styles.transactionBottomRow}>
          <SkeletonPulse style={styles.payoutBadge} />
          <SkeletonPulse style={styles.timeText} />
        </View>
      </View>
      <View style={styles.transactionRight}>
        <SkeletonPulse style={styles.amount} />
        <SkeletonPulse style={styles.statusBadge} />
      </View>
    </View>
  );
});

// Section header skeleton
export const SectionHeaderSkeleton = memo(function SectionHeaderSkeleton() {

  return (
    <View style={styles.sectionHeader}>
      <SkeletonPulse style={styles.sectionTitle} />
    </View>
  );
});

// Full earnings skeleton
export interface EarningsSkeletonProps {
  showSummary?: boolean;
  showChart?: boolean;
  transactionCount?: number;
}

function EarningsSkeleton({
  showSummary = true,
  showChart = true,
  transactionCount = 5,
}: EarningsSkeletonProps) {
  return (
    <View style={styles.container}>
      {showSummary && <SummaryCardSkeleton />}
      {showChart && <ChartSkeleton />}
      <SectionHeaderSkeleton />
      {Array.from({ length: transactionCount }).map((_, i) => (
        <TransactionSkeleton key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Summary card
  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: radii.xl,
    padding: 20,
    backgroundColor: palette.surface,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  summaryTitle: {
    width: 120,
    height: 20,
    borderRadius: radii.sm,
  },
  summaryBadge: {
    width: 80,
    height: 24,
    borderRadius: radii.pill,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryMetric: {
    width: '48%',
    height: 80,
    borderRadius: radii.lg,
  },
  // Chart
  chartCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: radii.xl,
    padding: 20,
    backgroundColor: palette.surface,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  chartTitle: {
    width: 80,
    height: 18,
    borderRadius: radii.sm,
  },
  chartTotal: {
    width: 60,
    height: 22,
    borderRadius: radii.sm,
  },
  chartBars: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    height: 100,
    alignItems: 'flex-end',
  },
  chartBarColumn: {
    flex: 1,
    alignItems: 'center',
  },
  chartBar: {
    width: 16,
    borderRadius: radii.sm,
  },
  chartLabel: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  // Transaction
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: radii.lg,
    backgroundColor: palette.surface,
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  typeIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  transactionMiddle: {
    flex: 1,
    marginRight: 8,
  },
  listingName: {
    width: '80%',
    height: 16,
    borderRadius: radii.sm,
    marginBottom: 4,
  },
  bookingRef: {
    width: '50%',
    height: 12,
    borderRadius: radii.sm,
    marginBottom: 4,
  },
  transactionBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  payoutBadge: {
    width: 50,
    height: 16,
    borderRadius: radii.pill,
  },
  timeText: {
    width: 40,
    height: 12,
    borderRadius: radii.sm,
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  amount: {
    width: 60,
    height: 18,
    borderRadius: radii.sm,
    marginBottom: 4,
  },
  statusBadge: {
    width: 60,
    height: 16,
    borderRadius: radii.pill,
  },
  // Section header
  sectionHeader: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    width: 80,
    height: 14,
    borderRadius: radii.sm,
  },
});

export default memo(EarningsSkeleton);
