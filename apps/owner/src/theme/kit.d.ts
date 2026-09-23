// Typings for the JS design tokens (theme/kit.js).
import type { TextStyle, ViewStyle } from 'react-native';

export const palette: { [key: string]: string };
export const radii: { xs: number; sm: number; md: number; lg: number; xl: number; xxl: number; pill: number };
export const spacing: { [key: string]: number };
export const FONT: string;
export const fonts: {
  regular: TextStyle;
  medium: TextStyle;
  semibold: TextStyle;
  bold: TextStyle;
  heavy: TextStyle;
};
export const typography: { [key: string]: TextStyle };
export const shadow: { soft: ViewStyle; lifted: ViewStyle; press: ViewStyle };
export const motion: { [key: string]: number };
export const fontStacks: { regular: string; medium: string };
declare const _default: any;
export default _default;
