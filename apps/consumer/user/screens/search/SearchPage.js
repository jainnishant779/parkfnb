import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  Modal,
  Animated,
  Dimensions,
  StatusBar,
  Platform,
  PermissionsAndroid,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Geolocation from '@react-native-community/geolocation';
import Icon from 'react-native-vector-icons/Feather';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as parkingService from '../../services/parkingService';
import { palette, fontStacks, radii, spacing } from '../../theme';
import { VehicleIcon } from '../../components/glass/VehicleIcons';
import { resolveImageUri } from '../../utils/imageUri';

const { height } = Dimensions.get('window');

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

// Amenity label → Feather glyph for the chips on a result card
const amenityIcons = {
  'EV Friendly': 'zap',
  Covered: 'sun',
  CCTV: 'video',
  Guarded: 'shield',
  '24/7': 'clock',
};

// Default to Delhi, India when the device won't give us a fix
const initialRegion = {
  latitude: 28.6139,
  longitude: 77.2090,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

// Light map styling so the teal price pins stay the loudest thing on screen
const mapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#F1F5F4' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7A8A8A' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#FBE9C8' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#D6E7E4' }] },
];

const SearchPage = ({ navigation, route }) => {
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

  // Render header — back, wordmark, filters pill
  const renderHeader = () => (
    <View style={styles.headerTop}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Icon name="arrow-left" size={20} color={palette.text} />
      </TouchableOpacity>

      <Text style={styles.wordmark}>PARK</Text>

      <TouchableOpacity
        style={styles.filtersPill}
        onPress={() => setShowFilters(true)}
        activeOpacity={0.85}
      >
        <Icon name="sliders" size={16} color={palette.primary} />
        <Text style={styles.filtersPillText}>Filters</Text>
        {getActiveFilterCount() > 0 && (
          <View style={styles.filterBadge}>
            <Text style={styles.filterBadgeText}>{getActiveFilterCount()}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );

  // Render search field
  const renderSearchField = () => (
    <View style={styles.searchBar}>
      <Icon name="search" size={20} color={palette.primary} />
      <TextInput
        style={styles.searchInput}
        placeholder="Search area, landmark or address"
        placeholderTextColor={palette.textSubtle}
        value={searchQuery}
        onChangeText={setSearchQuery}
        onSubmitEditing={handleSearch}
        returnKeyType="search"
      />
      {searchQuery.length > 0 && (
        <TouchableOpacity
          onPress={() => setSearchQuery('')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="x" size={20} color={palette.text} />
        </TouchableOpacity>
      )}
    </View>
  );

  // Render vehicle type pills
  const renderVehiclePills = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.vehicleRow}
    >
      {vehicleTypeOptions.map((type) => {
        const active = selectedVehicle === type.id;
        return (
          <TouchableOpacity
            key={type.id}
            style={[styles.vehiclePill, active && styles.vehiclePillActive]}
            onPress={() => setSelectedVehicle(type.id)}
            activeOpacity={0.85}
          >
            {type.id === 'ev' ? (
              <Icon
                name="zap"
                size={18}
                color={active ? palette.textInverse : palette.text}
              />
            ) : (
              <VehicleIcon
                type={type.icon}
                size={20}
                color={active ? palette.textInverse : palette.text}
              />
            )}
            <Text style={[styles.vehiclePillText, active && styles.vehiclePillTextActive]}>
              {type.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  // Render the four dropdown filter pills
  const renderDropdownPills = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.dropdownRow}
    >
      {[
        { key: 'price', options: priceOptions, selected: selectedPrice },
        { key: 'distance', options: distanceOptions, selected: selectedDistance },
        { key: 'time', options: timeOptions, selected: selectedTime },
        { key: 'features', options: featureOptions, selected: selectedFeature },
      ].map(({ key, options, selected }) => (
        <TouchableOpacity
          key={key}
          style={[styles.dropdownPill, selected !== 'all' && styles.dropdownPillActive]}
          onPress={() => setOpenDropdown(openDropdown === key ? null : key)}
          activeOpacity={0.85}
        >
          <Text
            style={[styles.dropdownPillText, selected !== 'all' && styles.dropdownPillTextActive]}
          >
            {dropdownLabel(options, selected)}
          </Text>
          <Icon
            name="chevron-down"
            size={16}
            color={selected !== 'all' ? palette.primary : palette.text}
          />
        </TouchableOpacity>
      ))}
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

    return (
        <TouchableOpacity
          style={styles.dropdownOverlay}
          activeOpacity={1}
          onPress={() => setOpenDropdown(null)}
        >
          <View style={styles.dropdownSheet}>
            <Text style={styles.dropdownSheetTitle}>{config.title}</Text>
            {config.options.map((option) => {
              const active = config.selected === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={styles.dropdownOption}
                  onPress={() => {
                    dropdownSetters[openDropdown](option.id);
                    setOpenDropdown(null);
                  }}
                >
                  <Text
                    style={[styles.dropdownOptionText, active && styles.dropdownOptionTextActive]}
                  >
                    {option.label}
                  </Text>
                  {active && <Icon name="check" size={18} color={palette.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>

    );
  };

  // Render map with price pins
  const renderMap = () => (
    <View style={styles.mapContainer}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
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
                  <Text style={styles.mapMarkerText}>₹{spot.pricePerHour}</Text>
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
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      )}

      {/* Stacked circular map controls */}
      <View style={styles.mapControlsContainer}>
        <TouchableOpacity style={styles.mapControlButton} onPress={handleRecenter}>
          <Icon name="crosshair" size={20} color={palette.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.mapControlButton} onPress={handleSearchThisArea}>
          <Icon name="layers" size={20} color={palette.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.mapControlButton} onPress={handleRecenter}>
          <Icon name="navigation" size={20} color={palette.text} />
        </TouchableOpacity>
      </View>

      {showSearchArea && (
        <TouchableOpacity
          style={styles.searchAreaButton}
          onPress={handleSearchThisArea}
          activeOpacity={0.85}
        >
          <Icon name="navigation" size={16} color={palette.primary} />
          <Text style={styles.searchAreaText}>Search this area</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // Render one result card
  const renderResultCard = ({ item }) => {
    const favourite = favourites.includes(item.id);
    return (
      <TouchableOpacity
        style={styles.resultCard}
        onPress={() => openSpot(item)}
        activeOpacity={0.9}
      >
        <View style={styles.resultThumbWrap}>
          {item.images.length > 0 ? (
            <Image source={{ uri: resolveImageUri(item.images[0]) }} style={styles.resultThumb} />
          ) : (
            <View style={[styles.resultThumb, styles.resultThumbEmpty]}>
              <Icon name="image" size={22} color={palette.textSubtle} />
            </View>
          )}
          <TouchableOpacity
            style={styles.favouriteButton}
            onPress={() => toggleFavourite(item.id)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Icon
              name="heart"
              size={16}
              color={favourite ? palette.danger : palette.textInverse}
              fill={favourite ? palette.danger : 'none'}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.resultBody}>
          <Text style={styles.resultName} numberOfLines={1}>{item.name}</Text>

          {/* An unrated listing shows "New" — never a placeholder score */}
          {item.totalReviews > 0 ? (
            <View style={styles.resultRatingRow}>
              <Icon name="star" size={13} color={palette.warning} />
              <Text style={styles.resultRatingText}>{item.rating.toFixed(1)}</Text>
              <Text style={styles.resultReviewText}>({item.totalReviews} reviews)</Text>
            </View>
          ) : (
            <View style={styles.resultRatingRow}>
              <Text style={styles.resultNewText}>New</Text>
            </View>
          )}

          {!!item.distance && (
            <View style={styles.resultMetaRow}>
              <Icon name="map-pin" size={13} color={palette.textMuted} />
              <Text style={styles.resultMetaText}>
                {item.distance} • {item.travelTime}
              </Text>
            </View>
          )}

          <View style={styles.resultChips}>
            {item.amenities.slice(0, 3).map((amenity) => (
              <View key={amenity} style={styles.amenityChip}>
                <Icon
                  name={amenityIcons[amenity] || 'check'}
                  size={12}
                  color={palette.primary}
                />
                <Text style={styles.amenityChipText}>{amenity}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.resultPriceCol}>
          <Text style={styles.resultPrice}>₹{item.pricePerHour}/hr</Text>
          <Icon name="chevron-right" size={20} color={palette.textSubtle} />
        </View>
      </TouchableOpacity>
    );
  };

  // Render bottom sheet header — count + sort control
  const renderSheetHeader = () => (
    <View style={styles.sheetHeader}>
      <Text style={styles.sheetCount}>
        {filteredResults.length} parking {filteredResults.length === 1 ? 'space' : 'spaces'} near you
      </Text>
      <TouchableOpacity
        style={styles.sortButton}
        onPress={() => setOpenDropdown('sort')}
        activeOpacity={0.85}
      >
        <Text style={styles.sortLabel}>Sort by: </Text>
        <Text style={styles.sortValue}>{dropdownLabel(sortOptions, sortBy)}</Text>
        <Icon name="chevron-down" size={16} color={palette.text} />
      </TouchableOpacity>
    </View>
  );

  // Render filter modal
  const renderFilterModal = () =>
    showFilters ? (

      <View style={styles.filterModalOverlay}>
        <View style={styles.filterModal}>
          <View style={styles.filterModalHeader}>
            <Text style={styles.filterModalTitle}>Filters</Text>
            <TouchableOpacity
              style={styles.filterModalClose}
              onPress={() => setShowFilters(false)}
            >
              <Icon name="x" size={22} color={palette.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.filterModalContent} showsVerticalScrollIndicator={false}>
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
                      <TouchableOpacity
                        key={option.id}
                        style={[styles.filterOption, active && styles.filterOptionActive]}
                        onPress={() => set(option.id)}
                      >
                        <Text
                          style={[styles.filterOptionText, active && styles.filterOptionTextActive]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.filterModalFooter}>
            <TouchableOpacity style={styles.resetButton} onPress={resetFilters}>
              <Text style={styles.resetButtonText}>Reset All</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.applyButton}
              onPress={() => setShowFilters(false)}
            >
              <Text style={styles.applyButtonText}>
                Show {filteredResults.length} Results
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    
    ) : null;

  // Render empty / error state inside the sheet
  const renderEmptyState = () => {
    if (isLoading) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      );
    }
    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyIconContainer}>
          <Icon name="search" size={32} color={palette.primary} />
        </View>
        <Text style={styles.emptyTitle}>
          {spotsError ? 'Something went wrong' : 'No Parking Found'}
        </Text>
        <Text style={styles.emptySubtitle}>
          {spotsError || 'Try adjusting your filters or search in a different area'}
        </Text>
        <TouchableOpacity style={styles.emptyButton} onPress={resetFilters}>
          <Text style={styles.emptyButtonText}>Reset Filters</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.bg} />

      {/* Search panel — header, field, vehicle pills, dropdown pills */}
      <View style={styles.searchPanel}>
        {renderHeader()}
        {renderSearchField()}
        {renderVehiclePills()}
        {renderDropdownPills()}
      </View>

      {renderMap()}

      {/* Bottom sheet — results list */}
      <Animated.View
        style={[
          styles.bottomSheet,
          {
            transform: [{
              translateY: sheetAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [80, 0],
              }),
            }],
          },
        ]}
      >
        <View style={styles.sheetHandleWrap}>
          <View style={styles.sheetHandle} />
        </View>

        <FlatList
          data={filteredResults}
          renderItem={renderResultCard}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={renderSheetHeader}
          ListEmptyComponent={renderEmptyState}
        />
      </Animated.View>

      {renderDropdownSheet()}
      {renderFilterModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },

  // ─── Search panel ──────────────────────────────────────────────────────────
  searchPanel: {
    backgroundColor: palette.bg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
  },
  wordmark: {
    fontFamily: fontStacks.medium,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: palette.text,
  },
  filtersPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
  },
  filtersPillText: {
    fontFamily: fontStacks.medium,
    fontSize: 13,
    fontWeight: '500',
    color: palette.text,
  },
  filterBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    fontFamily: fontStacks.medium,
    fontSize: 10,
    fontWeight: '700',
    color: palette.textInverse,
  },

  // Search field
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 56,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: palette.surface,
    marginTop: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: fontStacks.regular,
    fontSize: 16,
    color: palette.text,
    padding: 0,
  },

  // Vehicle pills
  vehicleRow: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingRight: spacing.lg,
  },
  vehiclePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: palette.surface,
  },
  vehiclePillActive: {
    backgroundColor: palette.accent,
  },
  vehiclePillText: {
    fontFamily: fontStacks.medium,
    fontSize: 15,
    fontWeight: '500',
    color: palette.text,
  },
  vehiclePillTextActive: {
    color: palette.textInverse,
  },

  // Dropdown pills
  dropdownRow: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  dropdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: palette.surface,
  },
  dropdownPillActive: {
    borderWidth: 1,
    borderColor: palette.primary,
  },
  dropdownPillText: {
    fontFamily: fontStacks.regular,
    fontSize: 15,
    color: palette.text,
  },
  dropdownPillTextActive: {
    fontFamily: fontStacks.medium,
    fontWeight: '500',
    color: palette.primary,
  },

  // ─── Dropdown sheet ────────────────────────────────────────────────────────
  dropdownOverlay: {
    // Absolutely positioned rather than flex:1 — no longer inside a
    // <Modal>, which does not present on this build.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 24,
    backgroundColor: 'rgba(26,26,46,0.35)',
    justifyContent: 'flex-end',
  },
  dropdownSheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  dropdownSheetTitle: {
    fontFamily: fontStacks.medium,
    fontSize: 18,
    fontWeight: '500',
    color: palette.text,
    marginBottom: spacing.md,
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: palette.bgSoft,
  },
  dropdownOptionText: {
    fontFamily: fontStacks.regular,
    fontSize: 16,
    color: palette.text,
  },
  dropdownOptionTextActive: {
    fontFamily: fontStacks.medium,
    fontWeight: '500',
    color: palette.primary,
  },

  // ─── Map ───────────────────────────────────────────────────────────────────
  mapContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: palette.bgSoft,
  },
  map: {
    flex: 1,
  },
  mapLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: palette.bgSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Price pin — rounded label plus a triangular tail
  markerWrap: {
    alignItems: 'center',
  },
  mapMarker: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.xs,
    backgroundColor: palette.primary,
  },
  mapMarkerSelected: {
    backgroundColor: palette.accent,
  },
  mapMarkerUnavailable: {
    backgroundColor: palette.textSubtle,
  },
  mapMarkerText: {
    fontFamily: fontStacks.medium,
    fontSize: 13,
    fontWeight: '700',
    color: palette.textInverse,
  },
  markerTail: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: palette.primary,
  },
  markerTailSelected: {
    borderTopColor: palette.accent,
  },
  markerTailUnavailable: {
    borderTopColor: palette.textSubtle,
  },

  // Map controls
  mapControlsContainer: {
    position: 'absolute',
    right: spacing.lg,
    top: spacing.lg,
    gap: spacing.md,
  },
  mapControlButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  searchAreaButton: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: palette.surface,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  searchAreaText: {
    fontFamily: fontStacks.medium,
    fontSize: 15,
    fontWeight: '500',
    color: palette.primary,
  },

  // ─── Bottom sheet ──────────────────────────────────────────────────────────
  bottomSheet: {
    height: height * 0.46,
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 10,
  },
  sheetHandleWrap: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  sheetHandle: {
    width: 56,
    height: 5,
    borderRadius: radii.pill,
    backgroundColor: palette.bgSoft,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  sheetCount: {
    flex: 1,
    fontFamily: fontStacks.medium,
    fontSize: 17,
    fontWeight: '500',
    color: palette.text,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sortLabel: {
    fontFamily: fontStacks.regular,
    fontSize: 14,
    color: palette.textMuted,
  },
  sortValue: {
    fontFamily: fontStacks.medium,
    fontSize: 14,
    fontWeight: '500',
    color: palette.text,
    marginRight: spacing.xs,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },

  // ─── Result card ───────────────────────────────────────────────────────────
  resultCard: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.bgSoft,
  },
  resultThumbWrap: {
    position: 'relative',
  },
  resultThumb: {
    width: 96,
    height: 96,
    borderRadius: radii.sm,
    backgroundColor: palette.bgSoft,
  },
  resultThumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  favouriteButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(26,26,46,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultBody: {
    flex: 1,
    paddingLeft: spacing.md,
    justifyContent: 'center',
  },
  resultName: {
    fontFamily: fontStacks.medium,
    fontSize: 16,
    fontWeight: '500',
    color: palette.text,
  },
  resultRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  resultRatingText: {
    fontFamily: fontStacks.medium,
    fontSize: 13,
    fontWeight: '500',
    color: palette.text,
  },
  resultReviewText: {
    fontFamily: fontStacks.regular,
    fontSize: 13,
    color: palette.textMuted,
  },
  resultNewText: {
    fontFamily: fontStacks.medium,
    fontSize: 13,
    fontWeight: '500',
    color: palette.primary,
  },
  resultMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  resultMetaText: {
    fontFamily: fontStacks.regular,
    fontSize: 13,
    color: palette.textMuted,
  },
  resultChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  amenityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.xs,
    backgroundColor: palette.primarySoft,
  },
  amenityChipText: {
    fontFamily: fontStacks.regular,
    fontSize: 11,
    color: palette.primaryDeep,
  },
  resultPriceCol: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingLeft: spacing.sm,
    paddingVertical: spacing.xs,
  },
  resultPrice: {
    fontFamily: fontStacks.medium,
    fontSize: 17,
    fontWeight: '700',
    color: palette.text,
  },

  // ─── Empty state ───────────────────────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  emptyIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: palette.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontFamily: fontStacks.medium,
    fontSize: 18,
    fontWeight: '500',
    color: palette.text,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontFamily: fontStacks.regular,
    fontSize: 14,
    color: palette.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.xxl,
    marginBottom: spacing.xl,
  },
  emptyButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: palette.primary,
  },
  emptyButtonText: {
    fontFamily: fontStacks.medium,
    fontSize: 14,
    fontWeight: '500',
    color: palette.textInverse,
  },

  // ─── Filter modal ──────────────────────────────────────────────────────────
  filterModalOverlay: {
    // Absolutely positioned rather than flex:1 — no longer inside a
    // <Modal>, which does not present on this build.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 24,
    backgroundColor: 'rgba(26,26,46,0.35)',
    justifyContent: 'flex-end',
  },
  filterModal: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    maxHeight: '85%',
  },
  filterModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: palette.bgSoft,
  },
  filterModalTitle: {
    fontFamily: fontStacks.medium,
    fontSize: 20,
    fontWeight: '500',
    color: palette.text,
  },
  filterModalClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterModalContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  filterSection: {
    marginBottom: spacing.xl,
  },
  filterSectionTitle: {
    fontFamily: fontStacks.medium,
    fontSize: 16,
    fontWeight: '500',
    color: palette.text,
    marginBottom: spacing.md,
  },
  filterOptionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  filterOption: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: palette.bg,
  },
  filterOptionActive: {
    backgroundColor: palette.accent,
  },
  filterOptionText: {
    fontFamily: fontStacks.regular,
    fontSize: 14,
    color: palette.text,
  },
  filterOptionTextActive: {
    fontFamily: fontStacks.medium,
    fontWeight: '500',
    color: palette.textInverse,
  },
  filterModalFooter: {
    flexDirection: 'row',
    padding: spacing.xl,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: palette.bgSoft,
  },
  resetButton: {
    flex: 1,
    paddingVertical: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: palette.bg,
    alignItems: 'center',
  },
  resetButtonText: {
    fontFamily: fontStacks.medium,
    fontSize: 15,
    fontWeight: '500',
    color: palette.text,
  },
  applyButton: {
    flex: 2,
    paddingVertical: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: palette.primary,
    alignItems: 'center',
  },
  applyButtonText: {
    fontFamily: fontStacks.medium,
    fontSize: 15,
    fontWeight: '500',
    color: palette.textInverse,
  },
});

export default SearchPage;
