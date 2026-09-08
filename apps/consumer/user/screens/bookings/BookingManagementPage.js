import React, { useState, useRef, useMemo, useCallback } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import { AppAlert } from '../../components/AppAlert';
import Icon from 'react-native-vector-icons/Feather';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../../context/AuthContext';
import * as bookingService from '../../services/bookingService';
import { palette, radii, spacing, fontStacks } from '../../theme';
import { VehicleIcon } from '../../components/glass/VehicleIcons';

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
  const candidates = [s?.spaceImages, prop?.propertyImages];
  for (const arr of candidates) {
    if (Array.isArray(arr)) {
      const hit = arr.find((u) => typeof u === 'string' && u.length > 0);
      if (hit) return hit;
    }
  }
  return null;
};

const getVehicle = (booking) => {
  const v = booking?.vehicleId;
  return v && typeof v === 'object' ? v : null;
};

const formatDateTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).replace(',', ',');
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

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':    return '#10B981';
      case 'confirmed': return '#3B82F6';
      case 'pending':   return '#F59E0B';
      case 'completed': return '#A1A1AA';
      case 'cancelled': return '#EF4444';
      case 'rejected':  return '#DC2626';
      case 'no_show':   return '#6B7280';
      default:          return '#A1A1AA';
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

  // ─── Render helpers ────────────────────────────────────────────────────────

  const renderStars = (rating, interactive = false, size = 20) => (
    <View style={styles.starsContainer}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity
          key={star}
          disabled={!interactive}
          onPress={() => interactive && setReviewRating(star)}
        >
          <Icon
            name="star"
            size={size}
            color={star <= rating ? '#F59E0B' : palette.surface}
            style={{ marginHorizontal: 2 }}
          />
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderBookingCard = ({ item }) => {
    const parkingName = getSpaceName(item);
    const address = getSpaceAddress(item);
    const dateLabel = formatDate(item.startTime);
    const startLabel = formatTime(item.startTime);
    const endLabel = formatTime(item.endTime);
    const price = item.totalAmount ?? 0;
    const rating = localRatings[item.id];

    return (
      <TouchableOpacity
        style={styles.bookingCard}
        onPress={() => handleViewDetails(item)}
        activeOpacity={0.7}
      >
        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View style={styles.parkingIconContainer}>
            <MaterialIcon name="parking" size={22} color="#1A73E8" />
          </View>
          <View style={styles.cardTitleSection}>
            <Text style={styles.parkingName} numberOfLines={1}>{parkingName}</Text>
            <Text style={styles.bookingId}>Booking #{item.bookingNumber || item.id?.slice(-6)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '15' }]}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {getStatusLabel(item.status)}
            </Text>
          </View>
        </View>

        {/* Card Details */}
        <View style={styles.cardDetails}>
          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Icon name="map-pin" size={14} color="#A1A1AA" />
              <Text style={styles.detailText} numberOfLines={1}>{address}</Text>
            </View>
          </View>
          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Icon name="calendar" size={14} color="#A1A1AA" />
              <Text style={styles.detailText}>{dateLabel}</Text>
            </View>
            <View style={styles.detailItem}>
              <Icon name="clock" size={14} color="#A1A1AA" />
              <Text style={styles.detailText}>{startLabel} – {endLabel}</Text>
            </View>
          </View>
          <View style={styles.detailRow}>
            {item.bookingMode === 'request' && item.status === 'pending' ? (
              <View style={styles.detailItem}>
                <Icon name="info" size={14} color="#F59E0B" />
                <Text style={[styles.detailText, { color: '#F59E0B' }]}>Awaiting owner approval</Text>
              </View>
            ) : (
              <View style={styles.detailItem} />
            )}
            <View style={styles.priceContainer}>
              <Text style={styles.priceLabel}>Total:</Text>
              <Text style={styles.priceValue}>₹{price.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {/* Card Actions */}
        <View style={styles.cardActions}>
          {item.status === 'active' && (
            <>
              <TouchableOpacity style={styles.actionButton}>
                <Icon name="navigation" size={16} color="#1A73E8" />
                <Text style={styles.actionButtonText}>Navigate</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.primaryButton]}
                onPress={() => { setSelectedBooking(item); setShowExtendModal(true); }}
              >
                <Icon name="plus-circle" size={16} color="#FFFFFF" />
                <Text style={[styles.actionButtonText, styles.primaryButtonText]}>Extend</Text>
              </TouchableOpacity>
            </>
          )}
          {(item.status === 'confirmed' || item.status === 'pending') && (
            <TouchableOpacity
              style={[styles.actionButton, styles.cancelButton]}
              onPress={() => { setSelectedBooking(item); setShowCancelModal(true); }}
            >
              <Icon name="x" size={16} color="#EF4444" />
              <Text style={[styles.actionButtonText, styles.cancelButtonText]}>Cancel</Text>
            </TouchableOpacity>
          )}
          {item.status === 'completed' && (
            <>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleBookAgain(item)}
              >
                <Icon name="repeat" size={16} color="#1A73E8" />
                <Text style={styles.actionButtonText}>Book Again</Text>
              </TouchableOpacity>
              {!rating ? (
                <TouchableOpacity
                  style={[styles.actionButton, styles.reviewButton]}
                  onPress={() => { setSelectedBooking(item); setShowReviewModal(true); }}
                >
                  <Icon name="star" size={16} color="#F59E0B" />
                  <Text style={[styles.actionButtonText, styles.reviewButtonText]}>Review</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.ratedContainer}>
                  {renderStars(rating, false, 14)}
                </View>
              )}
            </>
          )}
          {(item.status === 'cancelled' || item.status === 'no_show') && (
            <TouchableOpacity
              style={[styles.actionButton, { flex: 1 }]}
              onPress={() => handleBookAgain(item)}
            >
              <Icon name="repeat" size={16} color="#1A73E8" />
              <Text style={styles.actionButtonText}>Book Again</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <Icon
          name={selectedTab === 'active' ? 'play-circle' : selectedTab === 'upcoming' ? 'clock' : 'check-circle'}
          size={48}
          color="#6B7280"
        />
      </View>
      <Text style={styles.emptyTitle}>
        No {selectedTab === 'active' ? 'Active' : selectedTab === 'upcoming' ? 'Upcoming' : 'Past'} Bookings
      </Text>
      <Text style={styles.emptySubtitle}>
        {selectedTab === 'active'
          ? "You don't have any active parking sessions"
          : selectedTab === 'upcoming'
          ? "You don't have any upcoming reservations"
          : "Your completed bookings will appear here"}
      </Text>
      <TouchableOpacity
        style={styles.emptyButton}
        onPress={() => navigation.navigate('Home')}
      >
        <Icon name="search" size={18} color="#FFFFFF" />
        <Text style={styles.emptyButtonText}>Find Parking</Text>
      </TouchableOpacity>
    </View>
  );

  // ─── Main render ───────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>My Bookings</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setShowSearch(!showSearch)}
            >
              <Icon name="search" size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setShowFilterModal(true)}
            >
              <Icon name="sliders" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
        {showSearch && (
          <View style={styles.searchContainer}>
            <Icon name="search" size={18} color="#6B7280" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search bookings..."
              placeholderTextColor="#6B7280"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Icon name="x" size={18} color="#6B7280" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        {tabs.map((tab) => {
          const count = tabCount(tab.id);
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, selectedTab === tab.id && styles.tabActive]}
              onPress={() => handleTabChange(tab.id)}
            >
              <Icon
                name={tab.icon}
                size={16}
                color={selectedTab === tab.id ? '#FF2E40' : '#6B7280'}
              />
              <Text style={[styles.tabText, selectedTab === tab.id && styles.tabTextActive]}>
                {tab.label}
              </Text>
              {count > 0 && (
                <View style={[styles.tabBadge, selectedTab === tab.id && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, selectedTab === tab.id && styles.tabBadgeTextActive]}>
                    {count}
                  </Text>
                </View>
              )}
              {selectedTab === tab.id && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1A73E8" />
          <Text style={styles.loadingText}>Loading bookings...</Text>
        </View>
      ) : filteredBookings.length > 0 ? (
        <FlatList
          data={filteredBookings}
          renderItem={renderBookingCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchBookings(true)}
              tintColor="#1A73E8"
            />
          }
        />
      ) : (
        renderEmptyState()
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('Home')}
        activeOpacity={0.8}
      >
        <Icon name="plus" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* ── Booking Details Modal ── */}
      {showDetailsModal ? (

        <View style={styles.modalOverlay}>
          <View style={styles.detailsModalContent}>
            <View style={styles.modalHandle} />
            <View style={styles.detailsModalHeader}>
              <TouchableOpacity
                style={styles.detailsBackButton}
                onPress={() => setShowDetailsModal(false)}
              >
                <Icon name="arrow-left" size={22} color={palette.text} />
              </TouchableOpacity>
              <Text style={styles.detailsModalTitle}>Booking Details</Text>
              <View style={styles.detailsBackButton} />
            </View>

            {selectedBooking && (() => {
              const copy = getStatusCopy(selectedBooking.status);
              const step = getStepperState(selectedBooking.status);
              const property = getSpaceProperty(selectedBooking);
              const space = typeof selectedBooking.spaceId === 'object' ? selectedBooking.spaceId : null;
              const vehicle = getVehicle(selectedBooking);
              const image = getSpaceImage(selectedBooking);
              const bookingRef = selectedBooking.bookingNumber || selectedBooking.id;
              const isCopied = copiedBookingId === selectedBooking.id;
              const totalSpots = space?.totalSpots || 1;
              // Reviews are not returned by the bookings endpoint. Show the
              // real count when it is there and "New" when it is not — never
              // a placeholder score.
              const reviewCount = property?.totalReviews ?? 0;
              const ratingValue = property?.rating;

              return (
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.detailsScrollContent}
                >
                  {/* ── Status header + stepper + booking id ── */}
                  <View style={styles.statusCard}>
                    <View style={styles.statusCardTop}>
                      <View style={[styles.statusIconCircle, { backgroundColor: copy.color + '1F' }]}>
                        <Icon name={copy.icon} size={28} color={copy.color} />
                      </View>
                      <View style={styles.statusCardCopy}>
                        <Text style={styles.statusCardTitle}>{copy.title}</Text>
                        <Text style={styles.statusCardMessage}>{copy.message}</Text>
                      </View>
                      <View style={[styles.statusPill, { backgroundColor: copy.color + '1F' }]}>
                        <Text style={[styles.statusPillText, { color: copy.color }]}>{copy.badge}</Text>
                      </View>
                    </View>

                    {/* Progress stepper */}
                    <View style={styles.stepper}>
                      {STEPPER_STEPS.map((label, index) => {
                        const isDone = index < step.reached;
                        const isCurrent = index === step.current;
                        const isDanger = isCurrent && step.tone === 'danger';
                        const dotColor = isDanger
                          ? palette.danger
                          : isDone
                          ? palette.primary
                          : isCurrent
                          ? palette.warning
                          : palette.textSubtle;
                        // The rail leading into this step is only "travelled"
                        // if the previous step completed and nothing failed.
                        const railDone = index <= step.reached - 1 && step.tone !== 'danger';

                        return (
                          <View key={label} style={styles.stepperItem}>
                            <View style={styles.stepperTrack}>
                              {index > 0 && (
                                <View
                                  style={[
                                    styles.stepperRail,
                                    railDone && styles.stepperRailDone,
                                  ]}
                                />
                              )}
                              {isDone && !isDanger ? (
                                <View style={[styles.stepperDot, styles.stepperDotDone]}>
                                  <Icon name="check" size={13} color={palette.textInverse} />
                                </View>
                              ) : isCurrent ? (
                                <View style={[styles.stepperDotRing, { borderColor: dotColor }]}>
                                  <View style={[styles.stepperDotCore, { backgroundColor: dotColor }]} />
                                </View>
                              ) : (
                                <View style={styles.stepperDotEmpty} />
                              )}
                              {index < STEPPER_STEPS.length - 1 && (
                                <View
                                  style={[
                                    styles.stepperRail,
                                    index < step.reached - 1 && step.tone !== 'danger' && styles.stepperRailDone,
                                  ]}
                                />
                              )}
                            </View>
                            <Text
                              style={[
                                styles.stepperLabel,
                                isDone && !isDanger && styles.stepperLabelDone,
                                isCurrent && styles.stepperLabelCurrent,
                                isDanger && styles.stepperLabelDanger,
                              ]}
                              numberOfLines={2}
                            >
                              {isDanger ? copy.badge : label}
                            </Text>
                            {index === 0 && (
                              <Text style={styles.stepperTime}>
                                {formatDate(selectedBooking.createdAt)}, {formatTime(selectedBooking.createdAt)}
                              </Text>
                            )}
                            {index === 2 && step.reached > 2 && step.tone !== 'danger' && selectedBooking.updatedAt ? (
                              <Text style={styles.stepperTime}>
                                {formatDate(selectedBooking.updatedAt)}, {formatTime(selectedBooking.updatedAt)}
                              </Text>
                            ) : null}
                            {index === 3 && selectedBooking.checkInTime ? (
                              <Text style={styles.stepperTime}>
                                {formatDate(selectedBooking.checkInTime)}, {formatTime(selectedBooking.checkInTime)}
                              </Text>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>

                    {/* Booking id row */}
                    <View style={styles.bookingIdRow}>
                      <View style={styles.bookingIdLeft}>
                        <View style={styles.bookingIdLabelRow}>
                          <Text style={styles.bookingIdLabel}>Booking ID</Text>
                          <TouchableOpacity
                            onPress={() => handleCopyBookingId(selectedBooking)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Icon
                              name={isCopied ? 'check' : 'copy'}
                              size={14}
                              color={isCopied ? palette.success : palette.textMuted}
                            />
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.bookingIdValue}>#{bookingRef || '—'}</Text>
                      </View>
                      <View style={styles.bookingIdRight}>
                        <Text style={styles.bookingIdLabel}>Booked on</Text>
                        <Text style={styles.bookingIdMeta}>{formatDateTime(selectedBooking.createdAt)}</Text>
                      </View>
                    </View>
                  </View>

                  {/* ── Parking card ── */}
                  <View style={styles.infoCard}>
                    <View style={styles.parkingRow}>
                      {image ? (
                        <Image source={{ uri: image }} style={styles.parkingThumb} resizeMode="cover" />
                      ) : (
                        <View style={[styles.parkingThumb, styles.parkingThumbEmpty]}>
                          <MaterialIcon name="parking" size={30} color={palette.primary} />
                        </View>
                      )}
                      <View style={styles.parkingBody}>
                        <View style={styles.parkingTitleRow}>
                          <Text style={styles.parkingTitle} numberOfLines={2}>
                            {getSpaceName(selectedBooking)}
                          </Text>
                          <View style={styles.parkingPriceBox}>
                            <Text style={styles.parkingPrice}>
                              {space?.hourlyRate != null ? `₹${space.hourlyRate}` : '—'}
                            </Text>
                            <Text style={styles.parkingPriceUnit}>/hr</Text>
                          </View>
                        </View>

                        {reviewCount > 0 && ratingValue != null ? (
                          <View style={styles.parkingMetaRow}>
                            <Icon name="star" size={13} color={palette.warning} />
                            <Text style={styles.parkingRating}>{ratingValue}</Text>
                            <Text style={styles.parkingMetaText}>
                              ({reviewCount} review{reviewCount === 1 ? '' : 's'})
                            </Text>
                          </View>
                        ) : (
                          <View style={styles.parkingMetaRow}>
                            <Text style={styles.parkingNewTag}>New</Text>
                          </View>
                        )}

                        <View style={styles.parkingMetaRow}>
                          <Icon name="map-pin" size={13} color={palette.textMuted} />
                          <Text style={styles.parkingMetaText} numberOfLines={2}>
                            {getSpaceAddress(selectedBooking)}
                          </Text>
                        </View>

                        <View style={styles.parkingMetaRow}>
                          <MaterialIcon name="parking" size={14} color={palette.textMuted} />
                          <Text style={styles.parkingMetaText}>
                            {totalSpots} parking spot{totalSpots === 1 ? '' : 's'}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.directionsButton}
                      onPress={() => handleDirections(selectedBooking)}
                      activeOpacity={0.8}
                    >
                      <Icon name="navigation" size={16} color={palette.primary} />
                      <Text style={styles.directionsText}>Get Directions</Text>
                    </TouchableOpacity>
                  </View>

                  {/* ── Your booking ── */}
                  <View style={styles.infoCard}>
                    <View style={styles.rowCard}>
                      <View style={styles.rowIcon}>
                        <Icon name="calendar" size={20} color={palette.primary} />
                      </View>
                      <View style={styles.rowBody}>
                        <Text style={styles.rowTitle}>Your Booking</Text>
                        <Text style={styles.rowSubtitle}>
                          {formatDate(selectedBooking.startTime)}
                          {formatDate(selectedBooking.startTime) === 'Today' || formatDate(selectedBooking.startTime) === 'Tomorrow'
                            ? `, ${new Date(selectedBooking.startTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                            : ''}
                        </Text>
                        <View style={styles.timeRow}>
                          <Text style={styles.timeStrong}>{formatTime(selectedBooking.startTime)}</Text>
                          <Icon name="arrow-right" size={14} color={palette.textSubtle} />
                          <Text style={styles.timeStrong}>{formatTime(selectedBooking.endTime)}</Text>
                          <Text style={styles.timeMuted}>
                            ({formatDuration(selectedBooking.durationHours)})
                          </Text>
                        </View>
                      </View>
                      {selectedBooking.status === 'active' && (
                        <TouchableOpacity
                          style={styles.outlineChip}
                          onPress={() => {
                            setShowDetailsModal(false);
                            setTimeout(() => setShowExtendModal(true), 300);
                          }}
                          activeOpacity={0.8}
                        >
                          <Icon name="edit-2" size={14} color={palette.primary} />
                          <Text style={styles.outlineChipText}>Modify</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {/* ── Vehicle details ── */}
                  {vehicle && (
                    <View style={styles.infoCard}>
                      <View style={styles.rowCard}>
                        <View style={styles.rowIcon}>
                          <VehicleIcon type={vehicle.vehicleType} size={22} color={palette.primary} />
                        </View>
                        <View style={styles.rowBody}>
                          <Text style={styles.rowTitle}>Vehicle Details</Text>
                          <View style={styles.vehicleMetaRow}>
                            <Text style={styles.rowSubtitle}>
                              {[vehicle.vehicleMake, vehicle.vehicleModel].filter(Boolean).join(' ') ||
                                vehicle.vehicleType ||
                                'Vehicle'}
                            </Text>
                            {vehicle.licensePlate ? (
                              <>
                                <Text style={styles.vehicleDot}>·</Text>
                                <Text style={styles.vehiclePlate}>{vehicle.licensePlate}</Text>
                              </>
                            ) : null}
                            {vehicle.isVerified ? (
                              <View style={styles.verifiedBadge}>
                                <Icon name="check-circle" size={12} color={palette.success} />
                                <Text style={styles.verifiedText}>Verified</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                        <Icon name="chevron-right" size={20} color={palette.textSubtle} />
                      </View>
                    </View>
                  )}

                  {/* ── Payment summary ── */}
                  {/* Every figure here is a field the API returned. Nothing is
                      recomputed locally — a screen that invented its own fee
                      once billed a total the server never charged. */}
                  <View style={styles.infoCard}>
                    <View style={styles.rowCard}>
                      <View style={styles.rowIcon}>
                        <Icon name="credit-card" size={20} color={palette.primary} />
                      </View>
                      <View style={styles.rowBody}>
                        <Text style={styles.rowTitle}>Payment Summary</Text>
                      </View>
                    </View>

                    <View style={styles.paymentBody}>
                      <View style={styles.paymentLine}>
                        <Text style={styles.paymentLineLabel}>
                          Base Price ({formatDuration(selectedBooking.durationHours)})
                        </Text>
                        <Text style={styles.paymentLineValue}>
                          ₹{(selectedBooking.basePrice ?? 0).toFixed(2)}
                        </Text>
                      </View>

                      {selectedBooking.discountAmount > 0 && (
                        <View style={styles.paymentLine}>
                          <Text style={styles.paymentLineLabel}>Discount</Text>
                          <Text style={[styles.paymentLineValue, { color: palette.success }]}>
                            −₹{selectedBooking.discountAmount.toFixed(2)}
                          </Text>
                        </View>
                      )}

                      {selectedBooking.serviceFee != null && (
                        <View style={styles.paymentLine}>
                          <Text style={styles.paymentLineLabel}>Service Fee</Text>
                          <Text style={styles.paymentLineValue}>
                            ₹{selectedBooking.serviceFee.toFixed(2)}
                          </Text>
                        </View>
                      )}

                      {selectedBooking.tax != null && (
                        <View style={styles.paymentLine}>
                          <Text style={styles.paymentLineLabel}>GST</Text>
                          <Text style={styles.paymentLineValue}>
                            ₹{selectedBooking.tax.toFixed(2)}
                          </Text>
                        </View>
                      )}

                      <View style={styles.paymentDivider} />

                      <View style={styles.paymentLine}>
                        <Text style={styles.paymentTotalLabel}>Total Amount</Text>
                        <Text style={styles.paymentTotalValue}>
                          ₹{(selectedBooking.totalAmount ?? 0).toFixed(2)}
                        </Text>
                      </View>
                    </View>

                    {selectedBooking.paymentStatus === 'paid' ? (
                      <View style={styles.paymentStrip}>
                        <View style={styles.paymentStripIcon}>
                          <Icon name="check" size={14} color={palette.textInverse} />
                        </View>
                        <View style={styles.paymentStripBody}>
                          <Text style={styles.paymentStripTitlePaid}>Payment Received</Text>
                          <Text style={styles.paymentStripText}>This booking is fully paid.</Text>
                        </View>
                      </View>
                    ) : selectedBooking.paymentStatus === 'pending' ? (
                      <View style={[styles.paymentStrip, styles.paymentStripPending]}>
                        <View style={[styles.paymentStripIcon, { backgroundColor: palette.warning }]}>
                          <Icon name="alert-circle" size={14} color={palette.textInverse} />
                        </View>
                        <View style={styles.paymentStripBody}>
                          <Text style={styles.paymentStripTitle}>Payment Pending</Text>
                          <Text style={styles.paymentStripText}>You will pay at the parking location.</Text>
                        </View>
                        <View style={styles.paymentMethodTag}>
                          <MaterialIcon name="cash" size={16} color={palette.warning} />
                          <Text style={styles.paymentMethodText}>
                            {selectedBooking.paymentMethod === 'online' ? 'Online' : 'Cash Payment'}
                          </Text>
                        </View>
                      </View>
                    ) : selectedBooking.paymentStatus ? (
                      <View style={[styles.paymentStrip, styles.paymentStripNeutral]}>
                        <View style={[styles.paymentStripIcon, { backgroundColor: palette.textMuted }]}>
                          <Icon name="info" size={14} color={palette.textInverse} />
                        </View>
                        <View style={styles.paymentStripBody}>
                          <Text style={styles.paymentStripTitleNeutral}>
                            Payment {selectedBooking.paymentStatus.charAt(0).toUpperCase() +
                              selectedBooking.paymentStatus.slice(1).replace('_', ' ')}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                  </View>

                  {/* ── Why it ended, when it did ── */}
                  {selectedBooking.rejectionReason || selectedBooking.cancellationReason ? (
                    <View style={styles.infoCard}>
                      <View style={styles.rowCard}>
                        <View style={[styles.rowIcon, styles.rowIconDanger]}>
                          <Icon name="info" size={20} color={palette.danger} />
                        </View>
                        <View style={styles.rowBody}>
                          <Text style={styles.rowTitle}>
                            {selectedBooking.rejectionReason ? 'Reason for Decline' : 'Cancellation Reason'}
                          </Text>
                          <Text style={styles.rowSubtitle}>
                            {selectedBooking.rejectionReason || selectedBooking.cancellationReason}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ) : null}

                  {/* ── Cancellation policy ── */}
                  <View style={styles.infoCard}>
                    <View style={styles.rowCard}>
                      <View style={styles.rowIcon}>
                        <Icon name="shield" size={20} color={palette.primary} />
                      </View>
                      <View style={styles.rowBody}>
                        <Text style={styles.rowTitle}>Cancellation Policy</Text>
                        <Text style={styles.rowSubtitle}>
                          Free cancellation up to 2 hours before your booking starts.
                        </Text>
                      </View>
                      <Icon name="chevron-right" size={20} color={palette.textSubtle} />
                    </View>
                  </View>
                </ScrollView>
              );
            })()}

            {/* ── Sticky footer ── */}
            {selectedBooking && (
              <View style={styles.stickyFooter}>
                {['pending', 'confirmed'].includes(selectedBooking.status) && (
                  <TouchableOpacity
                    style={styles.footerCancelButton}
                    onPress={() => {
                      setShowDetailsModal(false);
                      setTimeout(() => setShowCancelModal(true), 300);
                    }}
                    activeOpacity={0.8}
                  >
                    <Icon name="x-circle" size={18} color={palette.danger} />
                    <Text style={styles.footerCancelText}>Cancel Booking</Text>
                  </TouchableOpacity>
                )}
                {selectedBooking.status === 'active' && (
                  <TouchableOpacity
                    style={[styles.footerCancelButton, styles.footerSecondaryButton]}
                    onPress={() => {
                      setShowDetailsModal(false);
                      setTimeout(() => setShowExtendModal(true), 300);
                    }}
                    activeOpacity={0.8}
                  >
                    <Icon name="plus-circle" size={18} color={palette.primary} />
                    <Text style={[styles.footerCancelText, { color: palette.primary }]}>Extend Time</Text>
                  </TouchableOpacity>
                )}
                {['completed', 'cancelled', 'rejected', 'no_show'].includes(selectedBooking.status) && (
                  <TouchableOpacity
                    style={[styles.footerCancelButton, styles.footerSecondaryButton]}
                    onPress={() => {
                      setShowDetailsModal(false);
                      handleBookAgain(selectedBooking);
                    }}
                    activeOpacity={0.8}
                  >
                    <Icon name="repeat" size={18} color={palette.primary} />
                    <Text style={[styles.footerCancelText, { color: palette.primary }]}>Book Again</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.footerPrimaryButton}
                  onPress={() => {
                    setShowDetailsModal(false);
                    navigation.navigate('Home');
                  }}
                  activeOpacity={0.85}
                >
                  <Icon name="home" size={18} color={palette.textInverse} />
                  <Text style={styles.footerPrimaryText}>Back to Home</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      
      ) : null}

      {/* ── Cancel Confirmation Modal ── */}
      {showCancelModal ? (

        <View style={styles.confirmModalOverlay}>
          <View style={styles.confirmModalContent}>
            <View style={styles.confirmIconContainer}>
              <Icon name="alert-triangle" size={32} color="#EF4444" />
            </View>
            <Text style={styles.confirmTitle}>Cancel Booking?</Text>
            <Text style={styles.confirmMessage}>
              {selectedBooking?.bookingMode === 'request'
                ? 'Cancelling a pending request will notify the owner.'
                : 'Are you sure? This action cannot be undone.'}
            </Text>
            <TextInput
              style={styles.cancelReasonInput}
              placeholder="Reason (optional)"
              placeholderTextColor="#6B7280"
              value={cancelReason}
              onChangeText={setCancelReason}
              multiline
            />
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmCancelButton}
                onPress={() => { setShowCancelModal(false); setCancelReason(''); }}
                disabled={isCancelling}
              >
                <Text style={styles.confirmCancelText}>Keep Booking</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmDeleteButton, isCancelling && { opacity: 0.7 }]}
                onPress={handleCancelBooking}
                disabled={isCancelling}
              >
                {isCancelling
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Text style={styles.confirmDeleteText}>Yes, Cancel</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      
      ) : null}

      {/* ── Extend Booking Modal ── */}
      {showExtendModal ? (

        <View style={styles.modalOverlay}>
          <View style={styles.extendModalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.extendModalTitle}>Extend Parking Time</Text>
            <Text style={styles.extendModalSubtitle}>
              How many additional hours do you need?
            </Text>
            <View style={styles.hourSelector}>
              <TouchableOpacity
                style={styles.hourButton}
                onPress={() => setExtendHours(Math.max(1, extendHours - 1))}
              >
                <Icon name="minus" size={24} color="#1A73E8" />
              </TouchableOpacity>
              <View style={styles.hourDisplay}>
                <Text style={styles.hourValue}>{extendHours}</Text>
                <Text style={styles.hourUnit}>hour{extendHours > 1 ? 's' : ''}</Text>
              </View>
              <TouchableOpacity
                style={styles.hourButton}
                onPress={() => setExtendHours(Math.min(12, extendHours + 1))}
              >
                <Icon name="plus" size={24} color="#1A73E8" />
              </TouchableOpacity>
            </View>
            {selectedBooking && (
              <View style={styles.extendPriceCard}>
                <View style={styles.extendPriceRow}>
                  <Text style={styles.extendPriceLabel}>Additional Cost (estimate)</Text>
                  <Text style={styles.extendPriceValue}>
                    ₹{((selectedBooking.totalAmount / Math.max(selectedBooking.durationHours, 1)) * extendHours).toFixed(2)}
                  </Text>
                </View>
              </View>
            )}
            <View style={styles.extendActions}>
              <TouchableOpacity
                style={styles.extendCancelButton}
                onPress={() => setShowExtendModal(false)}
                disabled={isExtending}
              >
                <Text style={styles.extendCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.extendConfirmButton, isExtending && { opacity: 0.7 }]}
                onPress={handleExtendBooking}
                disabled={isExtending}
              >
                {isExtending
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Text style={styles.extendConfirmText}>Confirm Extension</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      
      ) : null}

      {/* ── Review Modal ── */}
      {showReviewModal ? (

        <View style={styles.modalOverlay}>
          <View style={styles.reviewModalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.reviewModalTitle}>Rate Your Experience</Text>
            {selectedBooking && (
              <Text style={styles.reviewParkingName}>{getSpaceName(selectedBooking)}</Text>
            )}
            <View style={styles.reviewStarsContainer}>
              {renderStars(reviewRating, true, 36)}
            </View>
            <TextInput
              style={styles.reviewInput}
              placeholder="Share your experience (optional)"
              placeholderTextColor="#6B7280"
              multiline
              numberOfLines={4}
              value={reviewText}
              onChangeText={setReviewText}
            />
            <View style={styles.reviewActions}>
              <TouchableOpacity
                style={styles.reviewCancelButton}
                onPress={() => { setShowReviewModal(false); setReviewRating(0); setReviewText(''); }}
              >
                <Text style={styles.reviewCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reviewSubmitButton, reviewRating === 0 && styles.reviewSubmitDisabled]}
                onPress={handleSubmitReview}
                disabled={reviewRating === 0}
              >
                <Text style={styles.reviewSubmitText}>Submit Review</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      
      ) : null}

      {/* ── Filter Modal ── */}
      {showFilterModal ? (

        <View style={styles.modalOverlay}>
          <View style={styles.filterModalContent}>
            <View style={styles.modalHandle} />
            <View style={styles.filterHeader}>
              <Text style={styles.filterTitle}>Filter Bookings</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <Icon name="x" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <Text style={styles.filterSectionTitle}>Status</Text>
            <View style={styles.filterOptions}>
              {['all', 'active', 'confirmed', 'pending', 'completed', 'cancelled', 'rejected', 'no_show'].map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[styles.filterOption, filterStatus === status && styles.filterOptionActive]}
                  onPress={() => setFilterStatus(status)}
                >
                  <Text style={[styles.filterOptionText, filterStatus === status && styles.filterOptionTextActive]}>
                    {status === 'all' ? 'All' : getStatusLabel(status)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.filterApplyButton}
              onPress={() => setShowFilterModal(false)}
            >
              <Text style={styles.filterApplyText}>Apply Filter</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.filterResetButton}
              onPress={() => { setFilterStatus('all'); setShowFilterModal(false); }}
            >
              <Text style={styles.filterResetText}>Reset</Text>
            </TouchableOpacity>
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
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  headerTitle: {
    fontFamily: fontStacks.regular,
    fontSize: 28,
    fontWeight: '300',
    letterSpacing: -0.5,
    color: palette.text,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 8,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: palette.text,
    padding: 0,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: palette.surface,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.surface,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 6,
    position: 'relative',
  },
  tabActive: {},
  tabText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#FF2E40',
    fontWeight: '600',
  },
  tabBadge: {
    backgroundColor: palette.surface,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tabBadgeActive: {
    backgroundColor: 'rgba(255,46,64,0.12)',
  },
  tabBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#A1A1AA',
  },
  tabBadgeTextActive: {
    color: '#FF2E40',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 20,
    right: 20,
    height: 3,
    backgroundColor: '#FF2E40',
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#A1A1AA',
  },
  listContent: {
    padding: 16,
    paddingBottom: 120,
  },
  // Flat content block on the mint page bg. The card-inside-card feel
  // (white box behind every booking) is gone — booking groups are
  // separated by spacing only.
  bookingCard: {
    backgroundColor: 'transparent',
    paddingHorizontal: 4,
    paddingVertical: 12,
    marginBottom: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  parkingIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(13, 115, 119, 0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitleSection: {
    flex: 1,
    marginLeft: 12,
  },
  parkingName: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.text,
  },
  bookingId: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardDetails: {
    backgroundColor: 'transparent',
    paddingVertical: 4,
    marginBottom: 14,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  detailText: {
    fontSize: 13,
    color: '#A1A1AA',
    flex: 1,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  priceLabel: {
    fontSize: 13,
    color: '#A1A1AA',
  },
  priceValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FF2E40',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(13, 115, 119, 0.10)',
    gap: 6,
  },
  actionButtonText: {
    fontSize: 13,
    color: '#FF2E40',
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#FF2E40',
  },
  primaryButtonText: {
    color: '#0B0F0C',
  },
  cancelButton: {
    backgroundColor: 'rgba(255,107,107,0.12)',
  },
  cancelButtonText: {
    color: '#EF4444',
  },
  reviewButton: {
    backgroundColor: 'rgba(242,181,60,0.12)',
  },
  reviewButtonText: {
    color: '#D97706',
  },
  ratedContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: 'transparent',
    borderRadius: 999,
  },
  starsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(13, 115, 119, 0.10)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#A1A1AA',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF2E40',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyButtonText: {
    color: '#0B0F0C',
    fontSize: 15,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 80,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FF2E40',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF2E40',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },

  // Modal Styles
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: palette.surface,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },

  // ── Details Modal ──────────────────────────────────────────────────────
  // Full-height sheet on the mint page bg. Cards are opaque white so the
  // stepper and price rows stay legible over the tinted background.
  detailsModalContent: {
    flex: 1,
    backgroundColor: palette.bg,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingTop: 12,
    marginTop: 40,
    overflow: 'hidden',
  },
  detailsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  detailsBackButton: {
    width: 40,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  detailsModalTitle: {
    fontFamily: fontStacks.medium,
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.3,
    color: palette.text,
  },
  detailsScrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },

  // Status header card
  statusCard: {
    backgroundColor: palette.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  statusCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  statusIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCardCopy: {
    flex: 1,
    marginLeft: spacing.md,
  },
  statusCardTitle: {
    fontFamily: fontStacks.medium,
    fontSize: 19,
    fontWeight: '600',
    letterSpacing: -0.3,
    color: palette.text,
  },
  statusCardMessage: {
    fontFamily: fontStacks.regular,
    fontSize: 13,
    lineHeight: 19,
    color: palette.textMuted,
    marginTop: 4,
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    marginLeft: spacing.sm,
  },
  statusPillText: {
    fontFamily: fontStacks.medium,
    fontSize: 12,
    fontWeight: '600',
  },

  // Progress stepper
  stepper: {
    flexDirection: 'row',
    marginTop: spacing.xl,
  },
  stepperItem: {
    flex: 1,
    alignItems: 'center',
  },
  stepperTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    height: 26,
  },
  stepperRail: {
    flex: 1,
    height: 2,
    backgroundColor: 'rgba(155,166,172,0.35)',
  },
  stepperRailDone: {
    backgroundColor: palette.primary,
  },
  stepperDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperDotDone: {
    backgroundColor: palette.primary,
  },
  stepperDotRing: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2.5,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperDotCore: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  stepperDotEmpty: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(155,166,172,0.5)',
    backgroundColor: 'transparent',
  },
  stepperLabel: {
    fontFamily: fontStacks.regular,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    color: palette.textSubtle,
    marginTop: 8,
    paddingHorizontal: 2,
  },
  stepperLabelDone: {
    fontFamily: fontStacks.medium,
    fontWeight: '600',
    color: palette.primary,
  },
  stepperLabelCurrent: {
    fontFamily: fontStacks.medium,
    fontWeight: '600',
    color: palette.text,
  },
  stepperLabelDanger: {
    fontFamily: fontStacks.medium,
    fontWeight: '600',
    color: palette.danger,
  },
  stepperTime: {
    fontFamily: fontStacks.regular,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
    color: palette.textMuted,
    marginTop: 2,
  },

  // Booking id row
  bookingIdRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: palette.surfaceDim,
    borderRadius: radii.sm,
    padding: spacing.md,
    marginTop: spacing.xl,
  },
  bookingIdLeft: {
    flex: 1,
  },
  bookingIdRight: {
    alignItems: 'flex-end',
    marginLeft: spacing.sm,
  },
  bookingIdLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bookingIdLabel: {
    fontFamily: fontStacks.regular,
    fontSize: 12,
    color: palette.textMuted,
  },
  bookingIdValue: {
    fontFamily: fontStacks.medium,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: palette.text,
    marginTop: 2,
  },
  bookingIdMeta: {
    fontFamily: fontStacks.medium,
    fontSize: 13,
    fontWeight: '600',
    color: palette.text,
    marginTop: 2,
  },

  // Generic white card + icon/body/chevron row used by most sections
  infoCard: {
    backgroundColor: palette.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: palette.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconDanger: {
    backgroundColor: 'rgba(229,72,77,0.10)',
  },
  rowBody: {
    flex: 1,
    marginLeft: spacing.md,
  },
  rowTitle: {
    fontFamily: fontStacks.medium,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: palette.text,
  },
  rowSubtitle: {
    fontFamily: fontStacks.regular,
    fontSize: 13,
    lineHeight: 19,
    color: palette.textMuted,
    marginTop: 3,
  },

  // Parking card
  parkingRow: {
    flexDirection: 'row',
  },
  parkingThumb: {
    width: 96,
    height: 96,
    borderRadius: radii.sm,
    backgroundColor: palette.surfaceDim,
  },
  parkingThumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  parkingBody: {
    flex: 1,
    marginLeft: spacing.md,
  },
  parkingTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  parkingTitle: {
    flex: 1,
    fontFamily: fontStacks.medium,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
    color: palette.text,
  },
  parkingPriceBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginLeft: spacing.sm,
  },
  parkingPrice: {
    fontFamily: fontStacks.medium,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: palette.primary,
  },
  parkingPriceUnit: {
    fontFamily: fontStacks.regular,
    fontSize: 13,
    color: palette.primary,
  },
  parkingMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  parkingRating: {
    fontFamily: fontStacks.medium,
    fontSize: 13,
    fontWeight: '600',
    color: palette.text,
  },
  parkingMetaText: {
    flex: 1,
    fontFamily: fontStacks.regular,
    fontSize: 13,
    lineHeight: 18,
    color: palette.textMuted,
  },
  // Shown in place of a score when the listing has no reviews yet.
  parkingNewTag: {
    fontFamily: fontStacks.medium,
    fontSize: 12,
    fontWeight: '600',
    color: palette.primary,
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.xs,
    overflow: 'hidden',
  },
  directionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(13,115,119,0.25)',
    backgroundColor: palette.primarySoft,
    gap: 8,
  },
  directionsText: {
    fontFamily: fontStacks.medium,
    fontSize: 14,
    fontWeight: '600',
    color: palette.primary,
  },

  // Your booking
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  timeStrong: {
    fontFamily: fontStacks.medium,
    fontSize: 15,
    fontWeight: '600',
    color: palette.text,
  },
  timeMuted: {
    fontFamily: fontStacks.regular,
    fontSize: 13,
    color: palette.textMuted,
  },
  outlineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(13,115,119,0.25)',
    backgroundColor: palette.primarySoft,
    marginLeft: spacing.sm,
    gap: 6,
  },
  outlineChipText: {
    fontFamily: fontStacks.medium,
    fontSize: 14,
    fontWeight: '600',
    color: palette.primary,
  },

  // Vehicle
  vehicleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 3,
    gap: 6,
  },
  vehicleDot: {
    fontFamily: fontStacks.regular,
    fontSize: 13,
    color: palette.textSubtle,
  },
  vehiclePlate: {
    fontFamily: fontStacks.medium,
    fontSize: 13,
    fontWeight: '600',
    color: palette.text,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(46,174,107,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    gap: 4,
  },
  verifiedText: {
    fontFamily: fontStacks.medium,
    fontSize: 11,
    fontWeight: '600',
    color: palette.success,
  },

  // Payment summary
  paymentBody: {
    marginTop: spacing.lg,
  },
  paymentLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  paymentLineLabel: {
    fontFamily: fontStacks.regular,
    fontSize: 14,
    color: palette.textMuted,
  },
  paymentLineValue: {
    fontFamily: fontStacks.medium,
    fontSize: 14,
    fontWeight: '500',
    color: palette.text,
  },
  paymentDivider: {
    height: 1,
    backgroundColor: 'rgba(155,166,172,0.25)',
    marginTop: 4,
    marginBottom: spacing.md,
  },
  paymentTotalLabel: {
    fontFamily: fontStacks.medium,
    fontSize: 16,
    fontWeight: '600',
    color: palette.text,
  },
  paymentTotalValue: {
    fontFamily: fontStacks.medium,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: palette.primary,
  },
  paymentStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(46,174,107,0.10)',
    borderRadius: radii.sm,
    padding: spacing.md,
    marginTop: spacing.md,
    gap: 10,
  },
  paymentStripPending: {
    backgroundColor: 'rgba(242,181,60,0.16)',
  },
  paymentStripNeutral: {
    backgroundColor: palette.surfaceDim,
  },
  paymentStripIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: palette.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentStripBody: {
    flex: 1,
  },
  paymentStripTitle: {
    fontFamily: fontStacks.medium,
    fontSize: 14,
    fontWeight: '600',
    color: '#B4801A',
  },
  paymentStripTitlePaid: {
    fontFamily: fontStacks.medium,
    fontSize: 14,
    fontWeight: '600',
    color: palette.success,
  },
  paymentStripTitleNeutral: {
    fontFamily: fontStacks.medium,
    fontSize: 14,
    fontWeight: '600',
    color: palette.text,
  },
  paymentStripText: {
    fontFamily: fontStacks.regular,
    fontSize: 12,
    lineHeight: 17,
    color: palette.textMuted,
    marginTop: 1,
  },
  paymentMethodTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  paymentMethodText: {
    fontFamily: fontStacks.medium,
    fontSize: 12,
    fontWeight: '600',
    color: '#B4801A',
  },

  // Sticky footer
  stickyFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(155,166,172,0.20)',
    gap: spacing.md,
  },
  footerCancelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: palette.danger,
    backgroundColor: 'transparent',
    gap: 8,
  },
  // Same outlined shape, teal instead of red — used when the secondary
  // action is Extend / Book Again rather than Cancel.
  footerSecondaryButton: {
    borderColor: 'rgba(13,115,119,0.35)',
    backgroundColor: palette.primarySoft,
  },
  footerCancelText: {
    fontFamily: fontStacks.medium,
    fontSize: 15,
    fontWeight: '600',
    color: palette.danger,
  },
  footerPrimaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: radii.sm,
    backgroundColor: palette.primary,
    gap: 8,
  },
  footerPrimaryText: {
    fontFamily: fontStacks.medium,
    fontSize: 15,
    fontWeight: '600',
    color: palette.textInverse,
  },

  // Confirm Modal
  confirmModalOverlay: {
    // Absolutely positioned rather than flex:1 — no longer inside a
    // <Modal>, which does not present on this build.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  confirmModalContent: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    alignItems: 'center',
  },
  confirmIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,107,107,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.text,
    marginBottom: 8,
  },
  confirmMessage: {
    fontSize: 14,
    color: '#A1A1AA',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  cancelReasonInput: {
    width: '100%',
    backgroundColor: palette.surface,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: palette.text,
    borderWidth: 1,
    borderColor: palette.surface,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  confirmCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: palette.surface,
    alignItems: 'center',
  },
  confirmCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#A1A1AA',
  },
  confirmDeleteButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDeleteText: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.text,
  },

  // Extend Modal
  extendModalContent: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  extendModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.text,
    textAlign: 'center',
  },
  extendModalSubtitle: {
    fontSize: 14,
    color: '#A1A1AA',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  hourSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 24,
  },
  hourButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,46,64,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hourDisplay: {
    alignItems: 'center',
  },
  hourValue: {
    fontSize: 48,
    fontWeight: '700',
    color: '#FF2E40',
  },
  hourUnit: {
    fontSize: 14,
    color: '#A1A1AA',
  },
  extendPriceCard: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  extendPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  extendPriceLabel: {
    fontSize: 15,
    color: '#A1A1AA',
  },
  extendPriceValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FF2E40',
  },
  extendActions: {
    flexDirection: 'row',
    gap: 12,
  },
  extendCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: palette.surface,
    alignItems: 'center',
  },
  extendCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#A1A1AA',
  },
  extendConfirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#FF2E40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  extendConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.text,
  },

  // Review Modal
  reviewModalContent: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  reviewModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.text,
    textAlign: 'center',
  },
  reviewParkingName: {
    fontSize: 14,
    color: '#A1A1AA',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  reviewStarsContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  reviewInput: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: palette.text,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  reviewActions: {
    flexDirection: 'row',
    gap: 12,
  },
  reviewCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: palette.surface,
    alignItems: 'center',
  },
  reviewCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#A1A1AA',
  },
  reviewSubmitButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#FF2E40',
    alignItems: 'center',
  },
  reviewSubmitDisabled: {
    backgroundColor: '#6B7280',
  },
  reviewSubmitText: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.text,
  },

  // Filter Modal
  filterModalContent: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  filterTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.text,
  },
  filterSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#A1A1AA',
    marginBottom: 12,
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  filterOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: palette.surface,
  },
  filterOptionActive: {
    backgroundColor: '#FF2E40',
  },
  filterOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#A1A1AA',
  },
  filterOptionTextActive: {
    color: palette.text,
  },
  filterApplyButton: {
    backgroundColor: '#FF2E40',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  filterApplyText: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.text,
  },
  filterResetButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  filterResetText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#A1A1AA',
  },
});

export default BookingManagementPage;
