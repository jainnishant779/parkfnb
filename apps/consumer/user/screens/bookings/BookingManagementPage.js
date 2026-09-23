import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Modal,
  Animated,
  TextInput,
  ScrollView,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Image,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import { AppAlert } from '../../components/AppAlert';
import Icon from 'react-native-vector-icons/Feather';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../../context/AuthContext';
import * as bookingService from '../../services/bookingService';
import { palette, radii, fonts } from '../../theme';
import { resolveImageUri } from '../../utils/imageUri';
import {
  PillButton,
  IconCircle,
  SearchPill,
  ScreenHeader,
  StatusTag,
  ProgressTrack,
  InfoGrid,
  TimelineItem,
  Chip,
  Segmented,
  EmptyState,
  IsoBlock,
} from '../../components/ui';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

const getSpaceName = (booking) => {
  const s = booking.spaceId;
  if (s && typeof s === 'object') {
    // Populated: spaceId.propertyId.propertyName (nested populate)
    const prop = s.propertyId;
    if (prop && typeof prop === 'object') return prop.propertyName || prop.name || 'Parking Space';
    return s.title || s.name || 'Parking Space';
  }
  return 'Parking Space';
};

const getSpaceAddress = (booking) => {
  const s = booking.spaceId;
  if (s && typeof s === 'object') {
    const prop = s.propertyId;
    if (prop && typeof prop === 'object') {
      const parts = [prop.address, prop.city, prop.state].filter(Boolean);
      return parts.join(', ') || '—';
    }
    return s.address || '—';
  }
  return '—';
};

const getSpaceProperty = (booking) => {
  const s = booking?.spaceId;
  if (s && typeof s === 'object') {
    const prop = s.propertyId;
    if (prop && typeof prop === 'object') return prop;
  }
  return null;
};

// Only spaceImages / propertyImages that actually came back from the API.
// No stock photography stand-in — an empty list renders the placeholder tile.
const getSpaceImage = (booking) => {
  const s = booking?.spaceId;
  const prop = getSpaceProperty(booking);
  const candidates = [
    s?.spaceImages,
    s?.space_images,
    prop?.propertyImages,
    prop?.property_images,
  ];
  for (const arr of candidates) {
    if (Array.isArray(arr)) {
      const hit = arr.find((u) => typeof u === 'string' && u.trim().length > 0);
      if (hit) return resolveImageUri(hit);
    }
  }
  return null;
};

const getVehicle = (booking) => {
  const v = booking?.vehicleId;
  return v && typeof v === 'object' ? v : null;
};

