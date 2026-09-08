/**
 * VehicleIcons — clean line-style SVG icons for vehicle types.
 *
 * Drawn at 24x24 and scale via the `size` prop. `color` defaults to
 * white so they read well sitting on coloured (teal) parking cards.
 * Replace the MaterialCommunityIcons "car/motorbike/bus/truck" glyphs
 * which read as cartoonish pictograms.
 */
import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

const Base = ({ size = 20, children }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {children}
  </Svg>
);

export const CarIcon = ({ size = 20, color = '#FFFFFF' }) => (
  <Base size={size}>
    <Path
      d="M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13M4 13h16v4a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4z"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Circle cx={7.5} cy={15.5} r={1} fill={color} />
    <Circle cx={16.5} cy={15.5} r={1} fill={color} />
  </Base>
);

export const BikeIcon = ({ size = 20, color = '#FFFFFF' }) => (
  <Base size={size}>
    <Circle cx={5.5} cy={16.5} r={3.5} stroke={color} strokeWidth={1.6} />
    <Circle cx={18.5} cy={16.5} r={3.5} stroke={color} strokeWidth={1.6} />
    <Path
      d="M5.5 16.5l4-7h5l3.5 7M9.5 9.5h4M14.5 9.5l-2-3h-2"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Base>
);

export const BusIcon = ({ size = 20, color = '#FFFFFF' }) => (
  <Base size={size}>
    <Path
      d="M5 5h14a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1zM4 10h16M9 19v2M15 19v2"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Circle cx={8} cy={15} r={1.1} fill={color} />
    <Circle cx={16} cy={15} r={1.1} fill={color} />
  </Base>
);

export const TruckIcon = ({ size = 20, color = '#FFFFFF' }) => (
  <Base size={size}>
    <Path
      d="M3 7h10v9H3zM13 11h4l3 3v2h-7zM6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Base>
);

export const ParkingPinIcon = ({ size = 28, color = '#FFFFFF' }) => (
  <Base size={size}>
    <Path
      d="M12 22s7-7.4 7-12a7 7 0 1 0-14 0c0 4.6 7 12 7 12z"
      fill={color}
      stroke={color}
      strokeWidth={1.4}
      strokeLinejoin="round"
    />
    <Path
      d="M9.5 6.5h3.6a2.6 2.6 0 0 1 0 5.2H9.5V6.5zM9.5 11.7v3"
      stroke="#0D7377"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Base>
);

export const VehicleIcon = ({ type, ...rest }) => {
  switch (type) {
    case 'bike':
    case 'motorcycle':
      return <BikeIcon {...rest} />;
    case 'bus':
      return <BusIcon {...rest} />;
    case 'truck':
      return <TruckIcon {...rest} />;
    case 'car':
    default:
      return <CarIcon {...rest} />;
  }
};

export default VehicleIcon;
