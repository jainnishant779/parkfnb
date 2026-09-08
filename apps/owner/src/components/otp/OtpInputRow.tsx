import React, {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Animated,
  Platform,
  useColorScheme,
  Keyboard,
} from 'react-native';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';

// ============================================================================
// TYPES
// ============================================================================

export interface OtpInputRowProps {
  value: string[];
  onChange: (value: string[]) => void;
  length?: number;
  error?: boolean;
  disabled?: boolean;
  onComplete?: (otp: string) => void;
}

export interface OtpInputRowRef {
  focus: () => void;
  blur: () => void;
  shake: () => void;
  clear: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const OTP_LENGTH = 6;
const BOX_SIZE = 48;

// ============================================================================
// THEME HELPERS
// ============================================================================

const getTheme = (isDark: boolean) => ({
  background: isDark ? colors.gray[800] : colors.white,
  surface: isDark ? colors.gray[700] : colors.gray[50],
  border: isDark ? colors.gray[600] : colors.gray[300],
  borderFocused: colors.primary[500],
  borderError: colors.error[500],
  borderFilled: isDark ? colors.gray[500] : colors.gray[400],
  text: isDark ? colors.white : colors.gray[900],
  placeholder: isDark ? colors.gray[500] : colors.gray[400],
});

// ============================================================================
// OTP INPUT ROW COMPONENT
// ============================================================================

const OtpInputRow = forwardRef<OtpInputRowRef, OtpInputRowProps>(
  (
    {
      value,
      onChange,
      length = OTP_LENGTH,
      error = false,
      disabled = false,
      onComplete,
    },
    ref
  ) => {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const theme = getTheme(isDark);

    // Refs for each input
    const inputRefs = useRef<(TextInput | null)[]>([]);

    // Animation values
    const shakeAnimation = useRef(new Animated.Value(0)).current;
    const focusAnimations = useRef(
      Array.from({ length }, () => new Animated.Value(0))
    ).current;
    const scaleAnimations = useRef(
      Array.from({ length }, () => new Animated.Value(1))
    ).current;

    // Track focused index
    const focusedIndexRef = useRef<number>(-1);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      focus: () => {
        const firstEmptyIndex = value.findIndex((v) => !v);
        const indexToFocus = firstEmptyIndex === -1 ? 0 : firstEmptyIndex;
        inputRefs.current[indexToFocus]?.focus();
      },
      blur: () => {
        inputRefs.current.forEach((input) => input?.blur());
      },
      shake: () => {
        // Shake animation for error feedback
        Animated.sequence([
          Animated.timing(shakeAnimation, {
            toValue: 10,
            duration: 50,
            useNativeDriver: true,
          }),
          Animated.timing(shakeAnimation, {
            toValue: -10,
            duration: 50,
            useNativeDriver: true,
          }),
          Animated.timing(shakeAnimation, {
            toValue: 10,
            duration: 50,
            useNativeDriver: true,
          }),
          Animated.timing(shakeAnimation, {
            toValue: -10,
            duration: 50,
            useNativeDriver: true,
          }),
          Animated.timing(shakeAnimation, {
            toValue: 0,
            duration: 50,
            useNativeDriver: true,
          }),
        ]).start();
      },
      clear: () => {
        onChange(Array(length).fill(''));
        inputRefs.current[0]?.focus();
      },
    }));

    // Auto-focus first input on mount
    useEffect(() => {
      const timer = setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }, []);

    // Check for completion
    useEffect(() => {
      const otp = value.join('');
      if (otp.length === length && onComplete) {
        onComplete(otp);
      }
    }, [value, length, onComplete]);

    // Handle focus animation
    const animateFocus = useCallback(
      (index: number, isFocused: boolean) => {
        Animated.parallel([
          Animated.timing(focusAnimations[index], {
            toValue: isFocused ? 1 : 0,
            duration: 150,
            useNativeDriver: false,
          }),
          Animated.spring(scaleAnimations[index], {
            toValue: isFocused ? 1.05 : 1,
            friction: 8,
            tension: 100,
            useNativeDriver: true,
          }),
        ]).start();
      },
      [focusAnimations, scaleAnimations]
    );

    // Handle text change
    const handleChange = useCallback(
      (text: string, index: number) => {
        // Handle paste: if text is longer than 1 character
        if (text.length > 1) {
          // Extract only digits
          const digits = text.replace(/\D/g, '').slice(0, length);
          if (digits.length > 0) {
            const newValue = [...value];
            for (let i = 0; i < length; i++) {
              newValue[i] = digits[i] || '';
            }
            onChange(newValue);

            // Focus last filled input or the one after
            const lastFilledIndex = Math.min(digits.length - 1, length - 1);
            if (digits.length < length) {
              inputRefs.current[digits.length]?.focus();
            } else {
              inputRefs.current[lastFilledIndex]?.blur();
              Keyboard.dismiss();
            }
          }
          return;
        }

        // Single digit input
        const digit = text.replace(/\D/g, '');
        const newValue = [...value];
        newValue[index] = digit;
        onChange(newValue);

        // Auto-advance to next input
        if (digit && index < length - 1) {
          inputRefs.current[index + 1]?.focus();
        } else if (digit && index === length - 1) {
          inputRefs.current[index]?.blur();
          Keyboard.dismiss();
        }
      },
      [value, onChange, length]
    );

    // Handle key press for backspace
    const handleKeyPress = useCallback(
      (e: any, index: number) => {
        if (e.nativeEvent.key === 'Backspace') {
          if (!value[index] && index > 0) {
            // Move to previous input on backspace when current is empty
            const newValue = [...value];
            newValue[index - 1] = '';
            onChange(newValue);
            inputRefs.current[index - 1]?.focus();
          }
        }
      },
      [value, onChange]
    );

    // Handle focus
    const handleFocus = useCallback(
      (index: number) => {
        focusedIndexRef.current = index;
        animateFocus(index, true);
      },
      [animateFocus]
    );

    // Handle blur
    const handleBlur = useCallback(
      (index: number) => {
        focusedIndexRef.current = -1;
        animateFocus(index, false);
      },
      [animateFocus]
    );

    // Render individual OTP box
    const renderBox = (index: number) => {
      const isFilled = !!value[index];

      // Interpolate border color based on focus
      const borderColor = focusAnimations[index].interpolate({
        inputRange: [0, 1],
        outputRange: [
          error
            ? theme.borderError
            : isFilled
            ? theme.borderFilled
            : theme.border,
          error ? theme.borderError : theme.borderFocused,
        ],
      });

      // Interpolate border width
      const borderWidth = focusAnimations[index].interpolate({
        inputRange: [0, 1],
        outputRange: [1.5, 2],
      });

      return (
        <Animated.View
          key={index}
          style={[
            styles.boxContainer,
            {
              transform: [
                { translateX: shakeAnimation },
                { scale: scaleAnimations[index] },
              ],
            },
          ]}
        >
          <Animated.View
            style={[
              styles.box,
              {
                backgroundColor: theme.surface,
                borderColor,
                borderWidth,
              },
              error && styles.boxError,
            ]}
          >
            <TextInput
              ref={(input) => {
                inputRefs.current[index] = input;
              }}
              style={[styles.input, { color: theme.text }]}
              value={value[index]}
              onChangeText={(text) => handleChange(text, index)}
              onKeyPress={(e) => handleKeyPress(e, index)}
              onFocus={() => handleFocus(index)}
              onBlur={() => handleBlur(index)}
              keyboardType="number-pad"
              maxLength={length} // Allow paste
              selectTextOnFocus
              editable={!disabled}
              // iOS specific
              textContentType="oneTimeCode"
              // Android specific
              autoComplete={Platform.OS === 'android' ? 'sms-otp' : undefined}
              // Accessibility
              accessibilityLabel={`OTP digit ${index + 1} of ${length}`}
              accessibilityHint={
                isFilled
                  ? `Current value is ${value[index]}`
                  : 'Enter a digit'
              }
              accessibilityRole="text"
            />
          </Animated.View>
        </Animated.View>
      );
    };

    return (
      <View style={styles.container}>
        <Animated.View
          style={[
            styles.row,
            { transform: [{ translateX: shakeAnimation }] },
          ]}
        >
          {Array.from({ length }, (_, i) => renderBox(i))}
        </Animated.View>
      </View>
    );
  }
);

OtpInputRow.displayName = 'OtpInputRow';

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing[2],
  },
  boxContainer: {
    // For individual scaling
  },
  box: {
    width: BOX_SIZE,
    height: BOX_SIZE + 8,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  boxError: {
    // Error state handled via animated borderColor
  },
  input: {
    width: '100%',
    height: '100%',
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '600',
    padding: 0,
  },
});

export default OtpInputRow;
