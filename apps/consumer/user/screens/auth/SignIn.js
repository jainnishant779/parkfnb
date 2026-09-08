/**
 * SignIn — phone entry, terms acceptance, sends OTP via MSG91.
 *
 * Functional behavior preserved 1:1 from prior version:
 *   - parseIndianPhone validates the 10-digit number
 *   - authService.sendOtp issues the code (backend generates + verifies it)
 *   - same error-code mapping
 *   - navigates to OTPVerification with { identifier, channel: 'sms' }
 *
 * Visuals: glass surface form on the warm ambient background. Country
 * code is a separate ink pill so the "+91" is unmistakably tappable
 * weight; the phone field is a glass pill input.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Animated,
  Easing,
  Pressable,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { parseIndianPhone } from '../../utils/validateForm';
import * as authService from '../../services/authService';

import AmbientBackground from '../../components/glass/AmbientBackground';
import GlassCard from '../../components/glass/GlassCard';
import GlassInput from '../../components/glass/GlassInput';
import GlassButton from '../../components/glass/GlassButton';
import { PhoneIcon, BackIcon } from '../../components/glass/Icons';
import { palette, typography, spacing, fontStacks, radii } from '../../theme';


const CheckIcon = ({ checked }) => (
  <Svg width={14} height={14} viewBox="0 0 16 16" fill="none">
    <Path
      d="M3 8.5l3 3L13 5"
      stroke={checked ? '#FFFFFF' : 'transparent'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const SignIn = ({ navigation }) => {
  const [phone, setPhone] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const parsedPhone = parseIndianPhone(phone);
  const isPhoneValid = !!parsedPhone;
  const canSubmit = isPhoneValid && acceptTerms && !isLoading;

  // Card entrance
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter]);

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

  const cardSlide = enter.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });

  // When the phone input gets focus, scroll the form card + "Send code"
  // button into view. AndroidManifest already sets adjustResize, but on
  // tall headlines the form still falls below the keyboard's top edge
  // until the user manually scrolls — basic UX requires we do it for them.
  const scrollRef = useRef(null);
  const handleInputFocus = () => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

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
                <Pressable hitSlop={10} onPress={() => navigation.navigate('Welcome')}>
                  <Text style={styles.brand}>PARKFNB</Text>
                </Pressable>
                <View style={{ width: 24 }} />
              </View>

              {/* Headline */}
              <Animated.View
                style={{
                  opacity: enter,
                  transform: [{ translateY: cardSlide }],
                }}
              >
                <View style={styles.headline}>
                  <Text style={styles.eyebrow}>Sign in</Text>
                  <Text style={styles.title}>Welcome{'\n'}back.</Text>
                  <Text style={styles.subtitle}>
                    Enter your mobile number — we'll send a one-time code.
                  </Text>
                </View>

                {/* Form card */}
                <GlassCard radius={radii.lg} intensity={20} style={styles.card}>
                  <View style={styles.cardInner}>
                    {/* Phone row: country code pill + glass input */}
                    <View style={styles.phoneRow}>
                      <View style={styles.cc}>
                        <Text style={styles.ccText}>+91</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <GlassInput
                          value={phone}
                          onChangeText={(t) => {
                            setPhone(t);
                            setErrorMessage('');
                          }}
                          placeholder="Mobile number"
                          keyboardType="phone-pad"
                          maxLength={15}
                          returnKeyType="done"
                          onSubmitEditing={handleSendOtp}
                          onFocus={handleInputFocus}
                          leftIcon={<PhoneIcon size={20} />}
                          right={
                            isPhoneValid ? (
                              <View style={styles.tick}>
                                <CheckIcon checked />
                              </View>
                            ) : null
                          }
                        />
                      </View>
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

                    {/* Terms */}
                    <TouchableOpacity
                      style={styles.terms}
                      onPress={() => setAcceptTerms(!acceptTerms)}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          acceptTerms && styles.checkboxChecked,
                        ]}
                      >
                        <CheckIcon checked={acceptTerms} />
                      </View>
                      <Text style={styles.termsText}>
                        I agree to the{' '}
                        <Text style={styles.termsLink}>Terms & Privacy</Text>
                      </Text>
                    </TouchableOpacity>

                    {/* CTA */}
                    <GlassButton
                      label="Send code"
                      onPress={handleSendOtp}
                      disabled={!canSubmit}
                      loading={isLoading}
                      fullWidth
                      style={{ marginTop: spacing.md }}
                    />
                  </View>
                </GlassCard>
              </Animated.View>

              {/* Footer */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>
                  No account?{' '}
                  <Text
                    style={styles.footerLink}
                    onPress={() => navigation.navigate('Welcome')}
                  >
                    Discover Parkfnb.
                  </Text>
                </Text>
              </View>
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
  card: { width: '100%' },
  cardInner: { padding: spacing.lg + 4 },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cc: {
    backgroundColor: palette.accent,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: radii.pill,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ccText: {
    color: palette.textInverse,
    fontFamily: fontStacks.medium,
    fontWeight: '500',
    fontSize: 15,
    letterSpacing: 0.3,
  },
  tick: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 12,
    color: palette.danger,
    marginTop: spacing.sm,
    marginLeft: 4,
  },
  terms: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: palette.text,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: palette.text,
    borderColor: palette.text,
  },
  termsText: {
    flex: 1,
    fontSize: 13,
    color: palette.textMuted,
    fontFamily: fontStacks.regular,
  },
  termsLink: {
    color: palette.text,
    fontFamily: fontStacks.medium,
    fontWeight: '500',
  },
  footer: {
    alignItems: 'center',
    paddingTop: spacing.xl,
  },
  footerText: {
    ...typography.bodySmall,
    color: palette.textMuted,
  },
  footerLink: {
    color: palette.text,
    fontFamily: fontStacks.medium,
    fontWeight: '500',
  },
});

export default SignIn;
