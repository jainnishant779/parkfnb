import React, { memo, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import { getTheme } from '../../../theme/colors';
import { spacing, borderRadius } from '../../../theme/spacing';
import { fontSize, fontWeight } from '../../../theme/typography';
import type { DailyEarnings } from '../../../types/models';

// Format currency compact
const formatCompact = (amount: number): string => {
  if (amount >= 1000) {
    return `₹${(amount / 1000).toFixed(1)}K`;
  }
  return `₹${amount}`;
};

// Format day label
const formatDayLabel = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', { weekday: 'short' }).charAt(0);
};

export interface EarningsChartProps {
  dailyEarnings: DailyEarnings[];
  title?: string;
  testID?: string;
}

function EarningsChart({
  dailyEarnings,
  title = 'Last 7 Days',
  testID,
}: EarningsChartProps) {
  const theme = useMemo(() => getTheme(false), []);

  // Calculate max value for scaling
  const maxValue = useMemo(() => {
    const max = Math.max(...dailyEarnings.map(d => d.net), 1);
    return max;
  }, [dailyEarnings]);

  // Calculate total
  const total = useMemo(() => {
    return dailyEarnings.reduce((sum, d) => sum + d.net, 0);
  }, [dailyEarnings]);

  return (
    <View
      style={[styles.container, { backgroundColor: theme.surface }]}
      testID={testID}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.total, { color: theme.success }]}>
          {formatCompact(total)}
        </Text>
      </View>

      {/* Chart */}
      <View style={styles.chartContainer}>
        {dailyEarnings.map((day, index) => {
          const height = maxValue > 0 ? (day.net / maxValue) * 100 : 0;
          const isToday = index === dailyEarnings.length - 1;

          return (
            <View key={day.date} style={styles.barColumn}>
              <View style={styles.barWrapper}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${Math.max(height, 5)}%`,
                      backgroundColor: isToday ? theme.primary : theme.primaryLight,
                    },
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.dayLabel,
                  { color: isToday ? theme.primary : theme.textMuted },
                  isToday && styles.dayLabelActive,
                ]}
              >
                {formatDayLabel(day.date)}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: theme.primaryLight }]} />
          <Text style={[styles.legendText, { color: theme.textMuted }]}>Previous Days</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: theme.primary }]} />
          <Text style={[styles.legendText, { color: theme.textMuted }]}>Today</Text>
        </View>
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
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  total: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold as any,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 100,
    paddingHorizontal: spacing[2],
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
  },
  barWrapper: {
    height: 80,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing[1],
  },
  bar: {
    width: '60%',
    minHeight: 4,
    borderRadius: borderRadius.sm,
  },
  dayLabel: {
    fontSize: 10,
    fontWeight: fontWeight.medium as any,
    marginTop: spacing[1],
  },
  dayLabelActive: {
    fontWeight: fontWeight.bold as any,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing[4],
    marginTop: spacing[3],
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: fontSize.xs,
  },
});

export default memo(EarningsChart);
