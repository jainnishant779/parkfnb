/**
 * KeyboardInset — app-wide keyboard avoidance for Android 15+.
 *
 * Apps targeting SDK 35+ are forced edge-to-edge on Android 15 and later,
 * where `windowSoftInputMode="adjustResize"` no longer shrinks the window:
 * the keyboard simply covers the bottom of the screen and focused inputs sit
 * behind it. This wrapper restores adjustResize behaviour in JS by padding
 * the whole app by the keyboard height; Android's ScrollViews then bring the
 * focused input into view on the size change, exactly as before.
 * Older Android (native adjustResize still works) and iOS are untouched.
 */
import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, View, StyleSheet } from 'react-native';

const NEEDS_JS_INSET = Platform.OS === 'android' && Platform.Version >= 35;

const KeyboardInset = ({ children }: { children: React.ReactNode }) => {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!NEEDS_JS_INSET) return undefined;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      setInset(e?.endCoordinates?.height || 0);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setInset(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (!NEEDS_JS_INSET) return <>{children}</>;
  return <View style={[styles.fill, { paddingBottom: inset }]}>{children}</View>;
};

const styles = StyleSheet.create({ fill: { flex: 1 } });

export default KeyboardInset;
