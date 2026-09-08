import React from 'react';
import {
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';

// ============================================================================
// TYPES
// ============================================================================

export interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  accessibilityHint?: string;
}

// ============================================================================
// THEME
// ============================================================================

const buttonTheme = {
  primary: {
    background: colors.primary[600],
    backgroundPressed: colors.primary[700],
    backgroundDisabled: colors.gray[300],
    text: colors.white,
    textDisabled: colors.gray[500],
  },
  secondary: {
    background: colors.gray[100],
    backgroundPressed: colors.gray[200],
    backgroundDisabled: colors.gray[100],
    text: colors.gray[900],
    textDisabled: colors.gray[400],
  },
  outline: {
    background: colors.transparent,
    backgroundPressed: colors.primary[50],
    backgroundDisabled: colors.transparent,
    border: colors.primary[600],
    borderDisabled: colors.gray[300],
    text: colors.primary[600],
    textDisabled: colors.gray[400],
  },
  ghost: {
    background: colors.transparent,
    backgroundPressed: colors.gray[100],
    backgroundDisabled: colors.transparent,
    text: colors.primary[600],
    textDisabled: colors.gray[400],
  },
};

const sizeStyles = {
  small: {
    height: 40,
    paddingHorizontal: spacing[4],
    fontSize: fontSize.sm,
    borderRadius: borderRadius.md,
  },
  medium: {
    height: 48,
    paddingHorizontal: spacing[5],
    fontSize: fontSize.base,
    borderRadius: borderRadius.lg,
  },
  large: {
    height: 56,
    paddingHorizontal: spacing[6],
    fontSize: fontSize.lg,
    borderRadius: borderRadius.xl,
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function PrimaryButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  size = 'large',
  fullWidth = true,
  style,
  textStyle,
  accessibilityHint,
}: PrimaryButtonProps) {
  const theme = buttonTheme[variant];
  const sizeStyle = sizeStyles[size];
  const isDisabled = disabled || loading;

  const getBackgroundColor = (pressed: boolean) => {
    if (isDisabled) return theme.backgroundDisabled;
    if (pressed) return theme.backgroundPressed;
    return theme.background;
  };

  const getTextColor = () => {
    if (isDisabled) return theme.textDisabled;
    return theme.text;
  };

  const getBorderColor = () => {
    if (variant === 'outline') {
      return isDisabled
        ? buttonTheme.outline.borderDisabled
        : buttonTheme.outline.border;
    }
    return 'transparent';
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        {
          height: sizeStyle.height,
          paddingHorizontal: sizeStyle.paddingHorizontal,
          borderRadius: sizeStyle.borderRadius,
          backgroundColor: getBackgroundColor(pressed),
          borderWidth: variant === 'outline' ? 1.5 : 0,
          borderColor: getBorderColor(),
          width: fullWidth ? '100%' : undefined,
        },
        !isDisabled && variant === 'primary' && styles.shadow,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled }}
    >
      {loading ? (
        <ActivityIndicator
          color={getTextColor()}
          size={size === 'small' ? 'small' : 'small'}
        />
      ) : (
        <Text
          style={[
            styles.text,
            {
              fontSize: sizeStyle.fontSize,
              color: getTextColor(),
            },
            textStyle,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shadow: {
    ...Platform.select({
      ios: {
        shadowColor: colors.primary[600],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  text: {
    fontWeight: fontWeight.semibold as any,
    textAlign: 'center',
  },
});
