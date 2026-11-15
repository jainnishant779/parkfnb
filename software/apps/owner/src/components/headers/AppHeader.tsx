import React, { memo, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../theme/colors';
import { palette, radii, fonts, shadow } from '../../theme/kit';
import HeaderAction, { HeaderIconName } from './HeaderAction';
import StatusPill, { StatusPillVariant } from './StatusPill';

// Types
export type HeaderVariant = 'standard' | 'large' | 'search' | 'brand';

/** One stat tile in the `brand` variant's stat row. */
export interface HeaderStat {
  icon: string;
  value: string;
  label: string;
  color: 'primary' | 'success' | 'warning' | 'danger';
  onPress?: () => void;
}

export interface HeaderLeftAction {
  icon: 'back' | 'menu' | 'close';
  label: string;
  onPress: () => void;
  showBackground?: boolean;
}

export interface HeaderRightAction {
  icon: HeaderIconName;
  label: string;
  onPress: () => void;
  badgeCount?: number;
  showDot?: boolean;
  variant?: 'default' | 'primary' | 'danger';
  size?: 'small' | 'medium' | 'large';
}

export interface AppHeaderProps {
  variant?: HeaderVariant;
  title: string;
  subtitle?: string;
  leftAction?: HeaderLeftAction;
  rightActions?: HeaderRightAction[];
  status?: StatusPillVariant;
  showDivider?: boolean;
  elevated?: boolean;
  compact?: boolean;
  isScrolled?: boolean;
  // Brand variant specific
  brandTagline?: string;
  stats?: HeaderStat[];
  // Search variant specific
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (text: string) => void;
  onSearchFocus?: () => void;
  onSearchBlur?: () => void;
  // Test IDs
  testID?: string;
}

// The owner app's icon ships amber; it sits beside ink type on the grey canvas.
const BRAND_MARK = require('../../assets/logo-mark.png');

// Height constants
const HEADER_HEIGHT_STANDARD = 56;
const HEADER_HEIGHT_LARGE = 72;
const HEADER_HEIGHT_SEARCH = 56;
const COMPACT_REDUCTION = 8;

// LargeTitleBlock sub-component
interface LargeTitleBlockProps {
  title: string;
  subtitle?: string;
  status?: StatusPillVariant;
  theme: ReturnType<typeof getTheme>;
  compact?: boolean;
}

const LargeTitleBlock = memo(function LargeTitleBlock({
  title,
  subtitle,
  status,
  theme,
  compact,
}: LargeTitleBlockProps) {
  return (
    <View style={styles.largeTitleBlock}>
      <View style={styles.largeTitleRow}>
        <Text
          style={[
            styles.largeTitle,
            { color: theme.text },
            compact && styles.largeTitleCompact,
          ]}
          numberOfLines={1}
          allowFontScaling
          accessibilityRole="header"
        >
          {title}
        </Text>
        {status && (
          <View style={styles.statusPillContainer}>
            <StatusPill status={status} size="small" showIcon={false} />
          </View>
        )}
      </View>
      {subtitle && (
        <Text
          style={[
            styles.largeSubtitle,
            { color: theme.textSecondary },
            compact && styles.largeSubtitleCompact,
          ]}
          numberOfLines={1}
          allowFontScaling
        >
          {subtitle}
        </Text>
      )}
    </View>
  );
});

// BrandLockup sub-component - icon + wordmark + tagline, brand variant only
interface BrandLockupProps {
  tagline?: string;
  theme: ReturnType<typeof getTheme>;
}

const BrandLockup = memo(function BrandLockup({
  tagline,
  theme,
}: BrandLockupProps) {
  return (
    <View style={styles.brandLockup}>
      <Image
        source={BRAND_MARK}
        style={styles.brandMark}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
      <View style={styles.brandWordmarkBlock}>
        <Text
          style={[styles.brandWordmark, { color: theme.text }]}
          numberOfLines={1}
          accessibilityRole="header"
        >
          PARKFNB
        </Text>
        <Text
          style={[styles.brandSubmark, { color: theme.primary }]}
          numberOfLines={1}
        >
          OWNER APP
        </Text>
        {tagline && (
          <Text
            style={[styles.brandTagline, { color: theme.textMuted }]}
            numberOfLines={2}
          >
            {tagline}
          </Text>
        )}
      </View>
    </View>
  );
});

// HeaderStatCard sub-component - one tile in the brand variant's stat row
interface HeaderStatCardProps {
  stat: HeaderStat;
  theme: ReturnType<typeof getTheme>;
  testID?: string;
}

const HeaderStatCard = memo(function HeaderStatCard({
  stat,
  theme,
  testID,
}: HeaderStatCardProps) {
  const accent = stat.color === 'primary' ? palette.text : theme[stat.color];
  // Soft tint behind the icon: peach for primary, the semantic `<token>Light`
  // wash otherwise.
  const accentBg =
    stat.color === 'primary' ? palette.peachSoft : theme[`${stat.color}Light`];

  return (
    <TouchableOpacity
      style={[styles.statCard, { backgroundColor: theme.surface }]}
      activeOpacity={0.85}
      onPress={stat.onPress}
      disabled={!stat.onPress}
      accessibilityRole="button"
      accessibilityLabel={`${stat.label}: ${stat.value}`}
      testID={testID}
    >
      <View style={[styles.statIcon, { backgroundColor: accentBg }]}>
        <Ionicons name={stat.icon} size={16} color={accent} />
      </View>
      <Text
        style={[styles.statValue, { color: theme.text }]}
        numberOfLines={1}
        allowFontScaling
      >
        {stat.value}
      </Text>
      <Text
        style={[styles.statLabel, { color: theme.textMuted }]}
        numberOfLines={2}
        allowFontScaling
      >
        {stat.label}
      </Text>
    </TouchableOpacity>
  );
});

// SearchField sub-component
interface SearchFieldProps {
  placeholder?: string;
  value?: string;
  onChange?: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  theme: ReturnType<typeof getTheme>;
}

const SearchField = memo(function SearchField({
  placeholder = 'Search...',
  value,
  onChange,
  onFocus,
  onBlur,
  theme,
}: SearchFieldProps) {
  return (
    <View
      style={[styles.searchContainer, { backgroundColor: theme.surface }]}
    >
      <Ionicons name="search" size={18} color={theme.textMuted} style={styles.searchIcon} />
      <TextInput
        style={[styles.searchInput, { color: theme.text }]}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        value={value}
        onChangeText={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={placeholder}
      />
    </View>
  );
});

// Main AppHeader component
function AppHeader({
  variant = 'standard',
  title,
  subtitle,
  leftAction,
  rightActions = [],
  status,
  showDivider = true,
  elevated = false,
  compact = false,
  isScrolled = false,
  brandTagline,
  stats,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  onSearchFocus,
  onSearchBlur,
  testID,
}: AppHeaderProps) {
  // Force light mode
  const theme = useMemo(() => getTheme(false), []);
  const insets = useSafeAreaInsets();

  // Calculate header height based on variant and compact mode
  const headerHeight = useMemo(() => {
    let height: number;
    switch (variant) {
      // `brand` stacks lockup + greeting + stat row, so its height is driven
      // by content rather than a constant.
      case 'brand':
        return undefined;
      case 'large':
        height = HEADER_HEIGHT_LARGE;
        break;
      case 'search':
        height = HEADER_HEIGHT_SEARCH;
        break;
      case 'standard':
      default:
        height = HEADER_HEIGHT_STANDARD;
    }
    return compact ? height - COMPACT_REDUCTION : height;
  }, [variant, compact]);

  // Show shadow when elevated or scrolled
  const showShadow = elevated || isScrolled;

  // Limit right actions to 3
  const visibleRightActions = useMemo(
    () => rightActions.slice(0, 3),
    [rightActions]
  );

  // Render left action area
  const renderLeftAction = useCallback(() => {
    if (!leftAction) {
      return <View style={styles.actionPlaceholder} />;
    }

    return (
      <HeaderAction
        icon={leftAction.icon}
        label={leftAction.label}
        onPress={leftAction.onPress}
        showBackground={leftAction.showBackground}
        testID={testID ? `${testID}-left-action` : undefined}
      />
    );
  }, [leftAction, testID]);

  // Render right actions area
  const renderRightActions = useCallback(() => {
    if (visibleRightActions.length === 0) {
      return <View style={styles.actionPlaceholder} />;
    }

    return (
      <View style={styles.rightActionsContainer}>
        {visibleRightActions.map((action, index) => (
          <HeaderAction
            key={`${action.icon}-${index}`}
            icon={action.icon}
            label={action.label}
            onPress={action.onPress}
            badgeCount={action.badgeCount}
            showDot={action.showDot}
            variant={action.variant}
            size={action.size}
            testID={testID ? `${testID}-right-action-${index}` : undefined}
          />
        ))}
      </View>
    );
  }, [visibleRightActions, testID]);

  // Render standard header content
  const renderStandardContent = () => (
    <View style={styles.standardContent}>
      {renderLeftAction()}
      <View style={styles.titleContainer}>
        <Text
          style={[styles.title, { color: theme.text }]}
          numberOfLines={1}
          allowFontScaling
          accessibilityRole="header"
        >
          {title}
        </Text>
        {subtitle && (
          <Text
            style={[styles.subtitle, { color: theme.textSecondary }]}
            numberOfLines={1}
            allowFontScaling
          >
            {subtitle}
          </Text>
        )}
      </View>
      {renderRightActions()}
    </View>
  );

  // Render large header content
  const renderLargeContent = () => (
    <View style={styles.largeContent}>
      <View style={styles.largeMainRow}>
        {leftAction && renderLeftAction()}
        <View style={styles.largeTitleWrapper}>
          <LargeTitleBlock
            title={title}
            subtitle={subtitle}
            status={status}
            theme={theme}
            compact={compact}
          />
        </View>
        {renderRightActions()}
      </View>
    </View>
  );

  // Render brand header content
  const renderBrandContent = () => (
    <View style={styles.brandContent}>
      <View style={styles.brandTopRow}>
        <BrandLockup tagline={brandTagline} theme={theme} />
        {renderRightActions()}
      </View>

      <View style={styles.brandGreetingRow}>
        <View style={styles.brandGreetingBlock}>
          <Text
            style={[styles.brandGreeting, { color: theme.text }]}
            numberOfLines={1}
            allowFontScaling
            accessibilityRole="header"
          >
            {title}
          </Text>
          {subtitle && (
            <Text
              style={[styles.brandSubtitle, { color: theme.textSecondary }]}
              numberOfLines={1}
              allowFontScaling
            >
              {subtitle}
            </Text>
          )}
        </View>
        {status && (
          <View style={styles.statusPillContainer}>
            <StatusPill status={status} size="small" showIcon={false} />
          </View>
        )}
      </View>

      {stats && stats.length > 0 && (
        <View style={styles.statRow}>
          {stats.map((stat, index) => (
            <HeaderStatCard
              key={stat.label}
              stat={stat}
              theme={theme}
              testID={testID ? `${testID}-stat-${index}` : undefined}
            />
          ))}
        </View>
      )}
    </View>
  );

  // Render search header content
  const renderSearchContent = () => (
    <View style={styles.searchContent}>
      {renderLeftAction()}
      <SearchField
        placeholder={searchPlaceholder}
        value={searchValue}
        onChange={onSearchChange}
        onFocus={onSearchFocus}
        onBlur={onSearchBlur}
        theme={theme}
      />
      {visibleRightActions.length > 0 && renderRightActions()}
    </View>
  );

  // Render content based on variant
  const renderContent = () => {
    switch (variant) {
      case 'brand':
        return renderBrandContent();
      case 'large':
        return renderLargeContent();
      case 'search':
        return renderSearchContent();
      case 'standard':
      default:
        return renderStandardContent();
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.background,
          paddingTop: insets.top,
        },
        showShadow && styles.shadow,
        // Dividers are gone in the redesign (header sits on the canvas); the
        // prop is still accepted for API compatibility.
        showDivider && !showShadow && styles.divider,
      ]}
      testID={testID}
    >
      <View
        style={[
          styles.content,
          { height: headerHeight },
          variant === 'brand' && styles.contentBrand,
          compact && styles.contentCompact,
        ]}
      >
        {renderContent()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 100,
  },
  content: {
    paddingHorizontal: 20,
  },
  contentCompact: {
    paddingVertical: 4,
  },
  contentBrand: {
    paddingTop: 12,
    paddingBottom: 16,
  },
  shadow: {
    ...shadow.soft,
  },
  divider: {},

  // Standard variant
  standardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  title: {
    ...fonts.semibold,
    fontSize: 19,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  subtitle: {
    ...fonts.medium,
    fontSize: 12.5,
    marginTop: 1,
    textAlign: 'center',
  },

  // Large variant
  largeContent: {
    flex: 1,
    justifyContent: 'center',
  },
  largeMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  largeTitleWrapper: {
    flex: 1,
  },
  largeTitleBlock: {
    paddingBottom: 0,
  },
  largeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  largeTitle: {
    ...fonts.semibold,
    fontSize: 30,
    letterSpacing: -0.8,
    flexShrink: 1,
  },
  largeTitleCompact: {
    fontSize: 24,
    letterSpacing: -0.5,
  },
  largeSubtitle: {
    ...fonts.medium,
    fontSize: 14,
    marginTop: 2,
  },
  largeSubtitleCompact: {
    fontSize: 12.5,
    marginTop: 2,
  },
  statusPillContainer: {
    flexShrink: 0,
  },

  // Brand variant
  brandContent: {
    gap: 18,
  },
  brandTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  brandLockup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandMark: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  brandWordmarkBlock: {
    flex: 1,
  },
  brandWordmark: {
    ...fonts.bold,
    fontSize: 18,
    letterSpacing: 1.2,
  },
  brandSubmark: {
    ...fonts.semibold,
    fontSize: 10,
    letterSpacing: 2.4,
    marginTop: 1,
  },
  brandTagline: {
    ...fonts.medium,
    fontSize: 12.5,
    marginTop: 4,
  },
  brandGreetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandGreetingBlock: {
    flex: 1,
  },
  brandGreeting: {
    ...fonts.semibold,
    fontSize: 30,
    letterSpacing: -0.8,
  },
  brandSubtitle: {
    ...fonts.medium,
    fontSize: 14,
    marginTop: 2,
  },
  statRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: radii.lg,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  statValue: {
    ...fonts.semibold,
    fontSize: 22,
    letterSpacing: -0.6,
  },
  statLabel: {
    ...fonts.medium,
    fontSize: 11.5,
    marginTop: 1,
  },

  // Search variant
  searchContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    height: 46,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    ...fonts.medium,
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },

  // Common
  actionPlaceholder: {
    width: 44,
    height: 44,
  },
  rightActionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});

export default memo(AppHeader);
