import React, { memo, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TextInput,
  Pressable,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import HeaderAction, { HeaderIconName } from './HeaderAction';
import StatusPill, { StatusPillVariant } from './StatusPill';

// Types
export type HeaderVariant = 'standard' | 'large' | 'search';

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
  // Search variant specific
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (text: string) => void;
  onSearchFocus?: () => void;
  onSearchBlur?: () => void;
  // Test IDs
  testID?: string;
}

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
      style={[
        styles.searchContainer,
        {
          backgroundColor: theme.borderLight,
          borderColor: theme.border,
        },
      ]}
    >
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
          backgroundColor: theme.surface,
          paddingTop: insets.top,
        },
        showShadow && styles.shadow,
        showDivider && !showShadow && [
          styles.divider,
          { borderBottomColor: theme.border },
        ],
      ]}
      testID={testID}
    >
      <View
        style={[
          styles.content,
          { height: headerHeight },
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
    paddingHorizontal: spacing[4],
  },
  contentCompact: {
    paddingVertical: spacing[1],
  },
  shadow: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  // Standard variant
  standardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing[2],
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.xs,
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
    gap: spacing[2],
  },
  largeTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold as any,
    flexShrink: 1,
  },
  largeTitleCompact: {
    fontSize: fontSize.xl,
  },
  largeSubtitle: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  largeSubtitleCompact: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  statusPillContainer: {
    flexShrink: 0,
  },

  // Search variant
  searchContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing[3],
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    paddingVertical: spacing[2],
  },

  // Common
  actionPlaceholder: {
    width: 44,
    height: 44,
  },
  rightActionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
});

export default memo(AppHeader);
