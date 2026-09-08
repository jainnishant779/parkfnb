import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { AuthStackParamList } from './types';

// Owner-type selection has been moved out of the pre-auth flow into the
// merged onboarding screen (shown only on signup). Existing accounts read
// owner_type from the backend on login. The Welcome screen file is kept
// on disk for future re-enable; the import + Stack.Screen are commented.
// import WelcomeOwnerTypeScreen from '../screens/auth/WelcomeOwnerTypeScreen';
import SignInScreen from '../screens/auth/SignInScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import OtpVerifyScreen from '../screens/auth/OtpVerifyScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthStack() {
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName="SignIn"
    >
      {/* <Stack.Screen name="WelcomeOwnerType" component={WelcomeOwnerTypeScreen} /> */}
      <Stack.Screen name="SignIn" component={SignInScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="OtpVerify" component={OtpVerifyScreen} />
    </Stack.Navigator>
  );
}
