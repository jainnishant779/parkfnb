/**
 * SignIn — phone entry, terms acceptance, sends the OTP.
 *
 * Behaviour (unchanged):
 *   - parseIndianPhone validates the 10-digit number
 *   - authService.sendOtp issues the code (backend generates + verifies it)
 *   - same error-code mapping
 *   - navigates to OTPVerification with { identifier, channel: 'sms' }
 *
 * Visuals: photo header + white sheet (AuthLayout). "+91" is a black pill
 * beside a grey pill phone field; the CTA is a full-width black pill.
 */
import React, { useState, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';

import { parseIndianPhone } from '../../utils/validateForm';
import * as authService from '../../services/authService';

import AuthLayout from '../../components/ui/AuthLayout';
import { T, PillButton } from '../../components/ui';
import { palette, fonts, radii } from '../../theme';

// Mobile field: digits only, max 10. The input's maxLength={10} stops
// typing at 10 (trimming in JS instead made Android move the cursor, so
// extra digits landed in the middle). A leading +91 / 0 is dropped.
const toTenDigits = (raw) => {
  let v = String(raw || '').trim();
  if (v.startsWith('+91')) v = v.slice(3);
  let d = v.replace(/\D/g, '');
  if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  return d.slice(0, 10);
};

const SignIn = ({ navigation }) => {
  const [phone, setPhone] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [focused, setFocused] = useState(false);

  const parsedPhone = parseIndianPhone(phone);
  const isPhoneValid = !!parsedPhone;
  const canSubmit = isPhoneValid && acceptTerms && !isLoading;

  const handleSendOtp = async () => {
    if (!canSubmit) return;
    setErrorMessage('');
    setIsLoading(true);

    try {
      await authService.sendOtp(parsedPhone, 'sms');
      navigation.navigate('OTPVerification', {
        identifier: parsedPhone,
        channel: 'sms',
      });
    } catch (err) {
      const code = err?.code || '';
      if (code === 'RATE_LIMIT_EXCEEDED') {
        // The backend message carries the cooldown.
        setErrorMessage(err?.message || 'Too many attempts. Please try again later.');
      } else if (code === 'REQ_INVALID_FORMAT' || code === 'REQ_MISSING_FIELD') {
        setErrorMessage('Enter a valid 10-digit mobile number.');
      } else if (code === 'NETWORK_ERROR' || code === 'NETWORK_TIMEOUT') {
        setErrorMessage('Check your internet connection and try again.');
      } else {
        setErrorMessage(err?.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Keep the form + CTA above the keyboard once the field is focused.
  const scrollRef = useRef(null);
  const handleInputFocus = () => {
    setFocused(true);
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  return (
    <AuthLayout
      image={require('../../assets/images/login.jpg')}
      title={'Welcome\nback'}
      subtitle="Sign in to find and book parking."
      onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      scrollRef={scrollRef}
    >
      <T variant="h2">Sign in</T>
      <T variant="bodySmall" style={styles.lede}>
        Enter your mobile number. We'll text you a 6-digit code.
      </T>

      {/* Phone row: country code pill + grey pill field */}
      <View style={styles.phoneRow}>
        <View style={styles.cc}>
          <Text style={styles.ccText}>+91</Text>
        </View>
        <View style={[styles.field, focused && styles.fieldFocused, !!errorMessage && styles.fieldError]}>
          <Icon name="smartphone" size={18} color={palette.textMuted} />
          <TextInput
            value={phone}
            onChangeText={(t) => {
              setPhone(toTenDigits(t));
              setErrorMessage('');
            }}
            placeholder="Mobile number"
            placeholderTextColor={palette.textSubtle}
            keyboardType="phone-pad"
            maxLength={10}
            returnKeyType="done"
            onSubmitEditing={handleSendOtp}
            onFocus={handleInputFocus}
            onBlur={() => setFocused(false)}
            style={styles.input}
          />
          {isPhoneValid ? (
            <View style={styles.tick}>
              <Icon name="check" size={13} color={palette.textInverse} />
            </View>
          ) : null}
        </View>
      </View>

      {errorMessage ? (
        <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {errorMessage}
        </Text>
      ) : null}

      {/* Terms */}
      <Pressable
        style={styles.terms}
        onPress={() => setAcceptTerms(!acceptTerms)}
        hitSlop={6}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: acceptTerms }}
      >
        <View style={[styles.checkbox, acceptTerms && styles.checkboxChecked]}>
          {acceptTerms ? <Icon name="check" size={13} color={palette.textInverse} /> : null}
        </View>
        <Text style={styles.termsText}>
          I agree to the <Text style={styles.termsLink}>Terms & Privacy Policy</Text>
        </Text>
      </Pressable>

      <PillButton
        label="Send code"
        iconRight="arrow-right"
        variant="ink"
        onPress={handleSendOtp}
        disabled={!canSubmit}
        loading={isLoading}
        style={styles.cta}
      />

      <Text style={styles.footerText}>
        New to parkfnb?{' '}
        <Text style={styles.footerLink} onPress={() => navigation.navigate('Onboarding')}>
          Take the tour
        </Text>
      </Text>
    </AuthLayout>
  );
};

const styles = StyleSheet.create({
  lede: { marginTop: 6, fontSize: 14, lineHeight: 20 },

  phoneRow: { flexDirection: 'row', alignItems: 'center', marginTop: 24 },
  cc: {
    height: 58,
    paddingHorizontal: 20,
    borderRadius: radii.pill,
    backgroundColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  ccText: { ...fonts.semibold, fontSize: 16, color: palette.textInverse },
  field: {
    flex: 1,
    height: 58,
    borderRadius: radii.pill,
    backgroundColor: palette.fill,
    borderWidth: 1.5,
    borderColor: palette.fill,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  fieldFocused: { borderColor: palette.ink, backgroundColor: palette.surface },
  fieldError: { borderColor: palette.danger },
  input: {
    ...fonts.semibold,
    flex: 1,
    fontSize: 17,
    letterSpacing: 0.4,
    color: palette.text,
    marginLeft: 10,
    paddingVertical: 0,
  },
  tick: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: { ...fonts.medium, fontSize: 13, color: palette.danger, marginTop: 10, marginLeft: 6 },

  terms: { flexDirection: 'row', alignItems: 'center', marginTop: 20 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: palette.textSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: { backgroundColor: palette.ink, borderColor: palette.ink },
  termsText: { ...fonts.medium, flex: 1, fontSize: 14, color: palette.textMuted },
  termsLink: { ...fonts.semibold, color: palette.text },

  cta: { marginTop: 26 },

  footerText: {
    ...fonts.medium,
    fontSize: 14,
    color: palette.textMuted,
    textAlign: 'center',
    marginTop: 22,
  },
  footerLink: { ...fonts.semibold, color: palette.text },
});

export default SignIn;
