/**
 * AuthLayout — photo header (black scrim, brand, big white headline) over
 * a white rounded bottom sheet that holds the form. Shared by SignIn and
 * OTPVerification so the auth flow reads as one continuous surface after
 * the photo onboarding.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';

import { IconCircle } from './index';
import { palette, fonts, radii } from '../../theme';

const { height: SCREEN_H } = Dimensions.get('window');

const AuthLayout = ({ image, title, subtitle, onBack, scrollRef, children }) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          ref={scrollRef}
          bounces={false}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <ImageBackground source={image} style={styles.hero} resizeMode="cover">
            <View style={styles.scrim} />
            <LinearGradient
              colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.72)']}
              locations={[0, 0.35, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={[styles.heroTop, { paddingTop: insets.top + 8 }]}>
              {onBack ? <IconCircle icon="arrow-left" variant="glass" size={44} onPress={onBack} /> : <View />}
              <Text style={styles.brand}>
                parkfnb.<Text style={styles.brandMark}>®</Text>
              </Text>
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
          </ImageBackground>

          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.grabber} />
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.surface },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, backgroundColor: palette.surface },

  hero: { height: Math.round(SCREEN_H * 0.42), backgroundColor: '#111' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  heroTop: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { ...fonts.bold, fontSize: 22, letterSpacing: -0.4, color: palette.textInverse },
  brandMark: { ...fonts.medium, fontSize: 11 },
  heroCopy: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 24, paddingBottom: 56 },
  title: {
    ...fonts.medium,
    fontSize: 44,
    lineHeight: 47,
    letterSpacing: -1.4,
    color: palette.textInverse,
  },
  subtitle: {
    ...fonts.medium,
    fontSize: 16,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.88)',
    marginTop: 10,
  },

  sheet: {
    flexGrow: 1,
    marginTop: -30,
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.line,
    marginBottom: 22,
  },
});

export default AuthLayout;
