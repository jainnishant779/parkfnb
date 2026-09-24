import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Platform,
  PermissionsAndroid,
  Linking,
  ActivityIndicator,
  Image,
} from 'react-native';
import { AppAlert } from '../../components/AppAlert';
import Geolocation from '@react-native-community/geolocation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import MapView, { Marker, Polyline, UrlTile, PROVIDER_GOOGLE } from 'react-native-maps';
import * as parkingService from '../../services/parkingService';
import { useAuth } from '../../context/AuthContext';
import { palette, radii, fonts, shadow } from '../../theme';
import { resolveImageUri } from '../../utils/imageUri';
import SheetModal from '../../components/ui/SheetModal';
import {
  IconCircle,
  PillButton,
  SearchPill,
  SectionTitle,
  StatusTag,
  IsoBlock,
  InfoGrid,
  Chip,
  EmptyState,
} from '../../components/ui';

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


// Default to Delhi, India for demo
const initialRegion = {
  latitude: 28.6139,
  longitude: 77.2090,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

const HomePage = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  // Greeting is computed once per mount — re-deriving it on every render
  // would churn the header for a string that changes a few times a day.
  const greeting = useMemo(() => greetingForHour(new Date().getHours()), []);
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
  const viewMode = 'map'; // list view removed; map is always shown
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Map card: expanded height + street route to the selected lot.
  const [mapExpanded, setMapExpanded] = useState(false);
  const [routeCoords, setRouteCoords] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);

  // Filter states
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  // Nearby list shows the closest few until "See all" is tapped.
  const [showAllSpots, setShowAllSpots] = useState(false);

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
    const applyFallbackLocation = (label) => {
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
          applyFallbackLocation(label);
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
            applyFallbackLocation('Location disabled');
            AppAlert.alert(
              'Location Permission Required',
              'Please enable location access in Settings to see nearby parking spots.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
              ]
            );
          } else {
            applyFallbackLocation('Location disabled');
          }
        } catch (err) {
          console.warn('[Location] permission error:', err);
          applyFallbackLocation('Location unavailable');
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

  // ─── Render helpers ────────────────────────────────────────────────────────

  const firstName = ((auth?.user?.legalName || '').trim().split(/\s+/)[0]) || '';
  // The route is drawn to the lot the user picked, else the closest one.
  const routeSpot = filteredSpots.find((sp) => sp.id === selectedSpot) || filteredSpots[0] || null;
  // Rounded so small GPS jitter doesn't refetch the route.
  const fromKey = userLocation
    ? `${userLocation.latitude.toFixed(3)},${userLocation.longitude.toFixed(3)}`
    : '';

  // Street-following route from OSRM; falls back to a straight line.
  useEffect(() => {
    if (!userLocation || !routeSpot) {
      setRouteCoords([]);
      setRouteInfo(null);
      return undefined;
    }
    const from = { latitude: userLocation.latitude, longitude: userLocation.longitude };
    const to = { latitude: routeSpot.latitude, longitude: routeSpot.longitude };
    setRouteCoords([from, to]);
    setRouteInfo(null);
    const controller = new AbortController();
    fetch(
      `https://router.project-osrm.org/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson`,
      { signal: controller.signal },
    )
      .then((r) => r.json())
      .then((data) => {
        const route = data?.routes?.[0];
        if (!route) return;
        setRouteCoords(route.geometry.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng })));
        setRouteInfo({
          km: (route.distance / 1000).toFixed(1),
          min: Math.max(1, Math.round(route.duration / 60)),
        });
      })
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromKey, routeSpot?.id]);
  // Map mode shows the closest few until "See all"; list mode shows everything.
  const visibleSpots = viewMode === 'list' || showAllSpots ? filteredSpots : filteredSpots.slice(0, 3);

  const availabilityLabel = (spot) =>
    spot.available === 0 ? 'Booked' : spot.available < 5 ? `${spot.available} left` : `${spot.available} free`;

  // Feature card in the "Current tracking" style: status pill, big name,
  // a dotted track for how full the lot is, distance / price underneath and
  // the isometric block peeking in from the right.
  const renderSpotCard = (spot, index) => {
    const tone = index % 2 === 0 ? 'peach' : 'blue';
    const isFavorite = favoriteSpotIds.includes(spot.id);
    const hasRating = spot.rating > 0;

    return (
      <TouchableOpacity
        key={spot.id}
        activeOpacity={0.9}
        onPress={() => handleSpotPress(spot)}
        style={[
          styles.spotCard,
          { backgroundColor: tone === 'peach' ? palette.peachSoft : palette.blueSoft },
          selectedSpot === spot.id && styles.spotCardSelected,
        ]}
      >
        <View style={styles.spotArt} pointerEvents="none">
          <IsoBlock size={150} tone={tone} />
        </View>

        <View style={styles.spotTop}>
          <StatusTag label={availabilityLabel(spot)} tone={spot.available === 0 ? 'danger' : 'ink'} />
          <TouchableOpacity
            onPress={() => toggleFavorite(spot.id)}
            hitSlop={10}
            activeOpacity={0.7}
            style={styles.heartBtn}
          >
            <MaterialIcon
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={17}
              color={isFavorite ? palette.danger : palette.text}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.spotBody}>
          <Text style={styles.spotName} numberOfLines={1}>{spot.name}</Text>
          <View style={styles.spotMetaRow}>
            <View style={styles.spotMetaCol}>
              <Text style={styles.spotMetaTitle}>{spot.distance}</Text>
              <Text style={styles.spotMetaSub} numberOfLines={1}>
                {spot.travelTime || spot.city || 'Nearby'}
              </Text>
            </View>
            <View style={styles.spotMetaCol}>
              <Text style={styles.spotMetaTitle}>{spot.price}/hr</Text>
              <Text style={styles.spotMetaSub}>
                {hasRating ? `${spot.rating.toFixed(1)} rating` : 'New'}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // The map (route, bubble, lot dots, info card). Rendered in the card and,
  // when expanded, again full screen in a Modal.
  const renderMap = (full) => (
    <>
            <MapView
              ref={full ? undefined : mapRef}
              style={StyleSheet.absoluteFill}
              provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
              initialRegion={mapRegion}
              mapType={Platform.OS === 'android' ? 'none' : 'mutedStandard'}
              userInterfaceStyle="dark"
              showsUserLocation={false}
              showsMyLocationButton={false}
              showsPointsOfInterests={false}
              showsCompass={false}
              showsBuildings={false}
              showsTraffic={false}
              maxZoomLevel={16}
              onUserLocationChange={handleUserLocationChange}
              moveOnMarkerPress={false}
              renderToHardwareTextureAndroid
            >
              {/* Flat charcoal basemap with no labels, drawn over the
                  platform map so iOS and Android look identical. */}
              <UrlTile
                urlTemplate="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
                maximumZ={16}
                shouldReplaceMapContent
                zIndex={-1}
              />

              {routeCoords.length > 1 ? (
                <>
                  <Polyline coordinates={routeCoords} strokeColor="rgba(246,203,145,0.25)" strokeWidth={12} />
                  <Polyline coordinates={routeCoords} strokeColor={palette.peach} strokeWidth={3.5} />
                </>
              ) : null}

              {/* Distance bubble at the middle of the route */}
              {routeCoords.length > 1 && routeInfo ? (
                <Marker
                  coordinate={routeCoords[Math.floor(routeCoords.length / 2)]}
                  anchor={{ x: 0.5, y: 1 }}
                  tracksViewChanges={Platform.OS === 'ios'}
                >
                  <View style={styles.pinWrap}>
                    <View style={styles.bubble}>
                      <Text style={styles.bubbleText}>{routeInfo.km} km</Text>
                    </View>
                    <View style={styles.bubbleTail} />
                  </View>
                </Marker>
              ) : null}

              {userLocation ? (
                <Marker coordinate={userLocation} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                  <View style={styles.glowOuter}>
                    <View style={styles.glowInner} />
                  </View>
                </Marker>
              ) : null}

              {filteredSpots.map((spot) => {
                const active = routeSpot?.id === spot.id;
                return (
                  <Marker
                    key={spot.id}
                    coordinate={{ latitude: spot.latitude, longitude: spot.longitude }}
                    onPress={() => setSelectedSpot(spot.id)}
                    anchor={{ x: 0.5, y: 0.5 }}
                    tracksViewChanges={Platform.OS === 'ios'}
                  >
                    <View style={[styles.glowOuter, !active && styles.glowOuterDim]}>
                      <View style={[styles.glowInner, !active && styles.glowInnerDim]} />
                    </View>
                  </Marker>
                );
              })}
            </MapView>

            <IconCircle
              icon="crosshair"
              size={52}
              onPress={handleLocationPillPress}
              style={[styles.mapLocate, full && { bottom: insets.bottom + 16 }]}
            />

            {routeSpot ? (
              <TouchableOpacity
                activeOpacity={0.9}
                style={[styles.routeCard, full && { bottom: insets.bottom + 16 }]}
                onPress={() => handleSpotPress(routeSpot)}
              >
                {routeSpot.images?.[0] ? (
                  <Image source={{ uri: resolveImageUri(routeSpot.images[0]) }} style={styles.routeThumb} />
                ) : (
                  <View style={[styles.routeThumb, styles.routeThumbEmpty]}>
                    <IsoBlock size={58} tone="peach" />
                  </View>
                )}
                <View style={styles.flex}>
                  <Text style={styles.routeName} numberOfLines={1}>{routeSpot.name}</Text>
                  <View style={styles.routeStats}>
                    <View>
                      <Text style={styles.routeLabel}>Distance</Text>
                      <Text style={styles.routeValue}>{routeInfo ? `${routeInfo.km} km` : routeSpot.distance}</Text>
                    </View>
                    <View>
                      <Text style={styles.routeLabel}>Duration</Text>
                      <Text style={styles.routeValue}>
                        {routeInfo ? `${routeInfo.min} min` : routeSpot.travelTime || '--'}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.routeLabel}>Price</Text>
                      <Text style={styles.routeValue}>{routeSpot.price}/hr</Text>
                    </View>
                  </View>
                </View>
                <IconCircle
                  icon="arrow-up-right"
                  size={36}
                  variant="grey"
                  onPress={() => navigation.navigate('ParkingDetails', { parkingData: routeSpot })}
                  style={styles.routeGo}
                />
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.expandBtn, full && { top: insets.top + 12 }]}
              onPress={() => setMapExpanded(!full)}
            >
              <Icon name={full ? 'minimize-2' : 'maximize-2'} size={19} color={palette.textInverse} />
            </TouchableOpacity>

            <Text style={[styles.mapCredit, full && { top: insets.top + 14 }]}>Esri, HERE, Garmin, OpenStreetMap</Text>
    </>
  );

  const renderSpotsContent = () => {
    if (isLoadingSpots) {
      return (
        <View style={styles.stateBox}>
          <ActivityIndicator color={palette.ink} />
          <Text style={styles.stateText}>Finding parking near you</Text>
        </View>
      );
    }
    if (spotsError) {
      return (
        <EmptyState
          title="Could not load spots"
          subtitle={spotsError}
          action="Retry"
          onAction={() => userLocation && fetchSpots(userLocation.latitude, userLocation.longitude)}
        />
      );
    }
    if (!userLocation) {
      return (
        <EmptyState
          title="Waiting for location"
          subtitle="Allow location access to see parking near you."
          tone="blue"
        />
      );
    }
    if (filteredSpots.length === 0) {
      return (
        <EmptyState
          title="No parking found"
          subtitle="Try other filters or search a different area."
          action="Reset filters"
          onAction={resetFilters}
        />
      );
    }
    return visibleSpots.map(renderSpotCard);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ paddingTop: insets.top + 8 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header: greeting + headline, filter button */}
        <View style={styles.header}>
          <View style={styles.flex}>
            <Text style={styles.hello} numberOfLines={1}>
              {greeting}{firstName ? `, ${firstName}` : ''}
            </Text>
            <Text style={styles.headline}>Find your{'\n'}parking spot</Text>
          </View>
          <IconCircle
            icon="sliders"
            size={50}
            badge={activeFilterCount > 0}
            onPress={() => setFilterModalVisible(true)}
          />
        </View>

        {/* Location pill */}
        <TouchableOpacity onPress={handleLocationPillPress} activeOpacity={0.8} style={styles.locPill}>
          <View style={styles.locDot}>
            <Icon name="map-pin" size={15} color={palette.textInverse} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.locLabel}>Your location</Text>
            <Text style={styles.locName} numberOfLines={1}>{locationName}</Text>
          </View>
          <Icon name="chevron-down" size={18} color={palette.textMuted} />
        </TouchableOpacity>

        {/* Content panel */}
        <View style={[styles.panel, { paddingBottom: insets.bottom + 120 }]}>
          <SearchPill
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search area or landmark"
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            onSubmitEditing={handleLocationSearch}
            returnKeyType="search"
            right={
              searchQuery.length > 0 ? (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={10}>
                  <Icon name="x" size={18} color={palette.textMuted} />
                </TouchableOpacity>
              ) : null
            }
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            {categories.map((category) => {
              const active = selectedCategory === category.id;
              return (
                <TouchableOpacity
                  key={category.id}
                  activeOpacity={0.8}
                  style={[styles.catChip, active && styles.catChipActive]}
                  onPress={() => {
                    setSelectedCategory(category.id);
                    if (userLocation) {
                      fetchSpots(userLocation.latitude, userLocation.longitude, { category: category.id });
                    }
                  }}
                >
                  <MaterialIcon
                    name={category.icon}
                    size={18}
                    color={active ? palette.textInverse : palette.text}
                  />
                  <Text style={[styles.catChipText, active && styles.catChipTextActive]}>
                    {category.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {viewMode === 'map' ? (
            <View style={styles.mapCard}>{renderMap(false)}</View>
          ) : null}

          <SectionTitle
            title={viewMode === 'list' ? 'All parking' : 'Nearby parking'}
            action={viewMode === 'map' && filteredSpots.length > 3 ? (showAllSpots ? 'Show less' : 'See all') : null}
            onAction={() => setShowAllSpots((v) => !v)}
            style={styles.sectionGap}
          />

          {renderSpotsContent()}
        </View>
      </ScrollView>

      {/* Full-screen map */}
      <Modal
        visible={mapExpanded}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setMapExpanded(false)}
      >
        <View style={styles.mapFull}>{renderMap(true)}</View>
      </Modal>

      {/* Spot preview sheet */}
      <SheetModal visible={modalVisible} onClose={closeModal}>
            {selectedParkingData && (
              <>
                <View style={styles.previewMedia}>
                  {Array.isArray(selectedParkingData.images) && selectedParkingData.images.length > 0 ? (
                    <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
                      {selectedParkingData.images.map((uri, idx) => (
                        <Image
                          key={`${uri}-${idx}`}
                          source={{ uri: resolveImageUri(uri) }}
                          style={styles.previewImage}
                          resizeMode="cover"
                        />
                      ))}
                    </ScrollView>
                  ) : (
                    <View style={styles.previewPlaceholder}>
                      <IsoBlock size={140} tone="peach" />
                    </View>
                  )}
                  <StatusTag
                    label={selectedParkingData.available === 0 ? 'Fully booked' : `${selectedParkingData.available} spots left`}
                    tone={selectedParkingData.available === 0 ? 'danger' : 'ink'}
                    style={styles.previewTag}
                  />
                </View>

                <View style={styles.previewTitleRow}>
                  <Text style={styles.previewName} numberOfLines={2}>{selectedParkingData.name}</Text>
                  {selectedParkingData.rating > 0 ? (
                    <View style={styles.ratingPill}>
                      <Icon name="star" size={13} color={palette.warning} />
                      <Text style={styles.ratingText}>{selectedParkingData.rating}</Text>
                    </View>
                  ) : (
                    <StatusTag label="New" tone="grey" />
                  )}
                </View>
                {selectedParkingData.address ? (
                  <View style={styles.previewAddrRow}>
                    <Icon name="map-pin" size={14} color={palette.textMuted} />
                    <Text style={styles.previewAddr} numberOfLines={2}>{selectedParkingData.address}</Text>
                  </View>
                ) : null}

                <View style={styles.previewGrid}>
                  <InfoGrid
                    columns={4}
                    items={[
                      { label: 'Distance', value: selectedParkingData.distance },
                      { label: 'Spots', value: `${selectedParkingData.spots}` },
                      { label: 'Open', value: '24/7' },
                      {
                        label: 'Price',
                        value:
                          selectedParkingData.minPrice != null &&
                          selectedParkingData.maxPrice != null &&
                          selectedParkingData.minPrice !== selectedParkingData.maxPrice
                            ? `₹${selectedParkingData.minPrice}-${selectedParkingData.maxPrice}/hr`
                            : `₹${selectedParkingData.pricePerHour}/hr`,
                      },
                    ]}
                  />
                </View>

                <View style={styles.previewActions}>
                  <IconCircle
                    icon="navigation"
                    size={58}
                    variant="grey"
                    onPress={() => openDirections(selectedParkingData)}
                  />
                  <PillButton
                    label={selectedParkingData.available === 0 ? 'Fully booked' : 'Book now'}
                    iconRight={selectedParkingData.available === 0 ? undefined : 'arrow-right'}
                    variant="ink"
                    disabled={selectedParkingData.available === 0}
                    onPress={() => {
                      closeModal();
                      navigation.navigate('ParkingDetails', { parkingData: selectedParkingData });
                    }}
                    style={styles.previewBook}
                  />
                </View>
              </>
            )}
      </SheetModal>

      {/* Filter sheet */}
      <SheetModal visible={filterModalVisible} onClose={() => setFilterModalVisible(false)} maxHeight="82%">
            <View style={styles.filterHeader}>
              <Text style={styles.sheetTitle}>Filters</Text>
              <IconCircle icon="x" size={40} variant="grey" onPress={() => setFilterModalVisible(false)} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.filterLabel}>Price per hour</Text>
              <View style={styles.chipWrap}>
                {priceRanges.map((range) => (
                  <Chip
                    key={range.id}
                    label={range.label}
                    selected={selectedPriceRange === range.id}
                    onPress={() => setSelectedPriceRange(range.id)}
                    style={styles.chipGap}
                  />
                ))}
              </View>

              <Text style={styles.filterLabel}>Duration</Text>
              <View style={styles.chipWrap}>
                {durationOptions.map((duration) => (
                  <Chip
                    key={duration.id}
                    label={duration.label}
                    icon={duration.icon}
                    selected={selectedDuration === duration.id}
                    onPress={() => setSelectedDuration(duration.id)}
                    style={styles.chipGap}
                  />
                ))}
              </View>

              <Text style={styles.filterLabel}>Amenities</Text>
              <View style={styles.chipWrap}>
                {amenityOptions.map((amenity) => (
                  <Chip
                    key={amenity.id}
                    label={amenity.label}
                    icon={amenity.icon}
                    selected={selectedAmenities.includes(amenity.id)}
                    onPress={() => toggleAmenity(amenity.id)}
                    style={styles.chipGap}
                  />
                ))}
              </View>
            </ScrollView>

            <View style={styles.filterActions}>
              <PillButton label="Reset" variant="grey" onPress={resetFilters} style={styles.actionLeft} />
              <PillButton
                label={`Show ${filteredSpots.length} results`}
                variant="ink"
                style={styles.filterApply}
                onPress={() => {
                  setFilterModalVisible(false);
                  if (userLocation) {
                    fetchSpots(userLocation.latitude, userLocation.longitude, {
                      priceRange: selectedPriceRange,
                      amenities: selectedAmenities,
                    });
                  }
                }}
              />
            </View>
      </SheetModal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  flex: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20 },
  hello: { ...fonts.medium, fontSize: 15, color: palette.textMuted },
  headline: {
    ...fonts.semibold,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.8,
    color: palette.text,
    marginTop: 6,
  },
  locPill: {
    marginHorizontal: 16,
    marginTop: 18,
    height: 64,
    borderRadius: radii.pill,
    backgroundColor: palette.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    paddingRight: 20,
  },
  locDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  locLabel: { ...fonts.medium, fontSize: 12, color: palette.textMuted },
  locName: { ...fonts.semibold, fontSize: 16, color: palette.text, marginTop: 1 },

  panel: {
    marginTop: 20,
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingHorizontal: 16,
    paddingTop: 18,
    minHeight: 500,
  },

  chipsRow: { paddingVertical: 14 },
  catChip: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    backgroundColor: palette.fill,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  catChipActive: { backgroundColor: palette.ink },
  catChipText: { ...fonts.semibold, fontSize: 14, color: palette.text, marginLeft: 7 },
  catChipTextActive: { color: palette.textInverse },

  mapCard: {
    height: 330,
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: '#1B1B1B',
  },
  mapFull: { flex: 1, backgroundColor: '#1B1B1B' },
  mapLocate: { position: 'absolute', right: 12, bottom: 12 },
  routeCard: {
    position: 'absolute',
    left: 12,
    right: 74,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: radii.lg,
    padding: 8,
  },
  routeThumb: { width: 62, height: 62, borderRadius: 16, marginRight: 10 },
  routeThumbEmpty: { backgroundColor: palette.peachSoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  routeName: { ...fonts.bold, fontSize: 14.5, color: palette.text, paddingRight: 30 },
  routeStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingRight: 4 },
  routeLabel: { ...fonts.medium, fontSize: 11, color: palette.textMuted },
  routeValue: { ...fonts.bold, fontSize: 13, color: palette.text, marginTop: 1 },
  routeGo: { position: 'absolute', top: 8, right: 8 },
  expandBtn: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapCredit: {
    ...fonts.medium,
    position: 'absolute',
    left: 14,
    top: 10,
    fontSize: 9,
    color: 'rgba(255,255,255,0.45)',
  },
  pinWrap: { alignItems: 'center' },
  bubble: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 6,
    ...shadow.press,
  },
  bubbleActive: { paddingHorizontal: 14, paddingVertical: 8 },
  bubbleText: { ...fonts.semibold, fontSize: 13, color: palette.text },
  bubbleTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: palette.surface,
    marginBottom: 3,
  },
  glowOuter: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(246,203,145,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowOuterDim: { width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(246,203,145,0.14)' },
  glowInnerDim: { width: 7, height: 7, borderRadius: 4, borderWidth: 0, opacity: 0.7 },
  glowInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: palette.peach,
    borderWidth: 1.5,
    borderColor: '#FFF3E0',
  },

  sectionGap: { marginTop: 22 },

  spotCard: {
    borderRadius: radii.xl,
    padding: 18,
    marginBottom: 12,
    minHeight: 160,
    overflow: 'hidden',
  },
  spotCardSelected: { borderWidth: 2, borderColor: palette.ink },
  spotArt: { position: 'absolute', right: -30, bottom: -26 },
  spotTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heartBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotBody: { width: '66%' },
  spotName: {
    ...fonts.bold,
    fontSize: 22,
    letterSpacing: -0.5,
    color: palette.text,
    marginTop: 12,
  },
  spotTrack: { marginTop: 14 },
  spotMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  spotMetaCol: { maxWidth: '55%' },
  spotMetaTitle: { ...fonts.semibold, fontSize: 13.5, color: palette.text },
  spotMetaSub: { ...fonts.medium, fontSize: 12, color: palette.textMuted, marginTop: 2 },

  stateBox: { alignItems: 'center', paddingVertical: 36 },
  stateText: { ...fonts.medium, fontSize: 14, color: palette.textMuted, marginTop: 12 },

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
  filterSheet: { maxHeight: '82%' },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.line,
    marginBottom: 16,
  },
  sheetTitle: { ...fonts.semibold, fontSize: 22, color: palette.text },

  previewMedia: { height: 190, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: palette.peachSoft },
  previewImage: { width: 360, height: 190 },
  previewPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  previewTag: { position: 'absolute', left: 12, top: 12 },
  previewTitleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  previewName: { ...fonts.bold, flex: 1, fontSize: 22, letterSpacing: -0.4, color: palette.text, marginRight: 10 },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.warningSoft,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  ratingText: { ...fonts.bold, fontSize: 12, color: palette.text, marginLeft: 4 },
  previewAddrRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  previewAddr: { ...fonts.medium, flex: 1, fontSize: 13.5, color: palette.textMuted, marginLeft: 6 },
  previewGrid: {
    marginTop: 16,
    paddingTop: 14,
    paddingHorizontal: 14,
    borderRadius: radii.lg,
    backgroundColor: palette.surfaceDim,
  },
  previewActions: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  previewBook: { flex: 1, marginLeft: 12 },

  filterHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  filterLabel: { ...fonts.semibold, fontSize: 15, color: palette.text, marginTop: 18, marginBottom: 10 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  chipGap: { marginBottom: 10, backgroundColor: palette.fill },
  filterActions: { flexDirection: 'row', marginTop: 16 },
  filterApply: { flex: 1.6 },
});

export default HomePage;
