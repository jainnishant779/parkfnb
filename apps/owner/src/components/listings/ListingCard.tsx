import React, { memo, useMemo, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Switch,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import type { FullListing, ListingStatus, VehicleType } from '../../types/models';

// Status configuration
const STATUS_CONFIG: Record<ListingStatus, { label: string; color: string; bgColor: string }> = {
  ACTIVE: { label: 'Active', color: '#059669', bgColor: '#ECFDF5' },
  PAUSED: { label: 'Paused', color: '#D97706', bgColor: '#FFFBEB' },
  DRAFT: { label: 'Draft', color: '#6B7280', bgColor: '#F3F4F6' },
  PENDING: { label: 'Pending', color: '#0D7377', bgColor: '#E8F5F4' },
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
          <View style={[styles.thumbnail, { backgroundColor: theme.borderLight }]}>
            {listing.thumbnail ? (
              <Ionicons name="image" size={32} color={theme.textMuted} />
            ) : (
              <Ionicons name="car" size={32} color={theme.textMuted} />
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
              <Pressable
                onPress={() => onMenuPress(listing)}
                style={styles.menuButton}
                hitSlop={8}
              >
                <Ionicons name="ellipsis-vertical" size={20} color={theme.textMuted} />
              </Pressable>
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

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: theme.borderLight }]} />

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
            <Text style={[styles.statValue, { color: theme.success }]}>{earningsText}</Text>
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
                <Ionicons name="star" size={14} color="#F59E0B" />
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
                style={[styles.vehicleChip, { backgroundColor: theme.borderLight }]}
              >
                <Ionicons name={VEHICLE_ICONS[type]} size={14} color={theme.textSecondary} />
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
                trackColor={{ false: theme.border, true: theme.primaryLight }}
                thumbColor={listing.status === 'ACTIVE' ? theme.primary : theme.textMuted}
                ios_backgroundColor={theme.border}
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
    borderRadius: borderRadius.xl,
    marginHorizontal: spacing[4],
    marginBottom: spacing[3],
    padding: spacing[4],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing[3],
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
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
    flex: 1,
    marginRight: spacing[2],
  },
  menuButton: {
    padding: spacing[1],
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing[1],
  },
  location: {
    fontSize: fontSize.sm,
    marginLeft: spacing[1],
    flex: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing[2],
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing[1],
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },
  timeText: {
    fontSize: fontSize.xs,
    marginLeft: spacing[2],
  },
  divider: {
    height: 1,
    marginVertical: spacing[3],
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stat: {
    alignItems: 'center',
    minWidth: 60,
  },
  statLabel: {
    fontSize: fontSize.xs,
    marginBottom: spacing[1],
  },
  statValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
  },
  statSubvalue: {
    fontSize: fontSize.xs,
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
    marginTop: spacing[3],
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
  },
  vehicleTypes: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vehicleChip: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing[1],
  },
  capacityText: {
    fontSize: fontSize.xs,
    marginLeft: spacing[1],
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleLabel: {
    fontSize: fontSize.xs,
    marginRight: spacing[2],
  },
  switch: {
    transform: [{ scale: 0.8 }],
  },
});

export default memo(ListingCard);
