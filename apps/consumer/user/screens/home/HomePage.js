import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Platform,
  PermissionsAndroid,
  FlatList,
  Linking,
  ActivityIndicator,
  Image,
  Dimensions,
  Animated,
  Easing,
  LayoutAnimation,
  UIManager,
} from 'react-native';

// Enable LayoutAnimation on Android. Required so the recommendations
// section can grow / shrink smoothly when "View All" is toggled.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SCREEN_WIDTH = Dimensions.get('window').width;
import { AppAlert } from '../../components/AppAlert';
import Geolocation from '@react-native-community/geolocation';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import * as parkingService from '../../services/parkingService';
import { useAuth } from '../../context/AuthContext';
import { palette, radii, fontStacks } from '../../theme';
import { VehicleIcon, ParkingPinIcon } from '../../components/glass/VehicleIcons';
import { resolveImageUri } from '../../utils/imageUri';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Time-of-day greeting for the home headline. No trailing comma — the
// caller appends the user's name only when one is known, so a comma baked
// in here would dangle for a user with no name on file.
const greetingForHour = (hour) => {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

// Rough travel-time estimate from distance. Under ~1 km people walk
// (~5 km/h); beyond that they drive (~20 km/h in city traffic). The
// backend has no routing data, so this stays an obvious approximation
// rather than a precise ETA.
const travelEstimate = (distanceKm) => {
  if (distanceKm == null || distanceKm >= 999) return null;
  if (distanceKm < 1) {
    return `${Math.max(1, Math.round((distanceKm / 5) * 60))} min walk`;
  }
  return `${Math.max(1, Math.round((distanceKm / 20) * 60))} min drive`;
};

// Amenity id → short chip label for the nearby cards. Only ids we
// actually derive from backend fields are listed; anything else falls
// back to a de-underscored version of the id.
const amenityChipLabels = {
  ev_charging: 'EV Friendly',
  covered: 'Covered',
  security: 'Guarded',
  cctv: 'CCTV',
  accessible: 'Accessible',
  valet: 'Valet',
};

const amenityChipIcons = {
  ev_charging: 'flash',
  covered: 'weather-sunny',
  security: 'shield-check-outline',
  cctv: 'cctv',
  accessible: 'wheelchair-accessibility',
  valet: 'account-tie-outline',
};

// Haversine distance in km between two lat/lng points
const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Map API allowedVehicleTypes → UI category id
const apiTypesToCategory = (types = []) => {
  if (types.some(t => ['motorcycle', 'bicycle'].includes(t))) return 'bike';
  if (types.some(t => ['van'].includes(t))) return 'bus';
  if (types.some(t => ['truck', 'rv', 'trailer'].includes(t))) return 'truck';
  return 'car';
};

// UI category id → API vehicle_type param (first matching type)
const categoryToApiType = {
  car: 'car',
  bike: 'motorcycle',
  bus: 'van',
  truck: 'truck',
};

// Group flat backend spaces by property → one UI item per parking lot
const groupSpacesByProperty = (spaces, userLat, userLng) => {
  const groups = {};

  for (const space of spaces) {
    const prop = space.propertyId;
    if (!prop || typeof prop !== 'object') continue;
    const propId = prop.id || prop._id;
    if (!propId) continue;

    if (!groups[propId]) {
      const lat = prop.locationLat ?? 0;
      const lng = prop.locationLng ?? 0;
      const distKm = (userLat && userLng && lat && lng)
        ? haversineKm(userLat, userLng, lat, lng) : null;
      const distText = distKm == null ? '—'
        : distKm < 1 ? `${Math.round(distKm * 1000)} m`
        : `${distKm.toFixed(1)} km`;

      groups[propId] = {
        id: propId,
        name: prop.propertyName || 'Parking Lot',
        address: [prop.address, prop.city].filter(Boolean).join(', '),
        city: prop.city || '',
        latitude: lat,
        longitude: lng,
        distance: distText,
        distanceKm: distKm ?? 999,
        propertyImages: (Array.isArray(prop.propertyImages) ? prop.propertyImages : (Array.isArray(prop.property_images) ? prop.property_images : []))
          .filter(u => typeof u === 'string' && u.trim().length > 0)
          .map(resolveImageUri),
        spaces: [],
      };
    }
    groups[propId].spaces.push(space);
  }

  return Object.values(groups).map(group => {
    const { spaces: groupSpaces } = group;
    const prices = groupSpaces.map(s => s.pricePerHour).filter(Boolean);
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const maxPrice = prices.length ? Math.max(...prices) : 0;

    const totalAvailable = groupSpaces.reduce((sum, s) =>
      sum + Math.max(0, (s.totalSpots || 1) - (s.activeBookingCount || 0)), 0);
    const totalSpots = groupSpaces.reduce((sum, s) => sum + (s.totalSpots || 1), 0);

    const amenities = [...new Set(groupSpaces.flatMap(s => {
      const a = [];
      if (s.hasEvCharging) a.push('ev_charging');
      if (['covered', 'garage', 'carport'].includes(s.spaceType)) a.push('covered');
      return a;
    }))];

    // Average across *rated* spaces only — folding unrated spaces in as 0
    // would drag a genuine 4.6 down to a number nobody ever gave.
    const ratedSpaces = groupSpaces.filter(sp => (sp.averageRating || 0) > 0);
    const avgRating = ratedSpaces.length
      ? ratedSpaces.reduce((s, sp) => s + sp.averageRating, 0) / ratedSpaces.length
      : 0;
    const vehicleTypes = [...new Set(groupSpaces.flatMap(s => s.allowedVehicleTypes || []))];

    const hasDailyInAny = groupSpaces.some(s => s.pricePerDay);
    const hasMonthlyInAny = groupSpaces.some(s => s.pricePerMonth);
    const duration = ['hourly'];
    if (hasDailyInAny) duration.push('daily');
    if (hasMonthlyInAny) duration.push('weekly');

    // Aggregate every space image so the home modal and details page have a
    // gallery to render even when the property itself has no top-level images.
    const spaceImages = groupSpaces.flatMap(s => {
      const list = Array.isArray(s.spaceImages) ? s.spaceImages : (Array.isArray(s.space_images) ? s.space_images : []);
      return list.filter(u => typeof u === 'string' && u.trim().length > 0).map(resolveImageUri);
    });

    return {
      ...group,
      price: minPrice === maxPrice ? `₹${minPrice}` : `₹${minPrice} – ₹${maxPrice}`,
      pricePerHour: minPrice,
      pricePerDay: groupSpaces.find(s => s.pricePerDay)?.pricePerDay,
      pricePerMonth: groupSpaces.find(s => s.pricePerMonth)?.pricePerMonth,
      minPrice,
      maxPrice,
      available: totalAvailable,
      spots: totalSpots,
      amenities,
      rating: Math.round(avgRating * 10) / 10,
      travelTime: travelEstimate(group.distanceKm),
      type: apiTypesToCategory(vehicleTypes),
      allowedVehicleTypes: vehicleTypes,
      duration,
      // Combine property and space images for previews (modal + details page).
      spaceImages,
      images: [...(group.propertyImages || []), ...spaceImages],
      // Pass all spaces so ParkingDetailsPage can show the space selector
      spaces: groupSpaces,
    };
  }).sort((a, b) => a.distanceKm - b.distanceKm);
};

// ─── Static config ─────────────────────────────────────────────────────────

// Vehicle category filters
const categories = [
  { id: 'all', icon: 'view-grid', label: 'All', color: palette.primary },
  { id: 'car', icon: 'car', label: 'Car', color: '#EC4899' },
  { id: 'bike', icon: 'motorbike', label: 'Bike', color: '#10B981' },
  { id: 'bus', icon: 'bus', label: 'Bus', color: '#F59E0B' },
  { id: 'truck', icon: 'truck', label: 'Truck', color: '#EF4444' },
];

// Filter options
const priceRanges = [
  { id: 'all', label: 'All Prices', min: 0, max: 100 },
  { id: 'budget', label: '₹0 - ₹3', min: 0, max: 3 },
  { id: 'mid', label: '₹4 - ₹8', min: 4, max: 8 },
  { id: 'premium', label: '₹9+', min: 9, max: 100 },
];

const durationOptions = [
  { id: 'all', label: 'All', icon: 'clock' },
  { id: 'hourly', label: 'Hourly', icon: 'clock' },
  { id: 'daily', label: 'Daily', icon: 'calendar' },
  { id: 'weekly', label: 'Weekly', icon: 'calendar' },
];

const amenityOptions = [
  { id: 'ev_charging', label: 'EV Charging', icon: 'battery-charging' },
  { id: 'security', label: '24/7 Security', icon: 'shield' },
  { id: 'covered', label: 'Covered', icon: 'home' },
  { id: 'accessible', label: 'Accessible', icon: 'users' },
  { id: 'cctv', label: 'CCTV', icon: 'video' },
  { id: 'valet', label: 'Valet', icon: 'user-check' },
];


// The three-step explainer under the headline. Purely descriptive — these
// are not filters and nothing routes off them, so they stay a static array
// rather than becoming pressable like `categories` above.
const journeySteps = [
  { id: 'find', icon: 'map-search-outline', label: 'FIND' },
  { id: 'book', icon: 'calendar-check-outline', label: 'BOOK' },
  { id: 'park', icon: 'car-outline', label: 'PARK' },
];

// Default to Delhi, India for demo
const initialRegion = {
  latitude: 28.6139,
  longitude: 77.2090,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

// Custom map style for light, clean appearance
const mapStyle = [
  {
    elementType: 'geometry',
    stylers: [{ color: '#f5f5f5' }],
  },
  {
    elementType: 'labels.text.fill',
    stylers: [{ color: '#616161' }],
  },
  {
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#f5f5f5' }],
  },
  {
    featureType: 'administrative.land_parcel',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#bdbdbd' }],
  },
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#eeeeee' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#757575' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#e5e5e5' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9e9e9e' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#ffffff' }],
  },
  {
    featureType: 'road.arterial',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#757575' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#dadada' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#616161' }],
  },
  {
    featureType: 'road.local',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9e9e9e' }],
  },
  {
    featureType: 'transit.line',
    elementType: 'geometry',
    stylers: [{ color: '#e5e5e5' }],
  },
  {
    featureType: 'transit.station',
    elementType: 'geometry',
    stylers: [{ color: '#eeeeee' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#c9c9c9' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9e9e9e' }],
  },
];

const HomePage = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  // Floating glass tab bar height (64) + outer padding (max(insets.bottom, 12)) + a little air.
  const tabBarHeight = 64 + Math.max(insets.bottom, 12) + 12;

  // Greeting is computed once per mount — re-deriving it on every render
  // would churn the header for a string that changes a few times a day.
  const greeting = useMemo(() => greetingForHour(new Date().getHours()), []);
  const avatarInitial = (auth?.user?.legalName || auth?.user?.email || '?')
    .trim()
    .charAt(0)
    .toUpperCase() || '?';

  // First name only — the greeting is a one-liner and a full legal name
  // would wrap or truncate next to the eco card. Falls back to an empty
  // string (not a placeholder name) so the greeting reads "Good morning 👋"
  // rather than inventing a user who isn't signed in yet.
  const firstName = useMemo(() => {
    const name = (auth?.user?.legalName || '').trim();
    return name ? name.split(/\s+/)[0] : '';
  }, [auth?.user?.legalName]);

  // Favourites are UI-only for now — the backend has no favourites
  // endpoint, so the heart state lives with the screen (same approach as
  // ParkingDetailsPage) rather than pretending to persist.
  const [favoriteSpotIds, setFavoriteSpotIds] = useState([]);
  const toggleFavorite = useCallback((spotId) => {
    setFavoriteSpotIds(prev =>
      prev.includes(spotId) ? prev.filter(id => id !== spotId) : [...prev, spotId]
    );
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedParkingData, setSelectedParkingData] = useState(null);
  const [viewMode, setViewMode] = useState('map'); // 'map' or 'list'
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Filter states
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  // The Nearby Parking section toggles between a compact (one row of
  // horizontal cards) and an expanded (full-screen vertical list) state
  // *in place* — there is no separate modal sheet that opens.
  const [recommendationsExpanded, setRecommendationsExpanded] = useState(false);

  // Drives the section's height between compact (intrinsic) and
  // expanded (full visible area above the menu). LayoutAnimation is a
  // no-op on Fabric, so we animate the height value directly with
  // useNativeDriver:false (height isn't native-driver compatible).
  const SCREEN_HEIGHT = Dimensions.get('window').height;
  const expandAnim = useRef(new Animated.Value(0)).current;
  // Measured height of the map area (the section's parent). Used as
  // the upper bound for the expanded section so its top edge never
  // climbs above the parent — without this, the section would render
  // off-screen at the top when fully expanded.
  const [mapAreaHeight, setMapAreaHeight] = useState(0);

  const openAllRecommendations = useCallback(() => {
    setRecommendationsExpanded(true);
    Animated.timing(expandAnim, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [expandAnim]);

  const closeAllRecommendations = useCallback(() => {
    Animated.timing(expandAnim, {
      toValue: 0,
      duration: 320,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) setRecommendationsExpanded(false);
    });
  }, [expandAnim]);

  const [selectedPriceRange, setSelectedPriceRange] = useState('all');
  const [selectedDuration, setSelectedDuration] = useState('all');
  const [selectedAmenities, setSelectedAmenities] = useState([]);

  // Geolocation state
  const [userLocation, setUserLocation] = useState(null);
  const [locationName, setLocationName] = useState('Locating...');
  const [mapRegion, setMapRegion] = useState(initialRegion);
  // True when `userLocation` is the Delhi fallback rather than a real fix.
  // Used to (a) make the location pill open a "turn on location" prompt
  // when tapped, and (b) decide whether to pop the prompt automatically
  // on first failure.
  const [isLocationFallback, setIsLocationFallback] = useState(false);
  const mapRef = useRef(null);
  const locationResolvedRef = useRef(false); // prevents error state from overwriting a good location name
  const locationLoggedRef = useRef(false);   // ensures lat/lng is logged only once
  const fetchSpotsRef = useRef(null);        // always points to latest fetchSpots (avoids stale closure)

  // Parking spots from backend
  const [parkingSpots, setParkingSpots] = useState([]);
  const [isLoadingSpots, setIsLoadingSpots] = useState(false);
  const [spotsError, setSpotsError] = useState('');

  // Measured height of the "Nearby Parking" bottom sheet — used to pin the
  // floating list-toggle and my-location buttons just above it. The sheet
  // has dynamic height (loading state vs. cards vs. error), so a hardcoded
  // bottom offset would either overlap the sheet or float in mid-screen.
  const [bottomSheetHeight, setBottomSheetHeight] = useState(0);
  const FLOATING_BUTTON_GAP = 12;

  // Hide/show bottom tab bar based on search focus
  useEffect(() => {
    navigation.getParent()?.setOptions({
      tabBarStyle: isSearchFocused
        ? { display: 'none' }
        : {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 65,
            backgroundColor: palette.surface,
            borderTopWidth: 0,
            paddingTop: 8,
            paddingBottom: 8,
            elevation: 10,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.1,
            shadowRadius: 12,
          },
    });
  }, [isSearchFocused, navigation]);

  // Open the device's *system-level* Location Settings (the GPS toggle),
  // not the app's permission page. On Android the GPS toggle lives at a
  // different settings screen than app permissions, and `openSettings()`
  // sends users to the latter. We try the location-source intent first;
  // if it fails (older Android, restricted device), we fall back to the
  // app settings page.
  const openSystemLocationSettings = async () => {
    if (Platform.OS === 'android') {
      try {
        await Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS');
        return;
      } catch (e) {
        // Fall through to app settings
      }
    }
    Linking.openSettings();
  };

  const promptEnableLocationServices = () => {
    AppAlert.alert(
      'Turn on location',
      "Your device's location is off, so we can't show parking spots near you. Turn on location in Settings, then come back.",
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: openSystemLocationSettings },
      ],
    );
  };

  // Tap-handler for the header location pill: when on the fallback (real
  // location couldn't be resolved), prompt to enable services; otherwise
  // re-center the map on the user's actual location.
  const handleLocationPillPress = () => {
    if (isLocationFallback) {
      promptEnableLocationServices();
    } else {
      centerOnUserLocation();
    }
  };

  // Reverse geocode coordinates → human-readable area name
  const reverseGeocode = async (latitude, longitude) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'ParkBnbApp/1.0 (aibinnovationsai@gmail.com)',
            'Accept-Language': 'en',
          },
        }
      );
      const data = await res.json();
      if (data.address) {
        const a = data.address;
        // Indian addresses: suburb > neighbourhood > city_district > town > city > state_district > district > county
        const name =
          a.suburb || a.neighbourhood || a.city_district ||
          a.town || a.city || a.state_district ||
          a.district || a.county || a.state || null;
        if (name) setLocationName(name);
      }
    } catch {
      // Geocoding failed — keep existing locationName
    }
  };

  // ─── Fetch spots from backend ───────────────────────────────────────────────
  const fetchSpots = useCallback(async (lat, lng, overrides = {}) => {
    setIsLoadingSpots(true);
    setSpotsError('');
    try {
      const priceRange = priceRanges.find(p => p.id === (overrides.priceRange ?? selectedPriceRange));
      const category = overrides.category ?? selectedCategory;
      const amenities = overrides.amenities ?? selectedAmenities;

      const params = { lat, lng, radius: 10, limit: 50 };
      if (category !== 'all') params.vehicleType = categoryToApiType[category];
      if (priceRange && priceRange.id !== 'all') {
        params.minPrice = priceRange.min;
        params.maxPrice = priceRange.max;
      }
      if (amenities.includes('ev_charging')) params.hasEvCharging = true;

      const response = await parkingService.searchNearbySpaces(params);
      const mapped = groupSpacesByProperty(response.spaces || [], lat, lng);
      setParkingSpots(mapped);
    } catch (err) {
      const code = err?.code || '';
      if (code === 'NETWORK_ERROR' || code === 'NETWORK_TIMEOUT') {
        setSpotsError('No internet connection.');
      } else {
        setSpotsError('Could not load parking spots.');
      }
      setParkingSpots([]);
    } finally {
      setIsLoadingSpots(false);
    }
  }, [selectedCategory, selectedPriceRange, selectedAmenities]);

  // Keep ref in sync so location callbacks always call the latest fetchSpots
  useEffect(() => { fetchSpotsRef.current = fetchSpots; });

  // Trigger the initial fetch exactly once, as soon as userLocation is first set
  const initialFetchDoneRef = useRef(false);
  useEffect(() => {
    if (userLocation && !initialFetchDoneRef.current) {
      initialFetchDoneRef.current = true;
      fetchSpotsRef.current(userLocation.latitude, userLocation.longitude);
    }
  }, [userLocation]);

  // Request location permission and get current location on mount.
  //
  // Why a fallback to `initialRegion` (Delhi):
  // The home screen's listing fetch only fires once `userLocation` is set
  // (see the effect above). If the device has location services off, or the
  // user denies permission, `userLocation` would stay null and the user sees
  // an empty home screen with no way to discover that listings exist. We
  // pin the fallback to Delhi so the user always sees *some* listings, and
  // we set a clear `locationName` so they know the location wasn't real.
  useEffect(() => {
    const useFallbackLocation = (label) => {
      if (locationResolvedRef.current) return;
      locationResolvedRef.current = true;
      // Don't overwrite the map region — keep `initialRegion` (Delhi) so
      // the map and the listing fetch use the same default coordinates.
      setUserLocation({
        latitude: initialRegion.latitude,
        longitude: initialRegion.longitude,
      });
      setLocationName(label);
      setIsLocationFallback(true);
    };

    const getCurrentLocation = () => {
      Geolocation.getCurrentPosition(
        (position) => {
          if (locationResolvedRef.current) return; // MapView already got it
          locationResolvedRef.current = true;
          const { latitude, longitude } = position.coords;
          if (!locationLoggedRef.current) {
            locationLoggedRef.current = true;
            console.log('[Location] Resolved via Geolocation.getCurrentPosition:', { latitude, longitude });
          }
          const newRegion = {
            latitude,
            longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          };
          setUserLocation({ latitude, longitude });
          setMapRegion(newRegion);
          if (mapRef.current) {
            mapRef.current.animateToRegion(newRegion, 1000);
          }
          reverseGeocode(latitude, longitude);
          // fetchSpots is triggered by the userLocation useEffect above
        },
        (error) => {
          if (locationResolvedRef.current) return; // MapView already got it
          console.warn('[Location] getCurrentPosition failed:', {
            code: error?.code,
            message: error?.message,
          });
          // code 1 = PERMISSION_DENIED (shouldn't happen if we got past the
          //          permission gate, but possible if the user revokes mid-flight)
          // code 2 = POSITION_UNAVAILABLE — device location services are OFF
          // code 3 = TIMEOUT — couldn't get a fix in 20s
          const label =
            error?.code === 1 ? 'Permission denied' :
            error?.code === 2 ? 'Turn on location' :
            error?.code === 3 ? 'Location timed out' :
            'Location unavailable';
          useFallbackLocation(label);
          // Code 2 = device location services are OFF. Permission alone
          // can't fix this — the user has to enable location in system
          // settings. Pop a prompt with a deep link.
          if (error?.code === 2) {
            promptEnableLocationServices();
          }
        },
        { enableHighAccuracy: false, timeout: 20000, maximumAge: 30000 }
      );
    };

    const requestLocationPermission = async () => {
      if (Platform.OS === 'android') {
        try {
          const alreadyGranted = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          console.log('[Location] permission alreadyGranted=', alreadyGranted);
          if (alreadyGranted) {
            getCurrentLocation();
            return;
          }

          const result = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: 'Location Permission',
              message: 'ParkBnb needs your location to show nearby parking spots.',
              buttonNeutral: 'Ask Me Later',
              buttonNegative: 'Cancel',
              buttonPositive: 'Allow',
            }
          );
          console.log('[Location] permission request result=', result);

          if (result === PermissionsAndroid.RESULTS.GRANTED) {
            getCurrentLocation();
          } else if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
            useFallbackLocation('Location disabled');
            AppAlert.alert(
              'Location Permission Required',
              'Please enable location access in Settings to see nearby parking spots.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
              ]
            );
          } else {
            useFallbackLocation('Location disabled');
          }
        } catch (err) {
          console.warn('[Location] permission error:', err);
          useFallbackLocation('Location unavailable');
        }
      } else {
        getCurrentLocation();
      }
    };

    requestLocationPermission();
  }, []);

  // Handle user location update from MapView
  const handleUserLocationChange = async (event) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    if (!locationResolvedRef.current) {
      // First fix — animate map and generate nearby spots
      locationResolvedRef.current = true;
      if (!locationLoggedRef.current) {
        locationLoggedRef.current = true;
        console.log('[Location] Resolved via MapView onUserLocationChange:', { latitude, longitude });
      }
      const newRegion = {
        latitude,
        longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
      setUserLocation({ latitude, longitude });
      setMapRegion(newRegion);
      if (mapRef.current) {
        mapRef.current.animateToRegion(newRegion, 1000);
      }
      reverseGeocode(latitude, longitude);
      // fetchSpots is triggered by the userLocation useEffect above
    } else {
      setUserLocation({ latitude, longitude });
    }
  };

  // Function to center map on user location
  const centerOnUserLocation = () => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        ...userLocation,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }, 1000);
    }
  };

  // Function to open directions to a parking spot
  const openDirections = (destination) => {
    const { latitude, longitude } = destination;

    // Use Google Maps URL which works reliably on both platforms
    const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;

    Linking.openURL(url).catch(() => {
      AppAlert.alert('Error', 'Unable to open maps application');
    });
  };

  // Search for location and center map
  const handleLocationSearch = async () => {
    if (searchQuery.trim() === '') return;

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`
      );
      const data = await response.json();

      if (data && data.length > 0) {
        const parsedLat = parseFloat(data[0].lat);
        const parsedLng = parseFloat(data[0].lon);
        const newRegion = {
          latitude: parsedLat,
          longitude: parsedLng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        };
        setMapRegion(newRegion);
        if (mapRef.current) {
          mapRef.current.animateToRegion(newRegion, 1000);
        }
        // Fetch parking spots for the searched location
        fetchSpots(parsedLat, parsedLng);
      }
    } catch (error) {
      console.log('Location search error:', error);
    }
  };

  // Toggle amenity selection
  const toggleAmenity = (amenityId) => {
    setSelectedAmenities(prev =>
      prev.includes(amenityId)
        ? prev.filter(id => id !== amenityId)
        : [...prev, amenityId]
    );
  };

  // Reset all filters and re-fetch
  const resetFilters = () => {
    setSelectedPriceRange('all');
    setSelectedDuration('all');
    setSelectedAmenities([]);
    if (userLocation) {
      fetchSpots(userLocation.latitude, userLocation.longitude, {
        priceRange: 'all',
        amenities: [],
        category: selectedCategory,
      });
    }
  };

  // Get active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedPriceRange !== 'all') count++;
    if (selectedDuration !== 'all') count++;
    count += selectedAmenities.length;
    return count;
  }, [selectedPriceRange, selectedDuration, selectedAmenities]);

  // Filter parking spots based on all criteria
  const filteredSpots = useMemo(() => {
    return parkingSpots.filter(spot => {
      // Filter by search query
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = spot.name.toLowerCase().includes(query);
        const matchesAddress = spot.address.toLowerCase().includes(query);
        if (!matchesName && !matchesAddress) {
          return false;
        }
      }

      // Filter by vehicle type
      if (selectedCategory !== 'all') {
        const types = spot.allowedVehicleTypes || [];
        const matchesCategory =
          (selectedCategory === 'car' && (types.length === 0 || types.includes('car') || types.includes('suv'))) ||
          (selectedCategory === 'bike' && types.some(t => ['motorcycle', 'bicycle'].includes(t))) ||
          (selectedCategory === 'bus' && types.includes('van')) ||
          (selectedCategory === 'truck' && types.some(t => ['truck', 'rv', 'trailer'].includes(t))) ||
          spot.type === selectedCategory;

        if (!matchesCategory) {
          return false;
        }
      }

      // Filter by price range
      if (selectedPriceRange !== 'all') {
        const priceRange = priceRanges.find(p => p.id === selectedPriceRange);
        if (priceRange && (spot.pricePerHour < priceRange.min || spot.pricePerHour > priceRange.max)) {
          return false;
        }
      }

      // Filter by duration
      if (selectedDuration !== 'all' && !spot.duration.includes(selectedDuration)) {
        return false;
      }

      // Filter by amenities
      if (selectedAmenities.length > 0) {
        const hasAllAmenities = selectedAmenities.every(amenity =>
          spot.amenities.includes(amenity)
        );
        if (!hasAllAmenities) {
          return false;
        }
      }

      return true;
    });
  }, [parkingSpots, searchQuery, selectedCategory, selectedPriceRange, selectedDuration, selectedAmenities]);

  const handleSpotPress = (spot) => {
    setSelectedSpot(spot.id === selectedSpot ? null : spot.id);
    setSelectedParkingData(spot);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setSelectedSpot(null);
  };

  // Nearby Parking card — shared by the compact horizontal strip and the
  // expanded vertical list so the two modes can't drift apart. `onPress`
  // differs between them (the expanded list collapses first), so it's
  // passed in rather than baked in.
  const renderNearbyCard = (spot, { onPress, style }) => {
    const isFavorite = favoriteSpotIds.includes(spot.id);
    const thumbnail = spot.images?.[0];
    // The backend has no review count — only `average_rating`, which is 0
    // until someone actually rates the space. Showing a star with no
    // rating behind it would be inventing social proof, so unrated
    // listings read "New" instead.
    const hasRating = spot.rating > 0;

    return (
      <TouchableOpacity
        // Keyed here rather than at each call site: the compact list maps over
        // spots directly, and FlatList is happy to receive one too.
        key={spot.id}
        style={[styles.recommendationCard, style]}
        onPress={onPress}
        activeOpacity={0.9}
      >
        <View style={styles.recommendationImageLeft}>
          {thumbnail ? (
            <Image source={{ uri: resolveImageUri(thumbnail) }} style={styles.recommendationThumbnail} />
          ) : (
            <ParkingPinIcon size={28} color={palette.primary} />
          )}
          <TouchableOpacity
            style={styles.favoriteButton}
            onPress={() => toggleFavorite(spot.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcon
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={16}
              color={isFavorite ? palette.danger : '#FFFFFF'}
            />
          </TouchableOpacity>
          {spot.available === 0 ? (
            <View style={styles.lowAvailabilityBadge}>
              <Text style={styles.lowAvailabilityText}>Booked</Text>
            </View>
          ) : spot.available < 5 && (
            <View style={styles.lowAvailabilityBadge}>
              <Text style={styles.lowAvailabilityText}>{spot.available} left</Text>
            </View>
          )}
        </View>

        <View style={styles.recommendationContent}>
          <Text style={styles.recommendationName} numberOfLines={1}>{spot.name}</Text>

          <View style={styles.recommendationRating}>
            {hasRating ? (
              <>
                <MaterialIcon name="star" size={13} color={palette.warning} />
                <Text style={styles.recommendationRatingText}>{spot.rating.toFixed(1)}</Text>
              </>
            ) : (
              <Text style={styles.recommendationNewBadge}>New</Text>
            )}
          </View>

          <View style={styles.recommendationMeta}>
            <Icon name="map-pin" size={12} color={palette.textSubtle} />
            <Text style={styles.recommendationDistance}>{spot.distance}</Text>
            {spot.travelTime && (
              <>
                <Text style={styles.recommendationDot}>•</Text>
                <Text style={styles.recommendationSpots}>{spot.travelTime}</Text>
              </>
            )}
          </View>

          {spot.amenities?.length > 0 && (
            <View style={styles.cardAmenityChipRow}>
              {spot.amenities.slice(0, 3).map((amenity) => (
                <View key={amenity} style={styles.cardAmenityChip}>
                  <MaterialIcon
                    name={amenityChipIcons[amenity] || 'check-circle-outline'}
                    size={12}
                    color={palette.primary}
                  />
                  <Text style={styles.cardAmenityChipText}>
                    {amenityChipLabels[amenity] || amenity.replace(/_/g, ' ')}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.recommendationPriceColumn}>
          <Text style={styles.recommendationPrice}>
            {spot.price}<Text style={styles.recommendationPriceUnit}>/hr</Text>
          </Text>
          <Icon name="chevron-right" size={18} color={palette.textSubtle} />
        </View>
      </TouchableOpacity>
    );
  };

  // Render list view header — results count and view toggle only
  const renderListHeader = () => (
    <View style={styles.listHeaderContainer}>
      <View style={styles.listResultsRow}>
        <View style={styles.resultsInfo}>
          <Text style={styles.resultsCount}>{filteredSpots.length} parking spots</Text>
        </View>
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.viewToggleButton, viewMode === 'list' && styles.viewToggleButtonActive]}
            onPress={() => setViewMode('list')}
          >
            <Icon name="list" size={18} color={viewMode === 'list' ? '#FFFFFF' : '#A1A1AA'} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewToggleButton, viewMode === 'map' && styles.viewToggleButtonActive]}
            onPress={() => setViewMode('map')}
          >
            <Icon name="map" size={18} color={viewMode === 'map' ? '#FFFFFF' : '#A1A1AA'} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // Render parking card for list view
  const renderParkingCard = ({ item }) => (
    <TouchableOpacity
      style={styles.parkingCard}
      onPress={() => handleSpotPress(item)}
    >
      <View style={styles.parkingCardImage}>
        <ParkingPinIcon size={36} color={palette.primary} />
        {item.available === 0 ? (
          <View style={[styles.lowAvailabilityBadgeCard, { backgroundColor: '#EF4444' }]}>
            <Text style={styles.lowAvailabilityTextCard}>Fully Booked</Text>
          </View>
        ) : item.available < 5 && (
          <View style={styles.lowAvailabilityBadgeCard}>
            <Text style={styles.lowAvailabilityTextCard}>{item.available} left</Text>
          </View>
        )}
      </View>
      <View style={styles.parkingCardContent}>
        <View style={styles.parkingCardHeader}>
          <Text style={styles.parkingCardName} numberOfLines={1}>{item.name}</Text>
          {item.rating > 0 ? (
            <View style={styles.parkingCardRating}>
              <Icon name="star" size={12} color="#F59E0B" />
              <Text style={styles.parkingCardRatingText}>{item.rating}</Text>
            </View>
          ) : (
            <Text style={styles.newTag}>New</Text>
          )}
        </View>
        <Text style={styles.parkingCardAddress} numberOfLines={1}>{item.address}</Text>
        <View style={styles.parkingCardMeta}>
          <View style={styles.metaItem}>
            <Icon name="navigation" size={12} color={palette.primary} />
            <Text style={styles.metaText}>{item.distance}</Text>
          </View>
          <View style={styles.metaItem}>
            <VehicleIcon type={item.type} size={12} color={palette.primary} />
            <Text style={[styles.metaText, item.available === 0 && { color: '#EF4444' }]}>
              {item.available === 0 ? 'No spots left' : `${item.available} spots`}
            </Text>
          </View>
        </View>
        <View style={styles.parkingCardAmenities}>
          {item.amenities.slice(0, 3).map((amenity, index) => (
            <View key={index} style={styles.amenityBadge}>
              <Text style={styles.amenityBadgeText}>{amenity.replace('_', ' ')}</Text>
            </View>
          ))}
          {item.amenities.length > 3 && (
            <View style={styles.amenityBadge}>
              <Text style={styles.amenityBadgeText}>+{item.amenities.length - 3}</Text>
            </View>
          )}
        </View>
        <View style={styles.parkingCardFooter}>
          <View>
            <Text style={styles.parkingCardPrice}>{item.price}<Text style={styles.parkingCardPriceUnit}>/hr</Text></Text>
          </View>
          {item.available === 0 ? (
            <View style={[styles.parkingCardBookButton, { backgroundColor: '#6B7280' }]}>
              <Text style={styles.parkingCardBookButtonText}>Booked</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.parkingCardBookButton}
              onPress={() => navigation.navigate('ParkingDetails', { parkingData: item })}
            >
              <Text style={styles.parkingCardBookButtonText}>Book Now</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  // Render recommendations section for list view
  const renderListRecommendations = () => (
    <View style={styles.listRecommendationsSection}>
      <View style={styles.listRecommendationsHeader}>
        <View style={styles.recommendationsTitleRow}>
          <Text style={styles.recommendationsTitle}>Nearby Parking</Text>
        </View>
        <TouchableOpacity onPress={openAllRecommendations} activeOpacity={0.7}>
          <Text style={styles.viewAllText}>View All</Text>
        </TouchableOpacity>
      </View>

      {isLoadingSpots ? (
        <ActivityIndicator color="#1A73E8" style={{ marginVertical: 16 }} />
      ) : spotsError ? (
        <Text style={styles.spotsErrorText}>{spotsError}</Text>
      ) : (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listRecommendationsScrollContent}
      >
        {filteredSpots.slice(0, 6).map((spot) => (
          <TouchableOpacity
            key={spot.id}
            style={[
              styles.listRecommendationCard,
              selectedSpot === spot.id && styles.recommendationCardSelected,
            ]}
            onPress={() => handleSpotPress(spot)}
            activeOpacity={0.9}
          >
            <View style={styles.recommendationImageLeft}>
              <ParkingPinIcon size={24} color={palette.primary} />
              {spot.available === 0 ? (
                <View style={[styles.lowAvailabilityBadge, { backgroundColor: '#EF4444' }]}>
                  <Text style={styles.lowAvailabilityText}>Booked</Text>
                </View>
              ) : spot.available < 5 && (
                <View style={styles.lowAvailabilityBadge}>
                  <Text style={styles.lowAvailabilityText}>{spot.available} left</Text>
                </View>
              )}
            </View>

            <View style={styles.recommendationContent}>
              <View style={styles.recommendationCardHeader}>
                <Text style={styles.recommendationName} numberOfLines={1}>{spot.name}</Text>
              </View>

              <View style={styles.recommendationMeta}>
                <Icon name="navigation" size={12} color={palette.primary} />
                <Text style={styles.recommendationDistance}>{spot.distance}</Text>
                <Text style={styles.recommendationDot}>•</Text>
                <Text style={[styles.recommendationSpots, spot.available === 0 && { color: '#EF4444' }]}>
                  {spot.available === 0 ? 'No spots left' : `${spot.available} spots`}
                </Text>
              </View>

              <View style={styles.recommendationFooter}>
                <Text style={styles.recommendationPrice}>{spot.price}<Text style={styles.recommendationPriceUnit}>/hr</Text></Text>
                {spot.available === 0 ? (
                  <View style={[styles.recommendationBookButton, { backgroundColor: '#6B7280' }]}>
                    <Text style={styles.recommendationBookButtonText}>Booked</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.recommendationBookButton}
                    onPress={() => {
                      navigation.navigate('ParkingDetails', { parkingData: spot });
                    }}
                  >
                    <Text style={styles.recommendationBookButtonText}>Book</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
      )}
    </View>
  );

  // Render "All Parking" section title
  const renderAllParkingTitle = () => (
    <View style={styles.allParkingTitleContainer}>
      <Icon name="grid" size={18} color="#1A73E8" />
      <Text style={styles.allParkingTitle}>All Parking</Text>
    </View>
  );

  // Render list view
  const renderListView = () => (
    <FlatList
      data={filteredSpots}
      renderItem={renderParkingCard}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <>
          {renderListHeader()}
          {!isSearchFocused && renderListRecommendations()}
          {renderAllParkingTitle()}
        </>
      }
      ListEmptyComponent={
        isLoadingSpots ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color="#1A73E8" />
            <Text style={[styles.emptySubtitle, { marginTop: 16 }]}>Finding parking spots nearby...</Text>
          </View>
        ) : spotsError ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconContainer}>
              <Icon name="wifi-off" size={40} color="#6B7280" />
            </View>
            <Text style={styles.emptyTitle}>Could Not Load Spots</Text>
            <Text style={styles.emptySubtitle}>{spotsError}</Text>
            <TouchableOpacity style={styles.emptyButton} onPress={() => userLocation && fetchSpots(userLocation.latitude, userLocation.longitude)}>
              <Text style={styles.emptyButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : !userLocation ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconContainer}>
              <Icon name="map-pin" size={40} color="#6B7280" />
            </View>
            <Text style={styles.emptyTitle}>Waiting for Location</Text>
            <Text style={styles.emptySubtitle}>Allow location access to see nearby parking spots</Text>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconContainer}>
              <Icon name="search" size={40} color="#6B7280" />
            </View>
            <Text style={styles.emptyTitle}>No Parking Found</Text>
            <Text style={styles.emptySubtitle}>
              Try adjusting your filters or search in a different area
            </Text>
            <TouchableOpacity style={styles.emptyButton} onPress={resetFilters}>
              <Text style={styles.emptyButtonText}>Reset Filters</Text>
            </TouchableOpacity>
          </View>
        )
      }
    />
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']} mode="padding">
      {/* Header Panel - covers brand row, greeting, search bar, and category buttons */}
      <View style={styles.headerPanel}>
        {/* Brand Row — logo mark + wordmark on the left, bell and avatar right */}
        <View style={styles.header}>
          <View style={styles.brandLockup}>
            <Image
              source={require('../../assets/logo-mark.png')}
              style={styles.brandMark}
              resizeMode="contain"
            />
            <View>
              <Text style={styles.brandWordmark}>PARKFNB</Text>
              <Text style={styles.brandTagline}>SMART PARKING / BRIGHTER CITIES</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            {/* The bell that used to sit here had no handler and a permanent
                "unread" dot: the consumer app has no notifications screen yet
                (NotificationCenter.js is empty). Bring it back with the feature. */}
            {/* The avatar is the only route into the profile from here, and
                Profile is a sibling tab rather than a stack screen. */}
            <TouchableOpacity
              style={styles.avatarButton}
              onPress={() => navigation.navigate('Profile')}
            >
              <Text style={styles.avatarInitial}>{avatarInitial}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Compact Greeting */}
        <View style={styles.greetingSection}>
          <Text style={styles.greetingLabel} numberOfLines={1}>
            {greeting}{firstName ? `, ${firstName}` : ''} 👋
          </Text>
          <Text style={styles.greetingSubtitle}>Find & book parking spots near you</Text>
        </View>

        {/* Search Section */}
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Icon name="search" size={20} color={palette.primary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search area or landmark"
              placeholderTextColor={palette.textSubtle}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              onSubmitEditing={handleLocationSearch}
              returnKeyType="search"
              underlineColorAndroid="transparent"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Icon name="x" size={18} color={palette.textSubtle} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.gpsButtonMap} onPress={centerOnUserLocation}>
              <Icon name="crosshair" size={18} color={palette.primary} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.searchButton} onPress={() => setFilterModalVisible(true)}>
            <Icon name="sliders" size={20} color="#FFFFFF" />
            {activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Category Filters — all share the same colour family as the
            header (white circle, teal glyph). Active state inverts:
            teal circle, white glyph. Mirrors the active-tab look. */}
        <View style={styles.categorySection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryScrollContent}
          >
            {categories.map((category) => {
              const active = selectedCategory === category.id;
              return (
                <TouchableOpacity
                  key={category.id}
                  style={[
                    styles.categoryButton,
                    active && styles.categoryButtonActive,
                  ]}
                  onPress={() => {
                    setSelectedCategory(category.id);
                    if (userLocation) {
                      fetchSpots(userLocation.latitude, userLocation.longitude, { category: category.id });
                    }
                  }}
                >
                  <MaterialIcon
                    name={category.icon}
                    size={20}
                    color={active ? palette.textInverse : palette.text}
                  />
                  <Text
                    style={[
                      styles.categoryButtonLabel,
                      active && styles.categoryButtonLabelActive,
                    ]}
                  >
                    {category.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* Map + List Area */}
      <View
        style={[styles.mapArea, { paddingBottom: tabBarHeight }]}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h && Math.abs(h - mapAreaHeight) > 1) setMapAreaHeight(h);
        }}
      >
        {/* Map Container - Always Mounted to prevent black flash on Android */}
        <View
          style={[
            styles.mapContainerAlwaysMounted,
            viewMode !== 'map' && styles.hiddenContainer
          ]}
          pointerEvents={viewMode === 'map' ? 'auto' : 'none'}
        >
          <View style={styles.mapWrapper}>
            <MapView
              ref={mapRef}
              style={styles.map}
              provider={PROVIDER_GOOGLE}
              initialRegion={mapRegion}
              showsUserLocation={true}
              showsMyLocationButton={false}
              followsUserLocation={true}
              onUserLocationChange={handleUserLocationChange}
              customMapStyle={mapStyle}
              loadingEnabled={true}
              loadingIndicatorColor="#1A73E8"
              loadingBackgroundColor="#FFFFFF"
              renderToHardwareTextureAndroid={true}
              moveOnMarkerPress={false}
            >
            {/* User Location Marker */}
            {userLocation && (
              <>
                {/* Outer pulsing circle */}
                <Circle
                  center={userLocation}
                  radius={100}
                  strokeColor="rgba(26, 115, 232, 0.3)"
                  fillColor="rgba(26, 115, 232, 0.1)"
                />
                {/* User location marker */}
                <Marker
                  coordinate={userLocation}
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <View style={styles.userLocationMarker}>
                    <View style={styles.userLocationOuter}>
                      <View style={styles.userLocationInner} />
                    </View>
                  </View>
                </Marker>
              </>
            )}
            {filteredSpots.map((spot) => {
              const isRange = spot.minPrice != null && spot.maxPrice != null && spot.minPrice !== spot.maxPrice;
              const active = selectedSpot === spot.id;
              return (
                <Marker
                  key={spot.id}
                  coordinate={{
                    latitude: spot.latitude,
                    longitude: spot.longitude,
                  }}
                  onPress={() => handleSpotPress(spot)}
                  tracksViewChanges={Platform.OS === 'ios'}
                >
                  <View style={styles.pinWrapper}>
                    <View style={[styles.pinContainer, active && styles.pinContainerActive]}>
                      {isRange ? (
                        <View style={[styles.pinBox, active && styles.pinBoxActive]}>
                          <Text style={[styles.pinBoxPrice, active && styles.pinPriceActive]}>
                            {'₹'}{spot.minPrice}{'–'}{'₹'}{spot.maxPrice}
                          </Text>
                        </View>
                      ) : (
                        <View style={[styles.pinCircle, active && styles.pinCircleActive]}>
                          <Text style={[styles.pinPrice, active && styles.pinPriceActive]}>
                            {spot.price}
                          </Text>
                        </View>
                      )}
                      <View style={[styles.pinTail, active && styles.pinTailActive]} />
                    </View>
                  </View>
                </Marker>
              );
            })}
          </MapView>
          </View>

          {/* List View Toggle Button — pinned just above the bottom sheet */}
          {!isSearchFocused && bottomSheetHeight > 0 && (
            <TouchableOpacity
              style={[styles.listToggleButton, { bottom: bottomSheetHeight + FLOATING_BUTTON_GAP }]}
              onPress={() => setViewMode('list')}
            >
              <Icon name="list" size={20} color="#1A73E8" />
            </TouchableOpacity>
          )}

          {/* My Location Button — pinned just above the bottom sheet */}
          {!isSearchFocused && bottomSheetHeight > 0 && (
            <TouchableOpacity
              style={[styles.myLocationButton, { bottom: bottomSheetHeight + FLOATING_BUTTON_GAP }]}
              onPress={centerOnUserLocation}
            >
              <Icon name="navigation" size={20} color="#1A73E8" />
            </TouchableOpacity>
          )}

          {/* Parking Recommendations Section.
              Compact mode: horizontal strip of cards.
              Expanded mode: full-screen vertical list (toggled in place
              by tapping "View All"; LayoutAnimation handles the grow). */}
          {!isSearchFocused && (
          <Animated.View
            style={[
              styles.recommendationsSection,
              {
                bottom: -tabBarHeight,
                paddingBottom: tabBarHeight + 8,
                // Compact: intrinsic height (use measured bottomSheetHeight,
                // fall back to 280 before first layout).
                // Expanded: just under the parent's height so the
                // section's top sits a hair below the search bar/header
                // — leaves a small peek of map at the top so it's clear
                // we're still on the home page.
                height: expandAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [
                    // 360 ≈ location row + header + two stacked cards; only
                    // used for the single frame before onLayout measures.
                    bottomSheetHeight || 360,
                    Math.max((mapAreaHeight || SCREEN_HEIGHT * 0.7) - 60, 320),
                  ],
                }),
              },
            ]}
            onLayout={(e) => {
              if (recommendationsExpanded) return;
              const h = e.nativeEvent.layout.height;
              if (h && Math.abs(h - bottomSheetHeight) > 1) setBottomSheetHeight(h);
            }}
          >
            {/* Resolved location. Hidden while expanded — the section then
                covers the map, and a "current location" row above a
                full-screen list reads as a filter it isn't. */}
            {!recommendationsExpanded && (
              <View style={styles.locationRow}>
                <View style={styles.locationIconWrapper}>
                  <Icon name="map-pin" size={18} color={palette.primary} />
                </View>
                <View style={styles.locationRowText}>
                  <Text style={styles.locationName} numberOfLines={1}>{locationName}</Text>
                  <Text style={styles.locationLabel}>Near your current location</Text>
                </View>
                <TouchableOpacity
                  style={styles.locationChangeButton}
                  onPress={handleLocationPillPress}
                  activeOpacity={0.7}
                >
                  <Text style={styles.locationChangeText}>Change</Text>
                  <Icon name="repeat" size={14} color={palette.primary} />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.recommendationsHeader}>
              <View style={styles.recommendationsTitleRow}>
                <Text style={styles.recommendationsTitle}>Nearby Parking</Text>
              </View>
              <TouchableOpacity
                style={styles.viewAllButton}
                onPress={recommendationsExpanded ? closeAllRecommendations : openAllRecommendations}
                activeOpacity={0.7}
              >
                <Text style={styles.viewAllText}>
                  {recommendationsExpanded ? 'View Less' : 'See All'}
                </Text>
                <Icon
                  name={recommendationsExpanded ? 'chevron-up' : 'chevron-right'}
                  size={16}
                  color={palette.primary}
                />
              </TouchableOpacity>
            </View>

            {isLoadingSpots ? (
              <ActivityIndicator color={palette.primary} style={{ marginVertical: 16, marginHorizontal: 16 }} />
            ) : spotsError ? (
              <Text style={[styles.spotsErrorText, { marginHorizontal: 16 }]}>{spotsError}</Text>
            ) : recommendationsExpanded ? (
              <FlatList
                data={filteredSpots}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                style={{ alignSelf: 'stretch' }}
                contentContainerStyle={styles.allRecommendationsListContent}
                renderItem={({ item }) => renderNearbyCard(item, {
                  onPress: () => {
                    closeAllRecommendations();
                    handleSpotPress(item);
                  },
                  // alignSelf: stretch + the list's paddingHorizontal:16 keep
                  // the card at the same left edge it had in the horizontal
                  // strip, so there's no left→center drift on expand.
                  style: { alignSelf: 'stretch', width: '100%', marginRight: 0 },
                })}
                ListEmptyComponent={
                  <View style={styles.emptyState}>
                    <View style={styles.emptyIconContainer}>
                      <Icon name="search" size={40} color="#6B7280" />
                    </View>
                    <Text style={styles.emptyTitle}>No Parking Found</Text>
                    <Text style={styles.emptySubtitle}>
                      Try adjusting your filters
                    </Text>
                  </View>
                }
              />
            ) : (
            /* Compact mode stacks the two closest lots vertically. A plain
               View (not a list) keeps the section's intrinsic height
               measurable, which the expand animation depends on. */
            <View style={styles.recommendationsScrollContent}>
              {filteredSpots.slice(0, 2).map((spot) => renderNearbyCard(spot, {
                onPress: () => handleSpotPress(spot),
                style: [
                  { alignSelf: 'stretch', width: '100%', marginRight: 0 },
                  selectedSpot === spot.id && styles.recommendationCardSelected,
                ],
              }))}
            </View>
            )}
          </Animated.View>
          )}
        </View>

        {/* List View - Overlay on map area */}
        {viewMode === 'list' && (
          <View style={styles.listViewOverlay}>
            {renderListView()}
          </View>
        )}
      </View>

      {/* Parking Details Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View pointerEvents="none" style={styles.modalBackdrop} />
          <View style={[styles.modalContent, { paddingBottom: 24 + 64 + insets.bottom }]}>
            {selectedParkingData && (
              <>
                {/* Modal Header */}
                <View style={styles.modalHeader}>
                  <View style={styles.modalDragIndicator} />
                </View>
                <TouchableOpacity style={styles.modalCloseButton} onPress={closeModal}>
                  <View style={styles.closeButtonCircle}>
                    <Icon name="x" size={18} color="#FFFFFF" />
                  </View>
                </TouchableOpacity>

                <ScrollView
                  style={styles.modalScroll}
                  contentContainerStyle={styles.modalScrollContent}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  {/* Parking Image */}
                  <View style={styles.parkingImageContainer}>
                    {Array.isArray(selectedParkingData.images) && selectedParkingData.images.length > 0 ? (
                      selectedParkingData.images.length === 1 ? (
                        <Image
                          source={{ uri: resolveImageUri(selectedParkingData.images[0]) }}
                          style={styles.parkingImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <ScrollView
                          horizontal
                          pagingEnabled
                          showsHorizontalScrollIndicator={false}
                          style={styles.parkingImageScroll}
                        >
                          {selectedParkingData.images.map((uri, idx) => (
                            <Image
                              key={`${uri}-${idx}`}
                              source={{ uri: resolveImageUri(uri) }}
                              style={styles.parkingImage}
                              resizeMode="cover"
                            />
                          ))}
                        </ScrollView>
                      )
                    ) : (
                      <View style={styles.parkingImagePlaceholder}>
                        <MaterialIcon name="parking" size={40} color="#1A73E8" />
                      </View>
                    )}
                    <View style={[styles.availabilityBadge, selectedParkingData.available === 0 && { backgroundColor: '#EF4444' }]}>
                      <Text style={styles.availabilityText}>
                        {selectedParkingData.available === 0 ? 'Fully Booked' : `${selectedParkingData.available} spots left`}
                      </Text>
                    </View>
                  </View>

                  {/* Parking Info */}
                  <View style={styles.parkingInfo}>
                    <View style={styles.parkingTitleRow}>
                      <Text style={styles.parkingName}>{selectedParkingData.name}</Text>
                      {selectedParkingData.rating > 0 ? (
                        <View style={styles.ratingContainer}>
                          <Icon name="star" size={14} color="#F59E0B" />
                          <Text style={styles.ratingText}>{selectedParkingData.rating}</Text>
                        </View>
                      ) : (
                        <Text style={styles.newTag}>New</Text>
                      )}
                    </View>

                    <View style={styles.parkingAddressRow}>
                      <Icon name="map-pin" size={14} color="#A1A1AA" />
                      <Text style={styles.parkingAddress}>{selectedParkingData.address}</Text>
                    </View>

                    <View style={styles.parkingDetailsRow}>
                      <TouchableOpacity style={styles.detailItem} onPress={() => openDirections(selectedParkingData)}>
                        <Icon name="navigation" size={14} color="#1A73E8" />
                        <Text style={styles.detailText}>{selectedParkingData.distance}</Text>
                      </TouchableOpacity>
                      <View style={styles.detailItem}>
                        <MaterialIcon name="car-outline" size={16} color="#1A73E8" />
                        <Text style={styles.detailText}>{selectedParkingData.spots} spots</Text>
                      </View>
                      <View style={styles.detailItem}>
                        <Icon name="clock" size={14} color="#1A73E8" />
                        <Text style={styles.detailText}>24/7</Text>
                      </View>
                    </View>
                  </View>
                </ScrollView>

                {/* Price and Book Button */}
                <View style={styles.modalFooter}>
                  <View style={styles.priceContainer}>
                    <Text style={styles.priceLabel}>Price</Text>
                    <Text style={styles.priceValue}>
                      {selectedParkingData.minPrice != null && selectedParkingData.maxPrice != null && selectedParkingData.minPrice !== selectedParkingData.maxPrice
                        ? `₹${selectedParkingData.minPrice} – ₹${selectedParkingData.maxPrice}`
                        : `₹${selectedParkingData.pricePerHour}`}
                      <Text style={styles.priceUnit}>/hr</Text>
                    </Text>
                  </View>
                  <View style={styles.modalButtonsRow}>
                    <TouchableOpacity
                      style={styles.directionsButton}
                      onPress={() => openDirections(selectedParkingData)}
                    >
                      <Icon name="navigation" size={18} color="#1A73E8" />
                    </TouchableOpacity>
                    {selectedParkingData.available === 0 ? (
                      <View style={[styles.bookButton, { backgroundColor: '#6B7280' }]}>
                        <Text style={styles.bookButtonText}>Booked</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.bookButton}
                        onPress={() => {
                          closeModal();
                          navigation.navigate('ParkingDetails', { parkingData: selectedParkingData });
                        }}
                      >
                        <Text style={styles.bookButtonText}>Book Now</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Filter Modal */}
      <Modal
        visible={filterModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View pointerEvents="none" style={styles.modalBackdrop} />
          <View style={[styles.filterModalContent, { paddingBottom: 30 + 64 + insets.bottom }]}>
            {/* Filter Header */}
            <View style={styles.filterHeader}>
              <Text style={styles.filterTitle}>Filters</Text>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
                <View style={styles.closeButtonCircle}>
                  <Icon name="x" size={18} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Price Range Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Price Range</Text>
                <View style={styles.filterOptionsRow}>
                  {priceRanges.map((range) => (
                    <TouchableOpacity
                      key={range.id}
                      style={[
                        styles.filterChip,
                        selectedPriceRange === range.id && styles.filterChipActive,
                      ]}
                      onPress={() => setSelectedPriceRange(range.id)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          selectedPriceRange === range.id && styles.filterChipTextActive,
                        ]}
                      >
                        {range.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Duration Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Duration</Text>
                <View style={styles.filterOptionsRow}>
                  {durationOptions.map((duration) => (
                    <TouchableOpacity
                      key={duration.id}
                      style={[
                        styles.filterChip,
                        selectedDuration === duration.id && styles.filterChipActive,
                      ]}
                      onPress={() => setSelectedDuration(duration.id)}
                    >
                      <Icon
                        name={duration.icon}
                        size={14}
                        color={selectedDuration === duration.id ? '#FFFFFF' : '#A1A1AA'}
                        style={styles.filterChipIcon}
                      />
                      <Text
                        style={[
                          styles.filterChipText,
                          selectedDuration === duration.id && styles.filterChipTextActive,
                        ]}
                      >
                        {duration.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Amenities Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Amenities</Text>
                <View style={styles.amenitiesGrid}>
                  {amenityOptions.map((amenity) => (
                    <TouchableOpacity
                      key={amenity.id}
                      style={[
                        styles.amenityChip,
                        selectedAmenities.includes(amenity.id) && styles.amenityChipActive,
                      ]}
                      onPress={() => toggleAmenity(amenity.id)}
                    >
                      <Icon
                        name={amenity.icon}
                        size={16}
                        color={selectedAmenities.includes(amenity.id) ? '#FFFFFF' : palette.primary}
                      />
                      <Text
                        style={[
                          styles.amenityChipText,
                          selectedAmenities.includes(amenity.id) && styles.amenityChipTextActive,
                        ]}
                      >
                        {amenity.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            {/* Filter Actions */}
            <View style={styles.filterActions}>
              <TouchableOpacity style={styles.resetButton} onPress={resetFilters}>
                <Text style={styles.resetButtonText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.applyButton}
                onPress={() => {
                  setFilterModalVisible(false);
                  if (userLocation) {
                    fetchSpots(userLocation.latitude, userLocation.longitude, {
                      priceRange: selectedPriceRange,
                      amenities: selectedAmenities,
                    });
                  }
                }}
              >
                <Text style={styles.applyButtonText}>
                  Apply ({filteredSpots.length} results)
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  headerPanel: {
    backgroundColor: 'transparent',
    paddingBottom: 8,
    zIndex: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  brandLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandMark: {
    width: 28,
    height: 28,
  },
  brandWordmark: {
    fontFamily: fontStacks.medium,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
    color: palette.text,
  },
  brandTagline: {
    display: 'none',
  },
  avatarButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  avatarInitial: {
    fontFamily: fontStacks.medium,
    fontSize: 14,
    fontWeight: '700',
    color: palette.primary,
  },
  greetingSection: {
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 6,
  },
  greetingLabel: {
    fontFamily: fontStacks.medium,
    fontSize: 15,
    fontWeight: '700',
    color: palette.text,
  },
  greetingSubtitle: {
    fontFamily: fontStacks.regular,
    fontSize: 12,
    color: palette.textMuted,
    marginTop: 1,
  },
  greetingHeadline: {
    fontFamily: fontStacks.medium,
    fontSize: 25,
    fontWeight: '700',
    letterSpacing: -0.8,
    lineHeight: 30,
    color: palette.text,
    marginTop: 10,
  },
  // Second line of the headline only. Nested <Text> inherits the size and
  // weight above, so this carries the colour shift and nothing else.
  greetingHeadlineAccent: {
    color: palette.primary,
  },
  ecoCard: {
    width: 158,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.primarySoft,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    // Sits against the headline block, not the greeting line above it —
    // the card is shorter than the text column beside it, so the offset
    // is what keeps their optical centres roughly aligned.
    marginTop: 34,
  },
  ecoCardText: {
    flex: 1,
  },
  ecoCardTitle: {
    fontFamily: fontStacks.medium,
    fontSize: 13,
    fontWeight: '600',
    color: palette.text,
  },
  ecoCardSubtitle: {
    fontFamily: fontStacks.regular,
    fontSize: 12,
    color: palette.textMuted,
  },
  journeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 14,
    paddingVertical: 10,
    backgroundColor: palette.surface,
    borderRadius: radii.md,
  },
  journeyStep: {
    // Equal flex on each step keeps the three labels evenly spaced
    // regardless of word length, so the dividers land on thirds.
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  journeyStepLabel: {
    fontFamily: fontStacks.medium,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: palette.text,
  },
  journeyDivider: {
    width: 1,
    height: 18,
    backgroundColor: palette.bgSoft,
  },
  mapArea: {
    flex: 1,
  },
  listViewOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.bg,
    zIndex: 2,
  },
  // Resolved-location row, sits between the map and the Nearby list.
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: palette.surface,
    borderRadius: radii.md,
  },
  locationRowText: {
    flex: 1,
  },
  locationIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    backgroundColor: palette.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationLabel: {
    fontFamily: fontStacks.regular,
    fontSize: 12,
    color: palette.textMuted,
    marginTop: 1,
  },
  locationName: {
    fontFamily: fontStacks.medium,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: palette.text,
  },
  locationChangeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: palette.primarySoft,
    backgroundColor: palette.surface,
  },
  locationChangeText: {
    fontFamily: fontStacks.medium,
    fontSize: 13,
    fontWeight: '600',
    color: palette.text,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  notificationButton: {
    position: 'relative',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  notificationBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.danger,
    borderWidth: 1.5,
    borderColor: palette.surface,
  },

  // List Header with Search Bar and Map Toggle
  listHeaderContainer: {
    paddingVertical: 12,
    marginBottom: 12,
  },
  listSearchSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  listSearchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 10,
  },
  listSearchInput: {
    flex: 1,
    fontSize: 14,
    color: palette.text,
    marginLeft: 8,
    padding: 0,
  },
  gpsButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(217,255,90,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  gpsButtonMap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(217,255,90,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  listFilterButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: palette.primary,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  listResultsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resultsCount: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.text,
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: palette.surface,
    borderRadius: 8,
    padding: 2,
  },
  viewToggleButton: {
    width: 36,
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewToggleButtonActive: {
    backgroundColor: palette.primary,
  },
  mapToggleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  // List Toggle Button on Map. `bottom` is set inline from the measured
  // bottom-sheet height so the button always sits just above the sheet.
  listToggleButton: {
    position: 'absolute',
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.surface,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },

  // List View
  listContent: {
    paddingHorizontal: 16,
    // Extra bottom padding so the last card scrolls clear of the floating
    // glass menu (64px bar + ~24px safe-area + breathing room).
    paddingBottom: 130,
  },
  listRecommendationsSection: {
    marginBottom: 20,
  },
  listRecommendationsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  listRecommendationsScrollContent: {
    paddingRight: 0,
  },
  listRecommendationCard: {
    width: 320,
    height: 120,
    backgroundColor: palette.surface,
    borderRadius: 12,
    marginRight: 12,
    marginVertical: 6,
    overflow: 'hidden',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  allParkingTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  allParkingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.text,
  },

  // Parking Card — soft teal surface, lighter than the deep
  // palette.primary so it sits closer in tone to the mint header bg.
  // The book button is a contrasting lime pill that still pops.
  parkingCard: {
    backgroundColor: '#DDEDE9',
    borderRadius: 24,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#B8E632',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
    elevation: 5,
  },
  parkingCardImage: {
    height: 100,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  lowAvailabilityBadgeCard: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#EF4444',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  lowAvailabilityTextCard: {
    fontSize: 10,
    fontWeight: '600',
    color: palette.text,
  },
  parkingCardContent: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  parkingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
  },
  parkingCardName: {
    fontFamily: fontStacks.medium,
    fontSize: 17,
    fontWeight: '500',
    letterSpacing: -0.2,
    color: palette.text,
    textAlign: 'center',
    flexShrink: 1,
  },
  parkingCardRating: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(13,115,119,0.10)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  parkingCardRatingText: {
    fontFamily: fontStacks.medium,
    fontSize: 12,
    fontWeight: '600',
    color: palette.primary,
    marginLeft: 4,
  },
  parkingCardAddress: {
    fontFamily: fontStacks.regular,
    fontSize: 13,
    color: palette.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
  parkingCardMeta: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 16,
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontFamily: fontStacks.regular,
    fontSize: 12,
    color: palette.textMuted,
    marginLeft: 4,
  },
  parkingCardAmenities: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    gap: 6,
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  amenityBadge: {
    backgroundColor: 'rgba(13,115,119,0.10)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  amenityBadgeText: {
    fontFamily: fontStacks.medium,
    fontSize: 10,
    fontWeight: '500',
    color: palette.primary,
    textTransform: 'capitalize',
  },
  parkingCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    alignSelf: 'stretch',
  },
  parkingCardPrice: {
    fontFamily: fontStacks.regular,
    fontSize: 24,
    fontWeight: '400',
    letterSpacing: -0.5,
    color: palette.primary,
  },
  parkingCardPriceUnit: {
    fontFamily: fontStacks.regular,
    fontSize: 12,
    fontWeight: '400',
    color: palette.textMuted,
  },
  // Book button — solid teal pill, white text. High contrast on the
  // light mint card.
  parkingCardBookButton: {
    backgroundColor: palette.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  parkingCardBookButtonText: {
    fontFamily: fontStacks.medium,
    fontSize: 14,
    fontWeight: '700',
    color: '#0B0F0C',
  },

  spotsErrorText: {
    fontSize: 13,
    color: '#EF4444',
    marginVertical: 12,
    textAlign: 'center',
  },

  // Empty State
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
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
    paddingHorizontal: 32,
    marginBottom: 20,
  },
  emptyButton: {
    backgroundColor: palette.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0B0F0C',
  },

  searchSection: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    // The journey row above carries its own top margin, so this only
    // needs to separate the two bands rather than clear the greeting.
    marginTop: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: radii.md,
    paddingHorizontal: 16,
    height: 54,
  },
  searchInput: {
    flex: 1,
    fontFamily: fontStacks.regular,
    fontSize: 15,
    color: palette.text,
    marginLeft: 10,
    backgroundColor: 'transparent',
    padding: 0,
    includeFontPadding: false,
  },
  searchButton: {
    width: 54,
    height: 54,
    borderRadius: radii.md,
    backgroundColor: palette.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categorySection: {
    marginTop: 12,
  },
  categoryScrollContent: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
  },
  // Labelled pills, not icon-only circles — with five vehicle types the
  // glyphs alone (van vs truck especially) aren't distinguishable.
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 18,
    borderRadius: radii.md,
    backgroundColor: palette.surface,
    justifyContent: 'center',
  },
  categoryButtonActive: {
    backgroundColor: palette.accent,
  },
  categoryButtonLabel: {
    fontFamily: fontStacks.medium,
    fontSize: 14,
    fontWeight: '600',
    color: palette.text,
  },
  categoryButtonLabelActive: {
    color: palette.textInverse,
  },
  mapContainer: {
    flex: 1,
    marginBottom: 55,
    backgroundColor: palette.surface,
  },
  // Always mounted map container - prevents black flash on Android
  mapContainerAlwaysMounted: {
    flex: 1,
    backgroundColor: palette.surface,
    zIndex: 1,
  },
  // Hidden container style - keeps component mounted but invisible
  hiddenContainer: {
    opacity: 0,
    zIndex: -1,
  },
  mapWrapper: {
    flex: 1,
    backgroundColor: palette.surface,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
    backgroundColor: palette.surface,
  },
  // My Location Button. `bottom` is set inline from the measured
  // bottom-sheet height so the button always sits just above the sheet.
  myLocationButton: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.surface,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  // Recommendations Section — anchored at bottom: 0 so its background
  // extends down through the menu area (no visible mint gap between the
  // section and the floating glass menu). paddingBottom is set inline
  // on the component because it depends on the live insets.
  recommendationsSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: palette.bg,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingTop: 16,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 10,
  },
  // When expanded, the section grows to fill the screen above the menu.
  recommendationsSectionExpanded: {
    top: 0,
  },
  recommendationsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  recommendationsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recommendationsTitle: {
    fontFamily: fontStacks.medium,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: palette.text,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewAllText: {
    fontFamily: fontStacks.medium,
    fontSize: 14,
    fontWeight: '600',
    color: palette.primary,
  },
  recommendationsScrollContent: {
    paddingHorizontal: 16,
  },
  recommendationCard: {
    backgroundColor: palette.surface,
    borderRadius: radii.md,
    marginBottom: 12,
    padding: 10,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 14,
    elevation: 3,
  },
  recommendationCardSelected: {
    borderColor: palette.primary,
    borderWidth: 2,
    shadowOpacity: 0.20,
    shadowRadius: 18,
    elevation: 6,
  },
  recommendationImage: {
    height: 80,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  lowAvailabilityBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: palette.danger,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.xs,
  },
  lowAvailabilityText: {
    fontFamily: fontStacks.medium,
    fontSize: 9,
    fontWeight: '600',
    color: palette.textInverse,
  },
  recommendationContent: {
    flex: 1,
    justifyContent: 'center',
    gap: 3,
  },
  recommendationImageRight: {
    width: 120,
    backgroundColor: palette.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  recommendationImageLeft: {
    width: 96,
    height: 96,
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: palette.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  recommendationThumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  favoriteButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    // Dark scrim so the white heart stays legible over any photo.
    backgroundColor: palette.glassDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardAmenityChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  cardAmenityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.xs,
    backgroundColor: palette.primarySoft,
  },
  cardAmenityChipText: {
    fontFamily: fontStacks.regular,
    fontSize: 10,
    color: palette.textMuted,
  },
  recommendationPriceColumn: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
  },
  recommendationNewBadge: {
    fontFamily: fontStacks.medium,
    fontSize: 11,
    fontWeight: '600',
    color: palette.textSubtle,
  },
  recommendationCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  recommendationName: {
    fontFamily: fontStacks.medium,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: palette.text,
  },
  recommendationRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    minHeight: 16,
  },
  recommendationRatingText: {
    fontFamily: fontStacks.medium,
    fontSize: 12,
    fontWeight: '700',
    color: palette.text,
  },
  recommendationMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recommendationDistance: {
    fontFamily: fontStacks.regular,
    fontSize: 12,
    color: palette.textMuted,
    marginLeft: 4,
  },
  recommendationDot: {
    fontSize: 12,
    color: palette.textSubtle,
    marginHorizontal: 4,
  },
  recommendationSpots: {
    fontFamily: fontStacks.regular,
    fontSize: 12,
    color: palette.textMuted,
  },
  recommendationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 0,
    marginTop: 4,
  },
  recommendationPrice: {
    fontFamily: fontStacks.medium,
    fontSize: 19,
    fontWeight: '700',
    color: palette.text,
  },
  recommendationPriceUnit: {
    fontFamily: fontStacks.regular,
    fontSize: 13,
    color: palette.textMuted,
  },
  recommendationBookButton: {
    backgroundColor: palette.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  recommendationBookButtonText: {
    fontFamily: fontStacks.medium,
    fontSize: 14,
    fontWeight: '700',
    color: '#0B0F0C',
  },
  userLocationMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  userLocationOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(26, 115, 232, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(26, 115, 232, 0.3)',
  },
  userLocationInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: palette.primary,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: palette.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 3,
  },
  pinWrapper: {
    alignItems: 'center',
  },
  pinContainer: {
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  pinContainerActive: {
    shadowOpacity: 0.2,
    elevation: 5,
  },
  pinCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.primary,
    borderWidth: 2,
    borderColor: palette.primary,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  pinCircleActive: {
    backgroundColor: palette.accent,
    borderColor: palette.primary,
  },
  pinPrice: {
    fontSize: 10,
    fontWeight: '700',
    color: palette.textInverse,
    textAlign: 'center',
  },
  pinPriceActive: {
    color: '#FFFFFF',
  },
  // Range price pin — wider pill/box shape
  pinBox: {
    height: 26,
    borderRadius: 8,
    backgroundColor: palette.primary,
    borderWidth: 2,
    borderColor: palette.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 7,
    zIndex: 2,
  },
  pinBoxActive: {
    backgroundColor: palette.accent,
    borderColor: palette.primary,
  },
  pinBoxPrice: {
    fontSize: 10,
    fontWeight: '700',
    color: palette.textInverse,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: palette.primary,
    marginTop: -2,
    zIndex: 1,
  },
  pinTailActive: {
    borderTopColor: palette.primary,
  },
  // Modal Styles
  modalOverlay: {
    // These sheets render inside a real <Modal>, so this fills the modal's
    // own root. The absolute positioning is kept (harmless there) along with
    // the zIndex/elevation left over from when they rendered inline.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 24,
    // The tint lives on modalBackdrop, not here: a translucent background on
    // a view that also carries elevation let Android's shadow paint through
    // it as a visible lighter strip.
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  // Used by the All Recommendations sheet — softer teal-tinted backdrop.
  modalOverlayDimmed: {
    backgroundColor: 'rgba(15, 40, 40, 0.45)',
  },
  modalContent: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    // 96 was a guess at clearing the tab bar (64 + a typical inset); it fell
    // short on any device with a taller gesture-nav inset. The render side
    // now pads for real with the actual inset (see contentBottomPad).
    paddingBottom: 24,
    // A percentage would resolve against the absolutely-positioned backdrop
    // rather than the screen, so cap in points instead.
    maxHeight: Dimensions.get('window').height * 0.85,
  },
  modalScroll: {
    // The sheet must be allowed to grow to its content instead of being
    // clipped by flex constraints.
    flexGrow: 1,
    flexShrink: 1,
  },
  modalScrollContent: {
    paddingBottom: 12,
  },
  modalHeader: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  modalDragIndicator: {
    width: 40,
    height: 4,
    backgroundColor: palette.surface,
    borderRadius: 2,
  },
  modalCloseButton: {
    position: 'absolute',
    right: 16,
    top: 16,
    zIndex: 10,
  },
  closeButtonCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  parkingImageContainer: {
    position: 'relative',
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  parkingImagePlaceholder: {
    width: '100%',
    height: 110,
    backgroundColor: palette.surface,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  parkingImage: {
    // Image takes full modal width minus the modal's 20px horizontal padding
    width: SCREEN_WIDTH - 40,
    height: 180,
    borderRadius: 16,
    backgroundColor: palette.surface,
  },
  parkingImageScroll: {
    width: SCREEN_WIDTH - 40,
    height: 180,
  },
  availabilityBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  availabilityText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '600',
  },
  parkingInfo: {
    marginBottom: 20,
  },
  parkingTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  parkingName: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.text,
    flex: 1,
  },
  newTag: {
    fontFamily: fontStacks.medium,
    fontSize: 12,
    color: palette.textMuted,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(242,181,60,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#D97706',
  },
  parkingAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 6,
  },
  parkingAddress: {
    fontSize: 14,
    color: '#A1A1AA',
    flex: 1,
  },
  parkingDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 20,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 13,
    color: '#A1A1AA',
    fontWeight: '500',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: palette.surface,
  },
  priceContainer: {
    flex: 1,
  },
  priceLabel: {
    fontSize: 12,
    color: '#A1A1AA',
    marginBottom: 2,
  },
  priceValue: {
    fontSize: 24,
    fontWeight: '700',
    color: palette.primary,
  },
  priceUnit: {
    fontSize: 14,
    fontWeight: '500',
    color: '#A1A1AA',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  directionsButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(217,255,90,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  bookButton: {
    backgroundColor: palette.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  bookButtonText: {
    color: '#0B0F0C',
    fontSize: 16,
    fontWeight: '600',
  },
  // Filter Modal Styles
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  filterModalContent: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 30,
    maxHeight: '80%',
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.surface,
  },
  filterTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.text,
  },
  filterSection: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.surface,
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.text,
    marginBottom: 12,
  },
  filterOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.surface,
  },
  filterChipActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  filterChipIcon: {
    marginRight: 6,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#A1A1AA',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  amenitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  amenityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(217,255,90,0.12)',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 8,
  },
  amenityChipActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  amenityChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: palette.primary,
  },
  amenityChipTextActive: {
    color: '#FFFFFF',
  },
  filterActions: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 20,
  },
  resetButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: palette.surface,
    alignItems: 'center',
  },
  resetButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#A1A1AA',
  },
  applyButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: palette.primary,
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0B0F0C',
  },
  // All Recommendations sheet — visually anchored to the same place as
  // the inline `recommendationsSection` so it reads as that section
  // expanding upward, not as a new sheet.
  allRecommendationsModalContent: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    // Bottom padding leaves room for the floating glass menu.
    paddingBottom: 96,
    flex: 1,
    marginTop: 60,
    shadowColor: '#B8E632',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 12,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(15, 40, 40, 0.18)',
    marginTop: 10,
    marginBottom: 4,
  },
  allRecommendationsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 12,
  },
  allRecommendationsTitle: {
    fontFamily: fontStacks.regular,
    fontSize: 22,
    fontWeight: '300',
    letterSpacing: -0.4,
    color: palette.text,
  },
  allRecommendationsCount: {
    fontFamily: fontStacks.regular,
    fontSize: 13,
    color: palette.textMuted,
    paddingBottom: 14,
  },
  // Match the compact horizontal scroll's paddingHorizontal so the first
  // card sits at the same X position in both modes — no left/center
  // shift when switching between compact and expanded.
  allRecommendationsListContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  allRecommendationsCard: {
    flexDirection: 'row',
    backgroundColor: '#DDEDE9',
    borderRadius: 18,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#B8E632',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 3,
  },
  allRecommendationsCardImage: {
    width: 90,
    backgroundColor: 'rgba(13,115,119,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  allRecommendationsCardContent: {
    flex: 1,
    padding: 12,
  },
  allRecommendationsCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  allRecommendationsCardName: {
    flex: 1,
    fontFamily: fontStacks.medium,
    fontSize: 15,
    fontWeight: '600',
    color: palette.text,
    marginRight: 8,
  },
  allRecommendationsCardAddress: {
    fontFamily: fontStacks.regular,
    fontSize: 12,
    color: palette.textMuted,
    marginTop: 2,
  },
  allRecommendationsCardMeta: {
    flexDirection: 'row',
    marginTop: 6,
    gap: 12,
  },
  allRecommendationsCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  allRecommendationsCardPrice: {
    fontFamily: fontStacks.regular,
    fontSize: 18,
    fontWeight: '700',
    color: palette.primary,
  },
  allRecommendationsBookButton: {
    backgroundColor: palette.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  allRecommendationsBookButtonText: {
    fontFamily: fontStacks.medium,
    fontSize: 13,
    fontWeight: '700',
    color: '#0B0F0C',
  },
});

export default HomePage;
