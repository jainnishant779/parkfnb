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
  Dimensions,
  Modal,
  ActivityIndicator,
  TextInput,
  Image,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import * as bookingService from '../../services/bookingService';
import * as vehicleService from '../../services/vehicleService';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import MapView, { Marker } from 'react-native-maps';
import { palette, radii, fontStacks, shadow } from '../../theme';

const { width } = Dimensions.get('window');

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

const PAYMENT_OPTIONS = [
  { id: 'cash', label: 'Cash', subtitle: 'Pay at the spot', icon: 'dollar-sign' },
  { id: 'online', label: 'Online', subtitle: 'Confirm instantly', icon: 'globe' },
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
  const [selectedEndTime, setSelectedEndTime] = useState('10:00');
  const [selectedHours, setSelectedHours] = useState(1);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null);
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
      parkingData?.spaceImages,
      parkingData?.propertyImages,
      parkingData?.images,
    ];
    const hit = candidates.find((arr) => Array.isArray(arr) && arr.length > 0);
    return (hit || []).filter((u) => typeof u === 'string' && u.length > 0);
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
    dimensions: {
      ...defaultParkingData.dimensions,
      ...(parkingData?.dimensions || {}),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [parkingData, resolvedImagesKey]);

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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.goBack()}
        >
          <Icon name="arrow-left" size={22} color={palette.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>PARK</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setIsFavorite(!isFavorite)}
          >
            <MaterialIcon
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={22}
              color={isFavorite ? palette.danger : palette.text}
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={handleShare}>
            <Icon name="share-2" size={22} color={palette.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Image Gallery */}
        <View style={styles.imageGallery}>
          <View style={styles.mainImageContainer}>
            {parking.images.length > 0 ? (
              <Image
                source={{ uri: parking.images[Math.min(selectedImageIndex, parking.images.length - 1)] }}
                style={styles.mainImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.imagePlaceholder}>
                <MaterialIcon name="parking" size={60} color={palette.primary} />
                <Text style={styles.imagePlaceholderText}>{parking.name}</Text>
              </View>
            )}
            <View style={styles.availabilityBadge}>
              <View style={styles.availabilityDot} />
              <Text style={styles.availabilityText}>
                {selectedSpace
                  ? `${Math.max(0, (selectedSpace.totalSpots || 1) - (selectedSpace.activeBookingCount || 0))} spot${(selectedSpace.totalSpots || 1) > 1 ? 's' : ''} available`
                  : `${parking.available} spot${parking.available !== 1 ? 's' : ''} available`}
              </Text>
            </View>
            {parking.images.length > 0 && (
              <View style={styles.imageCounter}>
                <Text style={styles.imageCounterText}>{selectedImageIndex + 1}/{parking.images.length}</Text>
              </View>
            )}

            {/* Amenity pills over the bottom of the hero */}
            {heroAmenities.length > 0 && (
              <View style={styles.heroAmenityRow}>
                {heroAmenities.map((a) => (
                  <View key={a.id} style={styles.heroAmenityPill}>
                    <MaterialIcon name={a.icon} size={13} color={palette.primary} />
                    <Text style={styles.heroAmenityText}>{a.label}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {parking.images.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbnailRow}>
              {parking.images.map((uri, index) => (
                <TouchableOpacity
                  key={`${uri}-${index}`}
                  style={[
                    styles.thumbnail,
                    selectedImageIndex === index && styles.thumbnailActive,
                  ]}
                  onPress={() => setSelectedImageIndex(index)}
                >
                  <Image source={{ uri }} style={styles.thumbnailImage} resizeMode="cover" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Parking Space Details */}
        <View style={styles.section}>
          <View style={styles.titleRow}>
            <View style={styles.titleContainer}>
              <Text style={styles.parkingName}>{parking.name}</Text>
              {parking.totalReviews > 0 ? (
                <View style={styles.ratingRow}>
                  <Icon name="star" size={14} color="#F59E0B" />
                  <Text style={styles.ratingText}>{parking.rating}</Text>
                  <Text style={styles.reviewCount}>({parking.totalReviews} reviews)</Text>
                </View>
              ) : (
                <Text style={styles.reviewCount}>No reviews yet</Text>
              )}
            </View>
            <View style={styles.priceTag}>
              <Text style={styles.priceAmount}>
                {isPropertyMode && !selectedSpace
                  ? parking.minPrice === parking.maxPrice
                    ? `₹${parking.minPrice}`
                    : `₹${parking.minPrice}–₹${parking.maxPrice}`
                  : `₹${selectedSpace?.pricePerHour ?? parking.pricePerHour}`}
              </Text>
              <Text style={styles.priceUnit}>/hr</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.addressRow} onPress={handleDirections}>
            <Icon name="map-pin" size={16} color={palette.primary} />
            <Text style={styles.addressText}>
              {parking.address}
              {parking.distance && parking.distance !== '—' ? ` · ${parking.distance}` : ''}
            </Text>
            <Text style={styles.directionsLink}>Get Directions</Text>
            <Icon name="navigation" size={14} color={palette.primary} />
          </TouchableOpacity>

          {/* Property Info Strip */}
          {propertyInfo.length > 0 && (
            <View style={styles.infoStrip}>
              {propertyInfo.map((cell, index) => (
                <React.Fragment key={cell.key}>
                  {index > 0 && <View style={styles.infoStripDivider} />}
                  <View style={styles.infoStripCell}>
                    <MaterialIcon name={cell.icon} size={18} color={palette.primary} />
                    <View style={styles.infoStripTextGroup}>
                      <Text style={styles.infoStripValue} numberOfLines={1}>
                        {cell.value}
                      </Text>
                      <Text style={styles.infoStripLabel} numberOfLines={1}>
                        {cell.label}
                      </Text>
                    </View>
                  </View>
                </React.Fragment>
              ))}
            </View>
          )}

          {/* Space Dimensions */}
          <View style={styles.dimensionsCard}>
            <Text style={styles.dimensionsTitle}>Space Dimensions</Text>
            <View style={styles.dimensionsRow}>
              <View style={styles.dimensionItem}>
                <MaterialIcon name="arrow-left-right" size={18} color={palette.textMuted} />
                <Text style={styles.dimensionLabel}>Width</Text>
                <Text style={styles.dimensionValue}>{parking.dimensions.width}</Text>
              </View>
              <View style={styles.dimensionDivider} />
              <View style={styles.dimensionItem}>
                <MaterialIcon name="arrow-up-down" size={18} color={palette.textMuted} />
                <Text style={styles.dimensionLabel}>Length</Text>
                <Text style={styles.dimensionValue}>{parking.dimensions.length}</Text>
              </View>
              <View style={styles.dimensionDivider} />
              <View style={styles.dimensionItem}>
                <MaterialIcon name="arrow-collapse-up" size={18} color={palette.textMuted} />
                <Text style={styles.dimensionLabel}>Height</Text>
                <Text style={styles.dimensionValue}>{parking.dimensions.height}</Text>
              </View>
            </View>
          </View>

          {/* Amenities */}
          <Text style={styles.subsectionTitle}>Amenities</Text>
          <View style={styles.amenitiesGrid}>
            {parking.amenities.map((amenity, index) => {
              const amenityInfo = getAmenityIcon(amenity);
              return (
                <View key={index} style={styles.amenityItem}>
                  <MaterialIcon name={amenityInfo.icon} size={18} color={palette.primary} />
                  <Text style={styles.amenityLabel}>{amenityInfo.label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Space Selector — shown when multiple spaces exist for this property */}
        {isPropertyMode && parkingData.spaces.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Choose Your Spot</Text>
            <Text style={styles.spaceSelectorSubtitle}>
              {parkingData.spaces.length} space types available at this location
            </Text>
            {parkingData.spaces.map((space) => {
              const spaceAvailable = Math.max(0, (space.totalSpots || 1) - (space.activeBookingCount || 0));
              const isFullyBooked = spaceAvailable === 0;
              const isSelected = selectedSpace?.id === space.id;

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
                  activeOpacity={isFullyBooked ? 1 : 0.8}
                >
                  <View style={styles.spaceCardLeft}>
                    <View style={[styles.spaceIconCircle, isSelected && styles.spaceIconCircleSelected]}>
                      <MaterialIcon
                        name={SPACE_TYPE_ICONS[space.spaceType] || 'parking'}
                        size={22}
                        color={isSelected ? palette.textInverse : palette.primary}
                      />
                    </View>
                  </View>
                  <View style={styles.spaceCardBody}>
                    <View style={styles.spaceCardHeader}>
                      <Text style={[styles.spaceCardType, isFullyBooked && styles.spaceCardTextDisabled]}>
                        {SPACE_TYPE_LABELS[space.spaceType] || space.spaceType}
                      </Text>
                      <Text style={[styles.spaceCardPrice, isFullyBooked && styles.spaceCardTextDisabled]}>
                        ₹{space.pricePerHour}/hr
                      </Text>
                    </View>
                    <View style={styles.spaceCardMeta}>
                      {isFullyBooked ? (
                        <View style={styles.spaceFullBadge}>
                          <Text style={styles.spaceFullText}>Fully Booked</Text>
                        </View>
                      ) : (
                        <Text style={styles.spaceAvailableText}>
                          {spaceAvailable} of {space.totalSpots || 1} spot{(space.totalSpots || 1) > 1 ? 's' : ''} available
                        </Text>
                      )}
                      {space.hasEvCharging && (
                        <View style={styles.spaceBadge}>
                          <MaterialIcon name="ev-station" size={12} color="#10B981" />
                          <Text style={styles.spaceBadgeText}>EV</Text>
                        </View>
                      )}
                      {space.bookingMode === 'request' && (
                        <View style={[styles.spaceBadge, styles.spaceBadgeRequest]}>
                          <Text style={[styles.spaceBadgeText, styles.spaceBadgeTextRequest]}>On Request</Text>
                        </View>
                      )}
                    </View>
                    {(space.allowedVehicleTypes || []).length > 0 && (
                      <Text style={styles.spaceVehicleTypes} numberOfLines={1}>
                        {(space.allowedVehicleTypes || []).slice(0, 3).join(', ')}
                        {(space.allowedVehicleTypes || []).length > 3 ? ' +more' : ''}
                      </Text>
                    )}
                  </View>
                  {isSelected && (
                    <View style={styles.spaceCheckmark}>
                      <Icon name="check-circle" size={22} color={palette.primary} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Date Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Date</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.dateRow}>
              {dates.map((dateItem, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.dateCard,
                    selectedDate.toDateString() === dateItem.date.toDateString() && styles.dateCardActive,
                  ]}
                  onPress={() => setSelectedDate(dateItem.date)}
                >
                  <Text style={[
                    styles.dateDayName,
                    selectedDate.toDateString() === dateItem.date.toDateString() && styles.dateTextActive,
                  ]}>
                    {dateItem.isToday ? 'Today' : dateItem.dayName}
                  </Text>
                  <Text style={[
                    styles.dateDay,
                    selectedDate.toDateString() === dateItem.date.toDateString() && styles.dateTextActive,
                  ]}>
                    {dateItem.day}
                  </Text>
                  <Text style={[
                    styles.dateMonth,
                    selectedDate.toDateString() === dateItem.date.toDateString() && styles.dateTextActive,
                  ]}>
                    {dateItem.month}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Duration & Time Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Booking Duration</Text>

          {/* Duration Type Selector */}
          <View style={styles.durationTypeRow}>
            {durationOptions.map((option) => (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.durationTypeButton,
                  selectedDuration === option.id && styles.durationTypeButtonActive,
                ]}
                onPress={() => setSelectedDuration(option.id)}
              >
                <Icon
                  name={option.icon}
                  size={16}
                  color={selectedDuration === option.id ? palette.primaryDeep : palette.textMuted}
                />
                <Text style={[
                  styles.durationTypeText,
                  selectedDuration === option.id && styles.durationTypeTextActive,
                ]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Hourly Time Selection */}
          {selectedDuration === 'hourly' && (
            <View style={styles.timeSelectionContainer}>
              <View style={styles.selectTimeHeader}>
                <Text style={styles.selectTimeTitle}>Select Time</Text>
                <Text style={styles.availabilityHint}>{availabilityText}</Text>
              </View>

              <View style={styles.timePickerRow}>
                <TouchableOpacity
                  style={styles.timePickerButton}
                  onPress={() => openTimePicker('start')}
                >
                  <Text style={styles.timePickerLabel}>Start Time</Text>
                  <View style={styles.timePickerValue}>
                    <Icon name="clock" size={18} color={palette.primary} />
                    <Text style={styles.timePickerText}>{getDisplayTime(selectedStartTime)}</Text>
                    <Icon name="chevron-down" size={18} color={palette.textMuted} />
                  </View>
                </TouchableOpacity>

                <View style={styles.timeArrow}>
                  <Icon name="arrow-right" size={20} color="#6B7280" />
                </View>

                <TouchableOpacity
                  style={styles.timePickerButton}
                  onPress={() => openTimePicker('end')}
                >
                  <Text style={styles.timePickerLabel}>End Time</Text>
                  <View style={styles.timePickerValue}>
                    <Icon name="clock" size={18} color={palette.primary} />
                    <Text style={styles.timePickerText}>{getDisplayTime(selectedEndTime)}</Text>
                    <Icon name="chevron-down" size={18} color={palette.textMuted} />
                  </View>
                </TouchableOpacity>
              </View>

              {/* Quick duration chips — replaces the old +/- stepper */}
              <View style={styles.quickHoursRow}>
                {QUICK_HOURS.map((h) => {
                  const active = selectedHours === h;
                  return (
                    <TouchableOpacity
                      key={h}
                      style={[styles.quickHourChip, active && styles.quickHourChipActive]}
                      onPress={() => applyHours(h)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.quickHourText,
                          active && styles.quickHourTextActive,
                        ]}
                      >
                        {h}h
                      </Text>
                    </TouchableOpacity>
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

        {/* Price Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Price Breakdown</Text>
          <View style={styles.priceBreakdownCard}>
            <View style={styles.priceRow}>
              <Text style={styles.priceRowLabel}>
                Base Price ({calculatePricing.durationText})
              </Text>
              <Text style={styles.priceRowValue}>₹{calculatePricing.basePrice}</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceRowLabel}>Service Fee</Text>
              <Text style={styles.priceRowValue}>₹{calculatePricing.serviceFee}</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceRowLabel}>{calculatePricing.taxLabel}</Text>
              <Text style={styles.priceRowValue}>₹{calculatePricing.tax}</Text>
            </View>
            {Number(calculatePricing.discount) > 0 && (
              <View style={styles.priceRow}>
                <Text style={styles.priceRowLabel}>Discount</Text>
                <Text style={[styles.priceRowValue, styles.priceRowValueDiscount]}>
                  −₹{calculatePricing.discount}
                </Text>
              </View>
            )}
            <View style={styles.priceDivider} />
            <View style={styles.priceRowTotal}>
              <Text style={styles.priceTotalLabel}>Total Amount</Text>
              <Text style={styles.priceTotalValue}>₹{calculatePricing.total}</Text>
            </View>
          </View>
        </View>

        {/* Payment Method */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Method</Text>
          <View style={styles.paymentOptionsRow}>
            {PAYMENT_OPTIONS.map((opt) => {
              const active = selectedPaymentMethod === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.paymentOptionCard, active && styles.paymentOptionCardActive]}
                  onPress={() => setSelectedPaymentMethod(opt.id)}
                >
                  {active && (
                    <View style={styles.paymentOptionCheckBadge}>
                      <Icon name="check-circle" size={16} color={palette.primary} />
                    </View>
                  )}
                  <Icon name={opt.icon} size={30} color={active ? palette.primary : palette.textMuted} />
                  <Text style={[styles.paymentOptionLabel, active && styles.paymentOptionLabelActive]}>
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
          <Text style={styles.sectionTitle}>Location</Text>
          <View style={styles.mapContainer}>
            <MapView
              style={styles.map}
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
                  <MaterialIcon name="parking" size={20} color="#FFFFFF" />
                </View>
              </Marker>
            </MapView>
            <TouchableOpacity style={styles.directionsButton} onPress={handleDirections}>
              <Icon name="navigation" size={18} color="#FFFFFF" />
              <Text style={styles.directionsButtonText}>Get Directions</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Terms & Conditions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Terms & Conditions</Text>
          <TouchableOpacity
            style={styles.termsCheckbox}
            onPress={() => setAgreedToTerms(!agreedToTerms)}
          >
            <View style={[
              styles.checkbox,
              agreedToTerms && styles.checkboxChecked,
            ]}>
              {agreedToTerms && <Icon name="check" size={14} color="#FFFFFF" />}
            </View>
            <Text style={styles.termsText}>
              I agree to the{' '}
              <Text style={styles.termsLink}>Terms of Service</Text>,{' '}
              <Text style={styles.termsLink}>Privacy Policy</Text>, and{' '}
              <Text style={styles.termsLink}>Refund Policy</Text>
            </Text>
          </TouchableOpacity>

          {/* Cancellation Policy */}
          <View style={styles.cancellationCard}>
            <Icon name="info" size={18} color={palette.primary} />
            <Text style={styles.cancellationText}>
              Free cancellation up to 2 hours before your booking starts
            </Text>
          </View>
        </View>

        {/* Bottom Spacing */}
        <View style={styles.scrollFooterSpacer} />
      </ScrollView>

      {/* Bottom Booking Bar */}
      <View style={styles.bottomBar}>
        {/* "View Details" expander — same numbers as the breakdown above,
            so it stays sourced from the quote. */}
        {showBottomBreakdown && !(isPropertyMode && !selectedSpace) && (
          <View style={styles.bottomBreakdown}>
            <View style={styles.bottomBreakdownRow}>
              <Text style={styles.bottomBreakdownLabel}>
                Base Price ({calculatePricing.durationText})
              </Text>
              <Text style={styles.bottomBreakdownValue}>₹{calculatePricing.basePrice}</Text>
            </View>
            <View style={styles.bottomBreakdownRow}>
              <Text style={styles.bottomBreakdownLabel}>Service Fee</Text>
              <Text style={styles.bottomBreakdownValue}>₹{calculatePricing.serviceFee}</Text>
            </View>
            <View style={styles.bottomBreakdownRow}>
              <Text style={styles.bottomBreakdownLabel}>{calculatePricing.taxLabel}</Text>
              <Text style={styles.bottomBreakdownValue}>₹{calculatePricing.tax}</Text>
            </View>
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
                <Text style={styles.bottomPriceValue}>₹{calculatePricing.total}</Text>
                <Text style={styles.bottomPriceDuration}>
                  for {calculatePricing.durationText}
                </Text>
                <TouchableOpacity
                  style={styles.viewDetailsButton}
                  onPress={() => setShowBottomBreakdown(!showBottomBreakdown)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.viewDetailsText}>View Details</Text>
                  <Icon
                    name={showBottomBreakdown ? 'chevron-down' : 'chevron-up'}
                    size={16}
                    color={palette.primary}
                  />
                </TouchableOpacity>
              </>
            )}
          </View>

          <View style={styles.bottomActionColumn}>
            <TouchableOpacity
              style={[
                styles.bookButton,
                (!isFormValid || isLoading) && styles.bookButtonDisabled,
              ]}
              onPress={handleBookNow}
              disabled={!isFormValid || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={palette.textInverse} size="small" />
              ) : (
                <>
                  <Text style={styles.bookButtonText}>
                    {isPropertyMode && !selectedSpace ? 'Select a Spot' : 'Book Now'}
                  </Text>
                  <Icon name="arrow-right" size={20} color={palette.textInverse} />
                </>
              )}
            </TouchableOpacity>
            <View style={styles.bottomCancellationRow}>
              <MaterialIcon name="shield-check" size={13} color={palette.primary} />
              <Text style={styles.bottomCancellationText}>
                Free cancellation up to 2 hours before
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Booking error shown above the bottom bar */}
      {bookingError ? (
        <View style={styles.bookingErrorBanner}>
          <Text style={styles.bookingErrorText}>{bookingError}</Text>
        </View>
      ) : null}

      {/* Booking Success Modal */}
      {showSuccessModal ? (

        <View style={styles.modalOverlay}>
          <View style={styles.successModalContent}>
            <View style={styles.successIconContainer}>
              <Icon name="check-circle" size={56} color="#10B981" />
            </View>
            <Text style={styles.successTitle}>Booking Confirmed!</Text>
            {confirmedBooking?.bookingNumber ? (
              <Text style={styles.successBookingNumber}>
                Booking #{confirmedBooking.bookingNumber}
              </Text>
            ) : null}
            <Text style={styles.successSubtitle}>
              Your parking space has been reserved.{'\n'}
              {confirmedBooking?.bookingMode === 'request'
                ? 'The owner will confirm your request shortly.'
                : 'You\'re all set — see you there!'}
            </Text>
            <TouchableOpacity
              style={styles.successButton}
              onPress={() => {
                setShowSuccessModal(false);
                navigation.goBack();
              }}
            >
              <Text style={styles.successButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      
      ) : null}

      {/* Online Payment Confirm Modal */}
      {showOnlineConfirmModal ? (

        <View style={styles.modalOverlay}>
          <View style={styles.onlineConfirmModalContent}>
            <View style={styles.onlineConfirmHeader}>
              <Text style={styles.onlineConfirmTitle}>Confirm Booking</Text>
              <TouchableOpacity onPress={() => setShowOnlineConfirmModal(false)}>
                <Icon name="x" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Price breakdown */}
            <View style={styles.confirmBreakdownCard}>
              <View style={styles.priceRow}>
                <Text style={styles.priceRowLabel}>
                  Base Price ({calculatePricing.durationText})
                </Text>
                <Text style={styles.priceRowValue}>₹{calculatePricing.basePrice}</Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={styles.priceRowLabel}>Service Fee</Text>
                <Text style={styles.priceRowValue}>₹{calculatePricing.serviceFee}</Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={styles.priceRowLabel}>{calculatePricing.taxLabel}</Text>
                <Text style={styles.priceRowValue}>₹{calculatePricing.tax}</Text>
              </View>
              <View style={styles.priceDivider} />
              <View style={styles.priceRowTotal}>
                <Text style={styles.priceTotalLabel}>Total</Text>
                <Text style={styles.priceTotalValue}>₹{calculatePricing.total}</Text>
              </View>
            </View>

            <View style={styles.onlineConfirmNote}>
              <Icon name="info" size={13} color={palette.textMuted} />
              <Text style={styles.onlineConfirmNoteText}>
                Online payment gateway coming soon. Your booking will be confirmed directly.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.addVehicleSaveButton, isLoading && styles.bookButtonDisabled]}
              onPress={handleOnlineConfirm}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.addVehicleSaveText}>
                  Confirm & Book  ·  ₹{calculatePricing.total}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      
      ) : null}

      {/* Add Vehicle Modal */}
      {showAddVehicleModal ? (

        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowAddVehicleModal(false)}
          />
          <View style={styles.addVehicleModalContent}>
            <View style={styles.addVehicleHeader}>
              <Text style={styles.addVehicleTitle}>Add a Vehicle</Text>
              <TouchableOpacity
                onPress={() => setShowAddVehicleModal(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Icon name="x" size={24} color={palette.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.addVehicleSubtitle}>
              You need a registered vehicle to make a booking.
            </Text>

            <Text style={styles.addVehicleLabel}>Registration Number</Text>
            <TextInput
              style={styles.addVehicleInput}
              placeholder="e.g. MH12AB1234"
              placeholderTextColor="#6B7280"
              value={addVehicleReg}
              onChangeText={(v) => setAddVehicleReg(v.toUpperCase())}
              autoCapitalize="characters"
              returnKeyType="done"
            />

            <Text style={styles.addVehicleLabel}>Vehicle Type</Text>
            <View style={styles.vehicleTypePills}>
              {ADD_VEHICLE_TYPES.map((vt) => (
                <TouchableOpacity
                  key={vt.apiType}
                  style={[
                    styles.vehicleTypePill,
                    addVehicleType === vt.apiType && styles.vehicleTypePillSelected,
                  ]}
                  onPress={() => setAddVehicleType(vt.apiType)}
                >
                  <Text
                    style={[
                      styles.vehicleTypePillText,
                      addVehicleType === vt.apiType && styles.vehicleTypePillTextSelected,
                    ]}
                  >
                    {vt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {addVehicleError ? (
              <Text style={styles.addVehicleError}>{addVehicleError}</Text>
            ) : null}

            <TouchableOpacity
              style={[
                styles.addVehicleSaveButton,
                addVehicleSaving && styles.bookButtonDisabled,
              ]}
              onPress={handleAddVehicleSave}
              disabled={addVehicleSaving}
            >
              {addVehicleSaving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.addVehicleSaveText}>Save & Book</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      
      ) : null}

      {/* Time Picker Modal */}
      {showTimeModal ? (

        <View style={styles.modalOverlay}>
          <View style={styles.timeModalContent}>
            <View style={styles.timeModalHeader}>
              <Text style={styles.timeModalTitle}>
                Select {timeModalType === 'start' ? 'Start' : 'End'} Time
              </Text>
              <TouchableOpacity onPress={() => setShowTimeModal(false)}>
                <Icon name="x" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.timeSlotsList}>
              {timeSlots.map((slot) => {
                // A start time earlier today is rejected by the backend, so
                // don't offer it.
                const past = timeModalType === 'start'
                  && isToday(selectedDate)
                  && parseInt(slot.value.split(':')[0], 10) <= new Date().getHours();
                return (
                <TouchableOpacity
                  key={slot.value}
                  disabled={past}
                  style={[
                    styles.timeSlotItem,
                    (timeModalType === 'start' ? selectedStartTime : selectedEndTime) === slot.value && styles.timeSlotItemActive,
                    past && styles.timeSlotItemPast,
                  ]}
                  onPress={() => selectTime(slot.value)}
                >
                  <Text style={[
                    styles.timeSlotText,
                    (timeModalType === 'start' ? selectedStartTime : selectedEndTime) === slot.value && styles.timeSlotTextActive,
                  ]}>
                    {slot.label}
                  </Text>
                  {(timeModalType === 'start' ? selectedStartTime : selectedEndTime) === slot.value && (
                    <Icon name="check" size={20} color={palette.primary} />
                  )}
                </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: 'transparent',
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: fontStacks.regular,
    fontSize: 20,
    fontWeight: '400',
    letterSpacing: 4,
    color: palette.text,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  scrollView: {
    flex: 1,
  },
  // Clears the taller sticky bottom bar (price + button + cancellation line).
  scrollFooterSpacer: {
    height: 160,
  },

  // Image Gallery
  imageGallery: {
    paddingHorizontal: 16,
  },
  mainImageContainer: {
    height: 230,
    position: 'relative',
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: palette.bgSoft,
  },
  mainImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: palette.bgSoft,
  },
  imagePlaceholderText: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '600',
    color: palette.textMuted,
  },
  availabilityBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.success,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  availabilityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.textInverse,
    marginRight: 6,
  },
  availabilityText: {
    color: palette.textInverse,
    fontSize: 12,
    fontWeight: '600',
  },
  imageCounter: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(26,26,46,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  imageCounterText: {
    color: palette.textInverse,
    fontSize: 12,
    fontWeight: '600',
  },
  heroAmenityRow: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  heroAmenityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  heroAmenityText: {
    fontSize: 11,
    fontWeight: '600',
    color: palette.text,
  },
  thumbnailRow: {
    paddingVertical: 12,
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: radii.xs,
    backgroundColor: palette.bgSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbnailActive: {
    borderColor: palette.primary,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
  },

  // Sections
  section: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.text,
    marginBottom: 14,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.text,
    marginTop: 20,
    marginBottom: 12,
  },

  // Main Info
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  titleContainer: {
    flex: 1,
    marginRight: 12,
  },
  parkingName: {
    fontSize: 24,
    fontWeight: '700',
    color: palette.text,
    marginBottom: 6,
    letterSpacing: -0.4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.text,
  },
  reviewCount: {
    fontSize: 13,
    color: palette.textMuted,
  },
  priceTag: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.sm,
  },
  priceAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.primary,
  },
  priceUnit: {
    fontSize: 13,
    color: palette.textMuted,
    marginLeft: 2,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingVertical: 6,
    gap: 6,
  },
  addressText: {
    flex: 1,
    fontSize: 14,
    color: palette.textMuted,
  },
  directionsLink: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.primary,
  },

  // Property Info Strip
  infoStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surfaceDim,
    borderRadius: radii.md,
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  infoStripCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  infoStripTextGroup: {
    flex: 1,
  },
  infoStripValue: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.text,
    textTransform: 'capitalize',
  },
  infoStripLabel: {
    fontSize: 11,
    color: palette.textMuted,
    marginTop: 1,
  },
  infoStripDivider: {
    width: 1,
    height: 32,
    backgroundColor: palette.bgSoft,
  },

  // Dimensions
  dimensionsCard: {
    backgroundColor: palette.surfaceDim,
    borderRadius: radii.md,
    padding: 16,
    marginTop: 16,
  },
  dimensionsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.text,
    marginBottom: 12,
  },
  dimensionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dimensionItem: {
    flex: 1,
    alignItems: 'center',
  },
  dimensionLabel: {
    fontSize: 11,
    color: palette.textMuted,
    marginTop: 4,
  },
  dimensionValue: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.text,
    marginTop: 2,
  },
  dimensionDivider: {
    width: 1,
    height: 40,
    backgroundColor: palette.bgSoft,
  },

  // Amenities
  amenitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  amenityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radii.pill,
    gap: 6,
  },
  amenityLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.primaryDeep,
  },

  // Date Selection
  dateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dateCard: {
    width: 70,
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: palette.surfaceDim,
    alignItems: 'center',
  },
  dateCardActive: {
    backgroundColor: palette.primary,
  },
  dateDayName: {
    fontSize: 12,
    color: palette.textMuted,
    fontWeight: '600',
  },
  dateDay: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.text,
    marginVertical: 4,
  },
  dateMonth: {
    fontSize: 12,
    color: palette.textMuted,
  },
  dateTextActive: {
    color: palette.textInverse,
  },

  // Duration Type
  durationTypeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  durationTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: radii.sm,
    backgroundColor: palette.surfaceDim,
    gap: 6,
  },
  durationTypeButtonActive: {
    backgroundColor: palette.primarySoft,
    borderWidth: 1.5,
    borderColor: palette.primary,
  },
  durationTypeText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.textMuted,
  },
  durationTypeTextActive: {
    color: palette.primaryDeep,
  },

  // Time Selection
  timeSelectionContainer: {
    marginTop: 4,
  },
  selectTimeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  selectTimeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.text,
  },
  availabilityHint: {
    fontSize: 12,
    color: palette.textMuted,
  },
  timePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timePickerButton: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: palette.bgSoft,
  },
  timePickerLabel: {
    fontSize: 11,
    color: palette.textMuted,
    marginBottom: 4,
  },
  timePickerValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timePickerText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: palette.text,
  },
  timeArrow: {
    paddingHorizontal: 2,
  },

  // Quick duration chips
  quickHoursRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  quickHourChip: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: radii.pill,
    backgroundColor: palette.surfaceDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickHourChipActive: {
    backgroundColor: palette.primary,
  },
  quickHourText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.textMuted,
  },
  quickHourTextActive: {
    color: palette.textInverse,
    fontWeight: '700',
  },
  customDurationNote: {
    fontSize: 12,
    color: palette.textMuted,
    marginTop: 10,
    textAlign: 'center',
  },

  // Price Breakdown
  priceBreakdownCard: {
    backgroundColor: palette.surface,
    borderRadius: radii.md,
    padding: 16,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  priceRowLabel: {
    fontSize: 14,
    color: palette.textMuted,
  },
  priceRowValue: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.text,
  },
  priceRowValueDiscount: {
    color: palette.success,
  },
  priceDivider: {
    height: 1,
    backgroundColor: palette.bgSoft,
    marginVertical: 12,
  },
  priceRowTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.text,
  },
  priceTotalValue: {
    fontSize: 22,
    fontWeight: '700',
    color: palette.primary,
  },

  // Payment Options (Cash / Online)
  paymentOptionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  paymentOptionCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 12,
    backgroundColor: palette.surface,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  paymentOptionCardActive: {
    borderColor: palette.primary,
    backgroundColor: palette.primarySoft,
  },
  paymentOptionCheckBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  paymentOptionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.text,
    marginTop: 10,
  },
  paymentOptionLabelActive: {
    color: palette.primaryDeep,
  },
  paymentOptionSubtitle: {
    fontSize: 12,
    color: palette.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },

  // Online confirm modal
  onlineConfirmModalContent: {
    backgroundColor: palette.bg,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: 24,
    paddingBottom: 36,
    width: '100%',
    position: 'absolute',
    bottom: 0,
  },
  onlineConfirmHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  onlineConfirmTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.text,
  },
  confirmBreakdownCard: {
    backgroundColor: palette.surface,
    borderRadius: radii.md,
    padding: 16,
    marginBottom: 16,
  },
  onlineConfirmNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 20,
  },
  onlineConfirmNoteText: {
    flex: 1,
    fontSize: 12,
    color: palette.textMuted,
    lineHeight: 18,
  },

  // Map
  mapContainer: {
    height: 170,
    borderRadius: radii.md,
    overflow: 'hidden',
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  mapMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: palette.surface,
  },
  directionsButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radii.pill,
    gap: 6,
    ...shadow.press,
  },
  directionsButtonText: {
    color: palette.primaryDeep,
    fontSize: 13,
    fontWeight: '700',
  },

  // Terms
  termsCheckbox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: palette.textSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  termsText: {
    flex: 1,
    fontSize: 14,
    color: palette.textMuted,
    lineHeight: 20,
  },
  termsLink: {
    color: palette.primary,
    fontWeight: '600',
  },
  cancellationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.primarySoft,
    borderRadius: radii.sm,
    padding: 12,
    marginTop: 16,
    gap: 10,
  },
  cancellationText: {
    flex: 1,
    fontSize: 13,
    color: palette.primaryDeep,
  },

  // Bottom Bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: palette.surface,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 30 : 16,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
  bottomBarMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bottomBreakdown: {
    borderBottomWidth: 1,
    borderBottomColor: palette.bgSoft,
    paddingBottom: 10,
    marginBottom: 12,
  },
  bottomBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  bottomBreakdownLabel: {
    fontSize: 13,
    color: palette.textMuted,
  },
  bottomBreakdownValue: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.text,
  },
  bottomPriceContainer: {
    flex: 1,
    marginRight: 12,
  },
  bottomPriceLabel: {
    fontSize: 12,
    color: palette.textMuted,
  },
  bottomPricePlaceholder: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.textMuted,
  },
  bottomPriceValue: {
    fontSize: 26,
    fontWeight: '700',
    color: palette.primary,
    letterSpacing: -0.5,
  },
  bottomPriceDuration: {
    fontSize: 12,
    color: palette.textMuted,
    marginTop: 1,
  },
  viewDetailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  viewDetailsText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.primary,
  },
  bottomActionColumn: {
    alignItems: 'center',
  },
  bookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primary,
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: radii.md,
    gap: 8,
    minWidth: 180,
  },
  bookButtonDisabled: {
    backgroundColor: palette.textSubtle,
  },
  bookButtonText: {
    color: palette.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },
  bottomCancellationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 7,
  },
  bottomCancellationText: {
    fontSize: 11,
    color: palette.textMuted,
  },

  // Booking error banner
  bookingErrorBanner: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 150 : 132,
    left: 16,
    right: 16,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: radii.sm,
    padding: 12,
  },
  bookingErrorText: {
    fontSize: 13,
    color: palette.danger,
    textAlign: 'center',
  },

  // Success modal
  successModalContent: {
    backgroundColor: palette.surface,
    borderRadius: radii.lg,
    padding: 32,
    margin: 24,
    alignItems: 'center',
  },
  successIconContainer: {
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: palette.text,
    marginBottom: 8,
  },
  successBookingNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.textMuted,
    marginBottom: 12,
  },
  successSubtitle: {
    fontSize: 14,
    color: palette.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  successButton: {
    backgroundColor: palette.primary,
    borderRadius: radii.sm,
    paddingVertical: 14,
    paddingHorizontal: 48,
  },
  successButtonText: {
    color: palette.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },

  // Time Modal
  modalOverlay: {
    // Absolutely positioned rather than flex:1 — no longer inside a
    // <Modal>, which does not present on this build.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 24,
    backgroundColor: 'rgba(26,26,46,0.45)',
    justifyContent: 'flex-end',
  },
  timeModalContent: {
    backgroundColor: palette.bg,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    maxHeight: '60%',
  },
  timeModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.bgSoft,
  },
  timeModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.text,
  },
  timeSlotsList: {
    padding: 16,
  },
  timeSlotItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.sm,
    marginBottom: 8,
    backgroundColor: palette.surface,
  },
  timeSlotItemActive: {
    backgroundColor: palette.primarySoft,
  },
  // Past start times can't be booked — the backend rejects them.
  timeSlotItemPast: {
    opacity: 0.35,
  },
  timeSlotText: {
    fontSize: 16,
    color: palette.text,
  },
  timeSlotTextActive: {
    fontWeight: '700',
    color: palette.primaryDeep,
  },

  // Space Selector
  spaceSelectorSubtitle: {
    fontSize: 13,
    color: palette.textMuted,
    marginBottom: 12,
    marginTop: -4,
  },
  spaceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 10,
    backgroundColor: palette.surface,
  },
  spaceCardSelected: {
    borderColor: palette.primary,
    backgroundColor: palette.primarySoft,
  },
  spaceCardDisabled: {
    opacity: 0.5,
    backgroundColor: palette.surfaceDim,
  },
  spaceCardLeft: {
    marginRight: 14,
  },
  spaceIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spaceIconCircleSelected: {
    backgroundColor: palette.primary,
  },
  spaceCardTextDisabled: {
    color: palette.textSubtle,
  },
  spaceBadgeRequest: {
    backgroundColor: 'rgba(242,181,60,0.16)',
  },
  spaceBadgeTextRequest: {
    color: '#92400E',
  },
  spaceCardBody: {
    flex: 1,
  },
  spaceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  spaceCardType: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.text,
  },
  spaceCardPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.primary,
  },
  spaceCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  spaceAvailableText: {
    fontSize: 12,
    color: palette.success,
    fontWeight: '600',
  },
  spaceFullBadge: {
    backgroundColor: 'rgba(229,72,77,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  spaceFullText: {
    fontSize: 11,
    color: palette.danger,
    fontWeight: '600',
  },
  spaceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(46,174,107,0.12)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  spaceBadgeText: {
    fontSize: 11,
    color: palette.success,
    fontWeight: '600',
  },
  spaceVehicleTypes: {
    fontSize: 11,
    color: palette.textSubtle,
    textTransform: 'capitalize',
  },
  spaceCheckmark: {
    marginLeft: 10,
  },

  // Add Vehicle Modal
  addVehicleModalContent: {
    backgroundColor: palette.bg,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: 24,
    paddingBottom: 36,
    width: '100%',
    position: 'absolute',
    bottom: 0,
  },
  addVehicleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  addVehicleTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.text,
  },
  addVehicleSubtitle: {
    fontSize: 14,
    color: palette.textMuted,
    marginBottom: 20,
  },
  addVehicleLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.textMuted,
    marginBottom: 8,
  },
  addVehicleInput: {
    borderWidth: 1.5,
    borderColor: palette.bgSoft,
    borderRadius: radii.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: palette.text,
    marginBottom: 16,
    backgroundColor: palette.surface,
  },
  vehicleTypePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  vehicleTypePill: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: palette.bgSoft,
    backgroundColor: palette.surface,
  },
  vehicleTypePillSelected: {
    borderColor: palette.primary,
    backgroundColor: palette.primarySoft,
  },
  vehicleTypePillText: {
    fontSize: 14,
    color: palette.textMuted,
    fontWeight: '600',
  },
  vehicleTypePillTextSelected: {
    color: palette.primaryDeep,
    fontWeight: '700',
  },
  addVehicleError: {
    fontSize: 13,
    color: palette.danger,
    marginBottom: 12,
  },
  addVehicleSaveButton: {
    backgroundColor: palette.primary,
    borderRadius: radii.sm,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addVehicleSaveText: {
    color: palette.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },
});

export default ParkingDetailsPage;
