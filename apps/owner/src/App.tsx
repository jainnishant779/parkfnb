import '../global.css';
import React from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import RootNavigator from './navigation/RootNavigator';
import { navigationRef } from './navigation/navigationRef';
import { AuthProvider } from './context/AuthContext';
import { AppAlertProvider } from './components/common/AppAlert';
import KeyboardInset from './components/common/KeyboardInset';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* App-wide default; screens on photos/cream set their own. */}
        <StatusBar barStyle="dark-content" backgroundColor="#F3F3F3" />
        {/* Android 15+ ignores adjustResize; this keeps inputs above the keyboard. */}
        <KeyboardInset>
        {/* AppAlert.alert() drops every alert unless this provider is mounted. */}
        <AppAlertProvider>
        <AuthProvider>
          <NavigationContainer
            ref={navigationRef}
            onStateChange={() => {
              console.log('Current route:', navigationRef.getCurrentRoute()?.name);
            }}
          >
            <RootNavigator />
          </NavigationContainer>
        </AuthProvider>
        </AppAlertProvider>
        </KeyboardInset>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
