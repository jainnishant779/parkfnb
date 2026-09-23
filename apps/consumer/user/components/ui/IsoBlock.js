/**
 * IsoBlock — isometric car illustration used on feature cards (the app's
 * stand-in for the reference's parcel box). Pure SVG, drawn in the same
 * peach / blue / grey tones as the card it sits on.
 */
import React from 'react';
import Svg, { Polygon, Circle, G, Ellipse } from 'react-native-svg';

const TONES = {
  peach: {
    top: '#F9D5A3',
    side: '#F0B574',
    front: '#E39C57',
    cabin: '#F6C88C',
    glass: '#4B3025',
    glassSide: '#3A241B',
    light: '#FFF4E2',
    shadow: 'rgba(120,70,20,0.16)',
  },
  blue: {
    top: '#EAF0FD',
    side: '#C4D5F3',
    front: '#A9BEE8',
    cabin: '#D7E3FA',
    glass: '#2C3A5A',
    glassSide: '#202B45',
    light: '#FFFFFF',
    shadow: 'rgba(30,50,100,0.14)',
  },
  grey: {
    top: '#F4F4F4',
    side: '#DCDCDC',
    front: '#C6C6C6',
    cabin: '#E8E8E8',
    glass: '#2A2A2A',
    glassSide: '#1C1C1C',
    light: '#FFFFFF',
    shadow: 'rgba(0,0,0,0.12)',
  },
};

// Wheel drawn in the car's side plane (isometric skew).
const Wheel = ({ cx, cy }) => (
  <G transform={`translate(${cx},${cy}) matrix(0.866,0.5,0,1,0,0)`}>
    <Circle r={8.2} fill="#1E1E1E" />
    <Circle r={3.6} fill="#9A9A9A" />
  </G>
);

const IsoBlock = ({ size = 120, tone = 'peach' }) => {
  const c = TONES[tone] || TONES.peach;
  return (
    <Svg width={size} height={size} viewBox="10 16 100 78">
      {/* ground shadow */}
      <Ellipse cx={62} cy={74} rx={40} ry={14} fill={c.shadow} />

      {/* body */}
      <Polygon points="45.4,24.1 99.4,55.3 74.6,69.6 20.6,38.4" fill={c.top} />
      <Polygon points="20.6,51.4 74.6,82.6 74.6,69.6 20.6,38.4" fill={c.side} />
      <Polygon points="99.4,68.3 74.6,82.6 74.6,69.6 99.4,55.3" fill={c.front} />

      {/* cabin */}
      <Polygon points="34.1,43.6 63.4,60.5 56.6,45.6 39.7,35.9" fill={c.cabin} />
      <Polygon points="83.6,48.8 63.4,60.5 56.6,45.6 76.9,34.0" fill={c.front} />
      <Polygon points="60.0,24.2 76.9,34.0 56.6,45.6 39.7,35.9" fill={c.top} />

      {/* glass */}
      <Polygon points="36.8,43.6 48.1,50.1 48.1,42.5 40.9,38.4" fill={c.glassSide} />
      <Polygon points="49.9,51.1 61.1,57.6 55.9,47.1 49.9,43.6" fill={c.glassSide} />
      <Polygon points="82.3,48.2 64.7,58.4 58.4,46.7 76.0,36.5" fill={c.glass} />

      {/* headlights */}
      <Polygon points="96.7,62.5 91.5,65.5 91.5,62.4 96.7,59.4" fill={c.light} />
      <Polygon points="82.5,70.7 77.3,73.7 77.3,70.6 82.5,67.6" fill={c.light} />

      {/* wheels */}
      <Wheel cx={32.8} cy={58.1} />
      <Wheel cx={62.0} cy={75.0} />
    </Svg>
  );
};

export default IsoBlock;
