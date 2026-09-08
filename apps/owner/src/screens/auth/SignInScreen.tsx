import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from 'react-native-vector-icons/Ionicons';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import type { AuthStackParamList } from '../../navigation/types';
import { authService } from '../../services/authService';
import { ApiRequestError } from '../../services/api';

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
// THEME
// ============================================================================

const theme = {
  colors: {
    background: '#FFFFFF',
    primary: '#0D7377',
    textPrimary: '#1F2937',
    textSecondary: '#6B7280',
    inputBg: '#F3F4F6',
    inputPlaceholder: '#9CA3AF',
    border: '#E5E7EB',
    buttonDisabled: '#9CA3AF',
    buttonText: '#FFFFFF',
    google: '#FFFFFF',
    googleBorder: '#E5E7EB',
    apple: '#000000',
    facebook: '#1877F2',
  },
};

// ============================================================================
// MAIN SCREEN
// ============================================================================

export default function SignInScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [phone, setPhone] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Decorative Circles */}
        <View style={styles.circleTopRight} />
        <View style={styles.circleTopRightInner} />
        <View style={styles.circleBottomLeft} />

        {/* Back Button */}
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </Pressable>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Sign In / Sign Up</Text>
          <Text style={styles.signUpText}>We'll send an OTP to verify your number.</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* Phone Input */}
          <View style={styles.inputContainer}>
            <Ionicons name="call-outline" size={22} color={theme.colors.textSecondary} style={styles.inputIcon} />
            <Text style={styles.countryCode}>+91</Text>
            <View style={styles.divider} />
            <TextInput
              style={styles.input}
              placeholder="Phone number"
              placeholderTextColor={theme.colors.inputPlaceholder}
              value={phone}
              onChangeText={(v) => {
                setErrorMessage('');
                setPhone(v);
              }}
              keyboardType="phone-pad"
              autoComplete="tel"
              maxLength={15}
            />
            {parsedPhone && (
              <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            )}
          </View>

          {/* Terms Checkbox */}
          <Pressable
            style={styles.termsRow}
            onPress={() => setTermsAccepted(!termsAccepted)}
          >
            <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
              {termsAccepted && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
            </View>
            <Text style={styles.termsText}>Accept all the Terms & Conditions</Text>
          </Pressable>

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

          {/* Sign In Button */}
          <Pressable
            style={[styles.signInButton, !isFormValid && styles.signInButtonDisabled]}
            onPress={handleSignIn}
            disabled={!isFormValid}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.signInButtonText}>Continue</Text>
            )}
          </Pressable>

          {/* Social Login */}
          <View style={styles.socialContainer}>
            <Pressable style={styles.socialButtonGoogle} onPress={handleGoogleSignIn}>
              <FontAwesome name="google" size={24} color="#EA4335" />
            </Pressable>
            <Pressable style={styles.socialButtonApple} onPress={handleAppleSignIn}>
              <FontAwesome name="apple" size={28} color="#FFFFFF" />
            </Pressable>
            <Pressable style={styles.socialButtonFacebook} onPress={handleFacebookSignIn}>
              <FontAwesome name="facebook" size={28} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },

  // Decorative Circles
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
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: '#EBF4FF',
    borderRadius: 20,
  },

  // Header
  header: {
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  signUpText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },

  // Form
  form: {
    flex: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.inputBg,
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 60,
    marginBottom: 24,
  },
  inputIcon: {
    marginRight: 10,
  },
  countryCode: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginRight: 10,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: theme.colors.border,
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.textPrimary,
  },

  // Terms
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: theme.colors.primary,
  },
  termsText: {
    fontSize: 15,
    color: theme.colors.textSecondary,
  },

  // Error
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },

  // Sign In Button
  signInButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  signInButtonDisabled: {
    backgroundColor: theme.colors.buttonDisabled,
  },
  signInButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.buttonText,
  },

  // Social Login
  socialContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  socialButtonGoogle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.google,
    borderWidth: 1,
    borderColor: theme.colors.googleBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  socialButtonApple: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.apple,
    justifyContent: 'center',
    alignItems: 'center',
  },
  socialButtonFacebook: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.facebook,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
