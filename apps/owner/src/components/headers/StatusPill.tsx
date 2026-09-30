import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../theme/colors';
import { radii, fonts, palette } from '../../theme/kit';

// Types
export type StatusPillVariant = 'verified' | 'pending' | 'rejected' | 'unverified';

export interface StatusPillProps {
  status: StatusPillVariant;
  showIcon?: boolean;
  size?: 'small' | 'medium';
  testID?: string;
}

// Status configuration
interface StatusConfig {
  label: string;
  icon: string;
}

const STATUS_CONFIG: Record<StatusPillVariant, StatusConfig> = {
  verified: {
    label: 'Verified',
    icon: 'checkmark-circle',
  },
  pending: {
    label: 'Pending',
    icon: 'time',
  },
  rejected: {
    label: 'Rejected',
    icon: 'close-circle',
  },
  unverified: {
    label: 'Unverified',
    icon: 'alert-circle',
  },
};

// StatusPill component for displaying verification status
function StatusPill({
  status,
  showIcon = true,
  size = 'medium',
  testID,
}: StatusPillProps) {
  // Force light mode
  const theme = useMemo(() => getTheme(false), []);

  // Get status-specific colors
  const statusColors = useMemo(() => {
    switch (status) {
      case 'verified':
        return {
          background: theme.successLight,
          text: theme.success,
        };
      case 'pending':
        return {
          background: theme.warningLight,
          text: theme.warning,
        };
      case 'rejected':
        return {
          background: theme.dangerLight,
          text: theme.danger,
        };
      case 'unverified':
      default:
        return {
          background: palette.fill,
          text: theme.textMuted,
        };
    }
  }, [status, theme]);

  // Get size-specific dimensions
  const dimensions = useMemo(() => {
    switch (size) {
      case 'small':
        return {
          paddingHorizontal: 10,
          paddingVertical: 4,
          fontSize: 11,
          iconSize: 12,
          gap: 4,
          borderRadius: radii.pill,
        };
      case 'medium':
      default:
        return {
          paddingHorizontal: 12,
          paddingVertical: 6,
          fontSize: 12,
          iconSize: 14,
          gap: 5,
          borderRadius: radii.pill,
        };
    }
  }, [size]);

  const config = STATUS_CONFIG[status];

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: statusColors.background,
          paddingHorizontal: dimensions.paddingHorizontal,
          paddingVertical: dimensions.paddingVertical,
          borderRadius: dimensions.borderRadius,
          gap: showIcon ? dimensions.gap : 0,
        },
      ]}
      testID={testID}
      accessibilityLabel={`Status: ${config.label}`}
      accessibilityRole="text"
    >
      {showIcon && (
        <Ionicons
          name={config.icon}
          size={dimensions.iconSize}
          color={statusColors.text}
        />
      )}
      <Text
        style={[
          styles.label,
          {
            color: statusColors.text,
            fontSize: dimensions.fontSize,
          },
        ]}
        allowFontScaling
      >
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    ...fonts.semibold,
  },
});

export default memo(StatusPill);
