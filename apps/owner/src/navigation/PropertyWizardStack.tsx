import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PropertyWizardProvider } from '../context/ListingWizardContext';
import StepLocationScreen from '../screens/listings/listingWizard/StepLocationScreen';
import StepPhotosScreen from '../screens/listings/listingWizard/StepPhotosScreen';
import PropertyReviewScreen from '../screens/listings/listingWizard/PropertyReviewScreen';

export type PropertyWizardParamList = {
  StepLocation: { editPropertyId?: string; chainToSpace?: boolean };
  StepPropertyPhotos: undefined;
  PropertyReview: undefined;
};

const Stack = createNativeStackNavigator<PropertyWizardParamList>();

export default function PropertyWizardStack({ route }: any) {
  const initialParams = {
    editPropertyId: route?.params?.editPropertyId,
    chainToSpace: route?.params?.chainToSpace,
  };
  return (
    <PropertyWizardProvider>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="StepLocation"
          component={StepLocationScreen}
          initialParams={initialParams}
        />
        <Stack.Screen name="StepPropertyPhotos" component={StepPhotosScreen} />
        <Stack.Screen name="PropertyReview" component={PropertyReviewScreen} />
      </Stack.Navigator>
    </PropertyWizardProvider>
  );
}
