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
 * Visuals: photo header + white sheet (AuthLayout). Six grey pill digit
 * cells; the next cell to fill gets an ink border, errors turn red.
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Animated,
  Keyboard,
} from 'react-native';

import { useAuth } from '../../context/AuthContext';
import * as authService from '../../services/authService';
import { maskPhone } from '../../utils/validateForm';

import AuthLayout from '../../components/ui/AuthLayout';
import { T, PillButton } from '../../components/ui';
import { palette, fonts, radii } from '../../theme';

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

  const borderColor = error
    ? palette.danger
    : halo.interpolate({
        inputRange: [0, 1],
        outputRange: [value ? palette.line : palette.fill, palette.ink],
      });

  return (
    <Animated.View
      style={[
        styles.cellWrap,
        {
          borderColor,
          backgroundColor: value || focused ? palette.surface : palette.fill,
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

  const maskedPhone = identifier ? maskPhone(identifier) : '';

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
        Sent to <Text style={styles.phoneHighlight}>{maskedPhone || identifier}</Text>
        {'  '}
        <Text style={styles.change} onPress={() => navigation.goBack()}>
          Change
        </Text>
      </Text>

      {/* Six display cells with ONE invisible input laid over the whole
          row: tapping anywhere focuses it, typing/pasting/SMS autofill fill
          the cells left to right. */}
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

      {/* Fixed-height slot so an error appearing/clearing does not push the
          Resend link and Verify button up and down. */}
      <View style={styles.errorSlot}>
        {errorMessage ? (
          <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="assertive">
            {errorMessage}
          </Text>
        ) : null}
      </View>

      <PillButton
        label="Verify"
        iconRight="arrow-right"
        variant="ink"
        onPress={handleVerify}
        disabled={!isOtpComplete || isDisabled}
        loading={isLoading}
      />

      <ResendRow
        cooldownKey={resendKey}
        forceActive={forceResend}
        onResend={handleResend}
        disabled={isLoading}
      />
    </AuthLayout>
  );
};

const styles = StyleSheet.create({
  lede: { ...fonts.medium, fontSize: 14, lineHeight: 20, color: palette.textMuted, marginTop: 6 },
  phoneHighlight: { ...fonts.semibold, color: palette.text },
  change: { ...fonts.semibold, color: palette.text, textDecorationLine: 'underline' },

  cellsRow: { flexDirection: 'row', marginTop: 24 },
  // Six cells share the sheet width, so they flex instead of a fixed width.
  cellSlot: { flex: 1, height: 64, marginHorizontal: 4 },
  cellWrap: {
    flex: 1,
    borderRadius: radii.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellDigit: {
    ...fonts.semibold,
    fontSize: 26,
    color: palette.text,
    // Android reserves an extra font-padding band above/below the glyph.
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
  errorSlot: { minHeight: 40, justifyContent: 'center' },
  errorText: { ...fonts.medium, fontSize: 13, color: palette.danger, textAlign: 'center' },

  resendRow: { alignItems: 'center', marginTop: 20 },
  resendActive: { ...fonts.semibold, fontSize: 15, color: palette.text },
  resendIdle: { ...fonts.medium, fontSize: 14, color: palette.textMuted },
  resendTimer: { ...fonts.semibold, color: palette.text },
});

export default OTPVerification;
