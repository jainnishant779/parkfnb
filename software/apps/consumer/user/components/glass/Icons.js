/**
 * Icon set — minimal SVG icons used across glass UI. Hand-tuned strokes
 * to match the modern hairline aesthetic. Colors via `color` prop so
 * they integrate with theme palette.
 */
import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { palette } from '../../theme';

export const PinIcon = ({ size = 22, color = palette.text, strokeWidth = 1.6 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 21s-7-7.6-7-12a7 7 0 0 1 14 0c0 4.4-7 12-7 12z"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
    <Circle cx={12} cy={9.5} r={2.6} stroke={color} strokeWidth={strokeWidth} />
  </Svg>
);

export const MailIcon = ({ size = 22, color = palette.textMuted, strokeWidth = 1.5 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x={3} y={5} width={18} height={14} rx={3} stroke={color} strokeWidth={strokeWidth} />
    <Path
      d="m4 7 7.4 5.4a1 1 0 0 0 1.2 0L20 7"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
    />
  </Svg>
);

export const PhoneIcon = ({ size = 22, color = palette.textMuted, strokeWidth = 1.5 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5 5L14 13l5 2v3a2 2 0 0 1-2 2A14 14 0 0 1 3 6a2 2 0 0 1 2-2z"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
  </Svg>
);

export const LockIcon = ({ size = 22, color = palette.textMuted, strokeWidth = 1.5 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x={4.5} y={10.5} width={15} height={10} rx={2.5} stroke={color} strokeWidth={strokeWidth} />
    <Path
      d="M8 10.5V7a4 4 0 1 1 8 0v3.5"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
    />
  </Svg>
);

export const SearchIcon = ({ size = 22, color = palette.text, strokeWidth = 1.6 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={11} cy={11} r={6.5} stroke={color} strokeWidth={strokeWidth} />
    <Path d="m20 20-3.5-3.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
  </Svg>
);

export const CarIcon = ({ size = 22, color = palette.text, strokeWidth = 1.6 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M5 14h14l-1.5-4a2 2 0 0 0-1.9-1.4H8.4A2 2 0 0 0 6.5 10L5 14z"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
    <Path
      d="M4 14h16v3a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1H7.5v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3z"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
  </Svg>
);

export const BackIcon = ({ size = 22, color = palette.text, strokeWidth = 1.7 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M14 6l-6 6 6 6"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const PinFill = ({ size = 28, color = palette.primary }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <Path
      d="M16 30s-10-10.6-10-17a10 10 0 1 1 20 0c0 6.4-10 17-10 17z"
      fill={color}
    />
    <Circle cx={16} cy={13} r={4} fill="#FFF" />
  </Svg>
);
