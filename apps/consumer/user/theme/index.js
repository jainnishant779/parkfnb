/**
 * Design system — single source of truth for the app's modern glass UI.
 *
 * Aesthetic: warm off-white base + soft orange/amber accent, glassmorphic
 * cards with translucent fills, soft shadows, and geometric blob shapes.
 * Inspired by reference UI: Cannabis Lab login + isometric city map.
 */
import { Platform } from 'react-native';

export const palette = {
  // Surfaces
  bg: '#EAF3F1',          // cool mint app background
  bgSoft: '#DDEDE9',      // slightly deeper mint
  surface: '#FFFFFF',
  surfaceDim: '#F4F9F7',

  // Brand — teal (original)
  primary: '#0D7377',
  primaryDeep: '#0A5C5F',
  primarySoft: '#E8F5F4',
  accent: '#1A1A2E',      // dark navy for ink pills
  accentSoft: '#2A2A40',

  // Text
  text: '#1A1A2E',
  textMuted: '#5C6970',
  textSubtle: '#9BA6AC',
  textInverse: '#FFFFFF',

  // Glass
  glassWhite: 'rgba(255,255,255,0.55)',
  glassWhiteStrong: 'rgba(255,255,255,0.75)',
  glassDark: 'rgba(26,26,46,0.55)',
  glassBorder: 'rgba(255,255,255,0.65)',
  glassBorderDark: 'rgba(255,255,255,0.10)',

  // Status
  success: '#2EAE6B',
  warning: '#F2B53C',
  danger: '#E5484D',

  // Shadow
  shadow: 'rgba(15,40,40,0.18)',
};

export const radii = {
  xs: 8,
  sm: 12,
  md: 18,
  lg: 24,
  xl: 32,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

// Helvetica is paid + missing on Android. We target Helvetica with a
// system stack so iOS picks Helvetica and Android falls back to its
// default sans-serif (Roboto). Same visual hierarchy, no licensing.
const fontStack = Platform.select({
  ios: 'Helvetica Neue',
  android: 'sans-serif',
  default: 'System',
});

const fontStackMedium = Platform.select({
  ios: 'Helvetica Neue',
  android: 'sans-serif-medium',
  default: 'System',
});

export const typography = {
  display: {
    fontFamily: fontStack,
    fontSize: 56,
    fontWeight: Platform.OS === 'ios' ? '300' : '300',
    letterSpacing: -1.5,
    lineHeight: 60,
    color: palette.text,
  },
  h1: {
    fontFamily: fontStack,
    fontSize: 36,
    fontWeight: '300',
    letterSpacing: -1.0,
    lineHeight: 42,
    color: palette.text,
  },
  h2: {
    fontFamily: fontStack,
    fontSize: 28,
    fontWeight: '400',
    letterSpacing: -0.5,
    lineHeight: 34,
    color: palette.text,
  },
  h3: {
    fontFamily: fontStackMedium,
    fontSize: 20,
    fontWeight: '500',
    letterSpacing: -0.3,
    lineHeight: 26,
    color: palette.text,
  },
  body: {
    fontFamily: fontStack,
    fontSize: 15,
    fontWeight: '400',
    letterSpacing: 0,
    lineHeight: 22,
    color: palette.text,
  },
  bodySmall: {
    fontFamily: fontStack,
    fontSize: 13,
    fontWeight: '400',
    letterSpacing: 0,
    lineHeight: 18,
    color: palette.textMuted,
  },
  label: {
    fontFamily: fontStackMedium,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.6,
    lineHeight: 16,
    textTransform: 'uppercase',
    color: palette.textMuted,
  },
  button: {
    fontFamily: fontStackMedium,
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.2,
    color: palette.textInverse,
  },
};

export const shadow = {
  soft: {
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 6,
  },
  lifted: {
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.22,
    shadowRadius: 36,
    elevation: 12,
  },
  press: {
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 6,
    elevation: 2,
  },
};

export const motion = {
  // Durations tuned for "smooth, not laggy" on older Android (Galaxy S8).
  fast: 180,
  base: 320,
  slow: 520,
  reveal: 800,
};

export const fontStacks = { regular: fontStack, medium: fontStackMedium };

export default {
  palette,
  radii,
  spacing,
  typography,
  shadow,
  motion,
  fontStacks,
};
