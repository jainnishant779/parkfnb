import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from './types';

import MergedOnboardingScreen from '../screens/onboarding/MergedOnboardingScreen';
// Legacy onboarding screens — kept on disk but no longer registered. Reach
// them by uncommenting the imports + Stack.Screen entries below.
// import ProfileSetupScreen from '../screens/onboarding/ProfileSetupScreen';
// import KycVerificationScreen from '../screens/onboarding/KycVerificationScreen';
// import KycIntroScreen from '../screens/onboarding/KycIntroScreen';
// import DocumentUploadScreen from '../screens/onboarding/DocumentUploadScreen';
// import KycStatusScreen from '../screens/onboarding/KycStatusScreen';
// import BankSetupScreen from '../screens/onboarding/BankSetupScreen';

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export default function OwnerOnboardingStack() {
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName="MergedOnboarding"
    >
      <Stack.Screen name="MergedOnboarding" component={MergedOnboardingScreen} />
    </Stack.Navigator>
  );
}
