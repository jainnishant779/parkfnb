/**
 * Onboarding — three full-bleed photo slides, story-style progress
 * segments on top, and a slide-to-continue control at the bottom.
 * Swipe or slide to advance; the last slide goes to SignIn.
 * Paged horizontal ScrollView (FlatList rendered blank under Fabric).
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
  ImageBackground,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';

import { SlideToContinue } from '../../components/ui';
import { palette, fonts } from '../../theme';

const { width, height } = Dimensions.get('window');

const SLIDES = [
  {
    id: 's1',
    image: require('../../assets/images/onboarding-1.jpg'),
    title: 'Parking\nmade\nsimple',
    body: 'Spots near you,\nright at your fingertips.',
  },
  {
    id: 's2',
    image: require('../../assets/images/onboarding-2.jpg'),
    title: 'Reserve\nin two\ntaps',
    body: 'Lock a slot before you\neven leave home.',
  },
  {
    id: 's3',
    image: require('../../assets/images/onboarding-3.jpg'),
    title: 'Drive in.\nPark.\nRelax.',
    body: 'Scan in at the gate and\nwe handle the rest.',
  },
];

const Onboarding = ({ navigation }) => {
  const insets = useSafeAreaInsets();
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
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        style={StyleSheet.absoluteFill}
      >
        {SLIDES.map((s) => (
          <ImageBackground key={s.id} source={s.image} style={styles.slide} resizeMode="cover">
            {/* Flat black scrim so white copy reads on any photo (the rooftop
                slide is mostly bright sky), then a gradient that deepens
                toward the headline and the slider. */}
            <View style={styles.scrim} />
            <LinearGradient
              colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.9)']}
              locations={[0, 0.22, 0.5, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={[styles.copy, { paddingBottom: insets.bottom + 132 }]}>
              <Text style={styles.title}>{s.title}</Text>
              <Text style={styles.body}>{s.body}</Text>
            </View>
          </ImageBackground>
        ))}
      </ScrollView>

      {/* Top: progress segments + brand */}
      <View style={[styles.top, { paddingTop: insets.top + 10 }]} pointerEvents="box-none">
        <View style={styles.segments}>
          {SLIDES.map((s, i) => (
            <View key={s.id} style={[styles.segment, i === index && styles.segmentActive]} />
          ))}
        </View>
        <View style={styles.brandRow}>
          <Text style={styles.brand}>
            parkfnb.<Text style={styles.brandMark}>®</Text>
          </Text>
          <Pressable hitSlop={12} onPress={handleSkip}>
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        </View>
      </View>

      {/* Bottom: slide to continue */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        <SlideToContinue
          label={index === SLIDES.length - 1 ? 'Start' : 'Continue'}
          hint="Slide"
          onComplete={handleNext}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111' },
  slide: { width, height, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.38)' },
  copy: { paddingHorizontal: 24 },
  title: {
    ...fonts.medium,
    fontSize: 56,
    lineHeight: 58,
    letterSpacing: -1.8,
    color: palette.textInverse,
  },
  body: {
    ...fonts.medium,
    fontSize: 20,
    lineHeight: 27,
    color: 'rgba(255,255,255,0.92)',
    marginTop: 18,
  },

  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 18 },
  segments: { flexDirection: 'row' },
  segment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    marginHorizontal: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  segmentActive: { backgroundColor: palette.textInverse },
  brandRow: {
    marginTop: 26,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { ...fonts.bold, fontSize: 28, letterSpacing: -0.6, color: palette.textInverse },
  brandMark: { ...fonts.medium, fontSize: 13 },
  skip: { ...fonts.semibold, fontSize: 15, color: 'rgba(255,255,255,0.85)' },

  bottom: { position: 'absolute', left: 20, right: 20, bottom: 0 },
});

export default Onboarding;
