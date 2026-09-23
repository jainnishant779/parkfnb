import React, { memo, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { palette, radii, fonts } from '../../../theme/kit';
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
  // Calculate max value for scaling
  const maxValue = useMemo(() => {
    const max = Math.max(...dailyEarnings.map(d => d.net), 1);
    return max;
  }, [dailyEarnings]);

  // Calculate total
  const total = useMemo(() => {
    return dailyEarnings.reduce((sum, d) => sum + d.net, 0);
  }, [dailyEarnings]);

  const dense = dailyEarnings.length > 10;

  return (
    <View style={styles.container} testID={testID}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.total}>{formatCompact(total)}</Text>
        </View>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: palette.peach }]} />
            <Text style={styles.legendText}>Previous</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: palette.ink }]} />
            <Text style={styles.legendText}>Today</Text>
          </View>
        </View>
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
                    dense && styles.barDense,
                    {
                      height: `${Math.max(height, 5)}%`,
                      backgroundColor: isToday ? palette.ink : palette.peach,
                    },
                  ]}
                />
              </View>
              {!dense || isToday || index % 5 === 0 ? (
                <Text
                  style={[
                    styles.dayLabel,
                    isToday && styles.dayLabelActive,
                  ]}
                >
                  {formatDayLabel(day.date)}
                </Text>
              ) : (
                <Text style={styles.dayLabel}> </Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: radii.xl,
    padding: 20,
    backgroundColor: palette.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  title: {
    ...fonts.medium,
    fontSize: 14,
    color: palette.textMuted,
  },
  total: {
    ...fonts.semibold,
    fontSize: 26,
    letterSpacing: -0.6,
    color: palette.text,
    marginTop: 2,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 150,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
  },
  barWrapper: {
    height: 124,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 2,
  },
  bar: {
    width: '70%',
    maxWidth: 30,
    minHeight: 6,
    borderRadius: 10,
  },
  barDense: {
    width: '80%',
    borderRadius: 4,
  },
  dayLabel: {
    ...fonts.medium,
    fontSize: 11,
    color: palette.textMuted,
    marginTop: 8,
  },
  dayLabelActive: {
    ...fonts.bold,
    color: palette.text,
  },
  legend: {
    alignItems: 'flex-end',
    gap: 6,
    paddingTop: 2,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textMuted,
  },
});

export default memo(EarningsChart);
