import React, { memo, useCallback } from 'react';
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
import { palette, radii, fonts } from '../../../theme/kit';
import { StatusTag } from '../../../components/ui';
import type {
  EarningsTransaction,
  TransactionStatus,
  PayoutStatus,
  TransactionType,
} from '../../../types/models';

// Status config
const STATUS_CONFIG: Record<TransactionStatus, { tone: string; color: string; label: string }> = {
  completed: { tone: 'success', color: palette.success, label: 'Completed' },
  pending: { tone: 'warning', color: palette.warning, label: 'Pending' },
  failed: { tone: 'danger', color: palette.danger, label: 'Failed' },
  refunded: { tone: 'grey', color: palette.textMuted, label: 'Refunded' },
};

// Payout status config
const PAYOUT_CONFIG: Record<PayoutStatus, { tone: string; label: string }> = {
  paid: { tone: 'ink', label: 'Paid' },
  unpaid: { tone: 'grey', label: 'Unpaid' },
  processing: { tone: 'warning', label: 'Processing' },
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
  const amountColor = isNegative ? palette.danger : palette.text;
  const amountPrefix = isNegative ? '-' : '+';

  return (
    <Animated.View style={[styles.outer, animatedStyle]}>
      <Pressable
        onPress={() => onPress(transaction)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.container, isLast && styles.containerLast]}
        testID={testID}
      >
        {/* Left: Type icon with status dot */}
        <View style={styles.typeIcon}>
          <Ionicons name={typeConfig.icon} size={20} color={palette.text} />
          <View style={[styles.statusDot, { backgroundColor: statusConfig.color }]} />
        </View>

        {/* Middle: Listing name + booking ref */}
        <View style={styles.middleSection}>
          <Text style={styles.listingName} numberOfLines={1}>
            {transaction.listingName}
          </Text>
          <View style={styles.subRow}>
            {transaction.bookingRef && (
              <Text style={styles.bookingRef}>
                {transaction.bookingRef}
              </Text>
            )}
            {transaction.renterName && (
              <Text style={styles.renterName} numberOfLines={1}>
                · {transaction.renterName}
              </Text>
            )}
          </View>
          {/* Secondary row: payout tag + time */}
          <View style={styles.bottomRow}>
            <StatusTag label={payoutConfig.label} tone={payoutConfig.tone} style={styles.tag} />
            <Text style={styles.timeText}>
              {formatTime(transaction.createdAt)}
            </Text>
          </View>
        </View>

        {/* Right: Amount + status label */}
        <View style={styles.rightSection}>
          <Text style={[styles.amount, { color: amountColor }]}>
            {amountPrefix}{formatCurrency(transaction.amount, transaction.currency)}
          </Text>
          <StatusTag label={statusConfig.label} tone={statusConfig.tone} style={[styles.tag, styles.tagRight]} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: {
    marginHorizontal: 16,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderRadius: radii.lg,
    backgroundColor: palette.surface,
  },
  containerLast: {
    marginBottom: 4,
  },
  typeIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  statusDot: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: palette.surface,
  },
  middleSection: {
    flex: 1,
    marginRight: 8,
  },
  listingName: {
    ...fonts.semibold,
    fontSize: 15,
    color: palette.text,
    marginBottom: 2,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  bookingRef: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textMuted,
  },
  renterName: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textMuted,
    marginLeft: 4,
    flex: 1,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  timeText: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textSubtle,
  },
  tagRight: {
    alignSelf: 'flex-end',
  },
  rightSection: {
    alignItems: 'flex-end',
  },
  amount: {
    ...fonts.semibold,
    fontSize: 16,
    letterSpacing: -0.2,
    marginBottom: 6,
  },
});

export default memo(TransactionItem);
