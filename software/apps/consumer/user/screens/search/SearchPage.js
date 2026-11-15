import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  Modal,
  Animated,
  StatusBar,
  Platform,
  PermissionsAndroid,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Geolocation from '@react-native-community/geolocation';
import Icon from 'react-native-vector-icons/Feather';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as parkingService from '../../services/parkingService';
import { palette, fonts, radii, spacing } from '../../theme';
import {
  PillButton,
  IconCircle,
  SearchPill,
  ScreenHeader,
  StatusTag,
  ProgressTrack,
  Chip,
  EmptyState,
  IsoBlock,
} from '../../components/ui';
import { VehicleIcon } from '../../components/glass/VehicleIcons';
import { resolveImageUri } from '../../utils/imageUri';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Haversine distance in km between two lat/lng points
const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatDistance = (km) =>
  km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;

// Walking is ~5 km/h, driving in city traffic ~20 km/h. Under 800 m we quote a
// walk because that's how the user will actually cover it.
const formatTravelTime = (km) => {
  if (km < 0.8) return `${Math.max(1, Math.round((km / 5) * 60))} min walk`;
  return `${Math.max(1, Math.round((km / 20) * 60))} min drive`;
};

// UI vehicle pill id → API vehicle_type param
const vehicleToApiType = {
  car: 'car',
  two_wheeler: 'motorcycle',
  commercial: 'truck',
  ev: 'car',
};

// Backend space → the shape the card, pin and details screen consume.
// `price_per_hour` arrives camelCased by caseTransform as `pricePerHour`.
const mapSpaceToResult = (space, userLat, userLng) => {
  const prop = space.propertyId || {};
  const coords = prop.location?.coordinates || space.location?.coordinates || [];
  const lng = typeof coords[0] === 'number' ? coords[0] : null;
  const lat = typeof coords[1] === 'number' ? coords[1] : null;

  const distanceKm =
    lat !== null && userLat !== null ? haversineKm(userLat, userLng, lat, lng) : null;

  // Only two amenities are actually recorded: ParkingSpace.has_ev_charging and
  // the space type. CCTV / Guarded / 24-7 exist in the designs but there is no
  // field behind them, so claiming them would be inventing a security promise.
  const amenities = [];
  if (space.hasEvCharging) amenities.push('EV Friendly');
  if (['covered', 'garage', 'carport'].includes(space.spaceType)) amenities.push('Covered');
  if (space.spaceType === 'outdoor' || space.spaceType === 'street') amenities.push('Open Air');

  const images = [
    ...(Array.isArray(prop.propertyImages) ? prop.propertyImages : (Array.isArray(prop.property_images) ? prop.property_images : [])),
    ...(Array.isArray(space.spaceImages) ? space.spaceImages : (Array.isArray(space.space_images) ? space.space_images : [])),
  ].filter(u => typeof u === 'string' && u.trim().length > 0).map(resolveImageUri);

  const totalSpots = space.totalSpots || 1;
  const available = Math.max(0, totalSpots - (space.activeBookingCount || 0));

  return {
    id: space._id || space.id,
    name: space.name || prop.name || 'Parking space',
    address: prop.address || prop.city || '',
    pricePerHour: space.pricePerHour || 0,
    distanceKm,
    distance: distanceKm === null ? '' : formatDistance(distanceKm),
    travelTime: distanceKm === null ? '' : formatTravelTime(distanceKm),
    // Only trust a rating that actually has reviews behind it — an unrated
    // listing must render as "New", never as a fabricated score.
    rating: space.averageRating || 0,
    totalReviews: space.totalReviews || 0,
    amenities,
    allowedVehicleTypes: space.allowedVehicleTypes || [],
    hasEvCharging: !!space.hasEvCharging,
    images,
    latitude: lat,
    longitude: lng,
    spots: totalSpots,
    available: available > 0,
    // ParkingDetailsPage reads the raw space off the route param
    space,
  };
};

// ─── Static config ────────────────────────────────────────────────────────────

// Vehicle pills across the top of the search panel
const vehicleTypeOptions = [
  { id: 'car', label: 'Car', icon: 'car' },
  { id: 'two_wheeler', label: '2 Wheeler', icon: 'bike' },
  { id: 'commercial', label: 'Commercial', icon: 'truck' },
  { id: 'ev', label: 'EV', icon: 'ev' },
];

