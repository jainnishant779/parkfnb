import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  ScrollView,
  Animated,
  Easing,
} from 'react-native';

// ============================================================================
// AppAlert — drop-in replacement for `Alert.alert` from react-native, but
// rendered as an in-app modal with our own styling (no native dialog).
//
// Usage is signature-compatible with Alert.alert so call sites can do a
// straight find/replace:
//
//   AppAlert.alert('Title', 'message');
//   AppAlert.alert(
//     'Cancel booking?',
//     "This can't be undone.",
//     [
//       { text: 'Cancel', style: 'cancel' },
//       { text: 'Confirm', style: 'destructive', onPress: () => doIt() },
//     ],
//   );
//
// One <AppAlertProvider> must be mounted at the root of the app.
// ============================================================================

const EMPTY_STATE = {
  visible: false,
  buttons: [{ text: 'OK' }],
  cancelable: true,
};

let _setState = null;

function showAlert(title, message, buttons, options) {
  const next = {
    visible: true,
    title,
    message,
    buttons: buttons && buttons.length ? buttons : [{ text: 'OK' }],
    cancelable: options?.cancelable !== false,
    onDismiss: options?.onDismiss,
  };
  if (_setState) {
    _setState(next);
  } else if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn(
      '[AppAlert] No <AppAlertProvider> mounted — alert dropped:',
      { title, message },
    );
  }
}

export const AppAlert = {
  alert: showAlert,
};

export function AppAlertProvider({ children }) {
  const [state, setState] = useState(EMPTY_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Animations: backdrop fade + card scale/translate.
  // Driving these manually (rather than relying on Modal's animationType)
  // gives us a softer, less abrupt entrance — the previous popup snapped
  // in with a hard fade, which read as janky.
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    _setState = setState;
    return () => {
      if (_setState === setState) _setState = null;
    };
  }, []);

  useEffect(() => {
    if (state.visible) {
      backdropAnim.setValue(0);
      cardAnim.setValue(0);
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(cardAnim, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [state.visible, backdropAnim, cardAnim]);

  const dismiss = useCallback(() => {
    setState((s) => ({ ...s, visible: false }));
  }, []);

  const handleButton = useCallback((btn) => {
    setState((s) => ({ ...s, visible: false }));
    btn.onPress?.();
  }, []);

  const handleBackdropPress = useCallback(() => {
    if (!stateRef.current.cancelable) return;
    dismiss();
    stateRef.current.onDismiss?.();
  }, [dismiss]);

  const cardStyle = {
    opacity: cardAnim,
    transform: [
      {
        scale: cardAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.92, 1],
        }),
      },
      {
        translateY: cardAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [12, 0],
        }),
      },
    ],
  };

  return (
    <>
      {children}
      <Modal
        transparent
        visible={state.visible}
        animationType="none"
        onRequestClose={handleBackdropPress}
        statusBarTranslucent
      >
        <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
          <Pressable style={styles.backdropPress} onPress={handleBackdropPress}>
            <Animated.View style={[styles.cardWrap, cardStyle]} pointerEvents="box-none">
              <Pressable style={styles.card} onPress={() => {}}>
            {state.title ? <Text style={styles.title}>{state.title}</Text> : null}
            {state.message ? (
              <ScrollView style={styles.messageScroll} contentContainerStyle={styles.messageContainer}>
                <Text style={styles.message}>{state.message}</Text>
              </ScrollView>
            ) : null}
            <View
              style={[
                styles.actions,
                state.buttons.length > 2 && styles.actionsStacked,
              ]}
            >
              {state.buttons.map((btn, idx) => {
                const isCancel = btn.style === 'cancel';
                const isDestructive = btn.style === 'destructive';
                const isStacked = state.buttons.length > 2;
                // Spacing between buttons. Use explicit margins instead of
                // `gap` so this works in any RN/Yoga combo: a horizontal gap
                // when laid out as a row, vertical gap when stacked.
                const spacingStyle = idx === 0
                  ? null
                  : isStacked
                    ? { marginTop: 8 }
                    : { marginLeft: 8 };
                return (
                  <Pressable
                    key={`${btn.text}-${idx}`}
                    onPress={() => handleButton(btn)}
                    style={({ pressed }) => [
                      styles.button,
                      isCancel && styles.buttonCancel,
                      isDestructive && styles.buttonDestructive,
                      !isCancel && !isDestructive && styles.buttonPrimary,
                      pressed && styles.buttonPressed,
                      isStacked && styles.buttonFull,
                      spacingStyle,
                    ]}
                  >
                    <Text
                      style={[
                        styles.buttonText,
                        isCancel && styles.buttonTextCancel,
                        isDestructive && styles.buttonTextDestructive,
                        !isCancel && !isDestructive && styles.buttonTextPrimary,
                      ]}
                    >
                      {btn.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
              </Pressable>
            </Animated.View>
          </Pressable>
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  backdropPress: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  cardWrap: {
    width: '100%',
    maxWidth: 420,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    width: '100%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.22,
        shadowRadius: 28,
      },
      android: { elevation: 14 },
    }),
  },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  messageScroll: { maxHeight: 240, marginBottom: 18 },
  messageContainer: { paddingRight: 4 },
  message: { fontSize: 14, color: '#475569', lineHeight: 20 },
  // Default 2-button layout: row, right-aligned, no wrap. With many
  // buttons (>2) we switch to a vertical stack so each gets full width.
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  actionsStacked: { flexDirection: 'column-reverse', alignItems: 'stretch' },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    minHeight: 40,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonFull: { width: '100%' },
  buttonPressed: { opacity: 0.7 },
  buttonPrimary: { backgroundColor: '#0D7377' },
  buttonCancel: { backgroundColor: '#F1F5F9' },
  buttonDestructive: { backgroundColor: '#EF4444' },
  buttonText: { fontSize: 14, fontWeight: '600' },
  buttonTextPrimary: { color: '#FFFFFF' },
  buttonTextCancel: { color: '#1F2937' },
  buttonTextDestructive: { color: '#FFFFFF' },
});

export default AppAlert;
