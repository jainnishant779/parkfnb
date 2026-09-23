import React, { memo, useMemo, useEffect, useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import TabItem, { TabIconName } from './TabItem';
import {
  saveLastSelectedTab,
  getTabBadgeState,
  initializeTabBadges,
  type TabName,
  type TabBadgeState,
} from '../../utils/storage';

// Tab configuration
interface TabConfig {
  key: TabName;
  label: string;
  icon: TabIconName;
}

const TAB_CONFIG_LISTINGS: TabConfig[] = [
  { key: 'Dashboard', label: 'Home', icon: 'home' },
  { key: 'Listings', label: 'Listings', icon: 'list' },
  { key: 'Bookings', label: 'Bookings', icon: 'calendar' },
  { key: 'Earnings', label: 'Earnings', icon: 'wallet' },
  { key: 'More', label: 'More', icon: 'menu' },
];

// For residential community owners: Properties + Staff instead of Listings + Earnings
const TAB_CONFIG_PROPERTIES: TabConfig[] = [
  { key: 'Dashboard', label: 'Home', icon: 'home' },
  { key: 'Properties', label: 'Properties', icon: 'business' },
  { key: 'Bookings', label: 'Bookings', icon: 'calendar' },
  { key: 'Staff', label: 'Staff', icon: 'people' },
  { key: 'More', label: 'More', icon: 'menu' },
];

// For industrial owners: Compliance instead of Properties/Listings, Staff & Roles instead of Earnings
const TAB_CONFIG_COMPLIANCE: TabConfig[] = [
  { key: 'Dashboard', label: 'Home', icon: 'home' },
  { key: 'Compliance', label: 'Compliance', icon: 'shield' },
  { key: 'Bookings', label: 'Bookings', icon: 'calendar' },
  { key: 'StaffRoles', label: 'Staff', icon: 'people' },
  { key: 'More', label: 'More', icon: 'menu' },
];

// For empty land owners: Lot Setup replaces Listings (second tab), keeps Earnings
const TAB_CONFIG_LOT_SETUP: TabConfig[] = [
  { key: 'Dashboard', label: 'Home', icon: 'home' },
  { key: 'LotSetup', label: 'Lot Setup', icon: 'map' },
  { key: 'Bookings', label: 'Bookings', icon: 'calendar' },
  { key: 'Earnings', label: 'Earnings', icon: 'wallet' },
  { key: 'More', label: 'More', icon: 'menu' },
];

// Floating pill height
const TAB_BAR_HEIGHT = 76;

// Extended props to include owner type tab flags
interface TabBarProps extends BottomTabBarProps {
  showPropertiesTab?: boolean;
  showComplianceTab?: boolean;
  showLotSetupTab?: boolean;
}

function TabBar({
  state,
  navigation,
  showPropertiesTab = false,
  showComplianceTab = false,
  showLotSetupTab = false,
}: TabBarProps) {
  const insets = useSafeAreaInsets();

  // Select the correct tab config based on owner type
  const tabConfig = useMemo(() => {
    if (showPropertiesTab) return TAB_CONFIG_PROPERTIES;
    if (showComplianceTab) return TAB_CONFIG_COMPLIANCE;
    if (showLotSetupTab) return TAB_CONFIG_LOT_SETUP;
    return TAB_CONFIG_LISTINGS;
  }, [showPropertiesTab, showComplianceTab, showLotSetupTab]);

  // Badge state
  const [badgeState, setBadgeState] = useState<TabBadgeState>({
    bookingsCount: 0,
    hasMoreDot: false,
  });

  // Load badge state on mount
  useEffect(() => {
    const loadBadges = async () => {
      try {
        // Initialize badges from dashboard data
        const badges = await initializeTabBadges();
        setBadgeState(badges);
      } catch (error) {
        console.error('Failed to load tab badges:', error);
      }
    };
    loadBadges();
  }, []);

  // Refresh badge state when tab bar is focused
  useEffect(() => {
    const refreshBadges = async () => {
      const badges = await getTabBadgeState();
      setBadgeState(badges);
    };
    refreshBadges();
  }, [state.index]);

  // Handle tab press
  const handleTabPress = useCallback(
    (routeName: string, isFocused: boolean) => {
      const event = navigation.emit({
        type: 'tabPress',
        target: routeName,
        canPreventDefault: true,
      });

      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(routeName);
        // Persist selected tab
        saveLastSelectedTab(routeName as TabName);
      }
    },
    [navigation]
  );

  // Handle tab long press
  const handleTabLongPress = useCallback(
    (routeName: string) => {
      navigation.emit({
        type: 'tabLongPress',
        target: routeName,
      });
    },
    [navigation]
  );

  // Pill floats above the home indicator; content scrolls underneath it.
  const bottomPadding = Math.max(insets.bottom - 6, 12);

  return (
    <View pointerEvents="box-none" style={[styles.outer, { paddingBottom: bottomPadding }]}>
      <View style={styles.pillShadow}>
        <View style={styles.pill}>
          {state.routes.map((route, index) => {
            const isFocused = state.index === index;
            const currentTabConfig = tabConfig.find((t) => t.key === route.name);

            if (!currentTabConfig) return null;

            // Get badge info
            const badgeCount =
              currentTabConfig.key === 'Bookings' ? badgeState.bookingsCount : undefined;
            const showDot = currentTabConfig.key === 'More' ? badgeState.hasMoreDot : false;

            return (
              <TabItem
                key={route.key}
                icon={currentTabConfig.icon}
                label={currentTabConfig.label}
                isActive={isFocused}
                onPress={() => handleTabPress(route.name, isFocused)}
                badgeCount={badgeCount}
                showDot={showDot}
                testID={`tab-${currentTabConfig.key.toLowerCase()}`}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  pillShadow: {
    borderRadius: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 26,
    elevation: 12,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: TAB_BAR_HEIGHT,
    paddingHorizontal: 6,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
});

export default memo(TabBar);
