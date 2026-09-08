import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Platform,
  TextInputProps,
  ViewStyle,
  Animated,
} from 'react-native';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';

// ============================================================================
// TYPES
// ============================================================================

export interface FormTextInputProps extends Omit<TextInputProps, 'style'> {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightAction?: {
    icon: React.ReactNode;
    onPress: () => void;
    accessibilityLabel: string;
  };
  containerStyle?: ViewStyle;
  disabled?: boolean;
  onBlur?: () => void;
  onFocus?: () => void;
}

// ============================================================================
// THEME
// ============================================================================

const inputTheme = {
  background: colors.white,
  backgroundDisabled: colors.gray[100],
  border: colors.gray[300],
  borderFocused: colors.primary[500],
  borderError: colors.error[500],
  text: colors.gray[900],
  textDisabled: colors.gray[400],
  placeholder: colors.gray[400],
  label: colors.gray[700],
  helper: colors.gray[500],
  error: colors.error[500],
  required: colors.error[500],
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function FormTextInput({
  label,
  value,
  onChangeText,
  placeholder,
  required = false,
  error,
  helperText,
  leftIcon,
  rightAction,
  containerStyle,
  disabled = false,
  onBlur,
  onFocus,
  ...textInputProps
}: FormTextInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const errorAnim = useRef(new Animated.Value(0)).current;

  // Animate error appearance
  React.useEffect(() => {
    Animated.timing(errorAnim, {
      toValue: error ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [error, errorAnim]);

  const handleFocus = () => {
    setIsFocused(true);
    onFocus?.();
  };

  const handleBlur = () => {
    setIsFocused(false);
    onBlur?.();
  };

  const getBorderColor = () => {
    if (error) return inputTheme.borderError;
    if (isFocused) return inputTheme.borderFocused;
    return inputTheme.border;
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {/* Label */}
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {required && <Text style={styles.required}> *</Text>}
      </View>

      {/* Input Container */}
      <Pressable
        onPress={() => inputRef.current?.focus()}
        style={[
          styles.inputContainer,
          {
            borderColor: getBorderColor(),
            backgroundColor: disabled
              ? inputTheme.backgroundDisabled
              : inputTheme.background,
          },
        ]}
        accessibilityRole="none"
      >
        {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}

        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            leftIcon && styles.inputWithLeftIcon,
            rightAction && styles.inputWithRightAction,
            disabled && styles.inputDisabled,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={inputTheme.placeholder}
          editable={!disabled}
          onFocus={handleFocus}
          onBlur={handleBlur}
          accessibilityLabel={`${label}${required ? ', required' : ''}`}
          accessibilityHint={helperText || undefined}
          accessibilityState={{ disabled }}
          {...textInputProps}
        />

        {rightAction && (
          <Pressable
            onPress={rightAction.onPress}
            style={styles.rightAction}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={rightAction.accessibilityLabel}
            accessibilityRole="button"
          >
            {rightAction.icon}
          </Pressable>
        )}
      </Pressable>

      {/* Helper / Error Text */}
      {(error || helperText) && (
        <Animated.View
          style={[
            styles.bottomTextContainer,
            {
              opacity: error ? errorAnim : 1,
            },
          ]}
          accessibilityLiveRegion={error ? 'polite' : 'none'}
        >
          <Text
            style={[
              styles.bottomText,
              error ? styles.errorText : styles.helperText,
            ]}
          >
            {error || helperText}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing[3],
  },
  labelRow: {
    flexDirection: 'row',
    marginBottom: spacing[1],
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: inputTheme.label,
  },
  required: {
    fontSize: fontSize.sm,
    color: inputTheme.required,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: borderRadius.lg,
    minHeight: 52,
    paddingHorizontal: spacing[4],
    ...Platform.select({
      ios: {
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  leftIcon: {
    marginRight: spacing[3],
  },
  input: {
    flex: 1,
    fontSize: fontSize.base,
    color: inputTheme.text,
    paddingVertical: Platform.OS === 'ios' ? spacing[3] : spacing[2],
  },
  inputWithLeftIcon: {
    // Already handled by flex
  },
  inputWithRightAction: {
    paddingRight: spacing[2],
  },
  inputDisabled: {
    color: inputTheme.textDisabled,
  },
  rightAction: {
    padding: spacing[1],
  },
  bottomTextContainer: {
    marginTop: spacing[1],
    paddingHorizontal: spacing[1],
  },
  bottomText: {
    fontSize: fontSize.xs,
  },
  helperText: {
    color: inputTheme.helper,
  },
  errorText: {
    color: inputTheme.error,
  },
});
