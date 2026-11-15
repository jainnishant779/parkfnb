import React, { useState, useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { MainTabsParamList } from './types';
import { TabBar } from '../components/navigation';
import {
  seedDashboardData,
  type TabName,
} from '../utils/storage';
import { useAuth } from '../context/AuthContext';
import { ENABLE_TYPE_SPECIFIC_UI } from '../constants/featureFlags';

// Screen imports
import DashboardScreen from '../screens/dashboard/DashboardScreen';
import MyListingsScreen from '../screens/listings/MyListingsScreen';
import PropertiesSlotsScreen from '../screens/properties/PropertiesSlotsScreen';
import ComplianceScreen from '../screens/industrial/ComplianceScreen';
import BookingsListScreen from '../screens/bookings/BookingsListScreen';
import EarningsScreen from '../screens/earnings/EarningsScreen';
import StaffScreen from '../screens/staff/StaffScreen';
import IndustrialStaffRolesScreen from '../screens/staff/IndustrialStaffRolesScreen';
import LotSetupScreen from '../screens/emptyLand/LotSetupScreen';
import MoreScreen from '../screens/more/MoreScreen';

const Tab = createBottomTabNavigator<MainTabsParamList>();

// Owner types that should see Properties tab instead of Listings
const PROPERTIES_OWNER_TYPES = ['residential_community'];

// Owner types that should see Compliance tab instead of Properties (industrial)
const INDUSTRIAL_OWNER_TYPES = ['industrial_facility'];

// Owner types that should see LotSetup tab instead of Earnings (empty land)
const EMPTY_LAND_OWNER_TYPES = ['empty_land'];

export default function MainTabs() {
  const [initialRoute] = useState<TabName>('Dashboard');
  const { owner } = useAuth();
  const ownerType = owner?.ownerType;

  // Specialty per-type tabs are disabled by ENABLE_TYPE_SPECIFIC_UI.
  // Source of truth for owner type is now the AuthContext owner record;
  // legacy AsyncStorage('ownerType') reads have been removed.
  const showPropertiesTab = ENABLE_TYPE_SPECIFIC_UI && !!ownerType && PROPERTIES_OWNER_TYPES.includes(ownerType);
  const showComplianceTab = ENABLE_TYPE_SPECIFIC_UI && !!ownerType && INDUSTRIAL_OWNER_TYPES.includes(ownerType);
  const showLotSetupTab = ENABLE_TYPE_SPECIFIC_UI && !!ownerType && EMPTY_LAND_OWNER_TYPES.includes(ownerType);

  useEffect(() => {
    seedDashboardData().catch((err) => console.error('Failed to seed dashboard data:', err));
  }, []);

  // Determine which second tab to show based on owner type
  const renderSecondTab = () => {
    if (showPropertiesTab) {
      return (
        <Tab.Screen
          name="Properties"
          component={PropertiesSlotsScreen}
          options={{ tabBarLabel: 'Properties' }}
        />
      );
    }
    if (showComplianceTab) {
      return (
        <Tab.Screen
          name="Compliance"
          component={ComplianceScreen}
          options={{ tabBarLabel: 'Compliance' }}
        />
      );
    }
    if (showLotSetupTab) {
      // Empty land: Lot Setup replaces Listings
      return (
        <Tab.Screen
          name="LotSetup"
          component={LotSetupScreen}
          options={{ tabBarLabel: 'Lot Setup' }}
        />
      );
    }
    return (
      <Tab.Screen
        name="Listings"
        component={MyListingsScreen}
        options={{ tabBarLabel: 'Listings' }}
      />
    );
  };

  // Determine which fourth tab to show based on owner type
  const renderFourthTab = () => {
    if (showPropertiesTab) {
      // Residential community: Staff management
      return (
        <Tab.Screen
          name="Staff"
          component={StaffScreen}
          options={{ tabBarLabel: 'Staff' }}
        />
      );
    }
    if (showComplianceTab) {
      // Industrial facility: Staff & Roles (replaces Earnings)
      return (
        <Tab.Screen
          name="StaffRoles"
          component={IndustrialStaffRolesScreen}
          options={{ tabBarLabel: 'Staff' }}
        />
      );
    }
    // Default & Empty land: Earnings
    return (
      <Tab.Screen
        name="Earnings"
        component={EarningsScreen}
        options={{ tabBarLabel: 'Earnings' }}
      />
    );
  };

  return (
    <Tab.Navigator
      initialRouteName={initialRoute}
      tabBar={(props) => (
        <TabBar
          {...props}
          showPropertiesTab={showPropertiesTab}
          showComplianceTab={showComplianceTab}
          showLotSetupTab={showLotSetupTab}
        />
      )}
      screenOptions={{
        headerShown: false,
        lazy: true,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ tabBarLabel: 'Home' }}
      />
      {renderSecondTab()}
      <Tab.Screen
        name="Bookings"
        component={BookingsListScreen}
        options={{ tabBarLabel: 'Bookings' }}
      />
      {renderFourthTab()}
      <Tab.Screen
        name="More"
        component={MoreScreen}
        options={{ tabBarLabel: 'More' }}
      />
    </Tab.Navigator>
  );
}
