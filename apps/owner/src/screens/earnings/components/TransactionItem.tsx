import React, { memo, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../../theme/colors';
import { spacing, borderRadius } from '../../../theme/spacing';
import { fontSize, fontWeight } from '../../../theme/typography';
import type {
  EarningsTransaction,
  TransactionStatus,
  PayoutStatus,
  TransactionType,
} from '../../../types/models';

// Status config
const STATUS_CONFIG: Record<TransactionStatus, { color: string; bgColor: string; label: string }> = {
  completed: { color: '#059669', bgColor: '#ECFDF5', label: 'Completed' },
  pending: { color: '#D97706', bgColor: '#FFFBEB', label: 'Pending' },
  failed: { color: '#DC2626', bgColor: '#FEF2F2', label: 'Failed' },
  refunded: { color: '#6366F1', bgColor: '#EEF2FF', label: 'Refunded' },
};

// Payout status config
const PAYOUT_CONFIG: Record<PayoutStatus, { color: string; bgColor: string; label: string }> = {
  paid: { color: '#059669', bgColor: '#ECFDF5', label: 'Paid' },
  unpaid: { color: '#D97706', bgColor: '#FFFBEB', label: 'Unpaid' },
  processing: { color: '#0D7377', bgColor: '#E8F5F4', label: 'Processing' },
};

// Transaction type config
const TYPE_CONFIG: Record<TransactionType, { icon: string; label: string }> = {
  booking: { icon: 'car-outline', label: 'Booking' },
  extension: { icon: 'time-outline', label: 'Extension' },
  cancellation_fee: { icon: 'close-circle-outline', label: 'Cancellation Fee' },
  adjustment: { icon: 'swap-horizontal-outline', label: 'Adjustment' },
  refund: { icon: 'arrow-undo-outline', label: 'Refund' },
};

// Format currency
const formatCurrency = (amount: number, currency: string = 'INR'): string => {
  const absAmount = Math.abs(amount);
  if (currency === 'INR') {
    return `₹${absAmount.toLocaleString('en-IN')}`;
  }
  return `${currency} ${absAmount.toLocaleString()}`;
};

// Format time
const formatTime = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

// Animation config
const SPRING_CONFIG = {
  damping: 15,
  stiffness: 150,
};

export interface TransactionItemProps {
  transaction: EarningsTransaction;
  onPress: (transaction: EarningsTransaction) => void;
  isLast?: boolean;
  testID?: string;
}

function TransactionItem({
  transaction,
  onPress,
  isLast = false,
  testID,
}: TransactionItemProps) {
  const theme = useMemo(() => getTheme(false), []);

  // Animation
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.98, SPRING_CONFIG);
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, SPRING_CONFIG);
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Get configs
  const statusConfig = STATUS_CONFIG[transaction.status];
  const payoutConfig = PAYOUT_CONFIG[transaction.payoutStatus];
  const typeConfig = TYPE_CONFIG[transaction.type];

  // Determine amount color
  const isNegative = transaction.amount < 0;
  const amountColor = isNegative ? theme.danger : theme.success;
  const amountPrefix = isNegative ? '-' : '+';

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={() => onPress(transaction)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          styles.container,
          { backgroundColor: theme.surface },
          !isLast && [styles.border, { borderBottomColor: theme.borderLight }],
        ]}
        testID={testID}
      >
        {/* Left: Status dot + Type icon */}
        <View style={styles.leftSection}>
          <View style={[styles.statusDot, { backgroundColor: statusConfig.color }]} />
          <View style={[styles.typeIcon, { backgroundColor: theme.borderLight }]}>
            <Ionicons name={typeConfig.icon} size={18} color={theme.textSecondary} />
          </View>
        </View>

        {/* Middle: Listing name + booking ref */}
        <View style={styles.middleSection}>
          <Text style={[styles.listingName, { color: theme.text }]} numberOfLines={1}>
            {transaction.listingName}
          </Text>
          <View style={styles.subRow}>
            {transaction.bookingRef && (
              <Text style={[styles.bookingRef, { color: theme.textMuted }]}>
                {transaction.bookingRef}
              </Text>
            )}
            {transaction.renterName && (
              <Text style={[styles.renterName, { color: theme.textSecondary }]} numberOfLines={1}>
                • {transaction.renterName}
              </Text>
            )}
          </View>
          {/* Secondary row: payout badge + time */}
          <View style={styles.bottomRow}>
            <View style={[styles.payoutBadge, { backgroundColor: payoutConfig.bgColor }]}>
              <Text style={[styles.payoutText, { color: payoutConfig.color }]}>
                {payoutConfig.label}
              </Text>
            </View>
            <Text style={[styles.timeText, { color: theme.textMuted }]}>
              {formatTime(transaction.createdAt)}
            </Text>
          </View>
        </View>

        {/* Right: Amount + status label */}
        <View style={styles.rightSection}>
          <Text style={[styles.amount, { color: amountColor }]}>
            {amountPrefix}{formatCurrency(transaction.amount, transaction.currency)}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
            <Text style={[styles.statusText, { color: statusConfig.color }]}>
              {statusConfig.label}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
  },
  border: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  leftSection: {
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  middleSection: {
    flex: 1,
    marginRight: spacing[2],
  },
  listingName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    marginBottom: 2,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[1],
  },
  bookingRef: {
    fontSize: fontSize.xs,
    fontFamily: 'monospace',
  },
  renterName: {
    fontSize: fontSize.xs,
    marginLeft: spacing[1],
    flex: 1,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  payoutBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  payoutText: {
    fontSize: 10,
    fontWeight: fontWeight.medium as any,
  },
  timeText: {
    fontSize: fontSize.xs,
  },
  rightSection: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[1],
  },
  statusBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  statusText: {
    fontSize: 10,
    fontWeight: fontWeight.medium as any,
  },
});

export default memo(TransactionItem);
