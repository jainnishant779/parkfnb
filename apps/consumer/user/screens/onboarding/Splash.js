/**
 * Splash — minimal first frame on the mint app background.
 *
 * Animation timeline (≈1900ms total before onDone fires):
 *   0   ms  page bg appears
 *   60  ms  soft teal halo pulses up behind the pin
 *   80  ms  pin drops in from above the centre with a spring
 *   500 ms  brand mark + tagline fade up from below
 *   1000ms  "loading" rail under the brand fills left → right
 *   1900ms  onDone fires → RootNavigator advances
 *
 * No Skia / SVG canvas / heavy art — those caused a SIGSEGV on this
 * device under Fabric. Everything here is plain RN views + animated
 * primitives so it's safe across the codebase's full RN/arch combo.
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
  StatusBar,
} from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { palette, fontStacks } from '../../theme';
import { PinFill } from '../../components/glass/Icons';

/**
 * RadialBloom — true radial-gradient soft glow rendered via SVG so the
 * edge fades smoothly to transparent with no visible shape outline.
 * Sits inside its parent and fills it; alpha at the perimeter is 0.
 */
let _bloomId = 0;
const RadialBloom = ({ width, height, cx, cy, rx, ry, color, peakOpacity }) => {
  const id = React.useMemo(() => `bloom-${++_bloomId}`, []);
  return (
    <Svg width={width} height={height} style={{ position: 'absolute' }}>
      <Defs>
        <RadialGradient
          id={id}
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          fx={cx}
          fy={cy}
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor={color} stopOpacity={peakOpacity} />
          <Stop offset="0.5" stopColor={color} stopOpacity={peakOpacity * 0.4} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill={`url(#${id})`} />
    </Svg>
  );
};

const { width, height } = Dimensions.get('window');
const TOTAL_MS = 1900;

