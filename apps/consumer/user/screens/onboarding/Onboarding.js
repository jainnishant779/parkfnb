/**
 * Onboarding — three-slide horizontal carousel introducing the app.
 * Implementation uses a paged horizontal ScrollView (rather than
 * FlatList, which was rendering blank on this device under Fabric).
 * Each slide shares the same structure: hero shape on top, copy
 * block beneath. Skip / final "Begin" → SignIn.
 */
import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  StatusBar,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle as SvgCircle } from 'react-native-svg';

import GlassButton from '../../components/glass/GlassButton';
import { palette, typography, spacing, fontStacks } from '../../theme';

const { width } = Dimensions.get('window');

const HERO = Math.min(width * 0.6, 260);

const SLIDES = [
  {
    id: 's1',
    accent: palette.primary,
    accentSoft: '#CFE4E2',
    eyebrow: 'Discover',
    title: 'Spots, mapped\nbeautifully.',
    body:
      'A live map of garages and street parking near you — refreshed every few seconds.',
    icon: 'pin',
  },
  {
    id: 's2',
    accent: '#1A1A2E',
    accentSoft: '#D5D5DA',
    eyebrow: 'Reserve',
    title: 'Lock a slot\nin two taps.',
    body:
      'Reserve ahead, scan in, and skip the loop-around. Pay later if you stay longer.',
    icon: 'check',
  },
  {
    id: 's3',
    accent: '#E5A23A',
    accentSoft: '#F4DEB1',
    eyebrow: 'Glide in',
    title: 'Your spot\nfinds you.',
    body:
      'Pin your destination — we route you to the closest verified parking automatically.',
    icon: 'car',
  },
];

const HeroIcon = ({ name, color }) => {
  const SIZE = HERO * 0.42;
  if (name === 'pin') {
    return (
      <Svg width={SIZE} height={SIZE} viewBox="0 0 32 32" fill="none">
        <Path
          d="M16 30s-10-10.6-10-17a10 10 0 1 1 20 0c0 6.4-10 17-10 17z"
          fill={color}
        />
        <SvgCircle cx={16} cy={13} r={4} fill="#FFFFFF" />
      </Svg>
    );
  }
  if (name === 'check') {
    return (
      <Svg width={SIZE} height={SIZE} viewBox="0 0 32 32" fill="none">
        <Path
          d="M5 17 l 7 7 L 27 9"
          stroke={color}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 32 32" fill="none">
      <Path
        d="M6 20 h20 l-2-6 a3 3 0 0 0 -2.8 -2 H10.8 a3 3 0 0 0 -2.8 2 L6 20z"
        fill={color}
      />
      <Path
        d="M5 20 h22 v4 a1.5 1.5 0 0 1 -1.5 1.5 H24 a1.5 1.5 0 0 1 -1.5 -1.5 V23 h-13 v1 a1.5 1.5 0 0 1 -1.5 1.5 H6.5 a1.5 1.5 0 0 1 -1.5 -1.5 V20z"
        fill={color}
      />
      <SvgCircle cx={11} cy={23} r={1.6} fill="#FFFFFF" />
      <SvgCircle cx={21} cy={23} r={1.6} fill="#FFFFFF" />
    </Svg>
  );
};

const Hero = ({ accent, accentSoft, icon }) => (
  <View style={styles.heroWrap}>
    <View style={[styles.heroDisc, { backgroundColor: accent }]}>
      <View style={[styles.heroIris, { backgroundColor: accentSoft }]} />
      <View style={styles.heroIconWrap}>
        <HeroIcon name={icon} color={accent} />
      </View>
    </View>
    <View style={[styles.heroSatellite, { backgroundColor: accent }]} />
    <View style={[styles.heroAccent, { backgroundColor: accentSoft }]} />
  </View>
);

const Slide = ({ slide }) => (
  <View style={styles.slide}>
    <Hero accent={slide.accent} accentSoft={slide.accentSoft} icon={slide.icon} />
    <View style={styles.copy}>
      <Text style={[styles.eyebrow, { color: slide.accent }]}>{slide.eyebrow}</Text>
      <Text style={styles.title}>{slide.title}</Text>
      <Text style={styles.body}>{slide.body}</Text>
    </View>
  </View>
);

const Onboarding = ({ navigation }) => {
  const [index, setIndex] = useState(0);
  const scrollRef = useRef(null);

  const handleScrollEnd = (e) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  };

  const handleNext = () => {
    if (index < SLIDES.length - 1) {
      const next = index + 1;
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
      setIndex(next);
    } else {
      navigation.navigate('SignIn');
    }
  };

  const handleSkip = () => navigation.navigate('SignIn');

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <SafeAreaView style={styles.safe}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <Text style={styles.brand}>PARKFNB</Text>
          <Pressable hitSlop={10} onPress={handleSkip}>
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        </View>

        {/* Carousel — paged horizontal ScrollView */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
        >
          {SLIDES.map((s) => (
            <Slide key={s.id} slide={s} />
          ))}
        </ScrollView>

        {/* Bottom bar: dots + CTA */}
        <View style={styles.bottom}>
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === index ? styles.dotActive : styles.dotInactive,
                ]}
              />
            ))}
          </View>
          <GlassButton
            label={index === SLIDES.length - 1 ? 'Begin' : 'Continue'}
            onPress={handleNext}
            variant="solid"
          />
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  brand: {
    fontFamily: fontStacks.regular,
    fontSize: 22,
    fontWeight: '300',
    letterSpacing: 4,
    color: palette.text,
  },
  skip: {
    ...typography.bodySmall,
    color: palette.textMuted,
    fontFamily: fontStacks.medium,
    fontWeight: '500',
  },

  scroll: { flex: 1 },
  scrollContent: { alignItems: 'stretch' },

  slide: {
    width,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },

  heroWrap: {
    width: HERO * 1.4,
    height: HERO * 1.4,
    marginBottom: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  heroDisc: {
    width: HERO,
    height: HERO,
    borderRadius: HERO / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIris: {
    position: 'absolute',
    width: HERO * 0.7,
    height: HERO * 0.7,
    borderRadius: HERO * 0.35,
    opacity: 0.55,
  },
  heroIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroSatellite: {
    position: 'absolute',
    top: HERO * 0.1,
    right: HERO * 0.05,
    width: HERO * 0.2,
    height: HERO * 0.2,
    borderRadius: HERO * 0.1,
    opacity: 0.9,
  },
  heroAccent: {
    position: 'absolute',
    bottom: HERO * 0.18,
    left: HERO * 0.02,
    width: HERO * 0.12,
    height: HERO * 0.12,
    borderRadius: HERO * 0.06,
  },

  copy: {
    width: '100%',
    alignItems: 'flex-start',
  },
  eyebrow: {
    ...typography.label,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fontStacks.regular,
    fontSize: 36,
    fontWeight: '300',
    letterSpacing: -1,
    lineHeight: 40,
    color: palette.text,
    marginBottom: spacing.md,
  },
  body: {
    ...typography.body,
    color: palette.textMuted,
  },

  bottom: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  dotActive: { width: 28, backgroundColor: palette.text },
  dotInactive: { width: 8, backgroundColor: palette.text, opacity: 0.25 },
});

export default Onboarding;
