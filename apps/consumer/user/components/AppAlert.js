import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  Animated,
  Easing,
} from 'react-native';
import { palette, fonts, radii } from '../theme';

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
                // TouchableOpacity rather than Pressable: a Pressable here
                // laid out correctly and responded to taps, but its
                // background never painted on Android inside this nested
                // modal, so the label rendered white-on-white.
                return (
                  <TouchableOpacity
                    key={`${btn.text}-${idx}`}
                    onPress={() => handleButton(btn)}
                    activeOpacity={0.7}
                    style={[
                      styles.button,
                      isCancel && styles.buttonCancel,
                      isDestructive && styles.buttonDestructive,
                      !isCancel && !isDestructive && styles.buttonPrimary,
                      isStacked ? styles.buttonFull : styles.buttonRow,
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
                  </TouchableOpacity>
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
    backgroundColor: 'rgba(0,0,0,0.45)',
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
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    padding: 24,
    width: '100%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.16,
        shadowRadius: 30,
      },
      android: { elevation: 14 },
    }),
  },
  title: { ...fonts.semibold, fontSize: 20, letterSpacing: -0.3, color: palette.text, marginBottom: 8 },
  messageScroll: { maxHeight: 240, marginBottom: 22 },
  messageContainer: { paddingRight: 4 },
  message: { ...fonts.medium, fontSize: 14.5, color: palette.textMuted, lineHeight: 21 },
  // Two buttons share a row at equal width; more than two stack.
  actions: { flexDirection: 'row', alignItems: 'center' },
  actionsStacked: { flexDirection: 'column-reverse', alignItems: 'stretch' },
  button: {
    paddingHorizontal: 18,
    height: 52,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonRow: { flex: 1 },
  buttonFull: { width: '100%' },
  // Fill plus a same-colour border: on Android the fill alone sometimes
  // failed to paint inside this nested modal, leaving an invisible button.
  buttonPrimary: { backgroundColor: palette.ink, borderWidth: 1.5, borderColor: palette.ink },
  buttonCancel: { backgroundColor: palette.fill, borderWidth: 1.5, borderColor: palette.fill },
  buttonDestructive: { backgroundColor: palette.danger, borderWidth: 1.5, borderColor: palette.danger },
  buttonText: { ...fonts.semibold, fontSize: 15 },
  buttonTextPrimary: { color: palette.textInverse },
  buttonTextCancel: { color: palette.text },
  buttonTextDestructive: { color: palette.textInverse },
});

export default AppAlert;
