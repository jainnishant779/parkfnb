import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Linking,
  Platform,
  Modal,
  Image,
  StatusBar,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import * as bookingService from '../../services/bookingService';
import * as vehicleService from '../../services/vehicleService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { palette, radii, spacing, fonts, typography, shadow } from '../../theme';
import {
  PillButton,
  IconCircle,
  Field,
  SectionTitle,
  StatusTag,
  InfoGrid,
  Chip,
  Segmented,
  IsoBlock,
} from '../../components/ui';
import { resolveImageUri } from '../../utils/imageUri';

// Duration options for booking
const durationOptions = [
  { id: 'hourly', label: 'Hourly', icon: 'clock' },
  { id: 'daily', label: 'Daily', icon: 'calendar' },
  { id: 'weekly', label: 'Weekly', icon: 'calendar' },
  { id: 'monthly', label: 'Monthly', icon: 'calendar' },
];

// One-tap durations. Replaces the +/- stepper: every value it could
// reasonably produce is one tap away here, and the chip row also keeps the
// end time in sync, which the stepper never did.
const QUICK_HOURS = [1, 2, 3, 4, 6, 8];

// Amenities worth surfacing on top of the hero image. Only the ones the
// listing actually declares are rendered — no filler pills.
const HERO_AMENITIES = [
  { id: 'cctv', label: 'CCTV', icon: 'cctv' },
  { id: 'security', label: 'Guarded', icon: 'shield-check' },
  { id: 'covered', label: 'Covered', icon: 'home-roof' },
  { id: 'ev_charging', label: 'EV Friendly', icon: 'ev-station' },
];

// 'online' has no gateway behind it yet — the backend never read
// payment_method at all, so tapping it used to create the exact same booking
// as Cash while claiming to "confirm instantly" and take a payment. Disabled
// until a real gateway exists, rather than ship a button that lies.
const PAYMENT_OPTIONS = [
  { id: 'cash', label: 'Cash', subtitle: 'Pay at the spot', icon: 'cash' },
  { id: 'online', label: 'Online', subtitle: 'Coming soon', icon: 'credit-card-outline', disabled: true },
];

// Generate time slots
const generateTimeSlots = () => {
  const slots = [];
  for (let hour = 0; hour < 24; hour++) {
    const time = `${hour.toString().padStart(2, '0')}:00`;
    const displayTime = hour === 0 ? '12:00 AM' : hour < 12 ? `${hour}:00 AM` : hour === 12 ? '12:00 PM' : `${hour - 12}:00 PM`;
    slots.push({ value: time, label: displayTime });
  }
  return slots;
};

const timeSlots = generateTimeSlots();

/**
 * The next hour that can still be booked today.
 *
 * The screen used to open at 09:00 regardless of the clock, so every
 * afternoon booking was rejected by the backend for starting in the past.
 * Rolls to 00:00 after 11pm — the date picker's next day is then the
 * sensible choice, and the same-day guard below moves it there.
 */
const nextBookableHour = () => {
  const h = new Date().getHours() + 1;
  return `${(h % 24).toString().padStart(2, '0')}:00`;
};

/** Is this date today? */
const isToday = (date) => {
  const d = new Date(date);
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
};

// Generate next 30 days
const generateDates = () => {
  const dates = [];
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    dates.push({
      date: date,
      day: date.getDate(),
      dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
      month: date.toLocaleDateString('en-US', { month: 'short' }),
      isToday: i === 0,
    });
  }
  return dates;
};

const ADD_VEHICLE_TYPES = [
  { apiType: 'car', label: 'Car' },
  { apiType: 'suv', label: 'SUV' },
  { apiType: 'van', label: 'Van' },
  { apiType: 'motorcycle', label: 'Moto' },
  { apiType: 'truck', label: 'Truck' },
];

const SPACE_TYPE_ICONS = {
  garage: 'garage',
  covered: 'home-roof',
  outdoor: 'weather-sunny',
  driveway: 'road',
  carport: 'car-side',
  street: 'road-variant',
};
const SPACE_TYPE_LABELS = {
  garage: 'Garage',
  covered: 'Covered',
  outdoor: 'Outdoor',
  driveway: 'Driveway',
  carport: 'Carport',
  street: 'Street',
};

