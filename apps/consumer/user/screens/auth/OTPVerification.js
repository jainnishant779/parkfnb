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
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
  Keyboard,
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

const DigitCell = ({ value, focused, error }) => {
  const halo = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(halo, {
      toValue: focused ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [focused, halo]);

  // The card is near-white, so a white border/fill made the cells vanish.
  const borderColor = error
    ? palette.danger
    : halo.interpolate({
        inputRange: [0, 1],
        outputRange: ['rgba(26,26,46,0.16)', palette.primary],
      });

  return (
    <Animated.View
      style={[
        styles.cellWrap,
        {
          borderColor,
          backgroundColor: value ? '#FFFFFF' : 'rgba(26,26,46,0.04)',
        },
      ]}
    >
      <Text style={styles.cellDigit}>{value}</Text>
    </Animated.View>
  );
};

/**
 * Resend countdown lives in its own component. When the tick was state of the
 * whole screen, every second re-rendered all six controlled TextInputs and the
 * Verify button, which is what made the page flicker.
 */
const ResendRow = React.memo(({ cooldownKey, forceActive, onResend, disabled }) => {
  const [seconds, setSeconds] = useState(RESEND_COOLDOWN);

  useEffect(() => {
    setSeconds(RESEND_COOLDOWN);
  }, [cooldownKey]);

  useEffect(() => {
    if (seconds <= 0) return undefined;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const active = forceActive || seconds <= 0;

  return (
    <View style={styles.resendRow}>
      {active ? (
        <Pressable onPress={onResend} disabled={disabled}>
          <Text style={styles.resendActive}>Resend code</Text>
        </Pressable>
      ) : (
        <Text style={styles.resendIdle}>
          Resend in <Text style={styles.resendTimer}>{seconds}s</Text>
        </Text>
      )}
    </View>
  );
});

const OTPVerification = ({ navigation, route }) => {
  const { identifier = '' } = route?.params || {};
  const auth = useAuth();

  // One string of typed digits, shown across six cells. A single TextInput
  // (instead of six that pass focus to each other) is what stops digits being
  // dropped, the keyboard bouncing and the page flickering while typing.
  const [digits, setDigits] = useState('');
  const otp = useMemo(
    () => Array.from({ length: OTP_LENGTH }, (_, i) => digits[i] || ''),
    [digits],
  );
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);
  // Bumped on a successful resend to restart the countdown in ResendRow;
  // forceResend unlocks "Resend code" early (expired / too many attempts).
  const [resendKey, setResendKey] = useState(0);
  const [forceResend, setForceResend] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  // Keep the Verify button in view once per keyboard open. (This used to run
  // an animated scrollToEnd on every digit, which made the card jump while
  // typing.) The window already resizes for the keyboard (adjustResize).
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      scrollRef.current?.scrollToEnd({ animated: false });
    });
    return () => sub.remove();
  }, []);

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

  const handleDigitsChange = (value) => {
    if (isDisabled || isLoading) return;
    setDigits(value.replace(/\D/g, '').slice(0, OTP_LENGTH));
    setErrorMessage('');
  };

  const isOtpComplete = digits.length === OTP_LENGTH;

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
        setForceResend(true);
      } else if (code === 'AUTH_OTP_INVALID') {
        const remaining = err?.details?.attemptsRemaining;
        setErrorMessage(
          remaining !== undefined
            ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            : 'Incorrect code. Please try again.'
        );
      } else if (code === 'AUTH_OTP_EXPIRED') {
        setErrorMessage('This code has expired. Please request a new one.');
        setForceResend(true);
      } else if (code === 'AUTH_OTP_MAX_ATTEMPTS') {
        setErrorMessage('Too many incorrect attempts. Please request a new code.');
        setIsDisabled(true);
        setForceResend(true);
      } else if (code === 'NETWORK_ERROR' || code === 'NETWORK_TIMEOUT') {
        setErrorMessage('No internet connection. Please try again.');
        keepDigits = true;
      } else {
        setErrorMessage(err?.message || 'Verification failed. Please try again.');
      }

      if (!keepDigits) {
        setDigits('');
        setTimeout(() => inputRef.current?.focus(), 100);
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

  const handleResend = useCallback(async () => {
    if (isLoading) return;
    try {
      await authService.resendOtp(identifier);
      setDigits('');
      setErrorMessage('');
      setIsDisabled(false);
      setForceResend(false);
      setResendKey((k) => k + 1);
      setTimeout(() => inputRef.current?.focus(), 100);
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
  }, [isLoading, identifier]);

  const cardSlide = enter.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });
  const maskedPhone = identifier ? maskPhone(identifier) : '';

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <AmbientBackground>
        <SafeAreaView style={styles.safe}>
          {/* Android already resizes the window (adjustResize); a second
              'height' adjustment here fought it and made the page jump. */}
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
                    {/* Six display cells with ONE invisible input laid over the
                        whole row: tapping anywhere focuses it, typing/pasting/SMS
                        autofill fill the cells left to right. */}
                    <View style={styles.cellsRow}>
                      {otp.map((digit, index) => (
                        <View key={index} style={styles.cellSlot}>
                          <DigitCell
                            value={digit}
                            focused={inputFocused && index === Math.min(digits.length, OTP_LENGTH - 1)}
                            error={!!errorMessage && !isLoading}
                          />
                        </View>
                      ))}
                      <TextInput
                        ref={inputRef}
                        style={styles.hiddenInput}
                        value={digits}
                        onChangeText={handleDigitsChange}
                        onFocus={() => setInputFocused(true)}
                        onBlur={() => setInputFocused(false)}
                        keyboardType="number-pad"
                        maxLength={OTP_LENGTH}
                        textContentType="oneTimeCode"
                        autoComplete="sms-otp"
                        autoFocus
                        editable={!isDisabled}
                        caretHidden
                        contextMenuHidden
                      />
                    </View>

                    {/* Fixed-height slot so an error appearing/clearing does not
                        push the Resend link and Verify button up and down. */}
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

                    <ResendRow
                      cooldownKey={resendKey}
                      forceActive={forceResend}
                      onResend={handleResend}
                      disabled={isLoading}
                    />

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
    // Android reserves an extra font-padding band above/below the glyph,
    // which at 28px can push the digit out of its cell.
    includeFontPadding: false,
    textAlign: 'center',
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
  errorSlot: {
    minHeight: 36,
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 12,
    color: palette.danger,
    textAlign: 'center',
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
