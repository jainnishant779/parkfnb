import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { palette, radii, fonts } from '../../../theme/kit';
import { StatusTag } from '../../../components/ui';
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
  return (
    <View style={styles.container} testID={testID}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Summary</Text>
        <StatusTag label={rangeLabel} tone="ink" />
      </View>

      {/* 2x2 tiles */}
      <View style={styles.grid}>
        {/* Gross */}
        <View style={styles.tile}>
          <View style={styles.tileIcon}>
            <Ionicons name="arrow-up-outline" size={16} color={palette.text} />
          </View>
          <Text style={styles.tileLabel}>Gross</Text>
          <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
            {formatCurrency(summary.gross, summary.currency)}
          </Text>
        </View>

        {/* Fees */}
        <View style={styles.tile}>
          <View style={styles.tileIcon}>
            <Ionicons name="remove-outline" size={16} color={palette.text} />
          </View>
          <Text style={styles.tileLabel}>Platform Fee</Text>
          <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
            -{formatCurrency(summary.fees, summary.currency)}
          </Text>
          {/* There is no commission model yet — `fees` is hardcoded to 0
              upstream. "8% of gross" claimed a rate that was never actually
              charged against the ₹0 shown above it. */}
          <Text style={styles.tileSub}>No platform fee yet</Text>
        </View>

        {/* Net */}
        <View style={[styles.tile, styles.tilePeach]}>
          <View style={[styles.tileIcon, styles.tileIconOnPeach]}>
            <Ionicons name="wallet-outline" size={16} color={palette.text} />
          </View>
          <Text style={styles.tileLabel}>Net Earnings</Text>
          <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
            {formatCurrency(summary.net, summary.currency)}
          </Text>
        </View>

        {/* Pending */}
        <TouchableOpacity
          style={styles.tile}
          onPress={onPressPending}
          disabled={!onPressPending}
          activeOpacity={0.8}
        >
          <View style={styles.tileTop}>
            <View style={styles.tileIcon}>
              <Ionicons name="time-outline" size={16} color={palette.text} />
            </View>
            {onPressPending && (
              <Ionicons name="chevron-forward" size={16} color={palette.textSubtle} />
            )}
          </View>
          <Text style={styles.tileLabel}>Pending</Text>
          <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
            {formatCurrency(summary.pending, summary.currency)}
          </Text>
          <Text style={styles.tileSub}>Awaiting payout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  title: {
    ...fonts.semibold,
    fontSize: 19,
    letterSpacing: -0.2,
    color: palette.text,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  tile: {
    width: '48.5%',
    minHeight: 124,
    padding: 16,
    borderRadius: radii.lg,
    backgroundColor: palette.surface,
  },
  tilePeach: {
    backgroundColor: palette.peachSoft,
  },
  tileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tileIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileIconOnPeach: {
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  tileLabel: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
    marginTop: 12,
  },
  tileValue: {
    ...fonts.semibold,
    fontSize: 22,
    letterSpacing: -0.5,
    color: palette.text,
    marginTop: 2,
  },
  tileSub: {
    ...fonts.medium,
    fontSize: 11,
    color: palette.textSubtle,
    marginTop: 2,
  },
});

export default memo(EarningsSummaryCard);
