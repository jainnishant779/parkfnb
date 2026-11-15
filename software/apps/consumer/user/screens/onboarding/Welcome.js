/**
 * Welcome — first interactive screen after splash. Glass card with the
 * brand mark and a single CTA into the onboarding carousel.
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AmbientBackground from '../../components/glass/AmbientBackground';
import GlassCard from '../../components/glass/GlassCard';
import GlassButton from '../../components/glass/GlassButton';
import { palette, typography, spacing, fontStacks } from '../../theme';

const Welcome = ({ navigation }) => {
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 600,
      delay: 80,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter]);

  const cardSlide = enter.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <AmbientBackground>
        <SafeAreaView style={styles.safe}>
          {/* Top brand */}
          <Animated.View style={[styles.brandRow, { opacity: enter }]}>
            <Text style={styles.brand}>PARKFNB</Text>
            <Text style={styles.brandSub}>by bnb</Text>
          </Animated.View>

          {/* Hero card */}
          <View style={styles.middle}>
            <Animated.View
              style={{
                opacity: enter,
                transform: [{ translateY: cardSlide }],
                width: '100%',
              }}
            >
              <GlassCard style={styles.hero} radius={28} intensity={22}>
                <View style={styles.heroInner}>
                  <Text style={styles.eyebrow}>Welcome</Text>
                  <Text style={styles.heroTitle}>
                    Park{'\n'}without{'\n'}the chase.
                  </Text>
                  <Text style={styles.heroBody}>
                    Find verified spots near you, reserve in seconds, and
                    glide in like a regular.
                  </Text>

                  <View style={styles.cta}>
                    <GlassButton
                      label="Get started"
                      variant="solid"
                      onPress={() => navigation.navigate('Onboarding')}
                      fullWidth
                    />
                  </View>
                </View>
              </GlassCard>
            </Animated.View>
          </View>

          {/* Footer microcopy */}
          <Animated.View style={[styles.footer, { opacity: enter }]}>
            <Text style={styles.footerText}>
              Already a member?{' '}
              <Text
                style={styles.footerLink}
                onPress={() => navigation.navigate('SignIn')}
              >
                Sign in
              </Text>
            </Text>
          </Animated.View>
        </SafeAreaView>
      </AmbientBackground>
    </View>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingTop: spacing.lg,
  },
  brand: {
    fontFamily: fontStacks.regular,
    fontSize: 28,
    fontWeight: '300',
    letterSpacing: 4,
    color: palette.text,
  },
  brandSub: {
    marginLeft: 8,
    fontFamily: fontStacks.regular,
    fontSize: 12,
    color: palette.textMuted,
    letterSpacing: 0.5,
  },
  middle: {
    flex: 1,
    justifyContent: 'center',
  },
  hero: {
    width: '100%',
  },
  heroInner: {
    padding: spacing.xl + 4,
  },
  eyebrow: {
    ...typography.label,
    color: palette.primary,
    marginBottom: spacing.md,
  },
  heroTitle: {
    fontFamily: fontStacks.regular,
    fontSize: 52,
    fontWeight: '300',
    letterSpacing: -2,
    lineHeight: 56,
    color: palette.text,
    marginBottom: spacing.lg,
  },
  heroBody: {
    ...typography.body,
    color: palette.textMuted,
    marginBottom: spacing.xl,
  },
  cta: {
    flexDirection: 'row',
  },
  footer: {
    alignItems: 'center',
    paddingBottom: spacing.lg,
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

export default Welcome;