const formatDuration = (hours) => {
  if (!hours && hours !== 0) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded} hour${rounded === 1 ? '' : 's'}`;
};

// ─── Progress stepper ────────────────────────────────────────────────────────
//
// The design only draws the happy path (request → approval → confirmed →
// check-in). The backend has seven statuses, so each one maps onto that track
// explicitly. `reached` is how many of the four steps are done, `current` is
// the step the booking is sitting on (amber ring), and `terminal` marks the
// ones the track can never advance past — those get a danger/neutral rail
// instead of a teal one.
const STEPPER_STEPS = ['Request Sent', 'Awaiting Approval', 'Confirmed', 'Check-in'];

const getStepperState = (status) => {
  switch (status) {
    // Request placed, owner has not answered yet.
    case 'pending':
      return { reached: 1, current: 1, tone: 'progress' };
    // Owner approved — first three dots are done, check-in still ahead.
    case 'confirmed':
      return { reached: 3, current: 3, tone: 'progress' };
    // Vehicle is parked: every step including check-in is done.
    case 'active':
      return { reached: 4, current: 3, tone: 'progress' };
    // Finished session — whole track complete, shown in teal, nothing current.
    case 'completed':
      return { reached: 4, current: -1, tone: 'done' };
    // Owner said no. Stops at "Awaiting Approval"; that dot turns red.
    case 'rejected':
      return { reached: 1, current: 1, tone: 'danger' };
    // Renter pulled out. Stops wherever it was; the live dot turns red.
    case 'cancelled':
      return { reached: 1, current: 1, tone: 'danger' };
    // Approved but never turned up — confirmed is real, check-in never happened.
    case 'no_show':
      return { reached: 3, current: 3, tone: 'danger' };
    default:
      return { reached: 0, current: 0, tone: 'progress' };
  }
};

// Headline + explanation for the status card, per backend status.
const getStatusCopy = (status) => {
  switch (status) {
    case 'pending':
      return {
        title: 'Pending Approval',
        message: "Your booking request has been sent to the parking owner. You'll be notified once it's approved.",
        badge: 'Request Sent',
        icon: 'clock',
        color: palette.warning,
      };
    case 'confirmed':
      return {
        title: 'Booking Confirmed',
        message: 'The owner approved your request. Head to the parking location at your start time to check in.',
        badge: 'Confirmed',
        icon: 'check-circle',
        color: palette.primary,
      };
    case 'active':
      return {
        title: 'Parking In Progress',
        message: 'You are checked in. Your session ends at the scheduled time — extend it if you need longer.',
        badge: 'Checked In',
        icon: 'play-circle',
        color: palette.success,
      };
    case 'completed':
      return {
        title: 'Booking Completed',
        message: 'This parking session has ended. Thanks for parking with us.',
        badge: 'Completed',
        icon: 'check-circle',
        color: palette.primary,
      };
    case 'rejected':
      return {
        title: 'Request Declined',
        message: 'The parking owner could not accept this request. You have not been charged — try another nearby space.',
        badge: 'Declined',
        icon: 'x-circle',
        color: palette.danger,
      };
    case 'cancelled':
      return {
        title: 'Booking Cancelled',
        message: 'This booking was cancelled and the spot has been released.',
        badge: 'Cancelled',
        icon: 'slash',
        color: palette.danger,
      };
    case 'no_show':
      return {
        title: 'Marked as No Show',
        message: 'The booking window passed without a check-in, so the spot was released.',
        badge: 'No Show',
        icon: 'alert-circle',
        color: palette.danger,
      };
    default:
      return {
        title: 'Booking',
        message: '',
        badge: '—',
        icon: 'clock',
        color: palette.textMuted,
      };
  }
};

// ─── Component ───────────────────────────────────────────────────────────────

const BookingManagementPage = ({ navigation }) => {
  // The tab bar is absolutely positioned (64 + the bottom inset), so the FAB
  // has to sit above that or the bar clips it.
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const user = auth.user;

  // Data
  const [bookings, setBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // UI
  const [selectedTab, setSelectedTab] = useState('upcoming');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');

  // Modals
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  // id of the booking whose number was just copied — drives the tick feedback
  const [copiedBookingId, setCopiedBookingId] = useState(null);

  // Cancel
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  // Extend
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extendHours, setExtendHours] = useState(1);
  const [isExtending, setIsExtending] = useState(false);

  // Review (local only — no review API in current scope)
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  // local review ratings stored per booking id
  const [localRatings, setLocalRatings] = useState({});

  // IoT Smart Barrier states
  const [unlockingBookingId, setUnlockingBookingId] = useState(null);
  const [lockingBookingId, setLockingBookingId] = useState(null);
  const [arrivingBookingId, setArrivingBookingId] = useState(null);
  const [activeBarrierCountdown, setActiveBarrierCountdown] = useState({}); // { [bookingId]: seconds }

  useEffect(() => {
    const activeIds = Object.keys(activeBarrierCountdown).filter((id) => activeBarrierCountdown[id] > 0);
    if (activeIds.length === 0) return;

    const timer = setInterval(() => {
      setActiveBarrierCountdown((prev) => {
        const next = { ...prev };
        let changed = false;
        activeIds.forEach((id) => {
          if (next[id] > 1) {
            next[id] -= 1;
            changed = true;
          } else {
            delete next[id];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeBarrierCountdown]);

  const handleUnlockBarrier = async (booking) => {
    const bookingId = booking?.id || booking?._id;
    if (!bookingId) return;
    setUnlockingBookingId(bookingId);
    try {
      const res = await bookingService.unlockBarrier(bookingId);
      const countdownSecs = res?.data?.auto_close_in_seconds || 60;
      setActiveBarrierCountdown((prev) => ({ ...prev, [bookingId]: countdownSecs }));
      AppAlert.alert(
        'Barrier Unlocked',
        res?.data?.message || 'Smart Barrier is opening! Please enter your spot. Auto-closing in 60s.',
        [{ text: 'OK' }]
      );
      fetchBookings(false);
    } catch (err) {
      console.error('Unlock barrier error:', err);
      const msg = err.response?.data?.error?.message || err.message || 'Could not unlock smart barrier.';
      AppAlert.alert('Barrier Unlock Failed', msg);
    } finally {
      setUnlockingBookingId(null);
    }
  };

  /**
   * "I've reached the space" — check in without touching the barrier.
   *
   * Unlocking also checks you in server-side, but a guest who parked at a spot
   * with no smart barrier (or whose barrier was already open) still needs a way
   * to tell the owner they have arrived. This moves confirmed → active.
   */
  const handleArrived = async (booking) => {
    const bookingId = booking?.id || booking?._id;
    if (!bookingId) return;
    setArrivingBookingId(bookingId);
    try {
      await bookingService.checkIn(bookingId);
      setBookings(prev =>
        prev.map(b => (b.id === bookingId ? { ...b, status: 'active' } : b))
      );
      AppAlert.alert(
        'Checked In',
        'The owner has been notified that you have arrived. Enjoy your stay!',
        [{ text: 'OK' }]
      );
      fetchBookings(false);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Could not check you in.';
      AppAlert.alert('Check-in Failed', msg);
    } finally {
      setArrivingBookingId(null);
    }
  };

  const handleLockBarrier = async (booking) => {
    const bookingId = booking?.id || booking?._id;
    if (!bookingId) return;
    setLockingBookingId(bookingId);
    try {
      const res = await bookingService.lockBarrier(bookingId);
      // Barrier is shut, so the auto-close countdown no longer applies.
      setActiveBarrierCountdown((prev) => {
        if (!prev[bookingId]) return prev;
        const next = { ...prev };
        delete next[bookingId];
        return next;
      });
      AppAlert.alert('Barrier Closed', res?.data?.message || 'Smart Barrier secured.', [{ text: 'OK' }]);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Could not close smart barrier.';
      AppAlert.alert('Barrier Close Failed', msg);
    } finally {
      setLockingBookingId(null);
    }
  };

  const tabIndicatorAnim = useRef(new Animated.Value(0)).current;

  const tabs = [
    { id: 'upcoming', label: 'Upcoming', icon: 'clock' },
    { id: 'active', label: 'Active', icon: 'play-circle' },
    { id: 'past', label: 'Past', icon: 'check-circle' },
  ];

  // ─── Fetch ─────────────────────────────────────────────────────────────────

  const fetchBookings = useCallback(async (refreshing = false) => {
    if (!user?.id) return;
    if (refreshing) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const res = await bookingService.getUserBookings(user.id, { limit: 100 });
      // Controller returns the array directly as data (not { bookings: [] })
      setBookings(Array.isArray(res) ? res : (res.bookings || []));
    } catch {
      setBookings([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { fetchBookings(); }, [fetchBookings]));

  // ─── Derived data ──────────────────────────────────────────────────────────

  const activeBookings = useMemo(
    () => bookings.filter(b => b.status === 'active'),
    [bookings]
  );
  const upcomingBookings = useMemo(
    () => bookings.filter(b => ['pending', 'confirmed'].includes(b.status)),
    [bookings]
  );
  const pastBookings = useMemo(
    () => bookings.filter(b => ['completed', 'cancelled', 'rejected', 'no_show'].includes(b.status)),
    [bookings]
  );

  const currentTabBookings = useMemo(() => {
    switch (selectedTab) {
      case 'active': return activeBookings;
      case 'upcoming': return upcomingBookings;
      case 'past': return pastBookings;
      default: return [];
    }
  }, [selectedTab, activeBookings, upcomingBookings, pastBookings]);

  const filteredBookings = useMemo(() => {
    let data = currentTabBookings;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(b =>
        getSpaceName(b).toLowerCase().includes(q) ||
        getSpaceAddress(b).toLowerCase().includes(q) ||
        (b.bookingNumber || '').toLowerCase().includes(q)
      );
    }
    if (filterStatus !== 'all') {
      data = data.filter(b => b.status === filterStatus);
    }
    return data;
  }, [currentTabBookings, searchQuery, filterStatus]);

  const tabCount = (tabId) => {
    if (tabId === 'active') return activeBookings.length;
    if (tabId === 'upcoming') return upcomingBookings.length;
    return pastBookings.length;
  };

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleTabChange = (tabId) => {
    const tabIndex = tabs.findIndex(t => t.id === tabId);
    Animated.spring(tabIndicatorAnim, { toValue: tabIndex, useNativeDriver: true }).start();
    setSelectedTab(tabId);
    setFilterStatus('all');
  };

  const handleViewDetails = (booking) => {
    setSelectedBooking(booking);
    setShowDetailsModal(true);
  };

  const handleCancelBooking = async () => {
    if (!selectedBooking) return;
    setIsCancelling(true);
    try {
      await bookingService.cancelBooking(selectedBooking.id, cancelReason.trim() || undefined);
      setBookings(prev =>
        prev.map(b => b.id === selectedBooking.id ? { ...b, status: 'cancelled' } : b)
      );
      setShowCancelModal(false);
      setShowDetailsModal(false);
      setSelectedBooking(null);
      setCancelReason('');
    } catch (err) {
      AppAlert.alert('Error', err?.message || 'Could not cancel booking. Please try again.');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleExtendBooking = async () => {
    if (!selectedBooking) return;
    setIsExtending(true);
    try {
      const res = await bookingService.extendBooking(selectedBooking.id, extendHours);
      // Update the booking in local state with new end time / total
      const updated = res.booking || res;
      setBookings(prev => prev.map(b => b.id === selectedBooking.id ? { ...b, ...updated } : b));
      setShowExtendModal(false);
      setExtendHours(1);
    } catch (err) {
      AppAlert.alert('Error', err?.message || 'Could not extend booking. Please try again.');
    } finally {
      setIsExtending(false);
    }
  };

  const handleSubmitReview = () => {
    if (!selectedBooking || reviewRating === 0) return;
    setLocalRatings(prev => ({ ...prev, [selectedBooking.id]: reviewRating }));
    setShowReviewModal(false);
    setReviewRating(0);
    setReviewText('');
  };

  const handleBookAgain = (booking) => {
    navigation.navigate('Home');
  };

  const handleCopyBookingId = (booking) => {
    const id = booking?.bookingNumber || booking?.id;
    if (!id) return;
    Clipboard.setString(`#${id}`);
    setCopiedBookingId(booking.id);
    setTimeout(() => setCopiedBookingId(null), 1600);
  };

  // Same scheme the parking details screen uses. Falls back to an address
  // search when the property has no stored coordinates.
  const handleDirections = (booking) => {
    const prop = getSpaceProperty(booking);
    const label = getSpaceName(booking);
    const lat = prop?.locationLat;
    const lng = prop?.locationLng;
    const scheme = Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' });
    const query = (lat && lng)
      ? Platform.select({
          ios: `${label}@${lat},${lng}`,
          android: `${lat},${lng}(${label})`,
        })
      : encodeURIComponent(getSpaceAddress(booking));
    Linking.openURL(`${scheme}${query}`).catch(() => {
      AppAlert.alert('Error', 'Could not open maps on this device.');
    });
  };

  // ─── Status helpers ────────────────────────────────────────────────────────

  const getStatusTone = (status) => {
    switch (status) {
      case 'active':
      case 'confirmed': return 'ink';
      case 'pending': return 'warning';
      case 'completed': return 'grey';
      case 'cancelled':
      case 'rejected':
      case 'no_show': return 'danger';
      default: return 'grey';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'active':    return 'In Progress';
      case 'confirmed': return 'Confirmed';
      case 'pending':   return 'Pending Approval';
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      case 'rejected':  return 'Rejected';
      case 'no_show':   return 'No Show';
      default:          return status;
    }
  };

  // Stepper → ProgressTrack position. A finished booking fills the track.
  const trackPosition = (status) => {
    const st = getStepperState(status);
    return st.current === -1 ? STEPPER_STEPS.length : st.current;
  };

  // Timeline entries built only from timestamps the API returned, newest first.
  const buildTimeline = (b) => {
    const st = getStepperState(b.status);
    const copy = getStatusCopy(b.status);
    const events = [
      { key: 'sent', title: 'Request sent', subtitle: getSpaceName(b), at: b.createdAt },
    ];
    if (st.reached >= 3 && st.tone !== 'danger') {
      events.push({ key: 'confirmed', title: 'Booking confirmed', subtitle: 'Approved by the owner', at: b.updatedAt || b.createdAt });
    }
    if (b.checkInTime) {
      events.push({ key: 'checkin', title: 'Checked in', subtitle: getSpaceAddress(b), at: b.checkInTime });
    }
    if (b.status === 'completed') {
      events.push({ key: 'done', title: 'Session completed', subtitle: 'Thanks for parking with us', at: b.endTime });
    }
    if (['cancelled', 'rejected', 'no_show'].includes(b.status)) {
      events.push({
        key: 'ended',
        title: copy.title,
        subtitle: b.rejectionReason || b.cancellationReason || copy.message,
        at: b.updatedAt,
      });
    }
    return events.reverse();
  };

  // ─── Render helpers ────────────────────────────────────────────────────────

  const renderStars = (rating, interactive = false, size = 20) => (
    <View style={styles.starsContainer}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity
          key={star}
          disabled={!interactive}
          onPress={() => interactive && setReviewRating(star)}
          style={styles.starBtn}
        >
          <MaterialIcon
            name={star <= rating ? 'star' : 'star-outline'}
            size={size}
            color={star <= rating ? palette.warning : palette.textSubtle}
          />
        </TouchableOpacity>
      ))}
    </View>
  );

  // Status-specific actions. `compact` = small pills on the list card.
  const renderActions = (item, compact) => {
    const id = item.id || item._id;
    const size = compact ? 'sm' : 'md';
    const btns = [];
    if (item.status === 'confirmed') {
      btns.push(
        <PillButton
          key="arrived"
          size={size}
          variant="ink"
          icon="map-pin"
          label="I've reached"
          loading={arrivingBookingId === id}
          onPress={() => handleArrived(item)}
          style={styles.actionBtn}
        />,
      );
    }
    if (item.status === 'confirmed' || item.status === 'active') {
      btns.push(
        <PillButton
          key="unlock"
          size={size}
          variant={activeBarrierCountdown[id] ? 'peach' : item.status === 'active' ? 'ink' : 'white'}
          icon="unlock"
          label={activeBarrierCountdown[id] ? `Open ${activeBarrierCountdown[id]}s` : 'Unlock'}
          loading={unlockingBookingId === id}
          onPress={() => handleUnlockBarrier(item)}
          style={styles.actionBtn}
        />,
        <PillButton
          key="lock"
          size={size}
          variant="white"
          icon="lock"
          label="Close"
          loading={lockingBookingId === id}
          onPress={() => handleLockBarrier(item)}
          style={styles.actionBtn}
        />,
      );
    }
    if (item.status === 'active') {
      btns.push(
        <PillButton
          key="extend"
          size={size}
          variant="white"
          icon="plus-circle"
          label="Extend"
          onPress={() => { setSelectedBooking(item); setShowExtendModal(true); }}
          style={styles.actionBtn}
        />,
      );
    }
    if (item.status === 'confirmed' || item.status === 'pending') {
      btns.push(
        <PillButton
          key="cancel"
          size={size}
          variant="danger"
          icon="x"
          label="Cancel"
          onPress={() => { setSelectedBooking(item); setShowCancelModal(true); }}
          style={styles.actionBtn}
        />,
      );
    }
    if (['completed', 'cancelled', 'no_show', 'rejected'].includes(item.status)) {
      btns.push(
        <PillButton
          key="again"
          size={size}
          variant="white"
          icon="repeat"
          label="Book again"
          onPress={() => handleBookAgain(item)}
          style={styles.actionBtn}
        />,
      );
    }
    if (item.status === 'completed') {
      const rating = localRatings[item.id];
      btns.push(
        rating ? (
          <View key="rated" style={styles.ratedPill}>{renderStars(rating, false, 14)}</View>
        ) : (
          <PillButton
            key="review"
            size={size}
            variant="white"
            icon="star"
            label="Review"
            onPress={() => { setSelectedBooking(item); setShowReviewModal(true); }}
            style={styles.actionBtn}
          />
        ),
      );
    }
    return btns;
  };

  const renderBookingCard = ({ item, index }) => {
    const past = ['completed', 'cancelled', 'rejected', 'no_show'].includes(item.status);
    const tone = past ? 'grey' : index % 2 === 0 ? 'peach' : 'blue';
    const bg = { peach: palette.peachSoft, blue: palette.blueSoft, grey: palette.surface }[tone];
    const trackColor = { peach: '#F7D3A6', blue: '#BCD0F4', grey: palette.line }[tone];
    const price = item.totalAmount ?? 0;

    return (
      <TouchableOpacity
        style={[styles.bookingCard, { backgroundColor: bg }]}
        onPress={() => handleViewDetails(item)}
        activeOpacity={0.9}
      >
        <View style={styles.cardArt} pointerEvents="none">
          <IsoBlock size={132} tone={tone} />
        </View>

        <View style={styles.cardBody}>
          <StatusTag label={getStatusLabel(item.status)} tone={getStatusTone(item.status)} />
          <Text style={styles.cardRef} numberOfLines={1}>
            #{item.bookingNumber || item.id?.slice(-6)}
          </Text>
          <ProgressTrack
            steps={STEPPER_STEPS.length}
            current={trackPosition(item.status)}
            trackColor={trackColor}
            style={styles.cardTrack}
          />
          <View style={styles.cardMetaRow}>
            <View style={styles.cardMetaCol}>
              <Text style={styles.cardMetaTitle} numberOfLines={1}>{getSpaceName(item)}</Text>
              <Text style={styles.cardMetaSub}>{formatDate(item.startTime)}</Text>
            </View>
            <View style={styles.cardMetaCol}>
              <Text style={styles.cardMetaTitle}>₹{price.toFixed(0)}</Text>
              <Text style={styles.cardMetaSub}>{formatTime(item.startTime)}</Text>
            </View>
          </View>
        </View>

        {item.bookingMode === 'request' && item.status === 'pending' ? (
          <View style={styles.cardNote}>
            <Icon name="info" size={13} color={palette.warning} />
            <Text style={styles.cardNoteText}>Awaiting owner approval</Text>
          </View>
        ) : null}

        <View style={styles.cardActions}>{renderActions(item, true)}</View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <EmptyState
      tone={selectedTab === 'active' ? 'blue' : 'peach'}
      title={`No ${selectedTab === 'active' ? 'active' : selectedTab === 'upcoming' ? 'upcoming' : 'past'} bookings`}
      subtitle={
        selectedTab === 'active'
          ? "You don't have any active parking sessions."
          : selectedTab === 'upcoming'
          ? "You don't have any upcoming reservations."
          : 'Your completed bookings will appear here.'
      }
      action="Find parking"
      onAction={() => navigation.navigate('Home')}
    />
  );

  // ─── Details (full screen, mirrors the reference "Details" page) ─────────────

  const renderDetails = () => {
    if (!selectedBooking) return null;
    const b = selectedBooking;
    const id = b.id || b._id;
    const copy = getStatusCopy(b.status);
    const space = typeof b.spaceId === 'object' ? b.spaceId : null;
    const vehicle = getVehicle(b);
    const image = getSpaceImage(b);
    const bookingRef = b.bookingNumber || b.id;
    const isCopied = copiedBookingId === b.id;
    const timeline = buildTimeline(b);
    const closeDetails = () => setShowDetailsModal(false);

    return (
      <View style={[styles.detailsRoot, { paddingTop: insets.top }]}>
        <ScreenHeader title="Details" onBack={closeDetails} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
          {/* Summary card */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryArt} pointerEvents="none">
              {image ? (
                <Image source={{ uri: image }} style={styles.summaryImage} />
              ) : (
                <IsoBlock size={150} tone="peach" />
              )}
            </View>
            <View style={styles.summaryTop}>
              <View style={styles.flex}>
                <Text style={styles.gridLabelStrong}>Booking id</Text>
                <TouchableOpacity
                  onPress={() => handleCopyBookingId(b)}
                  activeOpacity={0.7}
                  style={styles.refRow}
                >
                  <Text style={styles.summaryRef} numberOfLines={1}>#{bookingRef || '—'}</Text>
                  <Icon
                    name={isCopied ? 'check' : 'copy'}
                    size={15}
                    color={isCopied ? palette.success : palette.textMuted}
                  />
                </TouchableOpacity>
              </View>
              <View style={styles.statusCol}>
                <Text style={styles.gridLabelStrong}>Status</Text>
                <StatusTag label={copy.badge} tone={getStatusTone(b.status)} style={styles.statusTagGap} />
              </View>
            </View>
            <ProgressTrack
              steps={STEPPER_STEPS.length}
              current={trackPosition(b.status)}
              style={styles.summaryTrack}
            />
            <InfoGrid
              style={styles.summaryGrid}
              items={[
                { label: 'Parking', value: getSpaceName(b) },
                { label: 'Rate', value: space?.hourlyRate != null ? `₹${space.hourlyRate}/hr` : '—' },
                { label: 'Date', value: formatDate(b.startTime) },
                { label: 'Time', value: `${formatTime(b.startTime)} - ${formatTime(b.endTime)}` },
                { label: 'Duration', value: formatDuration(b.durationHours) },
                {
                  label: 'Vehicle',
                  value: vehicle
                    ? vehicle.licensePlate || [vehicle.vehicleMake, vehicle.vehicleModel].filter(Boolean).join(' ') || vehicle.vehicleType
                    : '—',
                },
              ]}
            />
          </View>

          {/* Sheet: status, timeline, payment */}
          <View style={styles.detailSheet}>
            <View style={styles.grabber} />
            <Text style={styles.sheetLead}>{copy.message}</Text>

            {timeline.map((ev, i) => (
              <TimelineItem
                key={ev.key}
                title={ev.title}
                subtitle={ev.subtitle}
                date={ev.at ? formatDate(ev.at) : null}
                time={ev.at ? formatTime(ev.at) : null}
                active={i === 0}
                isLast={i === timeline.length - 1}
              >
                {i === 0 ? (
                  <View style={styles.placeCard}>
                    <View style={styles.placeIcon}>
                      <MaterialIcon name="parking" size={22} color={palette.text} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.placeName} numberOfLines={1}>{getSpaceName(b)}</Text>
                      <Text style={styles.placeAddr} numberOfLines={1}>{getSpaceAddress(b)}</Text>
                    </View>
                    <IconCircle icon="navigation" size={40} variant="grey" onPress={() => handleDirections(b)} />
                  </View>
                ) : null}
              </TimelineItem>
            ))}

            <Text style={styles.sheetSection}>Payment</Text>
            <View style={styles.payCard}>
              <View style={styles.payLine}>
                <Text style={styles.payLabel}>Base price ({formatDuration(b.durationHours)})</Text>
                <Text style={styles.payValue}>₹{(b.basePrice ?? 0).toFixed(2)}</Text>
              </View>
              {b.discountAmount > 0 && (
                <View style={styles.payLine}>
                  <Text style={styles.payLabel}>Discount</Text>
                  <Text style={[styles.payValue, { color: palette.success }]}>-₹{b.discountAmount.toFixed(2)}</Text>
                </View>
              )}
              {b.serviceFee != null && (
                <View style={styles.payLine}>
                  <Text style={styles.payLabel}>Service fee</Text>
                  <Text style={styles.payValue}>₹{b.serviceFee.toFixed(2)}</Text>
                </View>
              )}
              {b.tax != null && (
                <View style={styles.payLine}>
                  <Text style={styles.payLabel}>GST</Text>
                  <Text style={styles.payValue}>₹{b.tax.toFixed(2)}</Text>
                </View>
              )}
              <View style={styles.payDivider} />
              <View style={styles.payLine}>
                <Text style={styles.payTotalLabel}>Total</Text>
                <Text style={styles.payTotalValue}>₹{(b.totalAmount ?? 0).toFixed(2)}</Text>
              </View>
              {b.paymentStatus ? (
                <View style={styles.payStatusRow}>
                  <StatusTag
                    label={
                      b.paymentStatus === 'paid'
                        ? 'Paid'
                        : b.paymentStatus === 'pending'
                        ? 'Pay at location'
                        : b.paymentStatus.charAt(0).toUpperCase() + b.paymentStatus.slice(1).replace('_', ' ')
                    }
                    tone={b.paymentStatus === 'paid' ? 'success' : b.paymentStatus === 'pending' ? 'warning' : 'grey'}
                  />
                  {b.paymentStatus === 'pending' ? (
                    <Text style={styles.payMethod}>
                      {b.paymentMethod === 'online' ? 'Online' : 'Cash payment'}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>

            <View style={styles.policyRow}>
              <Icon name="shield" size={16} color={palette.textMuted} />
              <Text style={styles.policyText}>Free cancellation up to 2 hours before your booking starts.</Text>
            </View>
          </View>
        </ScrollView>

        {/* Sticky actions */}
        <View style={[styles.detailFooter, { paddingBottom: insets.bottom + 12 }]}>
          {['confirmed', 'active'].includes(b.status) ? (
            <PillButton
              variant={activeBarrierCountdown[id] ? 'peach' : 'ink'}
              icon="unlock"
              label={activeBarrierCountdown[id] ? `Open ${activeBarrierCountdown[id]}s` : 'Unlock'}
              loading={unlockingBookingId === id}
              onPress={() => handleUnlockBarrier(b)}
              style={styles.footerMain}
            />
          ) : null}
          {['confirmed', 'active'].includes(b.status) ? (
            <PillButton
              variant="grey"
              icon="lock"
              label="Close"
              loading={lockingBookingId === id}
              onPress={() => handleLockBarrier(b)}
              style={styles.footerSide}
            />
          ) : null}
          {b.status === 'active' ? (
            <IconCircle
              icon="plus"
              size={58}
              variant="grey"
              onPress={() => { closeDetails(); setTimeout(() => setShowExtendModal(true), 300); }}
            />
          ) : null}
          {['pending', 'confirmed'].includes(b.status) ? (
            <IconCircle
              icon="x"
              size={58}
              variant="grey"
              color={palette.danger}
              onPress={() => { closeDetails(); setTimeout(() => setShowCancelModal(true), 300); }}
            />
          ) : null}
          {['completed', 'cancelled', 'rejected', 'no_show'].includes(b.status) ? (
            <PillButton
              variant="ink"
              icon="repeat"
              label="Book again"
              onPress={() => { closeDetails(); handleBookAgain(b); }}
              style={styles.footerMain}
            />
          ) : null}
          {b.status === 'pending' ? (
            <PillButton
              variant="ink"
              icon="home"
              label="Home"
              onPress={() => { closeDetails(); navigation.navigate('Home'); }}
              style={styles.footerMain}
            />
          ) : null}
        </View>
      </View>
    );
  };

  // ─── Main render ───────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My bookings</Text>
        <IconCircle icon="search" size={46} onPress={() => setShowSearch(!showSearch)} />
        <IconCircle
          icon="sliders"
          size={46}
          badge={filterStatus !== 'all'}
          onPress={() => setShowFilterModal(true)}
          style={styles.headerGap}
        />
      </View>
      {showSearch && (
        <SearchPill
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search bookings"
          autoFocus
          style={styles.search}
          right={
            searchQuery.length > 0 ? (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={10}>
                <Icon name="x" size={18} color={palette.textMuted} />
              </TouchableOpacity>
            ) : null
          }
        />
      )}

      <Segmented
        style={styles.tabs}
        value={selectedTab}
        onChange={handleTabChange}
        options={tabs.map((t) => ({
          id: t.id,
          label: tabCount(t.id) > 0 ? `${t.label} ${tabCount(t.id)}` : t.label,
        }))}
      />

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.ink} />
          <Text style={styles.loadingText}>Loading bookings</Text>
        </View>
      ) : (
        <FlatList
          data={filteredBookings}
          renderItem={renderBookingCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 120 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmptyState()}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchBookings(true)}
              tintColor={palette.ink}
            />
          }
        />
      )}

      {/* ── Booking details ── */}
      <Modal
        visible={showDetailsModal}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setShowDetailsModal(false)}
      >
        {renderDetails()}
      </Modal>

      {/* ── Cancel confirmation ── */}
      <Modal
        visible={showCancelModal}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setShowCancelModal(false)}
      >
        <View style={styles.sheetOverlay}>
          <View pointerEvents="none" style={styles.sheetBackdrop} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.grabber} />
            <View style={[styles.sheetIcon, { backgroundColor: palette.dangerSoft }]}>
              <Icon name="alert-triangle" size={26} color={palette.danger} />
            </View>
            <Text style={styles.sheetTitle}>Cancel booking?</Text>
            <Text style={styles.sheetText}>
              {selectedBooking?.bookingMode === 'request'
                ? 'Cancelling a pending request will notify the owner.'
                : 'Are you sure? This action cannot be undone.'}
            </Text>
            <TextInput
              style={styles.textArea}
              placeholder="Reason (optional)"
              placeholderTextColor={palette.textSubtle}
              value={cancelReason}
              onChangeText={setCancelReason}
              multiline
            />
            <View style={styles.sheetActions}>
              <PillButton
                label="Keep booking"
                variant="grey"
                disabled={isCancelling}
                onPress={() => { setShowCancelModal(false); setCancelReason(''); }}
                style={styles.sheetBtnLeft}
              />
              <PillButton
                label="Yes, cancel"
                variant="ink"
                loading={isCancelling}
                onPress={handleCancelBooking}
                style={styles.flex}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Extend ── */}
      <Modal
        visible={showExtendModal}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setShowExtendModal(false)}
      >
        <View style={styles.sheetOverlay}>
          <View pointerEvents="none" style={styles.sheetBackdrop} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>Extend parking</Text>
            <Text style={styles.sheetText}>How many more hours do you need?</Text>
            <View style={styles.hourRow}>
              <IconCircle icon="minus" size={56} variant="grey" onPress={() => setExtendHours(Math.max(1, extendHours - 1))} />
              <View style={styles.hourDisplay}>
                <Text style={styles.hourValue}>{extendHours}</Text>
                <Text style={styles.hourUnit}>hour{extendHours > 1 ? 's' : ''}</Text>
              </View>
              <IconCircle icon="plus" size={56} variant="grey" onPress={() => setExtendHours(Math.min(12, extendHours + 1))} />
            </View>
            {selectedBooking && (
              <View style={styles.estimate}>
                <Text style={styles.estimateLabel}>Additional cost (estimate)</Text>
                <Text style={styles.estimateValue}>
                  ₹{((selectedBooking.totalAmount / Math.max(selectedBooking.durationHours, 1)) * extendHours).toFixed(2)}
                </Text>
              </View>
            )}
            <View style={styles.sheetActions}>
              <PillButton
                label="Cancel"
                variant="grey"
                disabled={isExtending}
                onPress={() => setShowExtendModal(false)}
                style={styles.sheetBtnLeft}
              />
              <PillButton
                label="Confirm"
                variant="ink"
                loading={isExtending}
                onPress={handleExtendBooking}
                style={styles.flex}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Review ── */}
      <Modal
        visible={showReviewModal}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setShowReviewModal(false)}
      >
        <View style={styles.sheetOverlay}>
          <View pointerEvents="none" style={styles.sheetBackdrop} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>Rate your experience</Text>
            {selectedBooking && <Text style={styles.sheetText}>{getSpaceName(selectedBooking)}</Text>}
            <View style={styles.reviewStars}>{renderStars(reviewRating, true, 36)}</View>
            <TextInput
              style={[styles.textArea, styles.textAreaTall]}
              placeholder="Share your experience (optional)"
              placeholderTextColor={palette.textSubtle}
              multiline
              numberOfLines={4}
              value={reviewText}
              onChangeText={setReviewText}
            />
            <View style={styles.sheetActions}>
              <PillButton
                label="Cancel"
                variant="grey"
                onPress={() => { setShowReviewModal(false); setReviewRating(0); setReviewText(''); }}
                style={styles.sheetBtnLeft}
              />
              <PillButton
                label="Submit"
                variant="ink"
                disabled={reviewRating === 0}
                onPress={handleSubmitReview}
                style={styles.flex}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Filter ── */}
      <Modal
        visible={showFilterModal}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={styles.sheetOverlay}>
          <View pointerEvents="none" style={styles.sheetBackdrop} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.grabber} />
            <View style={styles.filterHeader}>
              <Text style={styles.sheetTitle}>Filter bookings</Text>
              <IconCircle icon="x" size={40} variant="grey" onPress={() => setShowFilterModal(false)} />
            </View>
            <Text style={styles.filterLabel}>Status</Text>
            <View style={styles.chipWrap}>
              {['all', 'active', 'confirmed', 'pending', 'completed', 'cancelled', 'rejected', 'no_show'].map((status) => (
                <Chip
                  key={status}
                  label={status === 'all' ? 'All' : getStatusLabel(status)}
                  selected={filterStatus === status}
                  onPress={() => setFilterStatus(status)}
                  style={styles.chipGap}
                />
              ))}
            </View>
            <View style={styles.sheetActions}>
              <PillButton
                label="Reset"
                variant="grey"
                onPress={() => { setFilterStatus('all'); setShowFilterModal(false); }}
                style={styles.sheetBtnLeft}
              />
              <PillButton label="Apply" variant="ink" onPress={() => setShowFilterModal(false)} style={styles.flex} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  flex: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 14 },
  headerTitle: { ...fonts.semibold, flex: 1, fontSize: 28, letterSpacing: -0.7, color: palette.text },
  headerGap: { marginLeft: 10 },
  search: { marginHorizontal: 16, marginBottom: 12, backgroundColor: palette.surface },
  tabs: { marginHorizontal: 16, marginBottom: 14, backgroundColor: palette.bgSoft },

  loading: { alignItems: 'center', paddingTop: 60 },
  loadingText: { ...fonts.medium, fontSize: 14, color: palette.textMuted, marginTop: 12 },
  listContent: { paddingHorizontal: 16, flexGrow: 1 },

  bookingCard: { borderRadius: radii.xl, padding: 18, marginBottom: 12, overflow: 'hidden' },
  cardArt: { position: 'absolute', right: -30, top: 30 },
  cardBody: { width: '66%' },
  cardRef: { ...fonts.bold, fontSize: 23, letterSpacing: -0.5, color: palette.text, marginTop: 12 },
  cardTrack: { marginTop: 14 },
  cardMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  cardMetaCol: { maxWidth: '58%' },
  cardMetaTitle: { ...fonts.semibold, fontSize: 13.5, color: palette.text },
  cardMetaSub: { ...fonts.medium, fontSize: 12, color: palette.textMuted, marginTop: 2 },
  cardNote: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  cardNoteText: { ...fonts.semibold, fontSize: 12.5, color: palette.warning, marginLeft: 6 },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14 },
  actionBtn: { marginRight: 8, marginBottom: 8 },
  ratedPill: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: palette.surface,
    justifyContent: 'center',
    marginBottom: 8,
  },
  starsContainer: { flexDirection: 'row', alignItems: 'center' },
  starBtn: { marginHorizontal: 2 },

  // Details
  detailsRoot: { flex: 1, backgroundColor: palette.bgCream },
  summaryCard: {
    marginHorizontal: 16,
    marginTop: 4,
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    padding: 20,
    overflow: 'hidden',
  },
  summaryArt: { position: 'absolute', right: -34, top: 70 },
  summaryImage: { width: 130, height: 130, borderRadius: 24, marginRight: 50 },
  summaryTop: { flexDirection: 'row' },
  statusCol: { alignItems: 'flex-start' },
  statusTagGap: { marginTop: 6 },
  gridLabelStrong: { ...fonts.semibold, fontSize: 12.5, color: palette.text },
  refRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  summaryRef: { ...fonts.bold, fontSize: 24, letterSpacing: -0.5, color: palette.text, marginRight: 8, flexShrink: 1 },
  summaryTrack: { marginTop: 16, width: '66%' },
  summaryGrid: { marginTop: 18, width: '72%' },

  detailSheet: {
    marginTop: 14,
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.line,
    marginBottom: 16,
  },
  sheetLead: { ...fonts.medium, fontSize: 13.5, lineHeight: 19, color: palette.textMuted, marginBottom: 18 },
  placeCard: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    paddingRight: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.line,
  },
  placeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.peachSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  placeName: { ...fonts.bold, fontSize: 14, color: palette.text },
  placeAddr: { ...fonts.medium, fontSize: 12, color: palette.textMuted, marginTop: 2 },

  sheetSection: { ...fonts.semibold, fontSize: 18, color: palette.text, marginTop: 6, marginBottom: 12 },
  payCard: { backgroundColor: palette.surfaceDim, borderRadius: radii.lg, padding: 16 },
  payLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  payLabel: { ...fonts.medium, fontSize: 14, color: palette.textMuted },
  payValue: { ...fonts.semibold, fontSize: 14, color: palette.text },
  payDivider: { height: 1, backgroundColor: palette.line, marginVertical: 8 },
  payTotalLabel: { ...fonts.semibold, fontSize: 16, color: palette.text },
  payTotalValue: { ...fonts.bold, fontSize: 18, color: palette.text },
  payStatusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  payMethod: { ...fonts.medium, fontSize: 13, color: palette.textMuted, marginLeft: 10 },
  policyRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingHorizontal: 4 },
  policyText: { ...fonts.medium, flex: 1, fontSize: 13, color: palette.textMuted, marginLeft: 8 },

  detailFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: palette.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.line,
    gap: 10,
  },
  footerMain: { flex: 1.4 },
  footerSide: { flex: 1 },

  // Sheets
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sheetIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  sheetTitle: { ...fonts.semibold, fontSize: 22, color: palette.text },
  sheetText: { ...fonts.medium, fontSize: 14, lineHeight: 20, color: palette.textMuted, marginTop: 6 },
  textArea: {
    ...fonts.medium,
    marginTop: 16,
    minHeight: 56,
    borderRadius: radii.lg,
    backgroundColor: palette.fill,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 16,
    fontSize: 15,
    color: palette.text,
    textAlignVertical: 'top',
  },
  textAreaTall: { minHeight: 110 },
  sheetActions: { flexDirection: 'row', marginTop: 20 },
  sheetBtnLeft: { flex: 1, marginRight: 10 },
  hourRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  hourDisplay: { alignItems: 'center', marginHorizontal: 34 },
  hourValue: { ...fonts.bold, fontSize: 44, color: palette.text },
  hourUnit: { ...fonts.medium, fontSize: 14, color: palette.textMuted },
  estimate: {
    marginTop: 20,
    borderRadius: radii.lg,
    backgroundColor: palette.peachSoft,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  estimateLabel: { ...fonts.medium, fontSize: 14, color: palette.text },
  estimateValue: { ...fonts.bold, fontSize: 18, color: palette.text },
  reviewStars: { alignItems: 'center', marginTop: 18 },
  filterHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filterLabel: { ...fonts.semibold, fontSize: 15, color: palette.text, marginTop: 16, marginBottom: 10 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  chipGap: { marginBottom: 10, backgroundColor: palette.fill },
});

export default BookingManagementPage;
