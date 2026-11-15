import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Keyboard,
  type TextStyle,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';
import { authService } from '../../services/authService';
import { ApiRequestError } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import AuthLayoutJs from '../../components/ui/AuthLayout';
import * as UI from '../../components/ui';
import * as Kit from '../../theme/kit';

// The UI kit is plain JS; give it loose component types and typed font tokens.
const AuthLayout = AuthLayoutJs as React.ComponentType<any>;
const { T, PillButton } = UI as unknown as Record<string, React.ComponentType<any>>;
const { palette, radii } = Kit;
const fonts = Kit.fonts as Record<keyof typeof Kit.fonts, TextStyle>;

// Use NativeStackScreenProps for proper typing
type Props = NativeStackScreenProps<AuthStackParamList, 'OtpVerify'>;

// The backend issues six digits (otpController's CODE_LENGTH).
const OTP_LENGTH = 6;
const RESEND_TIMER_SECONDS = 30;

export default function OtpVerifyScreen({ navigation, route }: Props) {
  const {
    contactLabel = '9865567887',
    identifier: rawIdentifier = '',
    channel = 'sms',
  } = route.params || {};

  const { signIn } = useAuth();

  const [otpValues, setOtpValues] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [timerSeconds, setTimerSeconds] = useState(RESEND_TIMER_SECONDS);
  const [isTimerRunning, setIsTimerRunning] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isDisabled, setIsDisabled] = useState(false);

  const inputRefs = useRef<(TextInput | null)[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  // Visual only: which digit cell currently has focus (ink border).
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  // Timer countdown
  useEffect(() => {
    if (!isTimerRunning) return;

    const interval = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          setIsTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isTimerRunning]);

  // contactLabel is already a masked, formatted string like "+91 91XXXXX765"
  // (built by SignInScreen via maskPhone). Use it directly — stripping
  // non-digits would collapse "+91 91XXXXX765" to "9191765".
  const displayNumber = contactLabel;
  const otpString = otpValues.join('');
  const isNextEnabled = otpString.length === OTP_LENGTH && !isLoading && !isDisabled;

  const handleChange = (text: string, index: number) => {
    const digit = text.replace(/\D/g, '');
    const newValues = [...otpValues];
    newValues[index] = digit;
    setOtpValues(newValues);
    setErrorMessage('');

    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otpValues[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleResend = async () => {
    if (isTimerRunning) return;

    try {
      await authService.resendOtp(rawIdentifier, channel as 'sms' | 'email');
      setTimerSeconds(RESEND_TIMER_SECONDS);
      setIsTimerRunning(true);
      setOtpValues(Array(OTP_LENGTH).fill(''));
      setErrorMessage('');
      setIsDisabled(false);
      inputRefs.current[0]?.focus();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'AUTH_OTP_RATE_LIMITED') {
        setErrorMessage('Too many requests. Please try again later.');
      } else {
        setErrorMessage('Failed to resend code. Please try again.');
      }
    }
  };

  /** Stop the resend countdown so the "Resend" button is tappable immediately. */
  const unlockResend = () => {
    setIsTimerRunning(false);
    setTimerSeconds(0);
  };

  /** Wipe the digit boxes and refocus the first input. */
  const clearOtpInputs = () => {
    setOtpValues(Array(OTP_LENGTH).fill(''));
    // Defer to the next tick so React commits the cleared state before we focus.
    setTimeout(() => inputRefs.current[0]?.focus(), 0);
  };

  const handleNext = async () => {
    if (!isNextEnabled) return;
    Keyboard.dismiss();
    setIsLoading(true);
    setErrorMessage('');

    let networkErrorKeepDigits = false;

    try {
      // The backend verifies the code and mints the JWT in one call. Owner
      // type is not captured pre-auth — the backend defaults new accounts to
      // 'individual' and merged onboarding sets the real value via
      // updateProfile.
      const response = await authService.verifyOtp(
        rawIdentifier,
        otpString,
        '',
        true,
      );

      // Sign in via AuthContext. RootNavigator listens to isAuthenticated +
      // onboardingStep and swaps the entire navigator tree accordingly —
      // unauthenticated → Auth stack; authenticated + completed/kyc_submitted
      // → MainTabs; otherwise → Onboarding (MergedOnboarding). No manual
      // navigation.dispatch is needed; in fact dispatching a RESET to a
      // route that only exists in the *next* tree races the re-render and
      // produces a "RESET was not handled by any navigator" warning.
      await signIn(response.token, response.user, response.owner);
    } catch (err) {
      const e = err as any;
      if (e?.code === 'NETWORK_ERROR' || e?.code === 'NETWORK_TIMEOUT') {
        // The code was never checked, so the digits are still good — let the
        // user tap Next again once the network is back.
        networkErrorKeepDigits = true;
        setErrorMessage(
          e?.code === 'NETWORK_TIMEOUT'
            ? "Server didn't respond. Check your connection and tap Next to try again."
            : "Can't reach the server. Check your connection and tap Next to try again.",
        );
      } else if (err instanceof ApiRequestError) {
        // The backend reports every rejected code as AUTH_INVALID_CREDENTIALS
        // and separates the cases by status: 400 is a wrong or expired code,
        // 429 means the code has been burned by too many attempts.
        if (err.code === 'AUTH_INVALID_CREDENTIALS' && err.http === 429) {
          setErrorMessage('Too many wrong attempts. Please request a new code.');
          setIsDisabled(true);
          unlockResend();
        } else if (err.code === 'AUTH_INVALID_CREDENTIALS') {
          const remaining = err.details?.attemptsRemaining;
          setErrorMessage(
            remaining !== undefined
              ? `Wrong code. ${remaining} attempt(s) remaining.`
              : err.message || 'Wrong or expired code. Please try again.',
          );
        } else if (err.code === 'RATE_LIMIT_EXCEEDED') {
          setErrorMessage('Too many requests. Please wait a moment and try again.');
          unlockResend();
        } else {
          setErrorMessage(err.message || 'Verification failed. Please try again.');
        }
      } else {
        setErrorMessage('Connection error. Please try again.');
        networkErrorKeepDigits = true;
      }

      // Clear digits on every error except transient network failures —
      // for network errors we keep the entry so the user can retry without
      // re-typing once they reconnect.
      if (!networkErrorKeepDigits) {
        clearOtpInputs();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const formatTimer = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <AuthLayout
      image={require('../../assets/images/login.jpg')}
      title={'Check your\nmessages'}
      subtitle="We sent you a one-time code."
      onBack={() => navigation.goBack()}
      scrollRef={scrollRef}
    >
      <T variant="h2">Enter code</T>
      <Text style={styles.lede}>
        Code sent to <Text style={styles.phoneHighlight}>{displayNumber}</Text>
        {'  '}
        <Text style={styles.change} onPress={() => navigation.goBack()}>
          Change
        </Text>
      </Text>

      {/* OTP Inputs */}
      <View style={styles.otpContainer}>
        {Array.from({ length: OTP_LENGTH }, (_, index) => {
          const filled = !!otpValues[index];
          const isFocused = focusedIndex === index;
          return (
            <View
              key={index}
              style={[
                styles.otpBox,
                (filled || isFocused) && styles.otpBoxActive,
                isFocused && styles.otpBoxFocused,
                !!errorMessage && !isLoading && styles.otpBoxError,
              ]}
            >
              <TextInput
                ref={(ref) => { inputRefs.current[index] = ref; }}
                style={styles.otpInput}
                value={otpValues[index]}
                onChangeText={(text) => handleChange(text, index)}
                onKeyPress={(e) => handleKeyPress(e, index)}
                onFocus={() => setFocusedIndex(index)}
                onBlur={() => setFocusedIndex((cur) => (cur === index ? null : cur))}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
              />
            </View>
          );
        })}
      </View>

      {/* Fixed-height slot so an error appearing does not shift the CTA. */}
      <View style={styles.errorSlot}>
        {errorMessage ? (
          <Text
            style={styles.errorText}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
          >
            {errorMessage}
          </Text>
        ) : null}
      </View>

      <PillButton
        label="Next"
        iconRight="arrow-right"
        variant="ink"
        onPress={handleNext}
        disabled={!isNextEnabled}
        loading={isLoading}
      />

      {/* Resend Code */}
      <View style={styles.resendContainer}>
        {isTimerRunning ? (
          <Text style={styles.timerText}>
            Resend code in <Text style={styles.timerValue}>{formatTimer(timerSeconds)}</Text>
          </Text>
        ) : (
          <TouchableOpacity onPress={handleResend} activeOpacity={0.7} hitSlop={8}>
            <Text style={styles.resendText}>Resend code</Text>
          </TouchableOpacity>
        )}
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  lede: { ...fonts.medium, fontSize: 14, lineHeight: 20, color: palette.textMuted, marginTop: 6 },
  phoneHighlight: { ...fonts.semibold, color: palette.text },
  change: { ...fonts.semibold, color: palette.text, textDecorationLine: 'underline' },

  otpContainer: {
    flexDirection: 'row',
    // Six cells share the sheet width so the row holds on narrow devices.
    gap: 8,
    marginTop: 24,
  },
  otpBox: {
    flex: 1,
    height: 64,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: palette.fill,
    backgroundColor: palette.fill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpBoxActive: { backgroundColor: palette.surface, borderColor: palette.line },
  otpBoxFocused: { borderColor: palette.ink },
  otpBoxError: { borderColor: palette.danger },
  otpInput: {
    ...fonts.semibold,
    width: '100%',
    height: '100%',
    textAlign: 'center',
    fontSize: 26,
    color: palette.text,
    // Android gives a TextInput default vertical padding and an extra
    // font-padding band on top of the glyph; strip both so the digit
    // stays centred inside the cell.
    padding: 0,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },

  errorSlot: { minHeight: 40, justifyContent: 'center' },
  errorText: { ...fonts.medium, fontSize: 13, color: palette.danger, textAlign: 'center' },

  resendContainer: { alignItems: 'center', marginTop: 20 },
  timerText: { ...fonts.medium, fontSize: 14, color: palette.textMuted },
  timerValue: { ...fonts.semibold, color: palette.text },
  resendText: { ...fonts.semibold, fontSize: 15, color: palette.text },
});
