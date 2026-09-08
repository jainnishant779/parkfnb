import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import type { Payout, PayoutStatus } from '../../constants/mockPayoutsData';
import { PAYOUT_STATUS_CONFIG } from '../../constants/mockPayoutsData';

// ============================================================================
// TYPES
// ============================================================================

export interface PayoutRowProps {
  payout: Payout;
  onPress?: (payout: Payout) => void;
  isLast?: boolean;
  testID?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const getMethodLabel = (method: string): string => {
  const labels: Record<string, string> = {
    bank_transfer: 'Bank Transfer',
    upi: 'UPI',
    wallet: 'Wallet',
  };
  return labels[method] || method;
};

// ============================================================================
// STATUS BADGE COMPONENT
// ============================================================================

interface StatusBadgeProps {
  status: PayoutStatus;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const config = PAYOUT_STATUS_CONFIG[status];

  return (
    <View style={[styles.statusBadge, { backgroundColor: config.bgColor }]}>
      <Ionicons name={config.icon as any} size={12} color={config.color} />
      <Text style={[styles.statusText, { color: config.color }]}>
        {config.label}
      </Text>
    </View>
  );
};

// ============================================================================
// COMPONENT
// ============================================================================

function PayoutRow({
  payout,
  onPress,
  isLast = false,
  testID,
}: PayoutRowProps) {
  const statusConfig = PAYOUT_STATUS_CONFIG[payout.status];

  return (
    <Pressable
      onPress={() => onPress?.(payout)}
      style={({ pressed }) => [
        styles.container,
        !isLast && styles.borderBottom,
        pressed && styles.pressed,
      ]}
      android_ripple={{ color: 'rgba(0, 0, 0, 0.05)' }}
      accessibilityRole="button"
      accessibilityLabel={`Payout ${payout.id}, ${formatCurrency(payout.amount)}, ${PAYOUT_STATUS_CONFIG[payout.status].label}`}
      testID={testID}
    >
      {/* Content */}
      <View style={styles.content}>
        <View style={styles.topRow}>
          {/* Status Icon */}
          <View style={[styles.iconContainer, { backgroundColor: statusConfig.bgColor }]}>
            <Ionicons
              name={statusConfig.icon as any}
              size={14}
              color={statusConfig.color}
            />
          </View>
          <Text style={styles.payoutId} numberOfLines={1}>
            {payout.id}
          </Text>
          <Text style={styles.amount}>
            {formatCurrency(payout.netAmount)}
          </Text>
          {/* Chevron */}
          <Ionicons name="chevron-forward" size={18} color="#94A3B8" style={styles.chevron} />
        </View>

        <View style={styles.bottomRow}>
          <View style={styles.metaContainer}>
            <Text style={styles.date}>
              {formatDate(payout.date)}
            </Text>
            <Text style={styles.separator}>•</Text>
            <Text style={styles.method}>
              {getMethodLabel(payout.method)}
            </Text>
          </View>
          <StatusBadge status={payout.status} />
        </View>

        {/* Failure reason if applicable */}
        {payout.status === 'failed' && payout.failureReason && (
          <View style={styles.failureContainer}>
            <Ionicons name="information-circle" size={14} color="#EF4444" />
            <Text style={styles.failureText} numberOfLines={1}>
              {payout.failureReason}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[4],
    backgroundColor: '#FFFFFF',
    minHeight: 76,
    marginBottom: spacing[3],
    borderRadius: borderRadius.lg,
  },
  borderBottom: {
    borderBottomWidth: 0,
  },
  pressed: {
    backgroundColor: '#F8FAFC',
  },
  iconContainer: {
    width: 22,
    height: 22,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing[2],
  },
  content: {
    flex: 1,
    marginRight: spacing[2],
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[1],
  },
  payoutId: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
    color: '#1E293B',
    flex: 1,
    marginRight: spacing[2],
  },
  amount: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold as any,
    color: '#1E293B',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  date: {
    fontSize: fontSize.xs,
    color: '#64748B',
  },
  separator: {
    fontSize: fontSize.xs,
    color: '#94A3B8',
    marginHorizontal: spacing[1],
  },
  method: {
    fontSize: fontSize.xs,
    color: '#64748B',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.md,
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: fontWeight.medium as any,
  },
  failureContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing[2],
    gap: 4,
  },
  failureText: {
    fontSize: fontSize.xs,
    color: '#EF4444',
    flex: 1,
  },
  chevron: {
    marginLeft: spacing[2],
  },
});

export default memo(PayoutRow);
