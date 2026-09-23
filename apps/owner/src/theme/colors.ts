export const colors = {
  // Primary
  primary: {
    50: '#F6F6F6',
    100: '#EFEFEF',
    200: '#E2E2E2',
    300: '#C9C9C9',
    400: '#8A8A8A',
    500: '#141414',
    600: '#0A0A0A',
    700: '#000000',
    800: '#000000',
    900: '#000000',
  },

  // Neutral / Gray
  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },

  // Success
  success: {
    50: '#ECFDF5',
    100: '#D1FAE5',
    500: '#10B981',
    600: '#059669',
  },

  // Warning
  warning: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    500: '#F59E0B',
    600: '#D97706',
  },

  // Error
  error: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    500: '#EF4444',
    600: '#DC2626',
  },

  // Common
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

// Semantic theme colors with light/dark mode support
export type SemanticTheme = {
  background: string;
  surface: string;
  surfaceElevated: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderLight: string;
  primary: string;
  primaryLight: string;
  success: string;
  successLight: string;
  warning: string;
  warningLight: string;
  danger: string;
  dangerLight: string;
  info: string;
  infoLight: string;
  overlay: string;
};

// Shared look with the consumer app: light-grey canvas, white cards, ink
// (near-black) primary actions, peach accent. Every screen reads these
// semantic tokens, so changing them here re-skins the whole app.
export const lightTheme: SemanticTheme = {
  background: '#F3F3F3',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  text: '#161616',
  textSecondary: '#6E6E6E',
  textMuted: '#9A9A9A',
  border: '#E9E9E9',
  borderLight: '#F1F1F1',
  primary: '#141414',
  primaryLight: '#F1F1F1',
  success: '#2FA66A',
  successLight: '#E3F4EA',
  warning: '#E9A23B',
  warningLight: '#FCF0DA',
  danger: '#EF4B3F',
  dangerLight: '#FDE6E4',
  info: '#6F97E8',
  infoLight: '#EEF3FD',
  overlay: 'rgba(0, 0, 0, 0.45)',
};

export const darkTheme: SemanticTheme = {
  background: '#0F172A',
  surface: '#1E293B',
  surfaceElevated: '#334155',
  text: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  border: '#334155',
  borderLight: '#1E293B',
  primary: '#2A9D8F',
  primaryLight: '#0E3B38',
  success: '#10B981',
  successLight: '#064E3B',
  warning: '#F59E0B',
  warningLight: '#78350F',
  danger: '#EF4444',
  dangerLight: '#7F1D1D',
  info: '#60A5FA',
  infoLight: '#1E3A5F',
  overlay: 'rgba(0, 0, 0, 0.7)',
};

// The design is light-only (matches the consumer app), so dark mode maps to
// the light theme too. darkTheme is kept for reference.
export const getTheme = (_isDark: boolean): SemanticTheme => {
  return lightTheme;
};