const priceOptions = [
  { id: 'all', label: 'Price', min: 0, max: 999 },
  { id: 'budget', label: 'Under ₹30', min: 0, max: 30 },
  { id: 'mid', label: '₹30 - ₹60', min: 30, max: 60 },
  { id: 'premium', label: '₹60+', min: 60, max: 999 },
];

const distanceOptions = [
  { id: 'all', label: 'Distance', radius: 10 },
  { id: '1', label: 'Within 1 km', radius: 1 },
  { id: '3', label: 'Within 3 km', radius: 3 },
  { id: '5', label: 'Within 5 km', radius: 5 },
];

const timeOptions = [
  { id: 'all', label: 'Time' },
  { id: 'hourly', label: 'Hourly' },
  { id: 'daily', label: 'Daily' },
  { id: 'monthly', label: 'Monthly' },
];

const featureOptions = [
  { id: 'all', label: 'Features' },
  { id: 'ev_charging', label: 'EV Charging' },
  { id: 'covered', label: 'Covered' },
  { id: 'cctv', label: 'CCTV' },
  { id: 'security', label: 'Guarded' },
];

const sortOptions = [
  { id: 'distance', label: 'Distance' },
  { id: 'price', label: 'Price' },
  { id: 'rating', label: 'Rating' },
];

// Default to Delhi, India when the device won't give us a fix
const initialRegion = {
  latitude: 28.6139,
  longitude: 77.2090,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

// Neutral grey map styling so the ink price pins stay the loudest thing on screen
const mapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#F3F3F3' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8A8A8A' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#FCE9CF' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#DCE6FA' }] },
];

