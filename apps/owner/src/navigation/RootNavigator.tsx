import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import { useAuth } from '../context/AuthContext';

import AuthStack from './AuthStack';
import OwnerOnboardingStack from './OwnerOnboardingStack';
import MainTabs from './MainTabs';

// Screen imports for modal/detail screens
import NotificationsScreen from '../screens/notifications/NotificationsScreen';
import NotificationPreferencesScreen from '../screens/notifications/NotificationPreferencesScreen';
import AvailabilityCalendarScreen from '../screens/availability/AvailabilityCalendarScreen';
import PromotionsScreen from '../screens/promotions/PromotionsScreen';
import PayoutsScreen from '../screens/earnings/PayoutsScreen';
import EarningsScreen from '../screens/earnings/EarningsScreen';
import BookingDetailsScreen from '../screens/bookings/BookingDetailsScreen';
import BookingRequestQueueScreen from '../screens/bookings/BookingRequestQueueScreen';
import AccessPassQrScreen from '../screens/bookings/AccessPassQrScreen';
import ListingDetailsScreen from '../screens/listings/ListingDetailsScreen';
import AddListingScreen from '../screens/listings/AddListingScreen';
import ProfileScreen from '../screens/settings/ProfileScreen';
import SecurityScreen from '../screens/settings/SecurityScreen';
import LegalScreen from '../screens/settings/LegalScreen';
import SupportHelpCenterScreen from '../screens/support/SupportHelpCenterScreen';
import TicketDetailsScreen from '../screens/support/TicketDetailsScreen';
import KycVerificationScreen from '../screens/onboarding/KycVerificationScreen';
import ReviewsScreen from '../screens/reviews/ReviewsScreen';
import DisputesScreen from '../screens/disputes/DisputesScreen';
import IntegrationsScreen from '../screens/integrations/IntegrationsScreen';
import FleetManagementScreen from '../screens/integrations/FleetManagementScreen';
import GPSConfigurationScreen from '../screens/integrations/GPSConfigurationScreen';
import IoTIntegrationsScreen from '../screens/integrations/IoTIntegrationsScreen';
import PropertiesSlotsScreen from '../screens/properties/PropertiesSlotsScreen';
import PropertySpacesScreen from '../screens/listings/PropertySpacesScreen';
import PropertyWizardStack from './PropertyWizardStack';
import SpaceWizardStack from './SpaceWizardStack';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { isAuthenticated, isLoading, onboardingStep } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F3F3' }}>
        <ActivityIndicator size="large" color="#141414" />
      </View>
    );
  }

  // React Navigation auth pattern: conditionally render the screens that
  // are valid for the current auth state. When the auth state flips
  // (e.g. signOut), the screen tree changes and the navigator resets to
  // the new initial screen automatically — no manual navigation.reset
  // needed. If we registered all stacks unconditionally and only varied
  // `initialRouteName`, sign-out would not transition because
  // `initialRouteName` is consumed only on first mount.
  if (!isAuthenticated) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Auth" component={AuthStack} />
      </Stack.Navigator>
    );
  }

  const showMainApp =
    onboardingStep === 'completed' || onboardingStep === 'kyc_submitted';

  return (
    <Stack.Navigator
      initialRouteName={showMainApp ? 'MainTabs' : 'Onboarding'}
      screenOptions={{ headerShown: false }}
    >
      {showMainApp ? (
        <Stack.Screen name="MainTabs" component={MainTabs} />
      ) : (
        <Stack.Screen name="Onboarding" component={OwnerOnboardingStack} />
      )}

      {/* Modal/Detail Screens — available throughout the authenticated app. */}
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ presentation: 'card' }}
      />
      <Stack.Screen
        name="NotificationPreferences"
        component={NotificationPreferencesScreen}
        options={{ presentation: 'card' }}
      />
      <Stack.Screen
        name="Availability"
        component={AvailabilityCalendarScreen}
        options={{ presentation: 'card' }}
      />
      <Stack.Screen
        name="Promotions"
        component={PromotionsScreen}
        options={{ presentation: 'card' }}
      />
      <Stack.Screen
        name="Payouts"
        component={PayoutsScreen}
        options={{ presentation: 'card' }}
      />
      <Stack.Screen
        name="Earnings"
        component={EarningsScreen}
        options={{ presentation: 'card' }}
      />
      <Stack.Screen
        name="BookingDetails"
        component={BookingDetailsScreen}
        options={{ presentation: 'card' }}
      />
      <Stack.Screen
        name="BookingRequestQueue"
        component={BookingRequestQueueScreen}
        options={{ presentation: 'card' }}
      />
      <Stack.Screen
        name="AccessPass"
        component={AccessPassQrScreen}
        options={{ presentation: 'card' }}
      />
      <Stack.Screen
        name="ListingDetails"
        component={ListingDetailsScreen}
        options={{ presentation: 'card' }}
      />
      <Stack.Screen
        name="AddListing"
        component={AddListingScreen}
        options={{ presentation: 'card' }}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ presentation: 'card' }}
      />
      <Stack.Screen
        name="Security"
        component={SecurityScreen}
        options={{ presentation: 'card' }}
      />
      <Stack.Screen
        name="Legal"
        component={LegalScreen}
        options={{ presentation: 'card' }}
      />
      <Stack.Screen
        name="HelpCenter"
        component={SupportHelpCenterScreen}
        options={{ presentation: 'card' }}
      />
      <Stack.Screen
        name="TicketDetails"
        component={TicketDetailsScreen}
        options={{ presentation: 'card' }}
      />
      <Stack.Screen
        name="Kyc"
        component={KycVerificationScreen}
        options={{ presentation: 'card' }}
      />
      <Stack.Screen
        name="Reviews"
        component={ReviewsScreen}
        options={{ presentation: 'card' }}
      />
      <Stack.Screen
        name="Disputes"
        component={DisputesScreen}
        options={{ presentation: 'card' }}
      />
      <Stack.Screen
        name="Integrations"
        component={IntegrationsScreen}
        options={{ presentation: 'card' }}
      />
      <Stack.Screen
        name="FleetManagement"
        component={FleetManagementScreen}
        options={{ presentation: 'card' }}
      />
      <Stack.Screen
        name="GPSConfiguration"
        component={GPSConfigurationScreen}
        options={{ presentation: 'card' }}
      />
      <Stack.Screen
        name="IoTIntegrations"
        component={IoTIntegrationsScreen}
        options={{ presentation: 'card' }}
      />
      <Stack.Screen
        name="PropertiesSlots"
        component={PropertiesSlotsScreen}
        options={{ presentation: 'card' }}
      />
      <Stack.Screen
        name="PropertySpaces"
        component={PropertySpacesScreen}
        options={{ presentation: 'card' }}
      />
      <Stack.Screen
        name="PropertyWizard"
        component={PropertyWizardStack}
        options={{ presentation: 'card' }}
      />
      <Stack.Screen
        name="SpaceWizard"
        component={SpaceWizardStack}
        options={{ presentation: 'card' }}
      />
    </Stack.Navigator>
  );
}
