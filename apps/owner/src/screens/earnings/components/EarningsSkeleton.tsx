import React, { memo, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { getTheme } from '../../../theme/colors';
import { spacing, borderRadius } from '../../../theme/spacing';

// Animated skeleton pulse
function SkeletonPulse({ style }: { style?: any }) {
  const theme = useMemo(() => getTheme(false), []);
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
        { backgroundColor: theme.border },
        style,
        animatedStyle,
      ]}
    />
  );
}

// Summary card skeleton
export const SummaryCardSkeleton = memo(function SummaryCardSkeleton() {
  const theme = useMemo(() => getTheme(false), []);

  return (
    <View style={[styles.summaryCard, { backgroundColor: theme.surface }]}>
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
  const theme = useMemo(() => getTheme(false), []);

  return (
    <View style={[styles.chartCard, { backgroundColor: theme.surface }]}>
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
  const theme = useMemo(() => getTheme(false), []);

  return (
    <View style={[styles.transactionItem, { backgroundColor: theme.surface }]}>
      <View style={styles.transactionLeft}>
        <SkeletonPulse style={styles.statusDot} />
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
  const theme = useMemo(() => getTheme(false), []);

  return (
    <View style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
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
    marginHorizontal: spacing[4],
    marginBottom: spacing[4],
    borderRadius: borderRadius.xl,
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
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing[4],
  },
  summaryTitle: {
    width: 120,
    height: 20,
    borderRadius: borderRadius.sm,
  },
  summaryBadge: {
    width: 80,
    height: 24,
    borderRadius: borderRadius.full,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  summaryMetric: {
    width: '48%',
    height: 80,
    borderRadius: borderRadius.lg,
  },
  // Chart
  chartCard: {
    marginHorizontal: spacing[4],
    marginBottom: spacing[4],
    borderRadius: borderRadius.xl,
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
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing[4],
  },
  chartTitle: {
    width: 80,
    height: 18,
    borderRadius: borderRadius.sm,
  },
  chartTotal: {
    width: 60,
    height: 22,
    borderRadius: borderRadius.sm,
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
    borderRadius: borderRadius.sm,
  },
  chartLabel: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: spacing[1],
  },
  // Transaction
  transactionItem: {
    flexDirection: 'row',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing[3],
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing[2],
  },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
  },
  transactionMiddle: {
    flex: 1,
    marginRight: spacing[2],
  },
  listingName: {
    width: '80%',
    height: 16,
    borderRadius: borderRadius.sm,
    marginBottom: 4,
  },
  bookingRef: {
    width: '50%',
    height: 12,
    borderRadius: borderRadius.sm,
    marginBottom: spacing[1],
  },
  transactionBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  payoutBadge: {
    width: 50,
    height: 16,
    borderRadius: borderRadius.full,
  },
  timeText: {
    width: 40,
    height: 12,
    borderRadius: borderRadius.sm,
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  amount: {
    width: 60,
    height: 18,
    borderRadius: borderRadius.sm,
    marginBottom: spacing[1],
  },
  statusBadge: {
    width: 60,
    height: 16,
    borderRadius: borderRadius.full,
  },
  // Section header
  sectionHeader: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
  },
  sectionTitle: {
    width: 80,
    height: 14,
    borderRadius: borderRadius.sm,
  },
});

export default memo(EarningsSkeleton);
