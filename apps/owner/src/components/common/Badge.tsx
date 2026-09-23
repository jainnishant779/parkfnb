import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getTheme } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { palette, fonts } from '../../theme/kit';

// Types
export interface BadgeProps {
  count?: number;
  showDot?: boolean;
  maxCount?: number;
  size?: 'small' | 'medium' | 'large';
  color?: 'danger' | 'warning' | 'success' | 'primary';
  testID?: string;
}

// Badge component for notification counts or status indicators
function Badge({
  count,
  showDot = false,
  maxCount = 99,
  size = 'medium',
  color = 'danger',
  testID,
}: BadgeProps) {
  // Force light mode
  const theme = useMemo(() => getTheme(false), []);

  // Don't render if no count and not showing dot
  if (!showDot && (count === undefined || count === 0)) {
    return null;
  }

  // Get background color based on color prop
  const backgroundColor = useMemo(() => {
    switch (color) {
      case 'danger':
        return theme.danger;
      case 'warning':
        return theme.warning;
      case 'success':
        return theme.success;
      case 'primary':
        return palette.ink;
      default:
        return theme.danger;
    }
  }, [color, theme]);

  // Get size dimensions
  const dimensions = useMemo(() => {
    switch (size) {
      case 'small':
        return { minWidth: 16, height: 16, fontSize: 10, dotSize: 8 };
      case 'large':
        return { minWidth: 24, height: 24, fontSize: 14, dotSize: 14 };
      case 'medium':
      default:
        return { minWidth: 20, height: 20, fontSize: 12, dotSize: 10 };
    }
  }, [size]);

  // Format the count display
  const displayCount = useMemo(() => {
    if (count === undefined) return '';
    if (count > maxCount) return `${maxCount}+`;
    return count.toString();
  }, [count, maxCount]);

  // Render dot variant
  if (showDot && !count) {
    return (
      <View
        style={[
          styles.dotBadge,
          {
            width: dimensions.dotSize,
            height: dimensions.dotSize,
            borderRadius: dimensions.dotSize / 2,
            backgroundColor,
          },
        ]}
        testID={testID}
        accessibilityLabel="New notification"
        accessibilityRole="text"
      />
    );
  }

  // Render count variant
  return (
    <View
      style={[
        styles.countBadge,
        {
          minWidth: dimensions.minWidth,
          height: dimensions.height,
          borderRadius: dimensions.height / 2,
          backgroundColor,
          paddingHorizontal: displayCount.length > 1 ? spacing[1] + 2 : 0,
        },
      ]}
      testID={testID}
      accessibilityLabel={`${count} notifications`}
      accessibilityRole="text"
    >
      <Text
        style={[
          styles.countText,
          { fontSize: dimensions.fontSize },
        ]}
        allowFontScaling={false}
      >
        {displayCount}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dotBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    borderWidth: 2,
    borderColor: palette.surface,
  },
  countBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: palette.surface,
  },
  countText: {
    ...fonts.bold,
    color: palette.textInverse,
    includeFontPadding: false,
    textAlign: 'center',
  },
});

export default memo(Badge);
