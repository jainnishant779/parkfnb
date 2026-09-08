import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  StatusBar,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { AuthStackParamList } from '../../navigation/types';
import { authService } from '../../services/authService';
import { ApiRequestError } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

// Use NativeStackScreenProps for proper typing
type Props = NativeStackScreenProps<AuthStackParamList, 'OtpVerify'>;

// The backend issues six digits (otpController's CODE_LENGTH).
const OTP_LENGTH = 6;
const RESEND_TIMER_SECONDS = 30;

const theme = {
  colors: {
    background: '#FFFFFF',
    primary: '#0D7377',
    primaryLight: '#EBF4FF',
    textPrimary: '#1F2937',
    textSecondary: '#6B7280',
    border: '#C3E4E1',
    buttonDisabled: '#9CA3AF',
    buttonText: '#FFFFFF',
  },
};

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
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Decorative Circles */}
      <View style={styles.circleTopRight} />
      <View style={styles.circleTopRightInner} />
      <View style={styles.circleBottomLeft} />

      {/* Back Button */}
      <Pressable
        onPress={() => navigation.goBack()}
        style={styles.backButton}
      >
        <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
      </Pressable>

      {/* Content */}
      <View style={styles.content}>
        {/* Header */}
        <Text style={styles.title}>Enter Code</Text>
        <Text style={styles.subtitle}>code will be sent to {displayNumber}</Text>

        {/* OTP Inputs */}
        <View style={styles.otpContainer}>
          {Array.from({ length: OTP_LENGTH }, (_, index) => (
            <View
              key={index}
              style={[
                styles.otpBox,
                otpValues[index] && styles.otpBoxFilled,
              ]}
            >
              <TextInput
                ref={(ref) => { inputRefs.current[index] = ref; }}
                style={styles.otpInput}
                value={otpValues[index]}
                onChangeText={(text) => handleChange(text, index)}
                onKeyPress={(e) => handleKeyPress(e, index)}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
              />
            </View>
          ))}
        </View>

        {/* Error message */}
        {errorMessage ? (
          <Text
            style={styles.errorText}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
          >
            {errorMessage}
          </Text>
        ) : null}

        {/* Resend Code */}
        <View style={styles.resendContainer}>
          {isTimerRunning ? (
            <Text style={styles.timerText}>
              Resend Code in {formatTimer(timerSeconds)}
            </Text>
          ) : (
            <Pressable onPress={handleResend}>
              <Text style={styles.resendText}>Resend Code</Text>
            </Pressable>
          )}
        </View>

        {/* Next Button */}
        <Pressable
          onPress={handleNext}
          disabled={!isNextEnabled}
          style={[
            styles.nextButton,
            !isNextEnabled && styles.nextButtonDisabled,
          ]}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.nextButtonText}>Next</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  // Decorative Circles (same as SignIn screen)
  circleTopRight: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 130,
    height: 130,
    borderRadius: 70,
    backgroundColor: '#EBF4FF',
  },
  circleTopRightInner: {
    position: 'absolute',
    top: 50,
    right: 70,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E6FE8',
  },
  circleBottomLeft: {
    position: 'absolute',
    bottom: -60,
    left: -60,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#EBF4FF',
  },

  // Back Button
  backButton: {
    position: 'absolute',
    top: 20,
    left: 24,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EBF4FF',
    borderRadius: 20,
    zIndex: 10,
  },

  // Content
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 150,
    alignItems: 'center',
  },

  // Header
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginBottom: 50,
  },

  // OTP Inputs
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    // The parent centres its children, so the row needs to claim the full
    // width before flex:1 on the boxes can divide it.
    alignSelf: 'stretch',
    // Six boxes at a fixed 70px overflowed the screen; let them share the
    // row's width instead so the layout holds on narrow devices.
    gap: 8,
    marginBottom: 24,
  },
  otpBox: {
    flex: 1,
    maxWidth: 70,
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpBoxFilled: {
    borderColor: theme.colors.primary,
  },
  otpInput: {
    width: '100%',
    height: '100%',
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },

  // Error
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },

  // Resend
  resendContainer: {
    marginBottom: 32,
  },
  timerText: {
    fontSize: 15,
    color: theme.colors.textSecondary,
  },
  resendText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.primary,
  },

  // Next Button
  nextButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    height: 60,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextButtonDisabled: {
    backgroundColor: theme.colors.buttonDisabled,
  },
  nextButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.buttonText,
  },
});
