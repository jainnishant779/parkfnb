import React, { memo, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Pressable,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../../theme/colors';
import { spacing, borderRadius } from '../../../theme/spacing';
import { fontSize, fontWeight } from '../../../theme/typography';
import type { EarningsSummary } from '../../../types/models';

// Format currency for display
const formatCurrency = (amount: number, currency: string = 'INR'): string => {
  if (currency === 'INR') {
    return `₹${amount.toLocaleString('en-IN')}`;
  }
  return `${currency} ${amount.toLocaleString()}`;
};

export interface EarningsSummaryCardProps {
  summary: EarningsSummary;
  rangeLabel: string;
  onPressPending?: () => void;
  testID?: string;
}

function EarningsSummaryCard({
  summary,
  rangeLabel,
  onPressPending,
  testID,
}: EarningsSummaryCardProps) {
  const theme = useMemo(() => getTheme(false), []);

  return (
    <View
      style={[styles.container, { backgroundColor: theme.surface }]}
      testID={testID}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Earnings Summary</Text>
        <View style={[styles.rangeBadge, { backgroundColor: theme.primaryLight }]}>
          <Text style={[styles.rangeText, { color: theme.primary }]}>{rangeLabel}</Text>
        </View>
      </View>

      {/* 2x2 Grid */}
      <View style={styles.grid}>
        {/* Gross */}
        <View style={[styles.metric, { backgroundColor: theme.borderLight }]}>
          <View style={styles.metricHeader}>
            <Ionicons name="arrow-up-circle-outline" size={18} color={theme.success} />
            <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Gross</Text>
          </View>
          <Text style={[styles.metricValue, { color: theme.text }]}>
            {formatCurrency(summary.gross, summary.currency)}
          </Text>
        </View>

        {/* Fees */}
        <View style={[styles.metric, { backgroundColor: theme.borderLight }]}>
          <View style={styles.metricHeader}>
            <Ionicons name="remove-circle-outline" size={18} color={theme.warning} />
            <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Platform Fee</Text>
          </View>
          <Text style={[styles.metricValue, { color: theme.warning }]}>
            -{formatCurrency(summary.fees, summary.currency)}
          </Text>
          <Text style={[styles.metricSubtext, { color: theme.textMuted }]}>8% of gross</Text>
        </View>

        {/* Net */}
        <View style={[styles.metric, styles.netMetric, { backgroundColor: theme.successLight }]}>
          <View style={styles.metricHeader}>
            <Ionicons name="wallet-outline" size={18} color={theme.success} />
            <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Net Earnings</Text>
          </View>
          <Text style={[styles.metricValue, styles.netValue, { color: theme.success }]}>
            {formatCurrency(summary.net, summary.currency)}
          </Text>
        </View>

        {/* Pending */}
        <Pressable
          style={[styles.metric, { backgroundColor: theme.borderLight }]}
          onPress={onPressPending}
          disabled={!onPressPending}
        >
          <View style={styles.metricHeader}>
            <Ionicons name="time-outline" size={18} color={theme.info} />
            <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Pending</Text>
            {onPressPending && (
              <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
            )}
          </View>
          <Text style={[styles.metricValue, { color: theme.info }]}>
            {formatCurrency(summary.pending, summary.currency)}
          </Text>
          <Text style={[styles.metricSubtext, { color: theme.textMuted }]}>Awaiting payout</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[4],
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
  },
  rangeBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
  },
  rangeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  metric: {
    width: '48%',
    padding: spacing[3],
    borderRadius: borderRadius.lg,
  },
  netMetric: {
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    marginBottom: spacing[1],
  },
  metricLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
    flex: 1,
  },
  metricValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold as any,
  },
  netValue: {
    fontSize: fontSize['2xl'],
  },
  metricSubtext: {
    fontSize: 10,
    marginTop: 2,
  },
});

export default memo(EarningsSummaryCard);
