/**
 * OTPVerification — 6-digit code entry, verified by our backend.
 *
 * Functional behavior preserved 1:1 from prior version:
 *   - 30s resend cooldown
 *   - authService.verifyOtp(identifier, code) → auth.signIn
 *   - same error mapping (network keeps digits, others reset)
 *   - authService.resendOtp on resend
 *   - auto-verify when all digits are entered
 *
 * Visuals: large airy header, six glass digit cells with focus halo
 * driven by an animated border. Sat on the warm ambient background so
 * the cells actually look like glass, not flat tiles.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Pressable,
  Animated,
  Easing,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../context/AuthContext';
import * as authService from '../../services/authService';
import { maskPhone } from '../../utils/validateForm';

import AmbientBackground from '../../components/glass/AmbientBackground';
import GlassCard from '../../components/glass/GlassCard';
import GlassButton from '../../components/glass/GlassButton';
import { BackIcon } from '../../components/glass/Icons';
import { palette, typography, spacing, fontStacks, radii } from '../../theme';

const RESEND_COOLDOWN = 30;

// The backend issues the code and verifies it, so the digits the user types
// are what gets sent. (This replaced a client-side MSG91 check that then asked
// the backend for a session with a fixed '1234' — which let anyone mint a JWT
// for any number.)
const OTP_LENGTH = 6;
const emptyOtp = () => Array(OTP_LENGTH).fill('');

const DigitCell = ({ value, focused, error }) => {
  const halo = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(halo, {
      toValue: focused ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [focused, halo]);

  const borderColor = error
    ? palette.danger
    : halo.interpolate({
        inputRange: [0, 1],
        outputRange: ['rgba(255,255,255,0.6)', palette.primary],
      });

  return (
    <Animated.View
      style={[
        styles.cellWrap,
        {
          borderColor,
          backgroundColor: value
            ? palette.glassWhiteStrong
            : palette.glassWhite,
        },
      ]}
    >
      <Text style={styles.cellDigit}>{value}</Text>
    </Animated.View>
  );
};

const OTPVerification = ({ navigation, route }) => {
  const { identifier = '' } = route?.params || {};
  const auth = useAuth();

  const [otp, setOtp] = useState(emptyOtp);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(RESEND_COOLDOWN);
  const [isResendActive, setIsResendActive] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);

  const inputRefs = useRef([]);
  const scrollRef = useRef(null);

  // Scroll the OTP card + Verify button into view when the user taps a
  // digit cell. Without this the keyboard covers the bottom of the form.
  const handleCellFocus = (index) => {
    setFocusIndex(index);
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  // Entrance animation
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter]);

  // Countdown
  useEffect(() => {
    if (timerSeconds <= 0) {
      setIsResendActive(true);
      return;
    }
    const t = setTimeout(() => setTimerSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timerSeconds]);

  const handleOtpChange = (value, index) => {
    if (isDisabled || isLoading) return;
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    setErrorMessage('');
    if (value && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const isOtpComplete = otp.every((d) => d !== '');

  const handleVerify = useCallback(async () => {
    if (!isOtpComplete || isLoading || isDisabled) return;

    const otpString = otp.join('');
    setIsLoading(true);
    setErrorMessage('');

    try {
      const response = await authService.verifyOtp(identifier, otpString);
      await auth.signIn(response.token, response.user);
    } catch (err) {
      const code = err?.code || '';
      let keepDigits = false;

      if (code === 'AUTH_INVALID_CREDENTIALS') {
        // The backend puts the remaining-attempt count in the message.
        setErrorMessage(err?.message || 'Incorrect code. Please try again.');
      } else if (code === 'RATE_LIMIT_EXCEEDED') {
        setErrorMessage(err?.message || 'Too many attempts. Please request a new code.');
        setIsDisabled(true);
        setIsResendActive(true);
        setTimerSeconds(0);
      } else if (code === 'AUTH_OTP_INVALID') {
        const remaining = err?.details?.attemptsRemaining;
        setErrorMessage(
          remaining !== undefined
            ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            : 'Incorrect code. Please try again.'
        );
      } else if (code === 'AUTH_OTP_EXPIRED') {
        setErrorMessage('This code has expired. Please request a new one.');
        setIsResendActive(true);
      } else if (code === 'AUTH_OTP_MAX_ATTEMPTS') {
        setErrorMessage('Too many incorrect attempts. Please request a new code.');
        setIsDisabled(true);
        setIsResendActive(true);
      } else if (code === 'NETWORK_ERROR' || code === 'NETWORK_TIMEOUT') {
        setErrorMessage('No internet connection. Please try again.');
        keepDigits = true;
      } else {
        setErrorMessage(err?.message || 'Verification failed. Please try again.');
      }

      if (!keepDigits) {
        setOtp(emptyOtp());
        setTimeout(() => inputRefs.current[0]?.focus(), 100);
      }
    } finally {
      setIsLoading(false);
    }
  }, [otp, identifier, isOtpComplete, isLoading, isDisabled, auth]);

  // Auto-verify when complete
  useEffect(() => {
    if (isOtpComplete && !isLoading && !isDisabled) {
      handleVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOtpComplete]);

  const handleResend = async () => {
    if (!isResendActive || isLoading) return;
    try {
      await authService.resendOtp(identifier);
      setOtp(emptyOtp());
      setErrorMessage('');
      setIsDisabled(false);
      setIsResendActive(false);
      setTimerSeconds(RESEND_COOLDOWN);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err) {
      const code = err?.code || '';
      if (code === 'RATE_LIMIT_EXCEEDED') {
        // The backend says how long to wait.
        setErrorMessage(err?.message || 'Please wait before requesting another code.');
      } else if (code === 'NETWORK_ERROR' || code === 'NETWORK_TIMEOUT') {
        setErrorMessage('No internet connection. Please try again.');
      } else {
        setErrorMessage(err?.message || 'Failed to resend code. Please try again.');
      }
    }
  };

  const cardSlide = enter.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });
  const maskedPhone = identifier ? maskPhone(identifier) : '';

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <AmbientBackground>
        <SafeAreaView style={styles.safe}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
            keyboardVerticalOffset={0}
          >
            <ScrollView
              ref={scrollRef}
              contentContainerStyle={styles.scroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              automaticallyAdjustKeyboardInsets
            >
              {/* Top row */}
              <View style={styles.topRow}>
                <Pressable
                  onPress={() => navigation.goBack()}
                  hitSlop={10}
                  style={styles.backBtn}
                >
                  <BackIcon color={palette.text} />
                </Pressable>
                <Text style={styles.brand}>PARKFNB</Text>
                <View style={{ width: 24 }} />
              </View>

              <Animated.View
                style={{
                  opacity: enter,
                  transform: [{ translateY: cardSlide }],
                }}
              >
                <View style={styles.headline}>
                  <Text style={styles.eyebrow}>Verify</Text>
                  <Text style={styles.title}>Enter the{'\n'}code.</Text>
                  <Text style={styles.subtitle}>
                    A 6-digit code was sent to{' '}
                    <Text style={styles.phoneHighlight}>
                      {maskedPhone || identifier}
                    </Text>
                  </Text>
                </View>

                <GlassCard radius={radii.lg} intensity={20} style={styles.card}>
                  <View style={styles.cardInner}>
                    {/* Cells row — visual cells overlay invisible inputs for
                        styling control while keeping native keyboard behavior. */}
                    <View style={styles.cellsRow}>
                      {otp.map((digit, index) => (
                        <View key={index} style={styles.cellSlot}>
                          <DigitCell
                            value={digit}
                            focused={focusIndex === index}
                            error={!!errorMessage && !isLoading}
                          />
                          <TextInput
                            ref={(r) => (inputRefs.current[index] = r)}
                            style={styles.hiddenInput}
                            value={digit}
                            onChangeText={(v) => handleOtpChange(v, index)}
                            onKeyPress={(e) => handleKeyPress(e, index)}
                            onFocus={() => handleCellFocus(index)}
                            keyboardType="number-pad"
                            maxLength={1}
                            selectTextOnFocus
                            editable={!isDisabled && !isLoading}
                            caretHidden
                          />
                        </View>
                      ))}
                    </View>

                    {errorMessage ? (
                      <Text
                        style={styles.errorText}
                        accessibilityRole="alert"
                        accessibilityLiveRegion="assertive"
                      >
                        {errorMessage}
                      </Text>
                    ) : null}

                    {/* Resend */}
                    <View style={styles.resendRow}>
                      {isResendActive ? (
                        <Pressable onPress={handleResend} disabled={isLoading}>
                          <Text style={styles.resendActive}>Resend code</Text>
                        </Pressable>
                      ) : (
                        <Text style={styles.resendIdle}>
                          Resend in{' '}
                          <Text style={styles.resendTimer}>{timerSeconds}s</Text>
                        </Text>
                      )}
                    </View>

                    <GlassButton
                      label="Verify"
                      onPress={handleVerify}
                      disabled={!isOtpComplete || isDisabled}
                      loading={isLoading}
                      fullWidth
                      style={{ marginTop: spacing.md }}
                    />
                  </View>
                </GlassCard>
              </Animated.View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </AmbientBackground>
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    fontFamily: fontStacks.regular,
    fontSize: 20,
    fontWeight: '300',
    letterSpacing: 4,
    color: palette.text,
  },
  headline: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  eyebrow: {
    ...typography.label,
    color: palette.primary,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fontStacks.regular,
    fontSize: 44,
    fontWeight: '300',
    letterSpacing: -1.5,
    lineHeight: 48,
    color: palette.text,
    marginBottom: spacing.md,
  },
  subtitle: {
    ...typography.body,
    color: palette.textMuted,
  },
  phoneHighlight: {
    color: palette.text,
    fontFamily: fontStacks.medium,
    fontWeight: '500',
  },
  card: { width: '100%' },
  cardInner: { padding: spacing.lg + 4 },
  cellsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  // Six cells have to share the card width, so they flex instead of taking a
  // fixed 64pt each — at that width the last cells fell outside the card.
  cellSlot: {
    flex: 1,
    height: 72,
    position: 'relative',
  },
  cellWrap: {
    flex: 1,
    borderRadius: radii.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellDigit: {
    fontFamily: fontStacks.regular,
    fontSize: 28,
    fontWeight: '400',
    color: palette.text,
    letterSpacing: -1,
  },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    color: 'transparent',
    fontSize: 1,
    textAlign: 'center',
    backgroundColor: 'transparent',
  },
  errorText: {
    fontSize: 12,
    color: palette.danger,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  resendRow: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  resendActive: {
    color: palette.text,
    fontFamily: fontStacks.medium,
    fontWeight: '500',
    fontSize: 14,
  },
  resendIdle: {
    color: palette.textMuted,
    fontFamily: fontStacks.regular,
    fontSize: 14,
  },
  resendTimer: {
    color: palette.text,
    fontFamily: fontStacks.medium,
    fontWeight: '500',
  },
});

export default OTPVerification;
