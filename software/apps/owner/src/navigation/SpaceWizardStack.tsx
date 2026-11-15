import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SpaceWizardProvider } from '../context/ListingWizardContext';
import StepDimensionsScreen from '../screens/listings/listingWizard/StepDimensionsScreen';
import StepSpacePhotosScreen from '../screens/listings/listingWizard/StepSpacePhotosScreen';
import StepPricingScreen from '../screens/listings/listingWizard/StepPricingScreen';
import StepAvailabilityScreen from '../screens/listings/listingWizard/StepAvailabilityScreen';
import StepRulesScreen from '../screens/listings/listingWizard/StepRulesScreen';
import SpaceReviewScreen from '../screens/listings/listingWizard/SpaceReviewScreen';

export type SpaceWizardParamList = {
  StepDimensions: { propertyId: string; editSpaceId?: string };
  StepSpacePhotos: undefined;
  StepPricing: undefined;
  StepAvailability: undefined;
  StepRules: undefined;
  SpaceReview: undefined;
};

const Stack = createNativeStackNavigator<SpaceWizardParamList>();

export default function SpaceWizardStack({ route }: any) {
  const initialParams = {
    propertyId: route?.params?.propertyId,
    editSpaceId: route?.params?.editSpaceId,
  };
  return (
    <SpaceWizardProvider>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="StepDimensions"
          component={StepDimensionsScreen}
          initialParams={initialParams}
        />
        <Stack.Screen name="StepSpacePhotos" component={StepSpacePhotosScreen} />
        <Stack.Screen name="StepPricing" component={StepPricingScreen} />
        <Stack.Screen name="StepAvailability" component={StepAvailabilityScreen} />
        <Stack.Screen name="StepRules" component={StepRulesScreen} />
        <Stack.Screen name="SpaceReview" component={SpaceReviewScreen} />
      </Stack.Navigator>
    </SpaceWizardProvider>
  );
}
