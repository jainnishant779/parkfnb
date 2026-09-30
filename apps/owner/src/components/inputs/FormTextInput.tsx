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
import { palette, radii, fonts } from '../../theme/kit';

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
  background: palette.fill,
  backgroundFocused: palette.surface,
  backgroundDisabled: palette.surfaceDim,
  border: palette.fill,
  borderFocused: palette.ink,
  borderError: palette.danger,
  text: palette.text,
  textDisabled: palette.textSubtle,
  placeholder: palette.textSubtle,
  label: palette.textMuted,
  helper: palette.textMuted,
  error: palette.danger,
  required: palette.danger,
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
    return disabled ? inputTheme.backgroundDisabled : inputTheme.border;
  };

  const getBackgroundColor = () => {
    if (disabled) return inputTheme.backgroundDisabled;
    if (isFocused || error) return inputTheme.backgroundFocused;
    return inputTheme.background;
  };

  // Multiline fields keep a rounded rectangle; single-line fields are pills.
  const isMultiline = !!textInputProps.multiline;

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
            backgroundColor: getBackgroundColor(),
          },
          isMultiline && styles.inputContainerMultiline,
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
    marginBottom: 14,
  },
  labelRow: {
    flexDirection: 'row',
    marginBottom: 8,
    marginLeft: 4,
  },
  label: {
    ...fonts.medium,
    fontSize: 13,
    color: inputTheme.label,
  },
  required: {
    ...fonts.semibold,
    fontSize: 13,
    color: inputTheme.required,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: radii.pill,
    minHeight: 56,
    paddingHorizontal: 20,
  },
  inputContainerMultiline: {
    borderRadius: radii.lg,
    alignItems: 'flex-start',
    paddingVertical: 6,
  },
  leftIcon: {
    marginRight: 10,
  },
  input: {
    ...fonts.medium,
    flex: 1,
    fontSize: 16,
    color: inputTheme.text,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  inputWithLeftIcon: {
    // Already handled by flex
  },
  inputWithRightAction: {
    paddingRight: 8,
  },
  inputDisabled: {
    color: inputTheme.textDisabled,
  },
  rightAction: {
    padding: 4,
  },
  bottomTextContainer: {
    marginTop: 6,
    paddingHorizontal: 8,
  },
  bottomText: {
    ...fonts.medium,
    fontSize: 12.5,
  },
  helperText: {
    color: inputTheme.helper,
  },
  errorText: {
    color: inputTheme.error,
  },
});
