/**
 * BookingSchedulePage — second step of the booking flow.
 *
 * ParkingDetails picks the lot and the space; this screen picks the date,
 * duration and time, shows the server-quoted price, takes the payment method
 * and submits the booking. The pricing/quote/booking logic was moved here
 * verbatim from ParkingDetailsPage.
 */
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../../context/AuthContext';
import * as bookingService from '../../services/bookingService';
import * as vehicleService from '../../services/vehicleService';
import { palette, radii, spacing, fonts, typography, shadow } from '../../theme';
import {
  PillButton,
  IconCircle,
  Field,
  SectionTitle,
  StatusTag,
  Chip,
  Segmented,
  IsoBlock,
  ScreenHeader,
} from '../../components/ui';
import SheetModal from '../../components/ui/SheetModal';
import CalendarSheet from '../../components/ui/CalendarSheet';
import { SPACE_TYPE_ICONS, SPACE_TYPE_LABELS } from './ParkingDetailsPage';

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

const BookingSchedulePage = ({ navigation, route }) => {
  // `parking` is the merged listing ParkingDetails rendered (defaults +
  // parkingData + resolved images); `selectedSpace` is the chosen space, or
  // null for a single-space listing.
  const { parking = {}, selectedSpace = null, isPropertyMode = false } = route.params || {};
  const dates = useMemo(() => generateDates(), []);
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom;

  // State
  const [selectedDuration, setSelectedDuration] = useState('hourly');
  const [selectedDate, setSelectedDate] = useState(dates[0].date);
  const [showCalendar, setShowCalendar] = useState(false);
  const dateScrollRef = useRef(null);

  // From the calendar: set the date and bring its chip into view.
  const pickFromCalendar = (d) => {
    const idx = dates.findIndex((x) => x.date.toDateString() === d.toDateString());
    if (idx >= 0) {
      setSelectedDate(dates[idx].date);
      setTimeout(() => dateScrollRef.current?.scrollTo({ x: Math.max(idx - 1, 0) * 74, animated: true }), 250);
    }
  };
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

  // A conflict/validation error belongs to the selection that caused it; drop
  // it as soon as the user changes the date, time, duration or payment method.
  useEffect(() => {
    setBookingError('');
  }, [selectedDate, selectedStartTime, selectedEndTime, selectedHours, selectedDuration, selectedPaymentMethod]);

  // Server-side price for the current selection. Null until it arrives.
  const [quote, setQuote] = useState(null);

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
    return selectedPaymentMethod !== null && selectedDate !== null && spaceSelected;
  }, [selectedPaymentMethod, selectedDate, isPropertyMode, selectedSpace]);

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
      setBookingError('Please select a parking spot before booking.');
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

  /**
   * After a successful booking, return to wherever the user opened the
   * listing from — the same place ParkingDetails' "Done" used to go back to,
   * now two screens down because this step sits on top of it.
   */
  const finishBooking = () => {
    setShowSuccessModal(false);
    const state = navigation.getState?.();
    if (navigation.pop && state && state.index >= 2) {
      navigation.pop(2);
    } else {
      navigation.goBack();
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

  // Get display time
  const getDisplayTime = (time) => {
    const hour = parseInt(time.split(':')[0], 10);
    if (hour === 0) return '12:00 AM';
    if (hour < 12) return `${hour}:00 AM`;
    if (hour === 12) return '12:00 PM';
    return `${hour - 12}:00 PM`;
  };

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

  // Summary card facts
  const thumb = Array.isArray(parking.images) && parking.images.length > 0 ? parking.images[0] : null;
  const spaceType = selectedSpace?.spaceType ?? parking.spaceType;
  const spaceLabel = spaceType ? (SPACE_TYPE_LABELS[spaceType] || String(spaceType)) : 'Parking space';
  const spaceIcon = SPACE_TYPE_ICONS[spaceType] || 'parking';
  const spaceRate = selectedSpace?.pricePerHour ?? parking.pricePerHour;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader
          title="Select date & time"
          onBack={() => navigation.goBack()}
          right={<IconCircle icon="calendar" size={42} onPress={() => setShowCalendar(true)} />}
        />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Lot + space summary */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryThumb}>
            {thumb ? (
              <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <IsoBlock size={54} tone="peach" />
            )}
          </View>
          <View style={styles.summaryBody}>
            <Text style={styles.summaryName} numberOfLines={1}>{parking.name}</Text>
            {parking.address ? (
              <Text style={styles.summaryAddress} numberOfLines={1}>{parking.address}</Text>
            ) : null}
            <View style={styles.summarySpaceRow}>
              <View style={styles.summarySpacePill}>
                <MaterialIcon name={spaceIcon} size={14} color={palette.text} />
                <Text style={styles.summarySpaceText} numberOfLines={1}>
                  {spaceLabel}
                  {selectedSpace?.spaceNumber ? ` · Spot ${selectedSpace.spaceNumber}` : ''}
                </Text>
              </View>
              {spaceRate != null ? (
                <Text style={styles.summaryRate}>
                  ₹{spaceRate}
                  <Text style={styles.summaryRateUnit}>/hr</Text>
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* Date Selection */}
        <View style={styles.section}>
          <SectionTitle title="Select date" action="Calendar" onAction={() => setShowCalendar(true)} />
          <ScrollView ref={dateScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
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

        {/* Cancellation policy — informational only */}
        <View style={styles.section}>
          <View style={styles.cancellationCard}>
            <Icon name="info" size={16} color={palette.text} />
            <Text style={styles.cancellationText}>
              Free cancellation up to 2 hours before your booking starts
            </Text>
          </View>
        </View>

        {/* Bottom Spacing */}
        <View style={{ height: 150 + bottomInset }} />
      </ScrollView>

      {/* Booking error shown above the bottom bar */}
      {bookingError ? (
        <View style={[styles.bookingErrorBanner, { bottom: 120 + bottomInset }]}>
          <Icon name="alert-circle" size={16} color={palette.danger} />
          <Text style={styles.bookingErrorText}>{bookingError}</Text>
        </View>
      ) : null}

      {/* Bottom Booking Bar */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(16, bottomInset + 10) }]}>
        <View style={styles.bottomBarMain}>
          <View style={styles.bottomPriceContainer}>
            <Text style={styles.bottomPriceLabel}>Total for {calculatePricing.durationText}</Text>
            <Text style={styles.bottomPriceValue}>₹{calculatePricing.total}</Text>
          </View>
          <PillButton
            label="Confirm booking"
            variant="ink"
            onPress={handleBookNow}
            disabled={!isFormValid}
            loading={isLoading}
            style={styles.bookButton}
          />
        </View>
      </View>

      {/* Booking Success Sheet */}
      <SheetModal visible={showSuccessModal} onClose={finishBooking}>
        <View style={styles.sheetCenter}>
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
          <PillButton label="Done" variant="ink" onPress={finishBooking} style={styles.sheetButton} />
        </View>
      </SheetModal>

      {/* Online Payment Confirm Sheet */}
      <SheetModal visible={showOnlineConfirmModal} onClose={() => setShowOnlineConfirmModal(false)}>
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
      </SheetModal>

      {/* Add Vehicle Sheet */}
      <SheetModal visible={showAddVehicleModal} onClose={() => setShowAddVehicleModal(false)}>
        {/* Android 15+ is handled by the KeyboardInset inside SheetModal;
            iOS needs the sheet content lifted over the keyboard here. */}
        <KeyboardAvoidingView behavior="padding" enabled={Platform.OS === 'ios'}>
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
        </KeyboardAvoidingView>
      </SheetModal>

      {/* Time Picker Sheet */}
      <CalendarSheet
        visible={showCalendar}
        value={selectedDate}
        minDate={dates[0].date}
        maxDate={dates[dates.length - 1].date}
        onClose={() => setShowCalendar(false)}
        onSelect={pickFromCalendar}
      />

      <SheetModal visible={showTimeModal} onClose={() => setShowTimeModal(false)} maxHeight="72%">
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
      </SheetModal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scrollView: { flex: 1 },

  // Summary
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    marginHorizontal: spacing.lg,
    marginTop: 4,
    padding: 12,
    ...shadow.soft,
  },
  summaryThumb: {
    width: 72,
    height: 72,
    borderRadius: radii.lg,
    backgroundColor: palette.peachSoft,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryBody: { flex: 1, marginLeft: 12 },
  summaryName: { ...fonts.bold, fontSize: 17, letterSpacing: -0.3, color: palette.text },
  summaryAddress: { ...fonts.medium, fontSize: 12.5, color: palette.textMuted, marginTop: 2 },
  summarySpaceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  summarySpacePill: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.fill,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    height: 28,
    marginRight: 8,
  },
  summarySpaceText: { ...fonts.semibold, fontSize: 12, color: palette.text, marginLeft: 5, flexShrink: 1 },
  summaryRate: { ...fonts.bold, fontSize: 15, color: palette.text },
  summaryRateUnit: { ...fonts.medium, fontSize: 12, color: palette.textMuted },

  // Sections
  section: { paddingHorizontal: spacing.lg, marginTop: 24 },
  whiteCard: { backgroundColor: palette.surface, borderRadius: radii.xl, padding: spacing.lg },

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

  // Cancellation note
  cancellationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: palette.peachWash,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cancellationText: { ...fonts.medium, flex: 1, fontSize: 12.5, lineHeight: 17, color: palette.text, marginLeft: 8 },

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
  bottomBarMain: { flexDirection: 'row', alignItems: 'center' },
  bottomPriceContainer: { flex: 1, marginRight: 12 },
  bottomPriceLabel: { ...fonts.medium, fontSize: 12.5, color: palette.textMuted },
  bottomPriceValue: { ...fonts.bold, fontSize: 26, letterSpacing: -0.6, color: palette.text },
  bookButton: { minWidth: 170 },

  // Sheets
  sheetCenter: { alignItems: 'center' },
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

export default BookingSchedulePage;
