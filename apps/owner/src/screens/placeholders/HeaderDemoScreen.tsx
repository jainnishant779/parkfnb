import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Pressable,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppAlert } from '../../components/common/AppAlert';
import { useNavigation } from '@react-navigation/native';
import { AppHeader, StatusPill, HeaderAction } from '../../components/headers';
import { Badge } from '../../components/common';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import {
  getHeaderPreferences,
  saveHeaderPreferences,
  getOwnerProfile,
  saveOwnerProfile,
  HeaderPreferences,
  OwnerProfile,
} from '../../utils/storage';
import {
  MOCK_OWNER_PROFILE,
  getFormattedDateSubtitle,
  getOwnerGreeting,
  VerificationStatus,
} from '../../constants/mockProfile';
import type { StatusPillVariant } from '../../components/headers/StatusPill';
import type { HeaderVariant } from '../../components/headers/AppHeader';

// Demo screen to showcase all header variants and configurations
export default function HeaderDemoScreen() {
  const navigation = useNavigation();
  const colorScheme = useColorScheme();
  const theme = useMemo(() => getTheme(colorScheme === 'dark'), [colorScheme]);

  // State
  const [headerVariant, setHeaderVariant] = useState<HeaderVariant>('standard');
  const [compactMode, setCompactMode] = useState(false);
  const [showSubtitle, setShowSubtitle] = useState(true);
  const [showDivider, setShowDivider] = useState(true);
  const [elevated, setElevated] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('pending');
  const [badgeCount, setBadgeCount] = useState(3);
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile>(MOCK_OWNER_PROFILE);
  const [searchValue, setSearchValue] = useState('');

  // Load preferences on mount
  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    const preferences = await getHeaderPreferences();
    setCompactMode(preferences.compactMode);
    setShowSubtitle(preferences.showSubtitle);

    const profile = await getOwnerProfile();
    if (profile.ownerName !== 'Owner') {
      setOwnerProfile(profile);
      setVerificationStatus(profile.verificationStatus as VerificationStatus);
      setBadgeCount(profile.unreadNotificationsCount);
    }
  };

  // Save preferences when they change
  const handleCompactModeChange = useCallback(async (value: boolean) => {
    setCompactMode(value);
    await saveHeaderPreferences({ compactMode: value });
  }, []);

  const handleShowSubtitleChange = useCallback(async (value: boolean) => {
    setShowSubtitle(value);
    await saveHeaderPreferences({ showSubtitle: value });
  }, []);

  // Handle actions
  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleNotifications = useCallback(() => {
    AppAlert.alert('Notifications', 'Navigate to notifications screen');
  }, []);

  const handleSearch = useCallback(() => {
    AppAlert.alert('Search', 'Search functionality activated');
  }, []);

  const handleAdd = useCallback(() => {
    AppAlert.alert('Add', 'Add new item');
  }, []);

  const handleMenu = useCallback(() => {
    AppAlert.alert('Menu', 'Open menu');
  }, []);

  // Get header title based on variant
  const getHeaderTitle = () => {
    switch (headerVariant) {
      case 'large':
        return getOwnerGreeting(MOCK_OWNER_PROFILE.firstName);
      case 'search':
        return 'Search';
      default:
        return 'Header Demo';
    }
  };

  // Get header subtitle based on variant
  const getHeaderSubtitle = () => {
    if (!showSubtitle) return undefined;
    switch (headerVariant) {
      case 'large':
        return getFormattedDateSubtitle();
      default:
        return 'Showing all header variants';
    }
  };

  // Get right actions based on variant
  const getRightActions = () => {
    switch (headerVariant) {
      case 'large':
        return [
          {
            icon: 'notifications' as const,
            label: 'Notifications',
            onPress: handleNotifications,
            badgeCount,
          },
        ];
      case 'search':
        return [
          {
            icon: 'filter' as const,
            label: 'Filter',
            onPress: () => AppAlert.alert('Filter', 'Open filters'),
          },
        ];
      default:
        return [
          {
            icon: 'notifications' as const,
            label: 'Notifications',
            onPress: handleNotifications,
            badgeCount,
          },
          {
            icon: 'add' as const,
            label: 'Add',
            onPress: handleAdd,
          },
        ];
    }
  };

  // Render option row
  const renderOptionRow = (
    label: string,
    value: boolean,
    onChange: (value: boolean) => void
  ) => (
    <View style={[styles.optionRow, { borderBottomColor: theme.border }]}>
      <Text style={[styles.optionLabel, { color: theme.text }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: theme.border, true: theme.primaryLight }}
        thumbColor={value ? theme.primary : theme.textMuted}
      />
    </View>
  );

  // Render variant selector
  const renderVariantSelector = () => (
    <View style={styles.selectorContainer}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>
        Header Variant
      </Text>
      <View style={styles.variantButtons}>
        {(['standard', 'large', 'search'] as HeaderVariant[]).map((v) => (
          <Pressable
            key={v}
            style={[
              styles.variantButton,
              {
                backgroundColor:
                  headerVariant === v ? theme.primary : theme.borderLight,
                borderColor: headerVariant === v ? theme.primary : theme.border,
              },
            ]}
            onPress={() => setHeaderVariant(v)}
          >
            <Text
              style={[
                styles.variantButtonText,
                {
                  color:
                    headerVariant === v ? '#FFFFFF' : theme.textSecondary,
                },
              ]}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  // Render status selector
  const renderStatusSelector = () => (
    <View style={styles.selectorContainer}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>
        Verification Status
      </Text>
      <View style={styles.statusButtons}>
        {(['verified', 'pending', 'rejected', 'unverified'] as VerificationStatus[]).map(
          (s) => (
            <Pressable
              key={s}
              style={[
                styles.statusButton,
                {
                  backgroundColor:
                    verificationStatus === s ? theme.primaryLight : theme.surface,
                  borderColor:
                    verificationStatus === s ? theme.primary : theme.border,
                },
              ]}
              onPress={() => setVerificationStatus(s)}
            >
              <StatusPill status={s as StatusPillVariant} size="small" />
            </Pressable>
          )
        )}
      </View>
    </View>
  );

  // Render badge count selector
  const renderBadgeSelector = () => (
    <View style={styles.selectorContainer}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>
        Badge Count
      </Text>
      <View style={styles.badgeButtons}>
        {[0, 1, 5, 15, 99, 150].map((count) => (
          <Pressable
            key={count}
            style={[
              styles.badgeButton,
              {
                backgroundColor:
                  badgeCount === count ? theme.primary : theme.borderLight,
                borderColor:
                  badgeCount === count ? theme.primary : theme.border,
              },
            ]}
            onPress={() => setBadgeCount(count)}
          >
            <Text
              style={[
                styles.badgeButtonText,
                {
                  color:
                    badgeCount === count ? '#FFFFFF' : theme.textSecondary,
                },
              ]}
            >
              {count}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  // Render component showcase
  const renderComponentShowcase = () => (
    <View style={styles.showcaseContainer}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>
        Individual Components
      </Text>

      <View style={[styles.showcaseRow, { backgroundColor: theme.surface }]}>
        <Text style={[styles.showcaseLabel, { color: theme.textSecondary }]}>
          StatusPill:
        </Text>
        <View style={styles.showcaseItems}>
          <StatusPill status="verified" />
          <StatusPill status="pending" size="small" />
        </View>
      </View>

      <View style={[styles.showcaseRow, { backgroundColor: theme.surface }]}>
        <Text style={[styles.showcaseLabel, { color: theme.textSecondary }]}>
          Badge:
        </Text>
        <View style={styles.showcaseItems}>
          <View style={styles.badgeDemo}>
            <Badge count={5} />
          </View>
          <View style={styles.badgeDemo}>
            <Badge count={99} size="large" />
          </View>
          <View style={styles.badgeDemo}>
            <Badge count={150} />
          </View>
          <View style={styles.badgeDemo}>
            <Badge showDot />
          </View>
        </View>
      </View>

      <View style={[styles.showcaseRow, { backgroundColor: theme.surface }]}>
        <Text style={[styles.showcaseLabel, { color: theme.textSecondary }]}>
          HeaderAction:
        </Text>
        <View style={styles.showcaseItems}>
          <HeaderAction icon="back" label="Back" onPress={handleBack} />
          <HeaderAction
            icon="notifications"
            label="Notifications"
            onPress={handleNotifications}
            badgeCount={3}
          />
          <HeaderAction icon="add" label="Add" onPress={handleAdd} variant="primary" />
          <HeaderAction
            icon="menu"
            label="Menu"
            onPress={handleMenu}
            showBackground
          />
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Active Header */}
      <AppHeader
        variant={headerVariant}
        title={getHeaderTitle()}
        subtitle={getHeaderSubtitle()}
        leftAction={{
          icon: 'back',
          label: 'Go back',
          onPress: handleBack,
        }}
        rightActions={getRightActions()}
        status={headerVariant === 'large' ? (verificationStatus as StatusPillVariant) : undefined}
        showDivider={showDivider}
        elevated={elevated}
        compact={compactMode}
        isScrolled={isScrolled}
        searchPlaceholder="Search listings..."
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        testID="demo-header"
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        onScroll={(e) => {
          const scrollY = e.nativeEvent.contentOffset.y;
          setIsScrolled(scrollY > 10);
        }}
        scrollEventThrottle={16}
      >
        {/* Options */}
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Display Options
          </Text>
          {renderOptionRow('Compact Mode', compactMode, handleCompactModeChange)}
          {renderOptionRow('Show Subtitle', showSubtitle, handleShowSubtitleChange)}
          {renderOptionRow('Show Divider', showDivider, setShowDivider)}
          {renderOptionRow('Elevated (Shadow)', elevated, setElevated)}
        </View>

        {/* Variant Selector */}
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          {renderVariantSelector()}
        </View>

        {/* Status Selector */}
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          {renderStatusSelector()}
        </View>

        {/* Badge Selector */}
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          {renderBadgeSelector()}
        </View>

        {/* Component Showcase */}
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          {renderComponentShowcase()}
        </View>

        {/* Info */}
        <View style={[styles.infoSection, { backgroundColor: theme.primaryLight }]}>
          <Text style={[styles.infoTitle, { color: theme.primary }]}>
            About This Demo
          </Text>
          <Text style={[styles.infoText, { color: theme.textSecondary }]}>
            This screen demonstrates all header variants and configurations.
            Toggle the options above to see how the header adapts. Preferences
            are persisted locally using AsyncStorage.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing[4],
    gap: spacing[4],
  },
  section: {
    borderRadius: borderRadius.lg,
    padding: spacing[4],
  },
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[3],
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionLabel: {
    fontSize: fontSize.sm,
  },
  selectorContainer: {
    marginBottom: spacing[2],
  },
  variantButtons: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  variantButton: {
    flex: 1,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  variantButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  statusButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  statusButton: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  badgeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  badgeButton: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.md,
    borderWidth: 1,
    minWidth: 48,
    alignItems: 'center',
  },
  badgeButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  showcaseContainer: {
    gap: spacing[3],
  },
  showcaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    borderRadius: borderRadius.md,
    gap: spacing[3],
  },
  showcaseLabel: {
    fontSize: fontSize.sm,
    minWidth: 100,
  },
  showcaseItems: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    flexWrap: 'wrap',
  },
  badgeDemo: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: '#E5E7EB',
    position: 'relative',
  },
  infoSection: {
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    marginBottom: spacing[6],
  },
  infoTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[2],
  },
  infoText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});
