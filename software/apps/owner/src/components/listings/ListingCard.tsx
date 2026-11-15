import React, { memo, useMemo, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  Switch,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../theme/colors';
import { palette, radii, fonts, shadow } from '../../theme/kit';
import type { FullListing, ListingStatus, VehicleType } from '../../types/models';

// Status configuration
const STATUS_CONFIG: Record<ListingStatus, { label: string; color: string; bgColor: string }> = {
  ACTIVE: { label: 'Active', color: palette.textInverse, bgColor: palette.ink },
  PAUSED: { label: 'Paused', color: palette.warning, bgColor: palette.warningSoft },
  DRAFT: { label: 'Draft', color: palette.textMuted, bgColor: palette.fill },
  PENDING: { label: 'Pending', color: palette.text, bgColor: palette.blueSoft },
};

// Vehicle type icons
const VEHICLE_ICONS: Record<VehicleType, string> = {
  CAR: 'car-outline',
  BIKE: 'bicycle-outline',
  TRUCK: 'bus-outline',
  VAN: 'car-sport-outline',
};

// Animation config
const SPRING_CONFIG = {
  damping: 15,
  stiffness: 150,
};

export interface ListingCardProps {
  listing: FullListing;
  onPress: (listing: FullListing) => void;
  onToggleStatus: (listing: FullListing) => void;
  onMenuPress: (listing: FullListing) => void;
  testID?: string;
}

function ListingCard({
  listing,
  onPress,
  onToggleStatus,
  onMenuPress,
  testID,
}: ListingCardProps) {
  // Force light mode
  const theme = useMemo(() => getTheme(false), []);

  // Press animation
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.98, SPRING_CONFIG);
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, SPRING_CONFIG);
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Status config
  const statusConfig = STATUS_CONFIG[listing.status];
  const canToggle = listing.isVerifiedEligible &&
    (listing.status === 'ACTIVE' || listing.status === 'PAUSED');

  // Format price
  const priceText = `₹${listing.pricePerHour}/hr`;
  const dailyPriceText = listing.pricePerDay ? `₹${listing.pricePerDay}/day` : null;

  // Format earnings
  const earningsText = listing.totalEarnings > 0
    ? `₹${listing.totalEarnings.toLocaleString('en-IN')}`
    : '₹0';

  // Format location
  const locationText = `${listing.locationArea}, ${listing.locationCity}`;

  // Format time ago
  const timeAgo = useMemo(() => {
    const diff = Date.now() - listing.updatedAt;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }, [listing.updatedAt]);

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={() => onPress(listing)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.container, { backgroundColor: theme.surface }]}
        testID={testID}
      >
        {/* Top Row: Thumbnail + Info */}
        <View style={styles.topRow}>
          {/* Thumbnail Placeholder */}
          <View style={[styles.thumbnail, { backgroundColor: palette.peachSoft }]}>
            {listing.thumbnail ? (
              <Ionicons name="image" size={30} color={palette.peachDeep} />
            ) : (
              <Ionicons name="car" size={32} color={palette.peachDeep} />
            )}
          </View>

          {/* Main Info */}
          <View style={styles.mainInfo}>
            {/* Title Row */}
            <View style={styles.titleRow}>
              <Text
                style={[styles.title, { color: theme.text }]}
                numberOfLines={1}
              >
                {listing.title}
              </Text>
              {/* Menu Button */}
              <TouchableOpacity
                onPress={() => onMenuPress(listing)}
                style={styles.menuButton}
                activeOpacity={0.7}
                hitSlop={8}
              >
                <Ionicons name="ellipsis-horizontal" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>

            {/* Location */}
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={14} color={theme.textSecondary} />
              <Text
                style={[styles.location, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                {locationText}
              </Text>
            </View>

            {/* Status Badge + Time */}
            <View style={styles.statusRow}>
              <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
                <View style={[styles.statusDot, { backgroundColor: statusConfig.color }]} />
                <Text style={[styles.statusText, { color: statusConfig.color }]}>
                  {statusConfig.label}
                </Text>
              </View>
              <Text style={[styles.timeText, { color: theme.textMuted }]}>
                {timeAgo}
              </Text>
            </View>
          </View>
        </View>

        {/* Middle Row: Stats */}
        <View style={styles.statsRow}>
          {/* Price */}
          <View style={styles.stat}>
            <Text style={[styles.statLabel, { color: theme.textMuted }]}>Price</Text>
            <Text style={[styles.statValue, { color: theme.text }]}>{priceText}</Text>
            {dailyPriceText && (
              <Text style={[styles.statSubvalue, { color: theme.textSecondary }]}>
                {dailyPriceText}
              </Text>
            )}
          </View>

          {/* Earnings */}
          <View style={styles.stat}>
            <Text style={[styles.statLabel, { color: theme.textMuted }]}>Earnings</Text>
            <Text style={[styles.statValue, { color: theme.text }]}>{earningsText}</Text>
          </View>

          {/* Bookings */}
          <View style={styles.stat}>
            <Text style={[styles.statLabel, { color: theme.textMuted }]}>Bookings</Text>
            <Text style={[styles.statValue, { color: theme.text }]}>{listing.totalBookings}</Text>
          </View>

          {/* Rating */}
          {listing.rating && (
            <View style={styles.stat}>
              <Text style={[styles.statLabel, { color: theme.textMuted }]}>Rating</Text>
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={14} color={palette.peachDeep} />
                <Text style={[styles.statValue, { color: theme.text, marginLeft: 2 }]}>
                  {listing.rating.toFixed(1)}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Bottom Row: Vehicle Types + Toggle */}
        <View style={styles.bottomRow}>
          {/* Vehicle Types */}
          <View style={styles.vehicleTypes}>
            {listing.vehicleTypes.map((type) => (
              <View
                key={type}
                style={[styles.vehicleChip, { backgroundColor: palette.fill }]}
              >
                <Ionicons name={VEHICLE_ICONS[type]} size={15} color={theme.text} />
              </View>
            ))}
            <Text style={[styles.capacityText, { color: theme.textMuted }]}>
              {listing.capacity} spots
            </Text>
          </View>

          {/* Toggle Switch (only for eligible listings) */}
          {canToggle && (
            <View style={styles.toggleContainer}>
              <Text style={[styles.toggleLabel, { color: theme.textSecondary }]}>
                {listing.status === 'ACTIVE' ? 'Live' : 'Paused'}
              </Text>
              <Switch
                value={listing.status === 'ACTIVE'}
                onValueChange={() => onToggleStatus(listing)}
                trackColor={{ false: palette.line, true: palette.ink }}
                thumbColor={palette.surface}
                ios_backgroundColor={palette.line}
                style={styles.switch}
              />
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.xl,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    ...shadow.soft,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: radii.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  mainInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...fonts.semibold,
    fontSize: 17,
    letterSpacing: -0.2,
    flex: 1,
    marginRight: 8,
  },
  menuButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  location: {
    ...fonts.medium,
    fontSize: 13,
    marginLeft: 4,
    flex: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  statusText: {
    ...fonts.semibold,
    fontSize: 11,
  },
  timeText: {
    ...fonts.medium,
    fontSize: 12,
    marginLeft: 8,
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: radii.lg,
    backgroundColor: palette.surfaceDim,
  },
  stat: {
    alignItems: 'center',
    minWidth: 60,
  },
  statLabel: {
    ...fonts.medium,
    fontSize: 11.5,
    marginBottom: 3,
  },
  statValue: {
    ...fonts.bold,
    fontSize: 15,
    letterSpacing: -0.2,
  },
  statSubvalue: {
    ...fonts.medium,
    fontSize: 11.5,
    marginTop: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  vehicleTypes: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vehicleChip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  capacityText: {
    ...fonts.medium,
    fontSize: 12.5,
    marginLeft: 4,
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleLabel: {
    ...fonts.semibold,
    fontSize: 12.5,
    marginRight: 6,
  },
  switch: {
    transform: [{ scale: 0.8 }],
  },
});

export default memo(ListingCard);
