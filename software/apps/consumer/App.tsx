/**
 * Parking App
 * @format
 */
import "./global.css";
import React, { useState } from 'react';
import { LogBox, StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import KeyboardInset from './user/components/KeyboardInset';
import Splash from './user/screens/onboarding/Splash';
import { palette } from './user/theme';

// Every one of our screens already imports SafeAreaView from
// `react-native-safe-area-context`. The deprecation warning fires once at
// startup from a third-party library that reads `RN.SafeAreaView` via the
// (deprecated) getter on the react-native module. Silence it so the dev
// console isn't polluted on every reload.
LogBox.ignoreLogs(['SafeAreaView has been deprecated']);
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Screens
import Welcome from './user/screens/onboarding/Welcome';
import Onboarding from './user/screens/onboarding/Onboarding';
import UserOnboarding from './user/screens/onboarding/UserOnboarding';
import SignIn from './user/screens/auth/SignIn';
import OTPVerification from './user/screens/auth/OTPVerification';
import BottomTabNavigator from './user/navigation/BottomTabNavigator';
import ParkingDetailsPage from './user/screens/parking/ParkingDetailsPage';
import BookingSchedulePage from './user/screens/parking/BookingSchedulePage';
import SubscriptionPage from './user/screens/premium/SubscriptionPage';
import HelpSupportPage from './user/screens/support/HelpSupportPage';
import AboutPage from './user/screens/about/AboutPage';
import EditProfilePage from './user/screens/profile/EditProfilePage';

// Auth
import { AuthProvider, useAuth } from './user/context/AuthContext';
import { initializeMsg91 } from './user/services/msg91Service';
import { AppAlertProvider } from './user/components/AppAlert';

// Initialize the MSG91 OTP SDK at module load (before first render).
// Idempotent — safe even though msg91Service guards calls with the same init.
initializeMsg91();

const Stack = createNativeStackNavigator();

const navigationTheme = {
  dark: false,
  colors: {
    primary: palette.primary,
    background: palette.bg,
    card: palette.bg,
    text: palette.text,
    border: 'rgba(0,0,0,0.06)',
    notification: palette.danger,
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' as const },
    medium: { fontFamily: 'System', fontWeight: '500' as const },
    bold: { fontFamily: 'System', fontWeight: '700' as const },
    heavy: { fontFamily: 'System', fontWeight: '800' as const },
  },
};

// Native-stack animation tuned for a softer, more deliberate feel
// between screens. `slide_from_right` gives a clear forward motion;
// `animationDuration` slows it from the default snap to 350ms so the
// transition reads as intentional rather than abrupt.
const screenOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: palette.bg },
  animation: 'slide_from_right' as const,
  animationDuration: 350,
  gestureEnabled: true,
};

/**
 * Root navigator — driven by auth state from AuthContext.
 *
 * Routing logic:
 *  isLoading           → Splash (ActivityIndicator)
 *  !isAuthenticated    → Auth stack (Welcome → Onboarding → SignIn → OTPVerification)
 *  onboardingStep      → 'completed': MainApp
 *                      → anything else: UserOnboarding
 */
function RootNavigator() {
  const { isLoading, isAuthenticated, user } = useAuth();
  const isDarkMode = useColorScheme() === 'dark';

  // Cold-start splash plays a guaranteed minimum, regardless of how
  // quickly auth resolves. We hold the splash until BOTH (a) the
  // splash animation finishes and (b) auth context is ready — that
  // way the user never sees a flash-of-loading-spinner-then-splash.
  const [splashComplete, setSplashComplete] = useState(false);

  if (!splashComplete || isLoading) {
    return <Splash onDone={() => setSplashComplete(true)} />;
  }

  if (!isAuthenticated) {
    return (
      <>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
        {/* Flow: Splash (handled above) → Onboarding (3 slides) → SignIn → OTP.
            Welcome is kept registered as a route in case anything navigates
            back to it, but it's no longer the initial screen. */}
        <Stack.Navigator initialRouteName="Onboarding" screenOptions={screenOptions}>
          <Stack.Screen name="Onboarding" component={Onboarding} />
          <Stack.Screen name="SignIn" component={SignIn} />
          <Stack.Screen name="OTPVerification" component={OTPVerification} />
          <Stack.Screen name="Welcome" component={Welcome} />
        </Stack.Navigator>
      </>
    );
  }

  // Only these two states mean "this person has not filled in a consumer
  // profile yet". The rest of the ladder (kyc_submitted, completed) belongs to
  // the owner app's KYC flow.
  //
  // Both apps share one User record with a single user_type, so a number that
  // signed up as an owner sits at 'kyc_submitted'. Requiring exactly
  // 'completed' here trapped those accounts in the consumer onboarding screen
  // forever: Continue saved fine and the server answered 200, but the step
  // never became 'completed' so the screen never moved on.
  const needsConsumerOnboarding =
    !user?.onboardingStep ||
    user.onboardingStep === 'auth_complete' ||
    user.onboardingStep === 'profile_setup';

  if (needsConsumerOnboarding) {
    return (
      <>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
        <Stack.Navigator screenOptions={screenOptions}>
          <Stack.Screen name="UserOnboarding" component={UserOnboarding} />
        </Stack.Navigator>
      </>
    );
  }

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={palette.bg} />
      <Stack.Navigator screenOptions={screenOptions}>
        {/* Main app with bottom tabs */}
        <Stack.Screen name="MainApp" component={BottomTabNavigator} />

        {/* Modal / detail screens accessible from main app */}
        <Stack.Screen name="ParkingDetails" component={ParkingDetailsPage} />
        <Stack.Screen name="BookingSchedule" component={BookingSchedulePage} />
        <Stack.Screen name="Subscription" component={SubscriptionPage} />
        <Stack.Screen name="HelpSupport" component={HelpSupportPage} />
        <Stack.Screen name="About" component={AboutPage} />
        <Stack.Screen name="EditProfile" component={EditProfilePage} />
      </Stack.Navigator>
    </>
  );
}

import { OtaUpdateBanner } from './user/components/OtaUpdateBanner';

function App() {
  return (
    <SafeAreaProvider style={{ backgroundColor: palette.bg }}>
      <KeyboardInset>
      <AppAlertProvider>
        <AuthProvider>
          <NavigationContainer theme={navigationTheme}>
            <RootNavigator />
            <OtaUpdateBanner />
          </NavigationContainer>
        </AuthProvider>
      </AppAlertProvider>
      </KeyboardInset>
    </SafeAreaProvider>
  );
}

export default App;
