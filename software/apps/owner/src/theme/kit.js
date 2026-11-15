/**
 * Design system — single source of truth for the app's UI.
 *
 * Aesthetic: soft light-grey canvas, white rounded cards, warm peach and
 * powder-blue feature cards with isometric illustrations, black status
 * pills, and a floating frosted pill tab bar. Typeface: Urbanist.
 *
 * Legacy keys (primary, accent, glass*) are kept so older screens still
 * resolve, but they now point at the new ink/peach palette.
 */
import { Platform } from 'react-native';

export const palette = {
  // Surfaces
  bg: '#F3F3F3',          // app canvas (light grey)
  bgSoft: '#EBEBEB',
  bgCream: '#FDF3E6',     // warm canvas for detail screens
  surface: '#FFFFFF',
  surfaceDim: '#F6F6F6',
  fill: '#EFEFEF',        // search pill / inputs
  line: '#E9E9E9',

  // Ink (primary action colour — black pills, active tab)
  ink: '#141414',
  inkSoft: '#2B2B2B',

  // Warm accent
  peach: '#F6CB91',       // primary CTA (Continue)
  peachDeep: '#E9A55A',
  peachSoft: '#FCE9CF',   // peach card fill
  peachWash: '#FEF4E7',

  // Cool accent
  blue: '#6F97E8',
  blueSoft: '#DCE6FA',    // blue card fill
  blueWash: '#EEF3FD',

  // Legacy aliases → new palette
  primary: '#141414',
  primaryDeep: '#000000',
  primarySoft: '#F1F1F1',
  accent: '#141414',
  accentSoft: '#2B2B2B',

  // Text
  text: '#161616',
  textMuted: '#8A8A8A',
  textSubtle: '#B4B4B4',
  textInverse: '#FFFFFF',

  // Glass
  glassWhite: 'rgba(255,255,255,0.62)',
  glassWhiteStrong: 'rgba(255,255,255,0.82)',
  glassDark: 'rgba(20,20,20,0.55)',
  glassBorder: 'rgba(255,255,255,0.7)',
  glassBorderDark: 'rgba(255,255,255,0.10)',

  // Status
  success: '#2FA66A',
  successSoft: '#E3F4EA',
  warning: '#E9A23B',
  warningSoft: '#FCF0DA',
  danger: '#EF4B3F',
  dangerSoft: '#FDE6E4',
  info: '#2F8CF0',

  // Shadow
  shadow: 'rgba(0,0,0,0.12)',
};

export const radii = {
  xs: 8,
  sm: 12,
  md: 18,
  lg: 24,
  xl: 28,
  xxl: 34,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
};

// Urbanist ships as static faces (assets/fonts). On iOS the family name plus
// fontWeight picks the face; on Android the family is registered as an XML
// font family (res/font/urbanist.xml) so fontWeight resolves the same way.
export const FONT = 'Urbanist';

export const fonts = {
  regular: { fontFamily: FONT, fontWeight: '400' },
  medium: { fontFamily: FONT, fontWeight: '500' },
  semibold: { fontFamily: FONT, fontWeight: '600' },
  bold: { fontFamily: FONT, fontWeight: '700' },
  heavy: { fontFamily: FONT, fontWeight: '800' },
};

export const typography = {
  display: {
    ...fonts.medium,
    fontSize: 48,
    letterSpacing: -1.4,
    lineHeight: 52,
    color: palette.text,
  },
  h1: {
    ...fonts.semibold,
    fontSize: 32,
    letterSpacing: -0.8,
    lineHeight: 38,
    color: palette.text,
  },
  h2: {
    ...fonts.semibold,
    fontSize: 24,
    letterSpacing: -0.4,
    lineHeight: 30,
    color: palette.text,
  },
  h3: {
    ...fonts.semibold,
    fontSize: 19,
    letterSpacing: -0.2,
    lineHeight: 24,
    color: palette.text,
  },
  title: {
    ...fonts.semibold,
    fontSize: 16,
    lineHeight: 21,
    color: palette.text,
  },
  body: {
    ...fonts.medium,
    fontSize: 15,
    lineHeight: 21,
    color: palette.text,
  },
  bodySmall: {
    ...fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: palette.textMuted,
  },
  caption: {
    ...fonts.medium,
    fontSize: 12,
    lineHeight: 16,
    color: palette.textMuted,
  },
  label: {
    ...fonts.medium,
    fontSize: 12,
    lineHeight: 16,
    color: palette.textMuted,
  },
  button: {
    ...fonts.semibold,
    fontSize: 16,
    color: palette.text,
  },
};

export const shadow = {
  soft: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 3,
  },
  lifted: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 30,
    elevation: 10,
  },
  press: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
};

export const motion = {
  fast: 180,
  base: 320,
  slow: 520,
  reveal: 800,
};

// Legacy: older styles spread `fontFamily: fontStacks.regular`.
export const fontStacks = Platform.select({
  default: { regular: FONT, medium: FONT },
});

export default {
  palette,
  radii,
  spacing,
  fonts,
  typography,
  shadow,
  motion,
  fontStacks,
  FONT,
};
