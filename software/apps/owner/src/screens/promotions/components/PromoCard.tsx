// PromoCard Component - Card displaying promo details with actions
import React, { memo, useMemo, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Switch,
  TouchableOpacity,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { palette, radii, fonts } from '../../../theme/kit';
import { IsoBlock } from '../../../components/ui';
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
  /** Feature-card tint; the list alternates peach / blue. */
  tone?: 'peach' | 'blue';
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
  tone = 'peach',
  testID,
}: PromoCardProps) {
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
        { backgroundColor: tone === 'blue' ? palette.blueSoft : palette.peachSoft },
        isExpired && styles.containerMuted,
        animatedStyle,
      ]}
      accessibilityLabel={`${promo.name} promotion`}
      accessibilityRole="button"
      testID={testID}
    >
      {/* Illustration */}
      <View style={styles.art} pointerEvents="none">
        <IsoBlock size={130} tone={isExpired ? 'grey' : tone} />
      </View>

      {/* Top Row: status + toggle + menu */}
      <View style={styles.topRow}>
        <PromoStatusBadge status={status} size="small" />
        <View style={styles.topActions}>
          <Switch
            value={promo.enabled}
            onValueChange={onToggleEnabled}
            disabled={!canToggle}
            trackColor={{ false: 'rgba(255,255,255,0.8)', true: palette.ink }}
            thumbColor={palette.surface}
            ios_backgroundColor="rgba(255,255,255,0.8)"
            accessibilityLabel={`${promo.enabled ? 'Disable' : 'Enable'} promotion`}
            accessibilityState={{ checked: promo.enabled, disabled: !canToggle }}
            testID={testID ? `${testID}-toggle` : undefined}
          />
          <TouchableOpacity
            onPress={toggleMenu}
            activeOpacity={0.7}
            style={styles.menuButton}
            accessibilityLabel="More options"
            accessibilityRole="button"
            testID={testID ? `${testID}-menu` : undefined}
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={palette.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Body */}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {promo.name}
        </Text>
        <Text style={styles.discountText}>
          {formatDiscount(promo.type, promo.value, promo.currency)}
        </Text>

        <CodePill
          code={promo.code}
          onCopy={onCodeCopied}
          size="small"
          testID={testID ? `${testID}-code` : undefined}
        />

        {/* Details */}
        <View style={styles.detailsRow}>
          <View style={styles.detailCol}>
            <Text style={styles.detailTitle} numberOfLines={1}>
              {formatValidityRange(promo.startAt, promo.endAt)}
            </Text>
            <Text style={styles.detailSub}>Validity</Text>
          </View>
          <View style={styles.detailCol}>
            <Text style={styles.detailTitle} numberOfLines={1}>
              {getUsageDisplay(promo.usage)}
            </Text>
            <Text style={styles.detailSub}>Usage</Text>
          </View>
        </View>

        {/* Listings */}
        <TouchableOpacity
          onPress={onViewListings}
          activeOpacity={0.7}
          style={styles.listingsRow}
          accessibilityLabel={`View applicable listings: ${listingsCount}`}
        >
          <Text style={styles.listingsText}>Applies to {listingsCount}</Text>
          <Ionicons name="chevron-forward" size={14} color={palette.text} />
        </TouchableOpacity>
      </View>

      {/* Dropdown Menu */}
      {showMenu && (
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setShowMenu(false)}
        >
          <View style={styles.menuDropdown}>
            <TouchableOpacity
              onPress={() => handleMenuAction(onEdit)}
              activeOpacity={0.7}
              style={styles.menuItem}
              accessibilityLabel="Edit promotion"
            >
              <Ionicons name="create-outline" size={18} color={palette.text} />
              <Text style={styles.menuItemText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleMenuAction(onDuplicate)}
              activeOpacity={0.7}
              style={styles.menuItem}
              accessibilityLabel="Duplicate promotion"
            >
              <Ionicons name="copy-outline" size={18} color={palette.text} />
              <Text style={styles.menuItemText}>Duplicate</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity
              onPress={() => handleMenuAction(onDelete)}
              activeOpacity={0.7}
              style={styles.menuItem}
              accessibilityLabel="Delete promotion"
            >
              <Ionicons name="trash-outline" size={18} color={palette.danger} />
              <Text style={[styles.menuItemText, styles.menuItemDanger]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.xl,
    padding: 18,
    marginHorizontal: 16,
    marginBottom: 12,
    minHeight: 200,
    overflow: 'hidden',
  },
  containerMuted: {
    backgroundColor: palette.fill,
  },
  art: {
    position: 'absolute',
    right: -30,
    bottom: -26,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    width: '68%',
    marginTop: 12,
  },
  title: {
    ...fonts.semibold,
    fontSize: 22,
    lineHeight: 27,
    letterSpacing: -0.4,
    color: palette.text,
  },
  discountText: {
    ...fonts.semibold,
    fontSize: 30,
    letterSpacing: -0.8,
    color: palette.text,
    marginTop: 2,
    marginBottom: 10,
  },
  detailsRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 14,
  },
  detailCol: {
    flexShrink: 1,
  },
  detailTitle: {
    ...fonts.semibold,
    fontSize: 13,
    color: palette.text,
  },
  detailSub: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textMuted,
    marginTop: 2,
  },
  listingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    marginTop: 12,
  },
  listingsText: {
    ...fonts.semibold,
    fontSize: 13,
    color: palette.text,
    textDecorationLine: 'underline',
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
    top: 58,
    right: 14,
    minWidth: 160,
    borderRadius: radii.lg,
    padding: 6,
    backgroundColor: palette.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
  },
  menuItemText: {
    ...fonts.semibold,
    fontSize: 14,
    color: palette.text,
  },
  menuItemDanger: {
    color: palette.danger,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.line,
    marginHorizontal: 8,
  },
});

export default memo(PromoCard);