const ParkingDetailsPage = ({ navigation, route }) => {
  const { parkingData } = route.params || {};
  const scrollViewRef = useRef(null);
  const dates = useMemo(() => generateDates(), []);
  const auth = useAuth();
  // targetSdk 36 draws edge-to-edge, so the sticky bar has to clear the
  // system nav bar itself or its text slides underneath it.
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom;

  // Property mode: parkingData.spaces[] was passed from grouped homepage
  const isPropertyMode = Array.isArray(parkingData?.spaces) && parkingData.spaces.length > 0;
  const [selectedSpace, setSelectedSpace] = useState(
    isPropertyMode && parkingData.spaces.length === 1 ? parkingData.spaces[0] : null
  );

  // State
  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState('hourly');
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedDate, setSelectedDate] = useState(dates[0].date);
  const [selectedStartTime, setSelectedStartTime] = useState(nextBookableHour);
  // Start at the next bookable hour + the default 1h, not a fixed 10:00 that
  // could sit before the start time and leave Book Now disabled.
  const [selectedEndTime, setSelectedEndTime] = useState(() => {
    const startHour = parseInt(nextBookableHour().split(':')[0], 10);
    return `${((startHour + 1) % 24).toString().padStart(2, '0')}:00`;
  });
  const [selectedHours, setSelectedHours] = useState(1);
  // Cash is the only working method right now, so it starts pre-selected
  // instead of forcing an extra tap before Book Now can be enabled.
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('cash');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [timeModalType, setTimeModalType] = useState('start');
  const [isLoading, setIsLoading] = useState(false);

  // Booking state
  const [userVehicles, setUserVehicles] = useState([]);
  const [bookingError, setBookingError] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  // Add vehicle inline modal
  const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);
  const [addVehicleReg, setAddVehicleReg] = useState('');
  const [addVehicleType, setAddVehicleType] = useState('');
  const [addVehicleSaving, setAddVehicleSaving] = useState(false);
  const [addVehicleError, setAddVehicleError] = useState('');

  // Online payment confirm modal
  const [showOnlineConfirmModal, setShowOnlineConfirmModal] = useState(false);

  // Load user's vehicles so we can use the default one when booking
  useEffect(() => {
    const userId = auth?.user?.id;
    if (!userId) return;
    vehicleService.getUserVehicles(userId)
      .then((res) => {
        const list = (res.vehicles || []).map((v) => ({
          ...v,
          id: v.id || v._id,
          registrationNumber: v.registrationNumber || v.registration_number || v.license_plate || v.licensePlate,
          vehicleType: v.vehicleType || v.vehicle_type,
          isDefault: v.isDefault ?? v.is_default ?? false,
        }));
        setUserVehicles(list);
      })
      .catch(() => setUserVehicles([]));
  }, [auth?.user?.id]);

  // Default parking data
  const defaultParkingData = {
    id: '1',
    name: 'Central Parking',
    address: '123 Main St, Bergenfield, NJ 07621',
    latitude: 40.9276,
    longitude: -73.9973,
    pricePerHour: 5,
    pricePerDay: 35,
    pricePerWeek: 200,
    pricePerMonth: 700,
    rating: 0,
    totalReviews: 0,
    available: 12,
    spots: 45,
    distance: '0.3 mi',
    type: 'car',
    spaceType: 'Covered',
    dimensions: { width: '8.5 ft', length: '18 ft', height: '7 ft' },
    amenities: ['security', 'cctv', 'ev_charging', 'covered', 'accessible'],
    maxVehicleSize: 'SUVs and Sedans',
    bookingType: 'instant',
    operatingHours: '24/7',
    owner: {
      name: 'ParkSmart LLC',
      rating: 4.8,
      responseTime: '< 1 hour',
    },
    images: [],
    // No serviceFee/taxRate defaults here on purpose: those fields used to
    // seed a ₹1.50 fee and 8% tax that the backend never charged, so the
    // screen quoted a total the customer was not billed. Fees now come from
    // the server quote only.
  };

  const resolvedImages = useMemo(() => {
    const candidates = [
      selectedSpace?.spaceImages,
      selectedSpace?.space_images,
      parkingData?.spaceImages,
      parkingData?.space_images,
      parkingData?.propertyImages,
      parkingData?.property_images,
      parkingData?.images,
    ];
    const hit = candidates.find((arr) => Array.isArray(arr) && arr.length > 0);
    return (hit || [])
      .filter((u) => typeof u === 'string' && u.trim().length > 0)
      .map(resolveImageUri);
  }, [selectedSpace, parkingData]);

  // Stable identity key for the image list, so `parking` below only changes
  // when the images actually change rather than on every render.
  const resolvedImagesKey = resolvedImages.join('|');

  /**
   * Memoised so its identity is stable across renders.
   *
   * This object is a dependency of the quote effect below. Rebuilt inline on
   * every render it made that effect re-run in a loop, firing a debounced
   * POST /api/bookings/quote each pass.
   */
  const parking = useMemo(() => ({
    ...defaultParkingData,
    ...parkingData,
    images: resolvedImages,
    owner: {
      ...defaultParkingData.owner,
      ...(parkingData?.owner || {}),
    },
    // Real metres from the space the owner entered. The old default (8.5 x 18 x
    // 7 ft) was shown for every space because nothing ever mapped these fields.
    dimensions: (() => {
      const src = selectedSpace || parkingData || {};
      const fmt = (v) => (Number(v) > 0 ? `${Number(v)} m` : '—');
      return {
        width: fmt(src.widthMeters ?? src.width_meters),
        length: fmt(src.lengthMeters ?? src.length_meters),
        height: fmt(src.heightMeters ?? src.height_meters),
      };
    })(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [parkingData, selectedSpace, resolvedImagesKey]);

  // A conflict/validation error belongs to the selection that caused it; drop
  // it as soon as the user changes the date, time, duration or payment method.
  useEffect(() => {
    setBookingError('');
  }, [selectedDate, selectedStartTime, selectedEndTime, selectedHours, selectedDuration, selectedPaymentMethod]);

  // Server-side price for the current selection. Null until it arrives.
  const [quote, setQuote] = useState(null);

  // Bottom-bar breakdown expander ("View Details")
  const [showBottomBreakdown, setShowBottomBreakdown] = useState(false);

  /**
   * The 4-column property strip under the title.
   *
   * Every cell is derived from data the backend actually sends. There is no
   * property_type or floor_level column on Property/ParkingSpace, so the
   * design's "Commercial Building" and "P1 / Basement" are rendered from the
   * space type and space number when those exist, and the cell is dropped
   * entirely when they don't — rather than printing a plausible-looking
   * fiction next to a real address.
   */
  const propertyInfo = useMemo(() => {
    const space = selectedSpace;
    const cells = [];

    const spaceType = space?.spaceType ?? parking.spaceType;
    if (spaceType) {
      cells.push({
        key: 'type',
        icon: SPACE_TYPE_ICONS[spaceType] || 'office-building',
        value: SPACE_TYPE_LABELS[spaceType] || String(spaceType),
        label: 'Space Type',
      });
    }

    if (space?.spaceNumber) {
      cells.push({
        key: 'spot',
        icon: 'alpha-p-box-outline',
        value: String(space.spaceNumber),
        label: 'Spot No.',
      });
    }

    const vehicles = space?.allowedVehicleTypes ?? parking.allowedVehicleTypes ?? [];
    if (vehicles.length > 0) {
      cells.push({
        key: 'vehicles',
        icon: 'car',
        value: vehicles.slice(0, 2).join(', '),
        label: vehicles.length > 2 ? `+${vehicles.length - 2} more` : 'Allowed',
      });
    }

    const totalSpots = space?.totalSpots ?? parking.spots;
    if (totalSpots) {
      cells.push({
        key: 'spots',
        icon: 'numeric',
        value: String(totalSpots),
        label: 'Total Spots',
      });
    }

    return cells;
  }, [selectedSpace, parking.spaceType, parking.allowedVehicleTypes, parking.spots]);

  // Hero pills — intersection of what we can show and what this listing has.
  const heroAmenities = useMemo(() => {
    const declared = parking.amenities || [];
    return HERO_AMENITIES.filter((a) => declared.includes(a.id));
  }, [parking.amenities]);

  /**
   * Availability hint next to "Select Time".
   *
   * The search payload carries no SpaceAvailability window, so this reflects
   * `operatingHours` (which defaults to 24/7) instead of the design's
   * hardcoded "6:00 AM – 11:00 PM".
   */
  const availabilityText = useMemo(() => {
    const hours = selectedSpace?.operatingHours ?? parking.operatingHours;
    if (!hours || hours === '24/7') return 'Available: 24/7';
    return `Available: ${hours}`;
  }, [selectedSpace, parking.operatingHours]);

  // Calculate pricing based on duration — uses selectedSpace when available
  const calculatePricing = useMemo(() => {
    // In property mode, use the selected space's prices; otherwise fall back to parking (single-space)
    const priceSource = selectedSpace ?? parking;
    let basePrice = 0;
    let durationText = '';

    switch (selectedDuration) {
      case 'hourly':
        basePrice = (priceSource.pricePerHour || parking.pricePerHour) * selectedHours;
        durationText = `${selectedHours} hour${selectedHours > 1 ? 's' : ''}`;
        break;
      case 'daily':
        basePrice = priceSource.pricePerDay || priceSource.pricePerHour * 8 || parking.pricePerHour * 8;
        durationText = '1 day';
        break;
      case 'weekly':
        basePrice = priceSource.pricePerWeek || priceSource.pricePerMonth || priceSource.pricePerHour * 56 || parking.pricePerHour * 56;
        durationText = '1 week';
        break;
      case 'monthly':
        basePrice = priceSource.pricePerMonth || priceSource.pricePerHour * 240 || parking.pricePerHour * 240;
        durationText = '1 month';
        break;
      default:
        basePrice = priceSource.pricePerHour || parking.pricePerHour;
    }

    // Shown until the server's quote lands. The backend charges no service
    // fee or tax today; the old defaults here (a flat 1.50 and 8%) were
    // dollar-era numbers that made the total differ from what was billed.
    const serviceFee = 0;
    const tax = 0;
    const total = basePrice + serviceFee + tax;

    const local = {
      basePrice: basePrice.toFixed(2),
      serviceFee: serviceFee.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
      durationText,
    };

    // The quote is authoritative — it comes from the same code that will
    // create the booking.
    if (quote) {
      return {
        ...local,
        basePrice: Number(quote.basePrice ?? basePrice).toFixed(2),
        serviceFee: Number(quote.serviceFee ?? 0).toFixed(2),
        tax: Number(quote.tax ?? 0).toFixed(2),
        discount: Number(quote.discountAmount ?? 0).toFixed(2),
        total: Number(quote.totalAmount ?? total).toFixed(2),
        // Only label the tax row with a rate the server actually reports.
        // Hardcoding "GST (18%)" beside a ₹0.00 value would restate the bug
        // that had this screen quoting a total the backend never charged.
        taxLabel: quote.taxRate
          ? `GST (${Math.round(Number(quote.taxRate) * 100)}%)`
          : 'Taxes',
      };
    }
    return { ...local, taxLabel: 'Taxes' };
  }, [selectedDuration, selectedHours, parking, selectedSpace, quote]);

  // Validation
  const isFormValid = useMemo(() => {
    const spaceSelected = !isPropertyMode || selectedSpace !== null;
    return selectedPaymentMethod !== null && agreedToTerms && selectedDate !== null && spaceSelected;
  }, [selectedPaymentMethod, agreedToTerms, selectedDate, isPropertyMode, selectedSpace]);

  // Handle share
  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out this parking spot: ${parking.name} at ${parking.address}. Only ₹${parking.pricePerHour}/hr!`,
        title: parking.name,
      });
    } catch (error) {
      console.log('Error sharing:', error);
    }
  };

  // Handle directions
  const handleDirections = () => {
    const scheme = Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' });
    const latLng = `${parking.latitude},${parking.longitude}`;
    const label = parking.name;
    const url = Platform.select({
      ios: `${scheme}${label}@${latLng}`,
      android: `${scheme}${latLng}(${label})`,
    });
    Linking.openURL(url);
  };

  // Build ISO start/end times from the picker selections
  const buildBookingTimes = useCallback(() => {
    const [startH] = selectedStartTime.split(':').map(Number);

    const start = new Date(selectedDate);
    start.setHours(startH, 0, 0, 0);

    let end;
    if (selectedDuration === 'hourly') {
      end = new Date(start);
      end.setHours(startH + selectedHours, 0, 0, 0);
    } else if (selectedDuration === 'daily') {
      end = new Date(start);
      end.setDate(end.getDate() + 1);
    } else if (selectedDuration === 'weekly') {
      end = new Date(start);
      end.setDate(end.getDate() + 7);
    } else {
      // monthly
      end = new Date(start);
      end.setMonth(end.getMonth() + 1);
    }

    return { startTime: start.toISOString(), endTime: end.toISOString() };
  }, [selectedDate, selectedStartTime, selectedHours, selectedDuration]);

  // Ask the backend what this booking costs whenever the selection changes.
  // Debounced because dragging the hours stepper would otherwise fire a
  // request per tap.
  useEffect(() => {
    const spaceId = selectedSpace?.id ?? parking?.spaceId ?? parking?.id;
    if (!spaceId || !selectedDate) {
      setQuote(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      const { startTime, endTime } = buildBookingTimes();
      bookingService
        .quoteBooking(spaceId, startTime, endTime)
        .then((res) => {
          if (!cancelled) setQuote(res);
        })
        .catch(() => {
          // Fall back to the local estimate rather than blanking the price.
          if (!cancelled) setQuote(null);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [selectedSpace, parking, selectedDate, selectedStartTime, selectedHours,
      selectedDuration, buildBookingTimes]);

  // Core booking logic — call this with a resolved vehicle object
  const doBooking = async (vehicle) => {
    setIsLoading(true);
    setBookingError('');
    const spaceId = selectedSpace?.id ?? parking.id;
    try {
      const { startTime, endTime } = buildBookingTimes();
      const response = await bookingService.createBooking(
        spaceId,
        startTime,
        endTime,
        vehicle.id || vehicle._id,
        selectedPaymentMethod,
      );
      setShowOnlineConfirmModal(false);
      setConfirmedBooking(response.booking);
      setShowSuccessModal(true);
    } catch (err) {
      const code = err?.code || '';
      if (code === 'BIZ_CONFLICT') {
        setBookingError('This space is already booked for the selected time. Please choose a different time.');
      } else if (code === 'BIZ_VALIDATION' && err?.message?.includes('past')) {
        setBookingError('Start time cannot be in the past. Please select a future time.');
      } else if (code === 'NETWORK_ERROR' || code === 'NETWORK_TIMEOUT') {
        setBookingError('No internet connection. Please try again.');
      } else {
        setBookingError(err?.message || 'Booking failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Resolve vehicle then route by payment method
  const handleBookNow = async () => {
    if (!isFormValid || isLoading) return;

    // In property mode, user must select a specific space first
    if (isPropertyMode && !selectedSpace) {
      setBookingError('Please select a parking spot below before booking.');
      return;
    }

    // Must have at least one registered vehicle — show inline modal if not
    const vehicle = userVehicles.find((v) => v.isDefault) || userVehicles[0];
    if (!vehicle) {
      setAddVehicleReg('');
      setAddVehicleType('');
      setAddVehicleError('');
      setShowAddVehicleModal(true);
      return;
    }

    if (selectedPaymentMethod === 'online') {
      // Show price breakdown confirm modal
      setBookingError('');
      setShowOnlineConfirmModal(true);
    } else {
      // Cash — book directly
      await doBooking(vehicle);
    }
  };

  // Called from inside the online confirm modal
  const handleOnlineConfirm = async () => {
    const vehicle = userVehicles.find((v) => v.isDefault) || userVehicles[0];
    if (vehicle) {
      await doBooking(vehicle);
    }
  };

  // Save new vehicle then auto-proceed to booking
  const handleAddVehicleSave = async () => {
    if (!addVehicleReg.trim()) {
      setAddVehicleError('Registration number is required.');
      return;
    }
    if (!addVehicleType) {
      setAddVehicleError('Please select a vehicle type.');
      return;
    }
    const userId = auth?.user?.id;
    if (!userId) return;
    setAddVehicleSaving(true);
    setAddVehicleError('');
    try {
      const reg = addVehicleReg.trim().toUpperCase();
      await vehicleService.addVehicle(userId, {
        license_plate: reg,
        licensePlate: reg,
        registration_number: reg,
        registrationNumber: reg,
        vehicle_type: addVehicleType,
        vehicleType: addVehicleType,
        vehicle_size: 'medium',
        vehicleSize: 'medium',
        make: reg,
        model: addVehicleType,
        is_default: true,
        isDefault: true,
      });
      const res = await vehicleService.getUserVehicles(userId);
      const vehicles = (res.vehicles || []).map((v) => ({
        ...v,
        id: v.id || v._id,
        registrationNumber: v.registrationNumber || v.registration_number || v.license_plate || v.licensePlate,
        vehicleType: v.vehicleType || v.vehicle_type,
        isDefault: v.isDefault ?? v.is_default ?? false,
      }));
      setUserVehicles(vehicles);
      setShowAddVehicleModal(false);
      const vehicle = vehicles.find((v) => v.isDefault) || vehicles[0];
      if (vehicle) {
        await doBooking(vehicle);
      }
    } catch (err) {
      setAddVehicleError(err?.message || 'Failed to add vehicle. Please try again.');
    } finally {
      setAddVehicleSaving(false);
    }
  };

  // Open time picker modal
  const openTimePicker = (type) => {
    setTimeModalType(type);
    setShowTimeModal(true);
  };

  /**
   * Set the duration and drag the end time along with it.
   *
   * The old +/- stepper moved `selectedHours` without touching
   * `selectedEndTime`, so the end-time field could read 10:00 PM while the
   * booking was actually two hours long. The quote and the created booking
   * both come from `buildBookingTimes` (start + hours), so the displayed end
   * time was the thing that was wrong — this keeps it honest.
   */
  const applyHours = useCallback((hours) => {
    const clamped = Math.max(1, Math.min(24, hours));
    setSelectedHours(clamped);
    const startHour = parseInt(selectedStartTime.split(':')[0], 10);
    const endHour = (startHour + clamped) % 24;
    setSelectedEndTime(`${endHour.toString().padStart(2, '0')}:00`);
  }, [selectedStartTime]);

  // Select time
  const selectTime = (time) => {
    if (timeModalType === 'start') {
      setSelectedStartTime(time);
      // Auto-adjust end time, keeping the chosen duration intact. (This used
      // to clamp to 23:00, quietly shortening any evening booking.)
      const startHour = parseInt(time.split(':')[0], 10);
      const endHour = (startHour + selectedHours) % 24;
      setSelectedEndTime(`${endHour.toString().padStart(2, '0')}:00`);
    } else {
      setSelectedEndTime(time);
      // Calculate hours
      const startHour = parseInt(selectedStartTime.split(':')[0], 10);
      const endHour = parseInt(time.split(':')[0], 10);
      if (endHour > startHour) {
        setSelectedHours(endHour - startHour);
      }
    }
    setShowTimeModal(false);
  };

  // Get amenity icon
  const getAmenityIcon = (amenity) => {
    const icons = {
      security: { icon: 'shield-check', label: '24/7 Security' },
      cctv: { icon: 'cctv', label: 'CCTV' },
      ev_charging: { icon: 'ev-station', label: 'EV Charging' },
      covered: { icon: 'home-roof', label: 'Covered' },
      accessible: { icon: 'wheelchair-accessibility', label: 'Accessible' },
      valet: { icon: 'account-tie', label: 'Valet' },
      lighting: { icon: 'lightbulb-on', label: 'Well Lit' },
    };
    return icons[amenity] || { icon: 'check-circle', label: amenity };
  };

  // Format date for display
  const formatSelectedDate = () => {
    return selectedDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  // Get display time
  const getDisplayTime = (time) => {
    const hour = parseInt(time.split(':')[0], 10);
    if (hour === 0) return '12:00 AM';
    if (hour < 12) return `${hour}:00 AM`;
    if (hour === 12) return '12:00 PM';
    return `${hour - 12}:00 PM`;
  };

  const availableLabel = selectedSpace
    ? `${Math.max(0, (selectedSpace.totalSpots || 1) - (selectedSpace.activeBookingCount || 0))} spot${(selectedSpace.totalSpots || 1) > 1 ? 's' : ''} available`
    : `${parking.available} spot${parking.available !== 1 ? 's' : ''} available`;
  const availableCount = selectedSpace
    ? Math.max(0, (selectedSpace.totalSpots || 1) - (selectedSpace.activeBookingCount || 0))
    : Number(parking.available) || 0;

  const headlinePrice = isPropertyMode && !selectedSpace
    ? parking.minPrice === parking.maxPrice
      ? `₹${parking.minPrice}`
      : `₹${parking.minPrice}–₹${parking.maxPrice}`
    : `₹${selectedSpace?.pricePerHour ?? parking.pricePerHour}`;

  // Details grid: only facts the listing actually carries.
  const detailItems = [
    parking.distance && parking.distance !== '—' ? { label: 'Distance', value: parking.distance } : null,
    { label: 'Price', value: `${headlinePrice}/hr` },
    { label: 'Open hours', value: availabilityText.replace('Available: ', '') },
    { label: 'Rating', value: parking.totalReviews > 0 ? `${parking.rating} (${parking.totalReviews} reviews)` : 'No reviews yet' },
    ...propertyInfo.map((cell) => ({
      label: cell.label === 'Allowed' || cell.label.startsWith('+') ? 'Vehicles' : cell.label,
      value: cell.label.startsWith('+') ? `${cell.value} ${cell.label}` : cell.value,
    })),
  ].filter(Boolean);

  const isActiveDate = (d) => selectedDate.toDateString() === d.toDateString();

  const renderBreakdownRows = (rowStyle, labelStyle, valueStyle) => (
    <>
      <View style={rowStyle}>
        <Text style={labelStyle}>Base price ({calculatePricing.durationText})</Text>
        <Text style={valueStyle}>₹{calculatePricing.basePrice}</Text>
      </View>
      <View style={rowStyle}>
        <Text style={labelStyle}>Service fee</Text>
        <Text style={valueStyle}>₹{calculatePricing.serviceFee}</Text>
      </View>
      <View style={rowStyle}>
        <Text style={labelStyle}>{calculatePricing.taxLabel}</Text>
        <Text style={valueStyle}>₹{calculatePricing.tax}</Text>
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Photo hero */}
        <View style={[styles.hero, { height: 300 + insets.top }]}>
          {parking.images.length > 0 ? (
            <Image
              source={{ uri: parking.images[Math.min(selectedImageIndex, parking.images.length - 1)] }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.heroPlaceholder}>
              <IsoBlock size={200} tone="peach" />
            </View>
          )}
          <View pointerEvents="none" style={styles.heroScrim} />

          <View style={[styles.heroTop, { paddingTop: insets.top + 8 }]}>
            <IconCircle icon="arrow-left" variant="glass" size={44} onPress={() => navigation.goBack()} />
            <View style={styles.heroActions}>
              <TouchableOpacity
                style={styles.glassBtn}
                onPress={() => setIsFavorite(!isFavorite)}
                activeOpacity={0.75}
                hitSlop={6}
              >
                <MaterialIcon
                  name={isFavorite ? 'heart' : 'heart-outline'}
                  size={20}
                  color={isFavorite ? palette.danger : palette.textInverse}
                />
              </TouchableOpacity>
              <IconCircle icon="share-2" variant="glass" size={44} onPress={handleShare} style={styles.heroActionGap} />
            </View>
          </View>

          <View style={styles.heroBottom}>
            {heroAmenities.length > 0 ? (
              <View style={styles.heroAmenityRow}>
                {heroAmenities.map((a) => (
                  <View key={a.id} style={styles.heroAmenityPill}>
                    <MaterialIcon name={a.icon} size={13} color={palette.textInverse} />
                    <Text style={styles.heroAmenityText}>{a.label}</Text>
                  </View>
                ))}
              </View>
            ) : <View />}
            {parking.images.length > 0 && (
              <View style={styles.imageCounter}>
                <Text style={styles.imageCounterText}>{selectedImageIndex + 1}/{parking.images.length}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Details card */}
        <View style={styles.detailsCard}>
          {parking.images.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbnailRow}>
              {parking.images.map((uri, index) => (
                <TouchableOpacity
                  key={`${uri}-${index}`}
                  style={[styles.thumbnail, selectedImageIndex === index && styles.thumbnailActive]}
                  onPress={() => setSelectedImageIndex(index)}
                  activeOpacity={0.8}
                >
                  <Image source={{ uri: resolveImageUri(uri) }} style={styles.thumbnailImage} resizeMode="cover" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <View style={styles.titleTopRow}>
            <StatusTag label={availableLabel} tone={availableCount === 0 ? 'danger' : 'ink'} />
            <View style={styles.priceTag}>
              <Text style={styles.priceAmount}>{headlinePrice}</Text>
              <Text style={styles.priceUnit}>/hr</Text>
            </View>
          </View>
          <Text style={styles.parkingName}>{parking.name}</Text>
          <TouchableOpacity style={styles.addressRow} onPress={handleDirections} activeOpacity={0.7}>
            <Icon name="map-pin" size={15} color={palette.textMuted} />
            <Text style={styles.addressText} numberOfLines={2}>{parking.address}</Text>
          </TouchableOpacity>

          <View style={styles.cardDivider} />
          <InfoGrid items={detailItems} columns={2} />

          <View style={styles.dimensionsBox}>
            <InfoGrid
              columns={3}
              items={[
                { label: 'Width', value: parking.dimensions.width },
                { label: 'Length', value: parking.dimensions.length },
                { label: 'Height', value: parking.dimensions.height },
              ]}
            />
          </View>

          {parking.amenities.length > 0 && (
            <>
              <Text style={styles.cardSubTitle}>Amenities</Text>
              <View style={styles.amenitiesWrap}>
                {parking.amenities.map((amenity, index) => {
                  const amenityInfo = getAmenityIcon(amenity);
                  return (
                    <View key={index} style={styles.amenityPill}>
                      <MaterialIcon name={amenityInfo.icon} size={16} color={palette.text} />
                      <Text style={styles.amenityLabel}>{amenityInfo.label}</Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </View>

        {/* Space Selector — shown when multiple spaces exist for this property */}
        {isPropertyMode && parkingData.spaces.length > 1 && (
          <View style={styles.section}>
            <SectionTitle title="Choose your spot" />
            <Text style={styles.sectionSub}>
              {parkingData.spaces.length} space types available at this location
            </Text>
            {parkingData.spaces.map((space) => {
              const spaceAvailable = Math.max(0, (space.totalSpots || 1) - (space.activeBookingCount || 0));
              const isFullyBooked = spaceAvailable === 0;
              const isSelected = selectedSpace?.id === space.id;
              const fg = isSelected ? palette.textInverse : palette.text;
              const muted = isSelected ? 'rgba(255,255,255,0.7)' : palette.textMuted;

              return (
                <TouchableOpacity
                  key={space.id}
                  style={[
                    styles.spaceCard,
                    isSelected && styles.spaceCardSelected,
                    isFullyBooked && styles.spaceCardDisabled,
                  ]}
                  onPress={() => {
                    if (!isFullyBooked) setSelectedSpace(isSelected ? null : space);
                  }}
                  activeOpacity={isFullyBooked ? 1 : 0.85}
                >
                  <View style={[styles.spaceIconCircle, isSelected && styles.spaceIconCircleSelected]}>
                    <MaterialIcon
                      name={SPACE_TYPE_ICONS[space.spaceType] || 'parking'}
                      size={22}
                      color={palette.text}
                    />
                  </View>
                  <View style={styles.spaceCardBody}>
                    <View style={styles.spaceCardHeader}>
                      <Text style={[styles.spaceCardType, { color: fg }]}>
                        {SPACE_TYPE_LABELS[space.spaceType] || space.spaceType}
                      </Text>
                      <Text style={[styles.spaceCardPrice, { color: fg }]}>₹{space.pricePerHour}/hr</Text>
                    </View>
                    <View style={styles.spaceCardMeta}>
                      {isFullyBooked ? (
                        <StatusTag label="Fully booked" tone="danger" />
                      ) : (
                        <Text style={[styles.spaceAvailableText, { color: muted }]}>
                          {spaceAvailable} of {space.totalSpots || 1} spot{(space.totalSpots || 1) > 1 ? 's' : ''} available
                        </Text>
                      )}
                      {space.hasEvCharging && (
                        <StatusTag label="EV" tone={isSelected ? 'white' : 'success'} style={styles.spaceTag} />
                      )}
                      {space.bookingMode === 'request' && (
                        <StatusTag label="On request" tone={isSelected ? 'white' : 'warning'} style={styles.spaceTag} />
                      )}
                    </View>
                    {(space.allowedVehicleTypes || []).length > 0 && (
                      <Text style={[styles.spaceVehicleTypes, { color: muted }]} numberOfLines={1}>
                        {(space.allowedVehicleTypes || []).slice(0, 3).join(', ')}
                        {(space.allowedVehicleTypes || []).length > 3 ? ' +more' : ''}
                      </Text>
                    )}
                  </View>
                  {isSelected && <Icon name="check-circle" size={22} color={palette.textInverse} />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Date Selection */}
        <View style={styles.section}>
          <SectionTitle title="Select date" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
            {dates.map((dateItem, index) => {
              const active = isActiveDate(dateItem.date);
              return (
                <TouchableOpacity
                  key={index}
                  style={[styles.dateCard, active && styles.dateCardActive]}
                  onPress={() => setSelectedDate(dateItem.date)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.dateDayName, active && styles.dateTextActiveMuted]}>
                    {dateItem.isToday ? 'Today' : dateItem.dayName}
                  </Text>
                  <Text style={[styles.dateDay, active && styles.dateTextActive]}>{dateItem.day}</Text>
                  <Text style={[styles.dateMonth, active && styles.dateTextActiveMuted]}>{dateItem.month}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Duration & Time Selection */}
        <View style={styles.section}>
          <SectionTitle title="Booking duration" />
          <View style={styles.whiteCard}>
            <Segmented
              options={durationOptions.map((o) => ({ id: o.id, label: o.label }))}
              value={selectedDuration}
              onChange={setSelectedDuration}
            />

            {selectedDuration === 'hourly' && (
              <View style={styles.timeBlock}>
                <View style={styles.selectTimeHeader}>
                  <Text style={styles.selectTimeTitle}>Select time</Text>
                  <Text style={styles.availabilityHint}>{availabilityText}</Text>
                </View>

                <View style={styles.timePickerRow}>
                  <TouchableOpacity style={styles.timePill} onPress={() => openTimePicker('start')} activeOpacity={0.8}>
                    <Text style={styles.timePillLabel}>Start</Text>
                    <View style={styles.timePillValueRow}>
                      <Text style={styles.timePillValue}>{getDisplayTime(selectedStartTime)}</Text>
                      <Icon name="chevron-down" size={16} color={palette.textMuted} />
                    </View>
                  </TouchableOpacity>
                  <View style={styles.timeArrow}>
                    <Icon name="arrow-right" size={18} color={palette.textMuted} />
                  </View>
                  <TouchableOpacity style={styles.timePill} onPress={() => openTimePicker('end')} activeOpacity={0.8}>
                    <Text style={styles.timePillLabel}>End</Text>
                    <View style={styles.timePillValueRow}>
                      <Text style={styles.timePillValue}>{getDisplayTime(selectedEndTime)}</Text>
                      <Icon name="chevron-down" size={16} color={palette.textMuted} />
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Quick duration chips — replaces the old +/- stepper */}
                <View style={styles.quickHoursRow}>
                  {QUICK_HOURS.map((h) => {
                    const active = selectedHours === h;
                    return (
                      <Chip
                        key={h}
                        label={`${h}h`}
                        selected={active}
                        onPress={() => applyHours(h)}
                        style={[styles.quickChip, !active && styles.quickChipIdle]}
                      />
                    );
                  })}
                </View>

                {/* A duration reached through the end-time picker won't match a
                    chip — show it so the selection is never invisible. */}
                {!QUICK_HOURS.includes(selectedHours) && (
                  <Text style={styles.customDurationNote}>
                    Custom duration: {selectedHours} hour{selectedHours > 1 ? 's' : ''}
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Price Breakdown */}
        <View style={styles.section}>
          <SectionTitle title="Price breakdown" />
          <View style={styles.priceCard}>
            <View style={styles.priceArt} pointerEvents="none">
              <IsoBlock size={140} tone="peach" />
            </View>
            <View style={styles.priceBody}>
              {renderBreakdownRows(styles.priceRow, styles.priceRowLabel, styles.priceRowValue)}
              {Number(calculatePricing.discount) > 0 && (
                <View style={styles.priceRow}>
                  <Text style={styles.priceRowLabel}>Discount</Text>
                  <Text style={[styles.priceRowValue, styles.priceRowValueDiscount]}>
                    −₹{calculatePricing.discount}
                  </Text>
                </View>
              )}
              <View style={styles.priceDivider} />
              <Text style={styles.priceTotalLabel}>Total amount</Text>
              <Text style={styles.priceTotalValue}>₹{calculatePricing.total}</Text>
            </View>
          </View>
        </View>

        {/* Payment Method */}
        <View style={styles.section}>
          <SectionTitle title="Payment method" />
          <View style={styles.paymentOptionsRow}>
            {PAYMENT_OPTIONS.map((opt) => {
              const active = selectedPaymentMethod === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.paymentOptionCard,
                    active && styles.paymentOptionCardActive,
                    opt.disabled && styles.paymentOptionCardDisabled,
                  ]}
                  onPress={() => !opt.disabled && setSelectedPaymentMethod(opt.id)}
                  disabled={opt.disabled}
                  activeOpacity={0.85}
                >
                  <View style={styles.paymentTopRow}>
                    <View style={[styles.paymentIcon, active && styles.paymentIconActive]}>
                      <MaterialIcon
                        name={opt.icon}
                        size={22}
                        color={active ? palette.textInverse : opt.disabled ? palette.textSubtle : palette.text}
                      />
                    </View>
                    {active && <Icon name="check-circle" size={18} color={palette.ink} />}
                  </View>
                  <Text style={[styles.paymentOptionLabel, opt.disabled && styles.paymentTextDisabled]}>
                    {opt.label}
                  </Text>
                  <Text style={styles.paymentOptionSubtitle}>{opt.subtitle}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Location Map */}
        <View style={styles.section}>
          <SectionTitle title="Location" />
          <View style={styles.mapContainer}>
            <MapView
              style={styles.map}
              provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
              mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
              userInterfaceStyle="dark"
              initialRegion={{
                latitude: parking.latitude,
                longitude: parking.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
              scrollEnabled={false}
              zoomEnabled={false}
            >
              <Marker
                coordinate={{
                  latitude: parking.latitude,
                  longitude: parking.longitude,
                }}
              >
                <View style={styles.mapMarker}>
                  <MaterialIcon name="parking" size={20} color={palette.textInverse} />
                </View>
              </Marker>
            </MapView>
            <PillButton
              label="Get directions"
              icon="navigation"
              variant="ink"
              size="sm"
              onPress={handleDirections}
              style={styles.directionsButton}
            />
          </View>
        </View>

        {/* Terms & Conditions */}
        <View style={styles.section}>
          <View style={styles.whiteCard}>
            <TouchableOpacity
              style={styles.termsCheckbox}
              onPress={() => setAgreedToTerms(!agreedToTerms)}
              activeOpacity={0.8}
            >
              <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
                {agreedToTerms && <Icon name="check" size={14} color={palette.textInverse} />}
              </View>
              <Text style={styles.termsText}>
                I agree to the{' '}
                <Text style={styles.termsLink}>Terms of Service</Text>,{' '}
                <Text style={styles.termsLink}>Privacy Policy</Text>, and{' '}
                <Text style={styles.termsLink}>Refund Policy</Text>
              </Text>
            </TouchableOpacity>

            <View style={styles.cancellationCard}>
              <Icon name="info" size={16} color={palette.text} />
              <Text style={styles.cancellationText}>
                Free cancellation up to 2 hours before your booking starts
              </Text>
            </View>
          </View>
        </View>

        {/* Bottom Spacing */}
        <View style={{ height: 170 + bottomInset }} />
      </ScrollView>

      {/* Booking error shown above the bottom bar */}
      {bookingError ? (
        <View style={[styles.bookingErrorBanner, { bottom: 150 + bottomInset }]}>
          <Icon name="alert-circle" size={16} color={palette.danger} />
          <Text style={styles.bookingErrorText}>{bookingError}</Text>
        </View>
      ) : null}

      {/* Bottom Booking Bar */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(16, bottomInset + 10) }]}>
        {/* "View Details" expander — same numbers as the breakdown above,
            so it stays sourced from the quote. */}
        {showBottomBreakdown && !(isPropertyMode && !selectedSpace) && (
          <View style={styles.bottomBreakdown}>
            {renderBreakdownRows(styles.bottomBreakdownRow, styles.bottomBreakdownLabel, styles.bottomBreakdownValue)}
          </View>
        )}

        <View style={styles.bottomBarMain}>
          <View style={styles.bottomPriceContainer}>
            {isPropertyMode && !selectedSpace ? (
              <>
                <Text style={styles.bottomPriceLabel}>Total</Text>
                <Text style={styles.bottomPricePlaceholder}>Select a spot</Text>
              </>
            ) : (
              <>
                <Text style={styles.bottomPriceLabel}>Total for {calculatePricing.durationText}</Text>
                <Text style={styles.bottomPriceValue}>₹{calculatePricing.total}</Text>
                <TouchableOpacity
                  style={styles.viewDetailsButton}
                  onPress={() => setShowBottomBreakdown(!showBottomBreakdown)}
                  activeOpacity={0.7}
                  hitSlop={6}
                >
                  <Text style={styles.viewDetailsText}>View details</Text>
                  <Icon
                    name={showBottomBreakdown ? 'chevron-down' : 'chevron-up'}
                    size={15}
                    color={palette.textMuted}
                  />
                </TouchableOpacity>
              </>
            )}
          </View>

          <PillButton
            label={isPropertyMode && !selectedSpace ? 'Select a spot' : 'Book now'}
            iconRight={isPropertyMode && !selectedSpace ? undefined : 'arrow-right'}
            variant="ink"
            onPress={handleBookNow}
            disabled={!isFormValid}
            loading={isLoading}
            style={styles.bookButton}
          />
        </View>
        <View style={styles.bottomCancellationRow}>
          <MaterialIcon name="shield-check" size={13} color={palette.textMuted} />
          <Text style={styles.bottomCancellationText}>Free cancellation up to 2 hours before</Text>
        </View>
      </View>

      {/* Booking Success Sheet */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View pointerEvents="none" style={styles.modalBackdrop} />
          <View style={[styles.sheet, styles.sheetCenter, { paddingBottom: 28 + bottomInset }]}>
            <View style={styles.grabber} />
            <View style={styles.successIconContainer}>
              <Icon name="check" size={40} color={palette.success} />
            </View>
            <Text style={styles.successTitle}>
              {confirmedBooking?.status === 'pending' || confirmedBooking?.bookingMode === 'request'
                ? 'Booking Requested'
                : 'Booking Confirmed!'}
            </Text>
            {confirmedBooking?.bookingNumber ? (
              <StatusTag label={`Booking #${confirmedBooking.bookingNumber}`} style={styles.successTag} />
            ) : null}
            <Text style={styles.successSubtitle}>
              Your parking space has been reserved.{'\n'}
              {confirmedBooking?.status === 'pending' || confirmedBooking?.bookingMode === 'request'
                ? 'The owner will confirm your request shortly.'
                : 'You\'re all set — see you there!'}
            </Text>
            <PillButton
              label="Done"
              variant="ink"
              onPress={() => {
                setShowSuccessModal(false);
                navigation.goBack();
              }}
              style={styles.sheetButton}
            />
          </View>
        </View>
      </Modal>

      {/* Online Payment Confirm Sheet */}
      <Modal
        visible={showOnlineConfirmModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowOnlineConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View pointerEvents="none" style={styles.modalBackdrop} />
          <View style={[styles.sheet, { paddingBottom: 28 + bottomInset }]}>
            <View style={styles.grabber} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Confirm booking</Text>
              <IconCircle icon="x" variant="grey" size={38} onPress={() => setShowOnlineConfirmModal(false)} />
            </View>

            <View style={styles.confirmBreakdownCard}>
              {renderBreakdownRows(styles.confirmRow, styles.confirmRowLabel, styles.confirmRowValue)}
              <View style={styles.confirmDivider} />
              <View style={styles.confirmRow}>
                <Text style={styles.confirmTotalLabel}>Total</Text>
                <Text style={styles.confirmTotalValue}>₹{calculatePricing.total}</Text>
              </View>
            </View>

            <View style={styles.onlineConfirmNote}>
              <Icon name="info" size={13} color={palette.textMuted} />
              <Text style={styles.onlineConfirmNoteText}>
                Online payment gateway coming soon. Your booking will be confirmed directly.
              </Text>
            </View>

            <PillButton
              label={`Confirm & Book  ·  ₹${calculatePricing.total}`}
              variant="ink"
              onPress={handleOnlineConfirm}
              loading={isLoading}
              style={styles.sheetButton}
            />
          </View>
        </View>
      </Modal>

      {/* Add Vehicle Sheet */}
      <Modal
        visible={showAddVehicleModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowAddVehicleModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View pointerEvents="none" style={styles.modalBackdrop} />
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowAddVehicleModal(false)}
          />
          <View style={[styles.sheet, { paddingBottom: 28 + bottomInset }]}>
            <View style={styles.grabber} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Add a vehicle</Text>
              <IconCircle icon="x" variant="grey" size={38} onPress={() => setShowAddVehicleModal(false)} />
            </View>
            <Text style={styles.sheetSubtitle}>You need a registered vehicle to make a booking.</Text>

            <Field
              label="Registration number"
              icon="hash"
              placeholder="e.g. MH12AB1234"
              value={addVehicleReg}
              onChangeText={(v) => setAddVehicleReg(v.toUpperCase())}
              autoCapitalize="characters"
              returnKeyType="done"
              style={styles.sheetField}
            />

            <Text style={styles.sheetLabel}>Vehicle type</Text>
            <View style={styles.vehicleTypePills}>
              {ADD_VEHICLE_TYPES.map((vt) => {
                const active = addVehicleType === vt.apiType;
                return (
                  <Chip
                    key={vt.apiType}
                    label={vt.label}
                    selected={active}
                    onPress={() => setAddVehicleType(vt.apiType)}
                    style={[styles.quickChip, !active && styles.quickChipIdle]}
                  />
                );
              })}
            </View>

            {addVehicleError ? <Text style={styles.addVehicleError}>{addVehicleError}</Text> : null}

            <PillButton
              label="Save & Book"
              variant="ink"
              onPress={handleAddVehicleSave}
              loading={addVehicleSaving}
              style={styles.sheetButton}
            />
          </View>
        </View>
      </Modal>

      {/* Time Picker Sheet */}
      <Modal
        visible={showTimeModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowTimeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View pointerEvents="none" style={styles.modalBackdrop} />
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowTimeModal(false)}
          />
          <View style={[styles.sheet, styles.timeSheet, { paddingBottom: 16 + bottomInset }]}>
            <View style={styles.grabber} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                Select {timeModalType === 'start' ? 'start' : 'end'} time
              </Text>
              <IconCircle icon="x" variant="grey" size={38} onPress={() => setShowTimeModal(false)} />
            </View>
            <ScrollView style={styles.timeSlotsList} showsVerticalScrollIndicator={false}>
              {timeSlots.map((slot) => {
                // A start time earlier today is rejected by the backend, so
                // don't offer it.
                const past = timeModalType === 'start'
                  && isToday(selectedDate)
                  && parseInt(slot.value.split(':')[0], 10) <= new Date().getHours();
                const active = (timeModalType === 'start' ? selectedStartTime : selectedEndTime) === slot.value;
                return (
                  <TouchableOpacity
                    key={slot.value}
                    disabled={past}
                    style={[
                      styles.timeSlotItem,
                      active && styles.timeSlotItemActive,
                      past && styles.timeSlotItemPast,
                    ]}
                    onPress={() => selectTime(slot.value)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.timeSlotText, active && styles.timeSlotTextActive]}>
                      {slot.label}
                    </Text>
                    {active && <Icon name="check" size={18} color={palette.textInverse} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scrollView: { flex: 1 },

  // Hero
  hero: { width: '100%', backgroundColor: palette.peachSoft, overflow: 'hidden' },
  heroPlaceholder: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
  },
  heroActions: { flexDirection: 'row', alignItems: 'center' },
  heroActionGap: { marginLeft: 10 },
  glassBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBottom: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    bottom: 48,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  heroAmenityRow: { flexDirection: 'row', flexWrap: 'wrap', flex: 1, marginRight: 10 },
  heroAmenityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 6,
    marginTop: 6,
  },
  heroAmenityText: { ...fonts.semibold, fontSize: 11.5, color: palette.textInverse, marginLeft: 5 },
  imageCounter: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  imageCounterText: { ...fonts.semibold, fontSize: 12, color: palette.textInverse },

  // Details card
  detailsCard: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    marginTop: -28,
    marginHorizontal: spacing.lg,
    padding: spacing.xl,
    ...shadow.soft,
  },
  thumbnailRow: { marginBottom: 16 },
  thumbnail: {
    width: 58,
    height: 58,
    borderRadius: radii.md,
    overflow: 'hidden',
    marginRight: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbnailActive: { borderColor: palette.ink },
  thumbnailImage: { width: '100%', height: '100%' },
  titleTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceTag: { flexDirection: 'row', alignItems: 'baseline' },
  priceAmount: { ...fonts.bold, fontSize: 20, color: palette.text, letterSpacing: -0.4 },
  priceUnit: { ...fonts.medium, fontSize: 13, color: palette.textMuted, marginLeft: 2 },
  parkingName: {
    ...fonts.bold,
    fontSize: 28,
    lineHeight: 33,
    letterSpacing: -0.7,
    color: palette.text,
    marginTop: 12,
  },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 6 },
  addressText: {
    ...fonts.medium,
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    color: palette.textMuted,
    marginLeft: 6,
  },
  cardDivider: { height: 1, backgroundColor: palette.line, marginVertical: 16 },
  dimensionsBox: {
    backgroundColor: palette.fill,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    paddingTop: 14,
    marginTop: 4,
  },
  cardSubTitle: { ...fonts.semibold, fontSize: 15.5, color: palette.text, marginTop: 18, marginBottom: 10 },
  amenitiesWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  amenityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.fill,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    height: 38,
    marginRight: 8,
    marginBottom: 8,
  },
  amenityLabel: { ...fonts.semibold, fontSize: 13, color: palette.text, marginLeft: 6 },

  // Sections
  section: { paddingHorizontal: spacing.lg, marginTop: 24 },
  sectionSub: { ...fonts.medium, fontSize: 13, color: palette.textMuted, marginTop: -6, marginBottom: 12 },
  whiteCard: { backgroundColor: palette.surface, borderRadius: radii.xl, padding: spacing.lg },

  // Space selector
  spaceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: palette.surface,
  },
  spaceCardSelected: { backgroundColor: palette.ink, borderColor: palette.ink },
  spaceCardDisabled: { opacity: 0.5 },
  spaceIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  spaceIconCircleSelected: { backgroundColor: palette.peach },
  spaceCardBody: { flex: 1, marginRight: 8 },
  spaceCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spaceCardType: { ...fonts.bold, fontSize: 16 },
  spaceCardPrice: { ...fonts.bold, fontSize: 15 },
  spaceCardMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 6 },
  spaceAvailableText: { ...fonts.medium, fontSize: 12.5 },
  spaceTag: { marginLeft: 6 },
  spaceVehicleTypes: { ...fonts.medium, fontSize: 12, marginTop: 4 },

  // Dates
  dateRow: { paddingRight: 8 },
  dateCard: {
    width: 64,
    paddingVertical: 12,
    borderRadius: radii.lg,
    backgroundColor: palette.surface,
    alignItems: 'center',
    marginRight: 8,
  },
  dateCardActive: { backgroundColor: palette.ink },
  dateDayName: { ...fonts.semibold, fontSize: 12, color: palette.textMuted },
  dateDay: { ...fonts.bold, fontSize: 22, color: palette.text, marginVertical: 2 },
  dateMonth: { ...fonts.medium, fontSize: 12, color: palette.textMuted },
  dateTextActive: { color: palette.textInverse },
  dateTextActiveMuted: { color: 'rgba(255,255,255,0.7)' },

  // Time
  timeBlock: { marginTop: 18 },
  selectTimeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  selectTimeTitle: { ...fonts.semibold, fontSize: 15, color: palette.text },
  availabilityHint: { ...fonts.medium, fontSize: 12.5, color: palette.textMuted },
  timePickerRow: { flexDirection: 'row', alignItems: 'center' },
  timePill: {
    flex: 1,
    backgroundColor: palette.fill,
    borderRadius: radii.pill,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  timePillLabel: { ...fonts.medium, fontSize: 11.5, color: palette.textMuted },
  timePillValueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 1 },
  timePillValue: { ...fonts.bold, fontSize: 15.5, color: palette.text },
  timeArrow: { paddingHorizontal: 8 },
  quickHoursRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14 },
  quickChip: { height: 38, paddingHorizontal: 16, marginBottom: 8, marginRight: 8 },
  quickChipIdle: { backgroundColor: palette.fill },
  customDurationNote: { ...fonts.medium, fontSize: 12.5, color: palette.textMuted, marginTop: 4 },

  // Price breakdown
  priceCard: {
    backgroundColor: palette.peachSoft,
    borderRadius: radii.xl,
    padding: spacing.xl,
    overflow: 'hidden',
    minHeight: 190,
  },
  priceArt: { position: 'absolute', right: -30, bottom: -26 },
  priceBody: { width: '68%' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  priceRowLabel: { ...fonts.medium, flex: 1, fontSize: 13.5, color: palette.inkSoft, marginRight: 8 },
  priceRowValue: { ...fonts.semibold, fontSize: 13.5, color: palette.text },
  priceRowValueDiscount: { color: palette.success },
  priceDivider: { height: 1, backgroundColor: '#F2CFA2', marginVertical: 6 },
  priceTotalLabel: { ...fonts.semibold, fontSize: 13, color: palette.inkSoft, marginTop: 6 },
  priceTotalValue: { ...fonts.bold, fontSize: 30, letterSpacing: -0.8, color: palette.text, marginTop: 2 },

  // Payment
  paymentOptionsRow: { flexDirection: 'row' },
  paymentOptionCard: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: radii.lg,
    padding: 16,
    borderWidth: 2,
    borderColor: palette.surface,
    marginRight: 10,
  },
  paymentOptionCardActive: { borderColor: palette.ink },
  paymentOptionCardDisabled: { backgroundColor: palette.bgSoft, borderColor: palette.bgSoft, opacity: 0.7 },
  paymentTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  paymentIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentIconActive: { backgroundColor: palette.ink },
  paymentOptionLabel: { ...fonts.bold, fontSize: 16, color: palette.text, marginTop: 12 },
  paymentTextDisabled: { color: palette.textMuted },
  paymentOptionSubtitle: { ...fonts.medium, fontSize: 12.5, color: palette.textMuted, marginTop: 2 },

  // Map
  mapContainer: { height: 190, borderRadius: radii.xl, overflow: 'hidden', backgroundColor: palette.surface },
  map: { flex: 1 },
  mapMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: palette.surface,
  },
  directionsButton: { position: 'absolute', right: 12, bottom: 12 },

  // Terms
  termsCheckbox: { flexDirection: 'row', alignItems: 'flex-start' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: palette.textSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: palette.ink, borderColor: palette.ink },
  termsText: { ...fonts.medium, flex: 1, fontSize: 13.5, lineHeight: 20, color: palette.textMuted },
  termsLink: { ...fonts.semibold, color: palette.text, textDecorationLine: 'underline' },
  cancellationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.peachWash,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 14,
  },
  cancellationText: { ...fonts.medium, flex: 1, fontSize: 12.5, color: palette.text, marginLeft: 8 },

  // Error
  bookingErrorBanner: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.dangerSoft,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bookingErrorText: { ...fonts.medium, flex: 1, fontSize: 13, color: palette.danger, marginLeft: 8 },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingHorizontal: spacing.xl,
    paddingTop: 16,
    ...shadow.lifted,
  },
  bottomBreakdown: {
    backgroundColor: palette.fill,
    borderRadius: radii.lg,
    padding: 14,
    paddingBottom: 6,
    marginBottom: 12,
  },
  bottomBreakdownRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  bottomBreakdownLabel: { ...fonts.medium, fontSize: 13, color: palette.textMuted },
  bottomBreakdownValue: { ...fonts.semibold, fontSize: 13, color: palette.text },
  bottomBarMain: { flexDirection: 'row', alignItems: 'center' },
  bottomPriceContainer: { flex: 1, marginRight: 12 },
  bottomPriceLabel: { ...fonts.medium, fontSize: 12.5, color: palette.textMuted },
  bottomPricePlaceholder: { ...fonts.bold, fontSize: 18, color: palette.text, marginTop: 2 },
  bottomPriceValue: { ...fonts.bold, fontSize: 26, letterSpacing: -0.6, color: palette.text },
  viewDetailsButton: { flexDirection: 'row', alignItems: 'center', marginTop: 1 },
  viewDetailsText: { ...fonts.semibold, fontSize: 12.5, color: palette.textMuted, marginRight: 2 },
  bookButton: { minWidth: 150 },
  bottomCancellationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  bottomCancellationText: { ...fonts.medium, fontSize: 11.5, color: palette.textMuted, marginLeft: 5 },

  // Sheets
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingHorizontal: spacing.xl,
    paddingTop: 12,
  },
  sheetCenter: { alignItems: 'center' },
  timeSheet: { maxHeight: '72%' },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.line,
    marginBottom: 16,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { ...fonts.semibold, fontSize: 22, color: palette.text },
  sheetSubtitle: { ...fonts.medium, fontSize: 14, color: palette.textMuted, marginBottom: 16 },
  sheetField: { marginBottom: 16 },
  sheetLabel: { ...typography.caption, marginBottom: 8, marginLeft: 4 },
  sheetButton: { alignSelf: 'stretch', marginTop: 18 },

  successIconContainer: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: palette.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  successTitle: { ...fonts.bold, fontSize: 24, letterSpacing: -0.4, color: palette.text, marginTop: 16 },
  successTag: { alignSelf: 'center', marginTop: 10 },
  successSubtitle: {
    ...fonts.medium,
    fontSize: 14,
    lineHeight: 21,
    color: palette.textMuted,
    textAlign: 'center',
    marginTop: 10,
  },

  confirmBreakdownCard: {
    backgroundColor: palette.peachSoft,
    borderRadius: radii.lg,
    padding: 16,
    paddingBottom: 8,
    marginTop: 8,
  },
  confirmRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  confirmRowLabel: { ...fonts.medium, fontSize: 13.5, color: palette.inkSoft },
  confirmRowValue: { ...fonts.semibold, fontSize: 13.5, color: palette.text },
  confirmDivider: { height: 1, backgroundColor: '#F2CFA2', marginVertical: 6 },
  confirmTotalLabel: { ...fonts.bold, fontSize: 16, color: palette.text },
  confirmTotalValue: { ...fonts.bold, fontSize: 18, color: palette.text },
  onlineConfirmNote: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 12 },
  onlineConfirmNoteText: { ...fonts.medium, flex: 1, fontSize: 12.5, lineHeight: 17, color: palette.textMuted, marginLeft: 6 },

  vehicleTypePills: { flexDirection: 'row', flexWrap: 'wrap' },
  addVehicleError: { ...fonts.medium, fontSize: 13, color: palette.danger, marginTop: 6 },

  timeSlotsList: { marginTop: 4 },
  timeSlotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 50,
    borderRadius: radii.pill,
    paddingHorizontal: 20,
    backgroundColor: palette.fill,
    marginBottom: 8,
  },
  timeSlotItemActive: { backgroundColor: palette.ink },
  timeSlotItemPast: { opacity: 0.35 },
  timeSlotText: { ...fonts.semibold, fontSize: 15, color: palette.text },
  timeSlotTextActive: { color: palette.textInverse },
});

export default ParkingDetailsPage;