const Splash = ({ onDone }) => {
  // Pin drop + scale-in
  const pinDrop = useRef(new Animated.Value(0)).current;
  const pinScale = useRef(new Animated.Value(0)).current;

  // Halo (teal-tinted bloom behind the pin)
  const haloOpacity = useRef(new Animated.Value(0)).current;
  const haloScale = useRef(new Animated.Value(0.6)).current;

  // Brand + tagline
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleSlide = useRef(new Animated.Value(20)).current;

  // Bottom progress rail
  const railFill = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      // Halo blooms first behind where the pin is about to land
      Animated.delay(60),
      Animated.parallel([
        Animated.timing(haloOpacity, {
          toValue: 1,
          duration: 360,
          useNativeDriver: true,
        }),
        Animated.timing(haloScale, {
          toValue: 1,
          duration: 520,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      // Pin drops + scales in (slightly overlapping the halo bloom)
      Animated.parallel([
        Animated.timing(pinDrop, {
          toValue: 1,
          duration: 460,
          easing: Easing.bezier(0.34, 1.56, 0.64, 1),
          useNativeDriver: true,
        }),
        Animated.spring(pinScale, {
          toValue: 1,
          tension: 110,
          friction: 8,
          useNativeDriver: true,
        }),
      ]),
      // Brand text rises
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 360,
          useNativeDriver: true,
        }),
        Animated.timing(titleSlide, {
          toValue: 0,
          duration: 360,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      // Loading rail fills L→R
      Animated.timing(railFill, {
        toValue: 1,
        duration: 700,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();

    const t = setTimeout(() => onDone && onDone(), TOTAL_MS);
    return () => clearTimeout(t);
  }, [pinDrop, pinScale, haloOpacity, haloScale, titleOpacity, titleSlide, railFill, onDone]);

  const pinTranslateY = pinDrop.interpolate({
    inputRange: [0, 1],
    outputRange: [-180, 0],
  });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.bg} translucent={false} />

      {/* Real radial-gradient blooms — alpha fades to 0 in every
          direction from the centre, so there is no visible shape edge,
          just a soft teal glow. Drawn as full-area SVGs whose centre is
          anchored in (or just past) each corner. */}
      <View pointerEvents="none" style={[styles.bloomGroup, styles.bloomTopLeftGroup]}>
        <RadialBloom
          width={BLOOM}
          height={BLOOM}
          cx={BLOOM * 0.4}
          cy={BLOOM * 0.4}
          rx={BLOOM * 0.55}
          ry={BLOOM * 0.55}
          color={palette.primary}
          peakOpacity={0.22}
        />
      </View>
      <View pointerEvents="none" style={[styles.bloomGroup, styles.bloomBottomRightGroup]}>
        <RadialBloom
          width={BLOOM}
          height={BLOOM}
          cx={BLOOM * 0.6}
          cy={BLOOM * 0.6}
          rx={BLOOM * 0.55}
          ry={BLOOM * 0.55}
          color={palette.primary}
          peakOpacity={0.18}
        />
      </View>

      {/* Centered stack: halo + pin → brand + tagline → progress rail.
          All vertically grouped in the middle of the screen. */}
      <View style={styles.centerStack}>
        <View style={styles.centerBlock}>
          {/* Halo behind the pin — real radial gradient, no shape edge. */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.haloWrap,
              {
                opacity: haloOpacity,
                transform: [{ scale: haloScale }],
              },
            ]}
          >
            <RadialBloom
              width={HALO_SIZE}
              height={HALO_SIZE}
              cx={HALO_SIZE / 2}
              cy={HALO_SIZE / 2}
              rx={HALO_SIZE / 2}
              ry={HALO_SIZE / 2}
              color={palette.primary}
              peakOpacity={0.32}
            />
          </Animated.View>
          <Animated.View
            style={[
              styles.pinWrap,
              {
                transform: [{ translateY: pinTranslateY }, { scale: pinScale }],
              },
            ]}
          >
            <PinFill size={72} color={palette.primary} />
          </Animated.View>
        </View>

        <Animated.View
          style={[
            styles.brandBlock,
            {
              opacity: titleOpacity,
              transform: [{ translateY: titleSlide }],
            },
          ]}
        >
          <Text style={styles.brand}>PARKFNB</Text>
          <Text style={styles.tagline}>Find a spot. Glide in.</Text>

          <View style={styles.railTrack}>
            <Animated.View
              style={[
                styles.railFill,
                {
                  width: railFill.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
        </Animated.View>
      </View>
    </View>
  );
};

const HALO_SIZE = 220;
const BLOOM = Math.max(width, height) * 0.7;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // Diagonal teal-to-transparent gradient anchored in each corner.
  // The square (not circle) shape doesn't matter — the colour fades to
  // 0% well before the visible edge, so what you see is just the soft
  // glow, never a corner.
  bloomGroup: {
    position: 'absolute',
    width: BLOOM,
    height: BLOOM,
  },
  bloomTopLeftGroup: {
    top: -BLOOM * 0.45,
    left: -BLOOM * 0.4,
  },
  bloomBottomRightGroup: {
    bottom: -BLOOM * 0.45,
    right: -BLOOM * 0.4,
  },
  centerStack: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBlock: {
    width: HALO_SIZE,
    height: HALO_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Halo behind the pin — radial gradient drawn via SVG. No clip needed
  // since the gradient itself fades to alpha 0 well before its bounds.
  haloWrap: {
    position: 'absolute',
    width: HALO_SIZE,
    height: HALO_SIZE,
  },
  pinWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandBlock: {
    alignItems: 'center',
    paddingHorizontal: 32,
    marginTop: 8,
  },
  brand: {
    fontFamily: fontStacks.regular,
    fontSize: 48,
    fontWeight: '300',
    letterSpacing: 8,
    color: palette.text,
  },
  tagline: {
    fontFamily: fontStacks.regular,
    fontSize: 13,
    color: palette.textMuted,
    marginTop: 8,
    letterSpacing: 0.8,
  },
  railTrack: {
    width: 120,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(13, 115, 119, 0.14)',
    marginTop: 22,
    overflow: 'hidden',
  },
  railFill: {
    height: '100%',
    backgroundColor: palette.primary,
    borderRadius: 1.5,
  },
});

export default Splash;
