// ============================================================================
// COMPLIANCE STAT CARD - KPI Display Component
// ============================================================================

import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { spacing, borderRadius } from '../../../theme/spacing';
import { fontSize, fontWeight } from '../../../theme/typography';

// ============================================================================
// TYPES
// ============================================================================

type StatVariant = 'pending' | 'missing' | 'expiring' | 'compliant';

interface ComplianceStatCardProps {
  label: string;
  value: number;
  variant: StatVariant;
  icon: string;
  onPress?: () => void;
  testID?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const VARIANT_CONFIG: Record<StatVariant, { bg: string; iconBg: string; text: string; icon: string }> = {
  pending: {
    bg: '#F8FAFC',
    iconBg: '#E2E8F0',
    text: '#64748B',
    icon: '#64748B',
  },
  missing: {
    bg: '#FEF2F2',
    iconBg: '#FEE2E2',
    text: '#DC2626',
    icon: '#EF4444',
  },
  expiring: {
    bg: '#FFFBEB',
    iconBg: '#FEF3C7',
    text: '#D97706',
    icon: '#F59E0B',
  },
  compliant: {
    bg: '#ECFDF5',
    iconBg: '#D1FAE5',
    text: '#059669',
    icon: '#10B981',
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

function ComplianceStatCard({
  label,
  value,
  variant,
  icon,
  onPress,
  testID,
}: ComplianceStatCardProps) {
  const config = VARIANT_CONFIG[variant];

  const content = (
    <View
      style={[styles.container, { backgroundColor: config.bg }]}
      testID={testID}
    >
      <View style={[styles.iconContainer, { backgroundColor: config.iconBg }]}>
        <Ionicons name={icon as any} size={18} color={config.icon} />
      </View>
      <Text style={[styles.value, { color: config.text }]}>{value}</Text>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    width: 75,
    paddingHorizontal: spacing[2],
    paddingTop: spacing[2],
    paddingBottom: spacing[3],
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginRight: spacing[2],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[1],
  },
  value: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold as any,
    marginBottom: 1,
  },
  label: {
    fontSize: 10,
    color: '#64748B',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});

export default memo(ComplianceStatCard);
