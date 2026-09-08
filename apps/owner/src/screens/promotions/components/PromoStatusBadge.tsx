// PromoStatusBadge Component - Status indicator for promotions
import React, { memo, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../../theme/colors';
import { spacing, borderRadius } from '../../../theme/spacing';
import { fontSize, fontWeight } from '../../../theme/typography';
import type { PromoStatus } from '../../../types/promo';
import { getStatusDisplayInfo } from '../../../utils/promoHelpers';

interface PromoStatusBadgeProps {
  status: PromoStatus;
  size?: 'small' | 'medium';
  showIcon?: boolean;
  testID?: string;
}

function PromoStatusBadge({
  status,
  size = 'medium',
  showIcon = true,
  testID,
}: PromoStatusBadgeProps) {
  const theme = useMemo(() => getTheme(false), []);
  const displayInfo = useMemo(() => getStatusDisplayInfo(status), [status]);

  const getColorStyles = useCallback(() => {
    switch (displayInfo.color) {
      case 'success':
        return {
          bg: theme.successLight,
          text: theme.success,
        };
      case 'warning':
        return {
          bg: theme.warningLight,
          text: theme.warning,
        };
      case 'danger':
        return {
          bg: theme.dangerLight,
          text: theme.danger,
        };
      case 'muted':
        return {
          bg: theme.borderLight,
          text: theme.textMuted,
        };
      case 'neutral':
      default:
        return {
          bg: theme.borderLight,
          text: theme.textSecondary,
        };
    }
  }, [displayInfo.color, theme]);

  const colorStyles = getColorStyles();
  const isSmall = size === 'small';

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colorStyles.bg },
        isSmall && styles.containerSmall,
      ]}
      testID={testID}
      accessibilityLabel={`Status: ${displayInfo.label}`}
    >
      {showIcon && (
        <Ionicons
          name={displayInfo.icon}
          size={isSmall ? 12 : 14}
          color={colorStyles.text}
        />
      )}
      <Text
        style={[
          styles.label,
          { color: colorStyles.text },
          isSmall && styles.labelSmall,
        ]}
      >
        {displayInfo.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[2],
    borderRadius: borderRadius.md,
    gap: spacing[1],
    alignSelf: 'flex-start',
  },
  containerSmall: {
    paddingVertical: 2,
    paddingHorizontal: spacing[1] + 2,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },
  labelSmall: {
    fontSize: 10,
  },
});

export default memo(PromoStatusBadge);
