import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  type TextStyle,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from 'react-native-vector-icons/Ionicons';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import type { AuthStackParamList } from '../../navigation/types';
import { authService } from '../../services/authService';
import { ApiRequestError } from '../../services/api';
import AuthLayoutJs from '../../components/ui/AuthLayout';
import * as UI from '../../components/ui';
import * as Kit from '../../theme/kit';

// The UI kit is plain JS; give it loose component types and typed font tokens.
const AuthLayout = AuthLayoutJs as React.ComponentType<any>;
const { T, PillButton } = UI as unknown as Record<string, React.ComponentType<any>>;
const { palette, radii } = Kit;
const fonts = Kit.fonts as Record<keyof typeof Kit.fonts, TextStyle>;

type NavigationProp = NativeStackNavigationProp<AuthStackParamList>;

/** Strip everything except digits and return 10-digit Indian phone or null */
const parseIndianPhone = (value: string): string | null => {
  let digits = value.replace(/\D/g, '');
  // Drop leading country code (91 or 0)
  if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
  if (digits.length === 10 && /^[6-9]/.test(digits)) return digits;
  return null;
};

/** Mask phone for display: +91 98XXX XX765 */
const maskPhone = (digits: string): string => {
  if (digits.length !== 10) return `+91 ${digits}`;
  return `+91 ${digits.slice(0, 2)}${'X'.repeat(5)}${digits.slice(-3)}`;
};

// ============================================================================
// MAIN SCREEN
// ============================================================================

// Mobile field: digits only, max 10. The input's maxLength={10} stops
// typing at 10 (trimming in JS instead made Android move the cursor, so
// extra digits landed in the middle). A leading +91 / 0 is dropped.
const toTenDigits = (raw: string): string => {
  let v = String(raw || '').trim();
  if (v.startsWith('+91')) v = v.slice(3);
  let d = v.replace(/\D/g, '');
  if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  return d.slice(0, 10);
};

export default function SignInScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [phone, setPhone] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [focused, setFocused] = useState(false);

  const parsedPhone = parseIndianPhone(phone);
  const isFormValid = parsedPhone !== null && termsAccepted && !isLoading;

  const handleSignIn = async () => {
    if (!isFormValid || !parsedPhone) return;

    setIsLoading(true);
    setErrorMessage('');

    try {
      await authService.sendOtp(parsedPhone, 'sms');

      navigation.navigate('OtpVerify', {
        contactLabel: maskPhone(parsedPhone),
        identifier: parsedPhone,
        channel: 'sms',
        flow: 'signup',
      });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        switch (err.code) {
          case 'REQ_INVALID_FORMAT':
          case 'REQ_MISSING_FIELD':
            setErrorMessage('Enter a valid 10-digit Indian phone number');
            break;
          case 'AUTH_OTP_RATE_LIMITED':
            setErrorMessage('Too many attempts. Please try again later.');
            break;
          default:
            setErrorMessage(err.message || 'Something went wrong. Please try again.');
        }
      } else {
        setErrorMessage('Unable to connect. Please check your internet.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = () => { console.log('Google Sign In'); };
  const handleAppleSignIn = () => { console.log('Apple Sign In'); };
  const handleFacebookSignIn = () => { console.log('Facebook Sign In'); };

  // Keep the form + CTA above the keyboard once the field is focused.
  const scrollRef = useRef<ScrollView>(null);
  const handleInputFocus = () => {
    setFocused(true);
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  return (
    <AuthLayout
      image={require('../../assets/images/login.jpg')}
      title={'List your\nspace'}
      subtitle="Sign in to manage your parking."
      onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      scrollRef={scrollRef}
    >
      <T variant="h2">Sign in / Sign up</T>
      <T variant="bodySmall" style={styles.lede}>
        We'll send an OTP to verify your number.
      </T>

      {/* Phone row: country code pill + grey pill field */}
      <View style={styles.phoneRow}>
        <View style={styles.cc}>
          <Text style={styles.ccText}>+91</Text>
        </View>
        <View style={[styles.field, focused && styles.fieldFocused, !!errorMessage && styles.fieldError]}>
          <Ionicons name="call-outline" size={18} color={palette.textMuted} />
          <TextInput
            style={styles.input}
            placeholder="Phone number"
            placeholderTextColor={palette.textSubtle}
            value={phone}
            onChangeText={(v) => {
              setErrorMessage('');
              setPhone(toTenDigits(v));
            }}
            keyboardType="phone-pad"
            autoComplete="tel"
            maxLength={10}
            onFocus={handleInputFocus}
            onBlur={() => setFocused(false)}
          />
          {parsedPhone && (
            <View style={styles.tick}>
              <Ionicons name="checkmark" size={14} color={palette.textInverse} />
            </View>
          )}
        </View>
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

      {/* Terms Checkbox */}
      <TouchableOpacity
        style={styles.terms}
        onPress={() => setTermsAccepted(!termsAccepted)}
        activeOpacity={0.7}
        hitSlop={6}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: termsAccepted }}
      >
        <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
          {termsAccepted && <Ionicons name="checkmark" size={14} color={palette.textInverse} />}
        </View>
        <Text style={styles.termsText}>
          Accept all the <Text style={styles.termsLink}>Terms & Conditions</Text>
        </Text>
      </TouchableOpacity>

      <PillButton
        label="Continue"
        iconRight="arrow-right"
        variant="ink"
        onPress={handleSignIn}
        disabled={!isFormValid}
        loading={isLoading}
        style={styles.cta}
      />

      {/* Social Login */}
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or continue with</Text>
        <View style={styles.dividerLine} />
      </View>
      <View style={styles.socialContainer}>
        <TouchableOpacity style={styles.socialButton} onPress={handleGoogleSignIn} activeOpacity={0.75}>
          <FontAwesome name="google" size={22} color={palette.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.socialButton} onPress={handleAppleSignIn} activeOpacity={0.75}>
          <FontAwesome name="apple" size={24} color={palette.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.socialButton} onPress={handleFacebookSignIn} activeOpacity={0.75}>
          <FontAwesome name="facebook" size={22} color={palette.text} />
        </TouchableOpacity>
      </View>
    </AuthLayout>
  );
}

// ============================================================================
// STYLES
// ============================================================================

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

  dividerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 26 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: palette.line },
  dividerText: { ...fonts.medium, fontSize: 13, color: palette.textMuted, marginHorizontal: 12 },
  socialContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
    marginTop: 18,
  },
  socialButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: palette.fill,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
