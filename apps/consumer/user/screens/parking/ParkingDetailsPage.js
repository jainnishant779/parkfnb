import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Linking,
  Platform,
  Image,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { palette, radii, spacing, fonts, shadow } from '../../theme';
import {
  PillButton,
  IconCircle,
  SectionTitle,
  StatusTag,
  InfoGrid,
  IsoBlock,
} from '../../components/ui';
import { resolveImageUri } from '../../utils/imageUri';

// Amenities worth surfacing on top of the hero image. Only the ones the
// listing actually declares are rendered — no filler pills.
const HERO_AMENITIES = [
  { id: 'cctv', label: 'CCTV', icon: 'cctv' },
  { id: 'security', label: 'Guarded', icon: 'shield-check' },
  { id: 'covered', label: 'Covered', icon: 'home-roof' },
  { id: 'ev_charging', label: 'EV Friendly', icon: 'ev-station' },
];

export const SPACE_TYPE_ICONS = {
  garage: 'garage',
  covered: 'home-roof',
  outdoor: 'weather-sunny',
  driveway: 'road',
  carport: 'car-side',
  street: 'road-variant',
};
export const SPACE_TYPE_LABELS = {
  garage: 'Garage',
  covered: 'Covered',
  outdoor: 'Outdoor',
  driveway: 'Driveway',
  carport: 'Carport',
  street: 'Street',
};

// "Suitable for" pills. Keys are the backend's allowed_vehicle_types enum
// (ParkingSpace model); anything unknown still renders with a generic icon.
const VEHICLE_TYPE_META = {
  car: { icon: 'car-side', label: 'Car' },
  suv: { icon: 'car-estate', label: 'SUV' },
  van: { icon: 'van-utility', label: 'Van' },
  truck: { icon: 'truck', label: 'Truck' },
  motorcycle: { icon: 'motorbike', label: 'Motorbike' },
  bicycle: { icon: 'bicycle', label: 'Bicycle' },
  rv: { icon: 'rv-truck', label: 'RV' },
  trailer: { icon: 'truck-trailer', label: 'Trailer' },
};
const vehicleMeta = (type) => {
  const key = String(type || '').toLowerCase();
  return VEHICLE_TYPE_META[key] || {
    icon: 'car-info',
    label: key ? key.charAt(0).toUpperCase() + key.slice(1) : '',
  };
};

