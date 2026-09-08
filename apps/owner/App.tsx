import "./global.css";
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { navigationRef } from './src/navigation/navigationRef';
import { AuthProvider } from './src/context/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';
import { initializeMsg91 } from './src/services/msg91Service';
import { AppAlertProvider } from './src/components/common/AppAlert';

// Initialize the MSG91 OTP SDK at module load (before first render).
// Idempotent — safe even though msg91Service guards calls with the same init.
initializeMsg91();

export default function App() {
  return (
    // SafeAreaProvider must wrap everything that consumes safe-area
    // insets (status bar, notch, home indicator). Without it,
    // `useSafeAreaInsets()` and `<SafeAreaView edges={...}>` from
    // react-native-safe-area-context fall back to zero insets, which
    // is why screens were rendering under the status bar.
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
          </NavigationContainer>
        </AuthProvider>
      </AppAlertProvider>
    </SafeAreaProvider>
  );
}
