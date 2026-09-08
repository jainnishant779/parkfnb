// PromoCard Component - Card displaying promo details with actions
import React, { memo, useMemo, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Switch,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../../theme/colors';
import { spacing, borderRadius } from '../../../theme/spacing';
import { fontSize, fontWeight } from '../../../theme/typography';
import type { Promo } from '../../../types/promo';
import { derivePromoStatus } from '../../../services/promoStorage';
import {
  formatDiscount,
  formatValidityRange,
  getUsageDisplay,
} from '../../../utils/promoHelpers';
import CodePill from './CodePill';
import PromoStatusBadge from './PromoStatusBadge';

interface PromoCardProps {
  promo: Promo;
  onPress: () => void;
  onToggleEnabled: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onCodeCopied: () => void;
  onViewListings: () => void;
  testID?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function PromoCard({
  promo,
  onPress,
  onToggleEnabled,
  onEdit,
  onDuplicate,
  onDelete,
  onCodeCopied,
  onViewListings,
  testID,
}: PromoCardProps) {
  const theme = useMemo(() => getTheme(false), []);
  const [showMenu, setShowMenu] = useState(false);
  const scale = useSharedValue(1);

  const status = useMemo(() => derivePromoStatus(promo), [promo]);
  const isExpired = status === 'EXPIRED';
  const canToggle = !isExpired;

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.98, { damping: 15, stiffness: 200 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 200 });
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const toggleMenu = useCallback(() => {
    setShowMenu(prev => !prev);
  }, []);

  const handleMenuAction = useCallback((action: () => void) => {
    setShowMenu(false);
    action();
  }, []);

  const listingsCount = promo.applyToAllListings
    ? 'All listings'
    : `${promo.applicableListingIds.length} listing${promo.applicableListingIds.length !== 1 ? 's' : ''}`;

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.container,
        { backgroundColor: theme.surface },
        animatedStyle,
      ]}
      accessibilityLabel={`${promo.name} promotion`}
      accessibilityRole="button"
      testID={testID}
    >
      {/* Header Row */}
      <View style={styles.headerRow}>
        {/* Type Badge */}
        <View
          style={[
            styles.typeBadge,
            { backgroundColor: promo.type === 'PERCENT' ? theme.primaryLight : theme.successLight },
          ]}
        >
          <Text
            style={[
              styles.typeBadgeText,
              { color: promo.type === 'PERCENT' ? theme.primary : theme.success },
            ]}
          >
            {promo.type === 'PERCENT' ? '%' : '₹'}
          </Text>
        </View>

        {/* Title & Status */}
        <View style={styles.titleContainer}>
          <Text
            style={[styles.title, { color: theme.text }]}
            numberOfLines={2}
          >
            {promo.name}
          </Text>
          <PromoStatusBadge status={status} size="small" />
        </View>

        {/* Toggle */}
        <Switch
          value={promo.enabled}
          onValueChange={onToggleEnabled}
          disabled={!canToggle}
          trackColor={{
            false: theme.borderLight,
            true: theme.primaryLight,
          }}
          thumbColor={promo.enabled ? theme.primary : theme.textMuted}
          accessibilityLabel={`${promo.enabled ? 'Disable' : 'Enable'} promotion`}
          accessibilityState={{ checked: promo.enabled, disabled: !canToggle }}
          testID={testID ? `${testID}-toggle` : undefined}
        />

        {/* Menu Button */}
        <Pressable
          onPress={toggleMenu}
          style={styles.menuButtonInline}
          accessibilityLabel="More options"
          accessibilityRole="button"
          testID={testID ? `${testID}-menu` : undefined}
        >
          <Ionicons
            name="ellipsis-vertical"
            size={18}
            color={theme.textMuted}
          />
        </Pressable>
      </View>

      {/* Code Row */}
      <View style={styles.codeRow}>
        <CodePill
          code={promo.code}
          onCopy={onCodeCopied}
          size="small"
          testID={testID ? `${testID}-code` : undefined}
        />
        <Text style={[styles.discountText, { color: theme.text }]}>
          {formatDiscount(promo.type, promo.value, promo.currency)}
        </Text>
      </View>

      {/* Details Row */}
      <View style={styles.detailsRow}>
        {/* Validity */}
        <View style={styles.detailItem}>
          <Ionicons
            name="calendar-outline"
            size={14}
            color={theme.textMuted}
          />
          <Text
            style={[styles.detailText, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {formatValidityRange(promo.startAt, promo.endAt)}
          </Text>
        </View>

        {/* Usage */}
        <View style={styles.detailItem}>
          <Ionicons
            name="people-outline"
            size={14}
            color={theme.textMuted}
          />
          <Text
            style={[styles.detailText, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {getUsageDisplay(promo.usage)}
          </Text>
        </View>
      </View>

      {/* Listings Row */}
      <Pressable
        onPress={onViewListings}
        style={styles.listingsRow}
        accessibilityLabel={`View applicable listings: ${listingsCount}`}
      >
        <Ionicons
          name="location-outline"
          size={14}
          color={theme.textMuted}
        />
        <Text style={[styles.listingsText, { color: theme.primary }]}>
          Applies to: {listingsCount}
        </Text>
        <Ionicons
          name="chevron-forward"
          size={14}
          color={theme.primary}
        />
      </Pressable>

      {/* Dropdown Menu */}
      {showMenu && (
        <Pressable
          style={[styles.menuOverlay]}
          onPress={() => setShowMenu(false)}
        >
          <View
            style={[
              styles.menuDropdown,
              { backgroundColor: theme.surface },
            ]}
          >
            <Pressable
              onPress={() => handleMenuAction(onEdit)}
              style={styles.menuItem}
              accessibilityLabel="Edit promotion"
            >
              <Ionicons name="create-outline" size={18} color={theme.text} />
              <Text style={[styles.menuItemText, { color: theme.text }]}>
                Edit
              </Text>
            </Pressable>
            <Pressable
              onPress={() => handleMenuAction(onDuplicate)}
              style={styles.menuItem}
              accessibilityLabel="Duplicate promotion"
            >
              <Ionicons name="copy-outline" size={18} color={theme.text} />
              <Text style={[styles.menuItemText, { color: theme.text }]}>
                Duplicate
              </Text>
            </Pressable>
            <View style={[styles.menuDivider, { backgroundColor: theme.border }]} />
            <Pressable
              onPress={() => handleMenuAction(onDelete)}
              style={styles.menuItem}
              accessibilityLabel="Delete promotion"
            >
              <Ionicons name="trash-outline" size={18} color={theme.danger} />
              <Text style={[styles.menuItemText, { color: theme.danger }]}>
                Delete
              </Text>
            </Pressable>
          </View>
        </Pressable>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    marginHorizontal: spacing[4],
    marginBottom: spacing[3],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginBottom: spacing[3],
  },
  typeBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeBadgeText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold as any,
  },
  titleContainer: {
    flex: 1,
    gap: spacing[1],
  },
  title: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  menuButtonInline: {
    padding: spacing[2],
    marginLeft: spacing[1],
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[3],
  },
  discountText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold as any,
  },
  detailsRow: {
    flexDirection: 'row',
    gap: spacing[4],
    marginBottom: spacing[2],
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  detailText: {
    fontSize: fontSize.xs,
  },
  listingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingTop: spacing[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  listingsText: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },
  menuOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 10,
  },
  menuDropdown: {
    position: 'absolute',
    top: spacing[8],
    right: spacing[3],
    minWidth: 140,
    borderRadius: borderRadius.lg,
    padding: spacing[1],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
  },
  menuItemText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing[2],
  },
});

export default memo(PromoCard);