const SearchPage = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  // State management
  const [searchQuery, setSearchQuery] = useState(route?.params?.query || '');
  const [showFilters, setShowFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [spotsError, setSpotsError] = useState('');
  const [results, setResults] = useState([]);
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [favourites, setFavourites] = useState([]);
  const [mapReady, setMapReady] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [showSearchArea, setShowSearchArea] = useState(false);

  // Filter states
  const [selectedVehicle, setSelectedVehicle] = useState('car');
  const [selectedPrice, setSelectedPrice] = useState('all');
  const [selectedDistance, setSelectedDistance] = useState('all');
  const [selectedTime, setSelectedTime] = useState('all');
  const [selectedFeature, setSelectedFeature] = useState('all');
  const [sortBy, setSortBy] = useState('distance');

  // Which dropdown pill is open, if any — 'price' | 'distance' | 'time' | 'features' | 'sort'
  const [openDropdown, setOpenDropdown] = useState(null);

  // Animation refs
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const mapRef = useRef(null);
  const fetchSpotsRef = useRef(null);

  // Map region
  const [region, setRegion] = useState(initialRegion);

  // ─── Fetch spaces from backend ──────────────────────────────────────────────
  const fetchSpots = useCallback(async (lat, lng, overrides = {}) => {
    setIsLoading(true);
    setSpotsError('');
    try {
      const vehicle = overrides.vehicle ?? selectedVehicle;
      const price = priceOptions.find(p => p.id === (overrides.price ?? selectedPrice));
      const distance = distanceOptions.find(d => d.id === (overrides.distance ?? selectedDistance));
      const feature = overrides.feature ?? selectedFeature;

      const params = { lat, lng, radius: distance?.radius ?? 10, limit: 50 };
      if (vehicle) params.vehicleType = vehicleToApiType[vehicle];
      if (price && price.id !== 'all') {
        params.minPrice = price.min;
        params.maxPrice = price.max;
      }
      // The EV pill and the EV feature filter both narrow to charging-capable spaces
      if (feature === 'ev_charging' || vehicle === 'ev') params.hasEvCharging = true;

      const response = await parkingService.searchNearbySpaces(params);
      const mapped = (response.spaces || []).map(s => mapSpaceToResult(s, lat, lng));
      setResults(mapped);
    } catch (err) {
      const code = err?.code || '';
      if (code === 'NETWORK_ERROR' || code === 'NETWORK_TIMEOUT') {
        setSpotsError('No internet connection.');
      } else {
        setSpotsError('Could not load parking spaces.');
      }
      setResults([]);
    } finally {
      setIsLoading(false);
      setShowSearchArea(false);
    }
  }, [selectedVehicle, selectedPrice, selectedDistance, selectedFeature]);

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

  // Request location on mount, falling back to `initialRegion` so a denied
  // permission still shows listings rather than an empty screen.
  useEffect(() => {
    let cancelled = false;

    const fallbackToDefaultRegion = () => {
      if (cancelled) return;
      setUserLocation({ latitude: initialRegion.latitude, longitude: initialRegion.longitude });
      setRegion(initialRegion);
    };

    const locate = async () => {
      try {
        if (Platform.OS === 'android') {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) return fallbackToDefaultRegion();
        }
        Geolocation.getCurrentPosition(
          position => {
            if (cancelled) return;
            const { latitude, longitude } = position.coords;
            setUserLocation({ latitude, longitude });
            setRegion({ latitude, longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 });
          },
          fallbackToDefaultRegion,
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 10000 },
        );
      } catch {
        fallbackToDefaultRegion();
      }
    };

    locate();
    return () => { cancelled = true; };
  }, []);

  // Re-query whenever a filter that the backend understands changes.
  // Location is read through a ref so a GPS update alone doesn't re-fire this
  // effect and duplicate the fetch the mount effect above already ran.
  const userLocationRef = useRef(null);
  useEffect(() => { userLocationRef.current = userLocation; }, [userLocation]);

  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const location = userLocationRef.current;
    if (location) {
      fetchSpotsRef.current(location.latitude, location.longitude);
    }
  }, [selectedVehicle, selectedPrice, selectedDistance, selectedFeature]);

  // Re-run the search against whatever the user has panned to
  const handleSearchThisArea = () => {
    setUserLocation({ latitude: region.latitude, longitude: region.longitude });
    fetchSpotsRef.current(region.latitude, region.longitude);
  };

  const handleSearch = () => {
    if (userLocation) {
      fetchSpotsRef.current(userLocation.latitude, userLocation.longitude);
    }
  };

  const handleRecenter = () => {
    if (!userLocation || !mapRef.current) return;
    mapRef.current.animateToRegion({
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      latitudeDelta: 0.04,
      longitudeDelta: 0.04,
    }, 500);
  };

  // Filters the backend can't express — text query and the non-EV feature
  // flags — plus the client-side sort.
  const filteredResults = useMemo(() => {
    let list = [...results];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        spot =>
          spot.name.toLowerCase().includes(q) ||
          spot.address.toLowerCase().includes(q)
      );
    }

    if (selectedFeature !== 'all' && selectedFeature !== 'ev_charging') {
      const label = featureOptions.find(f => f.id === selectedFeature)?.label;
      list = list.filter(spot => spot.amenities.includes(label));
    }

    switch (sortBy) {
      case 'price':
        list.sort((a, b) => a.pricePerHour - b.pricePerHour);
        break;
      case 'rating':
        list.sort((a, b) => b.rating - a.rating);
        break;
      case 'distance':
      default:
        list.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
    }

    return list;
  }, [results, searchQuery, selectedFeature, sortBy]);

  // Only spaces we have coordinates for can carry a pin
  const mapPins = useMemo(
    () => filteredResults.filter(spot => spot.latitude !== null),
    [filteredResults],
  );

  // Slide the bottom sheet up once the first results land
  useEffect(() => {
    Animated.timing(sheetAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [sheetAnim]);

  const toggleFavourite = (id) => {
    setFavourites(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const openSpot = (spot) => {
    navigation.navigate('ParkingDetails', { parkingData: spot });
  };

  // Centre the map on a pin the user tapped
  const handlePinPress = (spot) => {
    setSelectedSpot(spot);
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: spot.latitude,
        longitude: spot.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }, 400);
    }
  };

  // Reset filters
  const resetFilters = () => {
    setSelectedVehicle('car');
    setSelectedPrice('all');
    setSelectedDistance('all');
    setSelectedTime('all');
    setSelectedFeature('all');
  };

  // Get active filter count
  const getActiveFilterCount = () => {
    let count = 0;
    if (selectedPrice !== 'all') count++;
    if (selectedDistance !== 'all') count++;
    if (selectedTime !== 'all') count++;
    if (selectedFeature !== 'all') count++;
    return count;
  };

  // The label a dropdown pill shows — its selection, or its own name when unset
  const dropdownLabel = (options, selectedId) =>
    options.find(o => o.id === selectedId)?.label || options[0].label;

  // Render header — back, centred title, filters button
  const renderHeader = () => (
    <ScreenHeader
      title="Search"
      onBack={() => navigation.goBack()}
      style={styles.header}
      right={
        <View>
          <IconCircle icon="sliders" size={44} onPress={() => setShowFilters(true)} />
          {getActiveFilterCount() > 0 && (
            <View style={styles.filterBadge} pointerEvents="none">
              <Text style={styles.filterBadgeText}>{getActiveFilterCount()}</Text>
            </View>
          )}
        </View>
      }
    />
  );

  // Render search field
  const renderSearchField = () => (
    <SearchPill
      value={searchQuery}
      onChangeText={setSearchQuery}
      placeholder="Search area, landmark or address"
      onSubmitEditing={handleSearch}
      returnKeyType="search"
      style={styles.searchPill}
      right={
        searchQuery.length > 0 ? (
          <TouchableOpacity
            onPress={() => setSearchQuery('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="x" size={18} color={palette.textMuted} />
          </TouchableOpacity>
        ) : null
      }
    />
  );

  // Render vehicle type chips
  const renderVehiclePills = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      {vehicleTypeOptions.map((type) => {
        const active = selectedVehicle === type.id;
        const fg = active ? palette.textInverse : palette.text;
        return (
          <TouchableOpacity
            key={type.id}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => setSelectedVehicle(type.id)}
            activeOpacity={0.8}
          >
            {type.id === 'ev' ? (
              <Icon name="zap" size={16} color={fg} />
            ) : (
              <VehicleIcon type={type.icon} size={18} color={fg} />
            )}
            <Text style={[styles.chipText, styles.chipTextGap, active && styles.chipTextActive]}>
              {type.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  // Render the four dropdown filter chips
  const renderDropdownPills = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      {[
        { key: 'price', options: priceOptions, selected: selectedPrice },
        { key: 'distance', options: distanceOptions, selected: selectedDistance },
        { key: 'time', options: timeOptions, selected: selectedTime },
        { key: 'features', options: featureOptions, selected: selectedFeature },
      ].map(({ key, options, selected }) => {
        const active = selected !== 'all';
        return (
          <TouchableOpacity
            key={key}
            style={[styles.chip, styles.chipSmall, active && styles.chipActive]}
            onPress={() => setOpenDropdown(openDropdown === key ? null : key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {dropdownLabel(options, selected)}
            </Text>
            <Icon
              name="chevron-down"
              size={15}
              color={active ? palette.textInverse : palette.textMuted}
              style={styles.chipChevron}
            />
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  // Setters keyed by dropdown so the shared sheet can write back to the right filter
  const dropdownSetters = {
    price: setSelectedPrice,
    distance: setSelectedDistance,
    time: setSelectedTime,
    features: setSelectedFeature,
    sort: setSortBy,
  };

  const dropdownConfigs = {
    price: { options: priceOptions, selected: selectedPrice, title: 'Price' },
    distance: { options: distanceOptions, selected: selectedDistance, title: 'Distance' },
    time: { options: timeOptions, selected: selectedTime, title: 'Time' },
    features: { options: featureOptions, selected: selectedFeature, title: 'Features' },
    sort: { options: sortOptions, selected: sortBy, title: 'Sort by' },
  };

  // One sheet serves every dropdown pill — they differ only in options + setter
  const renderDropdownSheet = () => {
    const config = dropdownConfigs[openDropdown];
    if (!config) return null;

    // Mounted only while a dropdown is open, so the Modal is always visible
    // when it renders at all.
    return (
      <Modal
        visible
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setOpenDropdown(null)}
      >
        <View style={styles.sheetOverlay}>
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={() => setOpenDropdown(null)}
          />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>{config.title}</Text>
            <View style={styles.sheetOptions}>
              {config.options.map((option) => {
                const active = config.selected === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[styles.optionRow, active && styles.optionRowActive]}
                    onPress={() => {
                      dropdownSetters[openDropdown](option.id);
                      setOpenDropdown(null);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>
                      {option.label}
                    </Text>
                    {active && <Icon name="check" size={18} color={palette.textInverse} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  // Render map with price pins
  const renderMap = () => (
    <View style={styles.mapCard}>
      <MapView
        ref={mapRef}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        userInterfaceStyle="dark"
        style={styles.map}
        customMapStyle={mapStyle}
        region={region}
        onRegionChangeComplete={(next) => {
          setRegion(next);
          setShowSearchArea(true);
        }}
        showsUserLocation
        showsMyLocationButton={false}
        onMapReady={() => setMapReady(true)}
      >
        {mapPins.map((spot) => {
          const active = selectedSpot?.id === spot.id;
          const muted = !spot.available;
          return (
            <Marker
              key={spot.id}
              coordinate={{ latitude: spot.latitude, longitude: spot.longitude }}
              onPress={() => handlePinPress(spot)}
              tracksViewChanges={false}
            >
              <View style={styles.markerWrap}>
                <View
                  style={[
                    styles.mapMarker,
                    active && styles.mapMarkerSelected,
                    muted && styles.mapMarkerUnavailable,
                  ]}
                >
                  <Text style={[styles.mapMarkerText, active && styles.mapMarkerTextSelected]}>
                    ₹{spot.pricePerHour}
                  </Text>
                </View>
                <View
                  style={[
                    styles.markerTail,
                    active && styles.markerTailSelected,
                    muted && styles.markerTailUnavailable,
                  ]}
                />
              </View>
            </Marker>
          );
        })}
      </MapView>

      {!mapReady && (
        <View style={styles.mapLoadingOverlay}>
          <ActivityIndicator size="large" color={palette.ink} />
        </View>
      )}

      {/* Stacked circular map controls */}
      <View style={styles.mapControlsContainer}>
        <IconCircle icon="crosshair" size={40} onPress={handleRecenter} />
        <IconCircle icon="layers" size={40} onPress={handleSearchThisArea} style={styles.mapControlGap} />
        <IconCircle icon="navigation" size={40} onPress={handleRecenter} style={styles.mapControlGap} />
      </View>

      {showSearchArea && (
        <View style={styles.searchAreaWrap} pointerEvents="box-none">
          <PillButton
            label="Search this area"
            icon="navigation"
            variant="ink"
            size="sm"
            onPress={handleSearchThisArea}
          />
        </View>
      )}
    </View>
  );

  // Render one result card — same look as Home's spot cards
  const renderResultCard = ({ item, index }) => {
    const tone = index % 2 === 0 ? 'peach' : 'blue';
    const favourite = favourites.includes(item.id);
    const booked = item.space?.activeBookingCount || 0;
    const occupied = item.spots > 0 ? Math.min(booked, item.spots) / item.spots : 0;
    const fullness = Math.min(3, Math.max(0, Math.round(occupied * 3)));
    return (
      <TouchableOpacity
        style={[
          styles.spotCard,
          { backgroundColor: tone === 'peach' ? palette.peachSoft : palette.blueSoft },
          selectedSpot?.id === item.id && styles.spotCardSelected,
        ]}
        onPress={() => openSpot(item)}
        activeOpacity={0.9}
      >
        <View style={styles.spotArt} pointerEvents="none">
          <IsoBlock size={150} tone={tone} />
        </View>

        <View style={styles.spotTop}>
          <View style={styles.spotTags}>
            <StatusTag
              label={item.available ? 'Available' : 'Fully booked'}
              tone={item.available ? 'ink' : 'danger'}
            />
            {item.amenities.slice(0, 2).map((amenity) => (
              <StatusTag key={amenity} label={amenity} tone="white" style={styles.spotTagGap} />
            ))}
          </View>
          <TouchableOpacity
            onPress={() => toggleFavourite(item.id)}
            hitSlop={10}
            activeOpacity={0.7}
            style={styles.heartBtn}
          >
            <MaterialIcon
              name={favourite ? 'heart' : 'heart-outline'}
              size={17}
              color={favourite ? palette.danger : palette.text}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.spotBody}>
          <Text style={styles.spotName} numberOfLines={1}>{item.name}</Text>
          <ProgressTrack
            steps={4}
            current={fullness}
            trackColor={tone === 'peach' ? '#F7D3A6' : '#BCD0F4'}
            style={styles.spotTrack}
          />
          <View style={styles.spotMetaRow}>
            <View style={styles.spotMetaCol}>
              <Text style={styles.spotMetaTitle}>{item.distance || '—'}</Text>
              <Text style={styles.spotMetaSub} numberOfLines={1}>
                {item.travelTime || item.address || 'Nearby'}
              </Text>
            </View>
            <View style={styles.spotMetaCol}>
              <Text style={styles.spotMetaTitle}>₹{item.pricePerHour}/hr</Text>
              {/* An unrated listing shows "New" — never a placeholder score */}
              <Text style={styles.spotMetaSub}>
                {item.totalReviews > 0 ? `${item.rating.toFixed(1)} rating` : 'New'}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // List header — map card, then count + sort control
  const renderListHeader = () => (
    <View>
      {renderMap()}
      <View style={styles.resultsHeader}>
        <View style={styles.flex}>
          <Text style={styles.resultsLabel}>Parking near you</Text>
          <Text style={styles.resultsCount}>
            {filteredResults.length}
            <Text style={styles.resultsUnit}> {filteredResults.length === 1 ? 'space' : 'spaces'}</Text>
          </Text>
        </View>
        <TouchableOpacity
          style={styles.sortButton}
          onPress={() => setOpenDropdown('sort')}
          activeOpacity={0.8}
        >
          <Text style={styles.sortLabel}>Sort: </Text>
          <Text style={styles.sortValue}>{dropdownLabel(sortOptions, sortBy)}</Text>
          <Icon name="chevron-down" size={15} color={palette.text} />
        </TouchableOpacity>
      </View>
    </View>
  );

  // Render filter modal
  const renderFilterModal = () => (
    <Modal
      visible={showFilters}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => setShowFilters(false)}
    >
      <View style={styles.sheetOverlay}>
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => setShowFilters(false)}
        />
        <View style={[styles.sheet, styles.filterSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grabber} />
          <View style={styles.sheetHeaderRow}>
            <Text style={styles.sheetTitle}>Filters</Text>
            <IconCircle icon="x" variant="grey" size={38} onPress={() => setShowFilters(false)} />
          </View>

          <ScrollView style={styles.filterContent} showsVerticalScrollIndicator={false}>
            {[
              { title: 'Price', options: priceOptions, selected: selectedPrice, set: setSelectedPrice },
              { title: 'Distance', options: distanceOptions, selected: selectedDistance, set: setSelectedDistance },
              { title: 'Time', options: timeOptions, selected: selectedTime, set: setSelectedTime },
              { title: 'Features', options: featureOptions, selected: selectedFeature, set: setSelectedFeature },
            ].map(({ title, options, selected, set }) => (
              <View key={title} style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>{title}</Text>
                <View style={styles.filterOptionRow}>
                  {options.map((option) => {
                    const active = selected === option.id;
                    return (
                      <Chip
                        key={option.id}
                        label={option.label}
                        selected={active}
                        onPress={() => set(option.id)}
                        style={[styles.filterChip, !active && styles.filterChipIdle]}
                      />
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.filterFooter}>
            <PillButton label="Reset all" variant="grey" onPress={resetFilters} style={styles.resetButton} />
            <PillButton
              label={`Show ${filteredResults.length} results`}
              variant="ink"
              onPress={() => setShowFilters(false)}
              style={styles.flex}
            />
          </View>
        </View>
      </View>
    </Modal>
  );

  // Render empty / error state under the list header
  const renderEmptyState = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={palette.ink} />
          <Text style={styles.loadingText}>Finding parking near you</Text>
        </View>
      );
    }
    return (
      <EmptyState
        title={spotsError ? 'Something went wrong' : 'No parking found'}
        subtitle={spotsError || 'Try adjusting your filters or search in a different area'}
        action="Reset filters"
        onAction={resetFilters}
        tone="blue"
      />
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.bg} />

      {/* Search panel — header, field, vehicle chips, filter chips */}
      <View style={styles.searchPanel}>
        {renderHeader()}
        {renderSearchField()}
        {renderVehiclePills()}
        {renderDropdownPills()}
      </View>

      {/* Results list, map card on top */}
      <Animated.View
        style={[
          styles.flex,
          {
            opacity: sheetAnim,
            transform: [{
              translateY: sheetAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [40, 0],
              }),
            }],
          },
        ]}
      >
        <FlatList
          data={filteredResults}
          renderItem={renderResultCard}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={renderListHeader()}
          ListEmptyComponent={renderEmptyState}
        />
      </Animated.View>

      {renderDropdownSheet()}
      {renderFilterModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  flex: { flex: 1 },

  // Search panel
  searchPanel: { backgroundColor: palette.bg, paddingBottom: spacing.sm },
  header: { paddingHorizontal: spacing.lg },
  filterBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: palette.bg,
  },
  filterBadgeText: { ...fonts.bold, fontSize: 10, color: palette.textInverse },
  searchPill: { marginHorizontal: spacing.lg, marginTop: 6, backgroundColor: palette.surface },
  chipRow: { paddingHorizontal: spacing.lg, paddingTop: 12 },
  chip: {
    height: 42,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    backgroundColor: palette.surface,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  chipSmall: { height: 38, paddingHorizontal: 14 },
  chipActive: { backgroundColor: palette.ink },
  chipText: { ...fonts.semibold, fontSize: 14, color: palette.text },
  chipTextGap: { marginLeft: 7 },
  chipTextActive: { color: palette.textInverse },
  chipChevron: { marginLeft: 4 },

  // Map card
  mapCard: {
    height: 230,
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: palette.surface,
    marginTop: 8,
  },
  map: { flex: 1 },
  mapLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapControlsContainer: { position: 'absolute', right: 12, top: 12 },
  mapControlGap: { marginTop: 8 },
  searchAreaWrap: { position: 'absolute', left: 0, right: 0, bottom: 14, alignItems: 'center' },
  markerWrap: { alignItems: 'center' },
  mapMarker: {
    backgroundColor: palette.ink,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 2,
    borderColor: palette.surface,
  },
  mapMarkerSelected: { backgroundColor: palette.peach, borderColor: palette.ink },
  mapMarkerUnavailable: { backgroundColor: palette.textSubtle },
  mapMarkerText: { ...fonts.bold, fontSize: 12, color: palette.textInverse },
  mapMarkerTextSelected: { color: palette.text },
  markerTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: palette.ink,
    marginTop: -1,
  },
  markerTailSelected: { borderTopColor: palette.ink },
  markerTailUnavailable: { borderTopColor: palette.textSubtle },

  // Results
  listContent: { paddingHorizontal: spacing.lg, paddingTop: 4 },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 20,
    marginBottom: 14,
  },
  resultsLabel: { ...fonts.medium, fontSize: 13, color: palette.textMuted },
  resultsCount: { ...fonts.bold, fontSize: 30, letterSpacing: -0.8, color: palette.text },
  resultsUnit: { ...fonts.medium, fontSize: 15, letterSpacing: 0, color: palette.textMuted },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    backgroundColor: palette.surface,
  },
  sortLabel: { ...fonts.medium, fontSize: 13, color: palette.textMuted },
  sortValue: { ...fonts.semibold, fontSize: 13, color: palette.text, marginRight: 4 },

  // Spot card — mirrors HomePage
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
  spotTags: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  spotTagGap: { marginLeft: 6 },
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

  loadingState: { alignItems: 'center', paddingVertical: 36 },
  loadingText: { ...fonts.medium, fontSize: 14, color: palette.textMuted, marginTop: 12 },

  // Sheets
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingHorizontal: spacing.xl,
    paddingTop: 12,
  },
  filterSheet: { maxHeight: '84%' },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.line,
    marginBottom: 16,
  },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { ...fonts.semibold, fontSize: 22, color: palette.text },
  sheetOptions: { marginTop: 14 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 52,
    borderRadius: radii.pill,
    paddingHorizontal: 20,
    backgroundColor: palette.fill,
    marginBottom: 8,
  },
  optionRowActive: { backgroundColor: palette.ink },
  optionText: { ...fonts.semibold, fontSize: 15, color: palette.text },
  optionTextActive: { color: palette.textInverse },

  filterContent: { marginTop: 8 },
  filterSection: { marginTop: 16 },
  filterSectionTitle: { ...fonts.semibold, fontSize: 15.5, color: palette.text, marginBottom: 10 },
  filterOptionRow: { flexDirection: 'row', flexWrap: 'wrap' },
  filterChip: { height: 40, paddingHorizontal: 16, marginBottom: 8, marginRight: 8 },
  filterChipIdle: { backgroundColor: palette.fill },
  filterFooter: { flexDirection: 'row', marginTop: 16 },
  resetButton: { marginRight: 10 },
});

export default SearchPage;
