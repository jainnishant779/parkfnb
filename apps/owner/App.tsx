import "./global.css";
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { navigationRef } from './src/navigation/navigationRef';
import { AuthProvider } from './src/context/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';
import { initializeMsg91 } from './src/services/msg91Service';
import { AppAlertProvider } from './src/components/common/AppAlert';

import { OtaUpdateBanner } from './src/components/common/OtaUpdateBanner';

// Initialize the MSG91 OTP SDK at module load (before first render).
// Idempotent — safe even though msg91Service guards calls with the same init.
initializeMsg91();

export default function App() {
  return (
    <SafeAreaProvider>
      <AppAlertProvider>
        <AuthProvider>
          <NavigationContainer
            ref={navigationRef}
            onStateChange={() =>
              console.log('Current route:', navigationRef.getCurrentRoute()?.name)
            }
          >
            <RootNavigator />
            <OtaUpdateBanner />
          </NavigationContainer>
        </AuthProvider>
      </AppAlertProvider>
    </SafeAreaProvider>
  );
}
