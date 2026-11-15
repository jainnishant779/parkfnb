import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { palette, radii, fonts } from '../../theme/kit';
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

// Status colours re-mapped onto the kit palette (labels/icons still come
// from PAYOUT_STATUS_CONFIG).
const STATUS_TONE: Partial<Record<PayoutStatus, { color: string; bgColor: string }>> = {
  paid: { color: palette.success, bgColor: palette.successSoft },
  pending: { color: palette.warning, bgColor: palette.warningSoft },
  processing: { color: palette.text, bgColor: palette.blueSoft },
  failed: { color: palette.danger, bgColor: palette.dangerSoft },
  scheduled: { color: palette.text, bgColor: palette.peachSoft },
  on_hold: { color: palette.warning, bgColor: palette.warningSoft },
};

const toneFor = (status: PayoutStatus) => {
  const config = PAYOUT_STATUS_CONFIG[status];
  return { ...config, ...(STATUS_TONE[status] || {}) };
};

// ============================================================================
// STATUS BADGE COMPONENT
// ============================================================================

interface StatusBadgeProps {
  status: PayoutStatus;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const config = toneFor(status);

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
  const statusConfig = toneFor(payout.status);

  return (
    <TouchableOpacity
      onPress={() => onPress?.(payout)}
      activeOpacity={0.85}
      style={[styles.container, !isLast && styles.borderBottom]}
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
              size={18}
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
          <Ionicons name="chevron-forward" size={18} color={palette.textSubtle} style={styles.chevron} />
        </View>

        <View style={styles.bottomRow}>
          <View style={styles.metaContainer}>
            <Text style={styles.date}>
              {formatDate(payout.date)}
            </Text>
            <View style={styles.separator} />
            <Text style={styles.method}>
              {getMethodLabel(payout.method)}
            </Text>
          </View>
          <StatusBadge status={payout.status} />
        </View>

        {/* Failure reason if applicable */}
        {payout.status === 'failed' && payout.failureReason && (
          <View style={styles.failureContainer}>
            <Ionicons name="information-circle" size={14} color={palette.danger} />
            <Text style={styles.failureText} numberOfLines={1}>
              {payout.failureReason}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: palette.surface,
    minHeight: 76,
    marginBottom: 12,
    borderRadius: radii.xl,
  },
  borderBottom: {
    borderBottomWidth: 0,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  payoutId: {
    ...fonts.semibold,
    fontSize: 15,
    color: palette.text,
    flex: 1,
    marginRight: 8,
  },
  amount: {
    ...fonts.bold,
    fontSize: 16,
    letterSpacing: -0.3,
    color: palette.text,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginLeft: 52,
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  date: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textMuted,
  },
  separator: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: palette.textSubtle,
    marginHorizontal: 6,
  },
  method: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textMuted,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    gap: 4,
  },
  statusText: {
    ...fonts.semibold,
    fontSize: 11,
  },
  failureContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginLeft: 52,
    gap: 4,
  },
  failureText: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.danger,
    flex: 1,
  },
  chevron: {
    marginLeft: 6,
  },
});

export default memo(PayoutRow);