const ParkingDetailsPage = ({ navigation, route }) => {
  const { parkingData } = route.params || {};
  const scrollViewRef = useRef(null);
  // targetSdk 36 draws edge-to-edge, so the sticky bar has to clear the
  // system nav bar itself or its text slides underneath it.
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom;

  // Property mode: parkingData.spaces[] was passed from grouped homepage
  const isPropertyMode = Array.isArray(parkingData?.spaces) && parkingData.spaces.length > 0;
  const [selectedSpace, setSelectedSpace] = useState(
    isPropertyMode && parkingData.spaces.length === 1 ? parkingData.spaces[0] : null
  );

  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

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
   * It is handed to BookingSchedule, whose quote effect depends on it —
   * rebuilt inline on every render it made that effect re-run in a loop,
   * firing a debounced POST /api/bookings/quote each pass.
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

    // Vehicle types are shown as their own "Suitable for" pills below.

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
  }, [selectedSpace, parking.spaceType, parking.spots]);

  /**
   * "Suitable for" — the vehicle types this listing accepts. The chosen
   * space's own list wins; before a space is picked it is the lot's union
   * (HomePage/SearchPage put that on parkingData.allowedVehicleTypes).
   * Nothing is invented: no list, no section.
   */
  const suitableVehicles = useMemo(() => {
    const list = selectedSpace?.allowedVehicleTypes
      ?? parking.allowedVehicleTypes
      ?? (isPropertyMode ? parkingData.spaces.flatMap((s) => s.allowedVehicleTypes || []) : []);
    const seen = new Set();
    return (Array.isArray(list) ? list : [])
      .map((t) => String(t || '').toLowerCase())
      .filter((t) => t && !seen.has(t) && seen.add(t))
      .map((t) => ({ id: t, ...vehicleMeta(t) }));
  }, [selectedSpace, parking.allowedVehicleTypes, isPropertyMode, parkingData]);

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
    ...propertyInfo.map((cell) => ({ label: cell.label, value: cell.value })),
  ].filter(Boolean);

  // The date/time/price/payment step lives on its own screen now.
  const needsSpace = isPropertyMode && !selectedSpace;
  const goToSchedule = () => {
    if (needsSpace) return;
    navigation.navigate('BookingSchedule', {
      parkingData,
      parking,
      selectedSpace,
      isPropertyMode,
    });
  };

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

          {suitableVehicles.length > 0 && (
            <>
              <Text style={styles.cardSubTitle}>Suitable for</Text>
              <View style={styles.amenitiesWrap}>
                {suitableVehicles.map((v) => (
                  <View key={v.id} style={styles.amenityPill}>
                    <MaterialIcon name={v.icon} size={17} color={palette.text} />
                    <Text style={styles.amenityLabel}>{v.label}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

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
              const fg = palette.text;
              const muted = palette.textMuted;

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
                  disabled={isFullyBooked}
                  activeOpacity={0.85}
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
                        <StatusTag label="EV" tone="success" style={styles.spaceTag} />
                      )}
                      {space.bookingMode === 'request' && (
                        <StatusTag label="On request" tone="warning" style={styles.spaceTag} />
                      )}
                    </View>
                    {(space.allowedVehicleTypes || []).length > 0 && (
                      <View style={styles.spaceVehicleRow}>
                        {(space.allowedVehicleTypes || []).slice(0, 4).map((t) => {
                          const m = vehicleMeta(t);
                          return (
                            <View key={t} style={styles.spaceVehiclePill}>
                              <MaterialIcon name={m.icon} size={13} color={muted} />
                              <Text style={[styles.spaceVehicleTypes, { color: muted }]}>{m.label}</Text>
                            </View>
                          );
                        })}
                        {(space.allowedVehicleTypes || []).length > 4 ? (
                          <Text style={[styles.spaceVehicleTypes, { color: muted }]}>
                            +{space.allowedVehicleTypes.length - 4}
                          </Text>
                        ) : null}
                      </View>
                    )}
                  </View>
                  <View style={[styles.spaceRadio, isSelected && styles.spaceRadioOn]}>
                    {isSelected ? <Icon name="check" size={14} color={palette.textInverse} /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

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
        <View style={{ height: 130 + bottomInset }} />
      </ScrollView>

      {/* Bottom bar — the booking itself continues on BookingSchedule */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(16, bottomInset + 10) }]}>
        <View style={styles.bottomBarMain}>
          <View style={styles.bottomPriceContainer}>
            <Text style={styles.bottomPriceLabel}>{needsSpace ? 'From' : 'Price'}</Text>
            <Text style={styles.bottomPriceValue} numberOfLines={1}>
              {headlinePrice}
              <Text style={styles.bottomPriceUnit}>/hr</Text>
            </Text>
          </View>
          <PillButton
            label={needsSpace ? 'Select a spot' : 'Select date & time'}
            iconRight={needsSpace ? undefined : 'arrow-right'}
            variant="ink"
            onPress={goToSchedule}
            disabled={needsSpace}
            style={styles.bookButton}
          />
        </View>
      </View>
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

  // Space selector
  spaceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: palette.surface,
  },
  // Selection is a border only — every card stays fully visible.
  spaceCardSelected: { borderColor: palette.ink },
  // Fully booked: greyed surface, but never faded out.
  spaceCardDisabled: { backgroundColor: palette.bgSoft, borderColor: palette.bgSoft },
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
  spaceVehicleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 6 },
  spaceVehiclePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.fill,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    height: 24,
    marginRight: 6,
    marginBottom: 4,
  },
  spaceVehicleTypes: { ...fonts.semibold, fontSize: 11.5, marginLeft: 4 },
  spaceRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: palette.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spaceRadioOn: { backgroundColor: palette.ink, borderColor: palette.ink },

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

  // Cancellation note
  cancellationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.peachWash,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cancellationText: { ...fonts.medium, flex: 1, fontSize: 12.5, color: palette.text, marginLeft: 8 },

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
  bottomPriceValue: { ...fonts.bold, fontSize: 24, letterSpacing: -0.6, color: palette.text },
  bottomPriceUnit: { ...fonts.medium, fontSize: 13, letterSpacing: 0, color: palette.textMuted },
  bookButton: { minWidth: 180 },
});

export default ParkingDetailsPage;
