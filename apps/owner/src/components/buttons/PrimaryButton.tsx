import React from 'react';
import {
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { palette, radii, fonts } from '../../theme/kit';

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
    background: palette.ink,
    backgroundDisabled: '#D6D6D6',
    text: palette.textInverse,
    textDisabled: palette.surface,
  },
  secondary: {
    background: palette.fill,
    backgroundDisabled: palette.fill,
    text: palette.text,
    textDisabled: palette.textSubtle,
  },
  outline: {
    background: palette.surface,
    backgroundDisabled: palette.surface,
    border: palette.ink,
    borderDisabled: palette.line,
    text: palette.text,
    textDisabled: palette.textSubtle,
  },
  ghost: {
    background: 'transparent',
    backgroundDisabled: 'transparent',
    text: palette.text,
    textDisabled: palette.textSubtle,
  },
};

const sizeStyles = {
  small: {
    height: 40,
    paddingHorizontal: 16,
    fontSize: 14,
  },
  medium: {
    height: 48,
    paddingHorizontal: 20,
    fontSize: 15,
  },
  large: {
    height: 58,
    paddingHorizontal: 24,
    fontSize: 16,
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

  const backgroundColor = isDisabled ? theme.backgroundDisabled : theme.background;

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
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      style={[
        styles.button,
        {
          height: sizeStyle.height,
          paddingHorizontal: sizeStyle.paddingHorizontal,
          backgroundColor,
          borderWidth: variant === 'outline' ? 1.5 : 0,
          borderColor: getBorderColor(),
          width: fullWidth ? '100%' : undefined,
        },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled }}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} size="small" />
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
    </TouchableOpacity>
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
    borderRadius: radii.pill,
  },
  text: {
    ...fonts.semibold,
    textAlign: 'center',
  },
});
