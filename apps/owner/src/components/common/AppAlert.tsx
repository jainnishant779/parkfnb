import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  ScrollView,
  BackHandler,
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
//     'Quit setup?',
//     "You'll be signed out.",
//     [
//       { text: 'Cancel', style: 'cancel' },
//       { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
//     ],
//   );
//
// One <AppAlertProvider> must be mounted at the root of the app. The
// provider registers itself with the imperative singleton so any module
// (including non-React code paths like services) can call AppAlert.alert.
// ============================================================================

export type AppAlertButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

export interface AppAlertOptions {
  cancelable?: boolean;
  onDismiss?: () => void;
}

interface AlertState {
  visible: boolean;
  title?: string;
  message?: string;
  buttons: AppAlertButton[];
  cancelable: boolean;
  onDismiss?: () => void;
}

const EMPTY_STATE: AlertState = {
  visible: false,
  buttons: [{ text: 'OK' }],
  cancelable: true,
};

/**
 * The provider's setter, held on globalThis rather than in a module-level
 * binding: this module can be evaluated more than once (different resolved
 * specifiers, fast refresh), and when that happened the provider registered
 * into one copy while callers read another — so every alert was silently
 * dropped.
 */
const REGISTRY_KEY = '__parkfnbAppAlertSetState';

const getSetter = (): ((state: AlertState) => void) | null =>
  (globalThis as any)[REGISTRY_KEY] ?? null;

const setSetter = (fn: ((state: AlertState) => void) | null) => {
  (globalThis as any)[REGISTRY_KEY] = fn;
};

function showAlert(
  title: string,
  message?: string,
  buttons?: AppAlertButton[],
  options?: AppAlertOptions,
) {
  const next: AlertState = {
    visible: true,
    title,
    message,
    buttons: buttons && buttons.length ? buttons : [{ text: 'OK' }],
    cancelable: options?.cancelable !== false,
    onDismiss: options?.onDismiss,
  };
  const setter = getSetter();
  if (setter) {
    setter(next);
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

// ----------------------------------------------------------------------------

export function AppAlertProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AlertState>(EMPTY_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Registered in a layout effect: it runs before the first paint, so an alert
  // fired from the earliest interaction still finds a setter, and unlike a
  // bare call during render it is not a side effect of rendering.
  useLayoutEffect(() => {
    setSetter(setState);
    return () => {
      if (getSetter() === setState) setSetter(null);
    };
  }, []);

  const dismiss = useCallback(() => {
    setState((s) => ({ ...s, visible: false }));
  }, []);

  const handleButton = useCallback(
    (btn: AppAlertButton) => {
      // Match Alert.alert: dismiss first, then run onPress so the
      // callback can synchronously open another alert if it wants to.
      setState((s) => ({ ...s, visible: false }));
      btn.onPress?.();
    },
    [],
  );

  const handleBackdropPress = useCallback(() => {
    if (!stateRef.current.cancelable) return;
    dismiss();
    stateRef.current.onDismiss?.();
  }, [dismiss]);

  // Android's back button should dismiss a cancelable alert, which <Modal>
  // used to handle via onRequestClose.
  useEffect(() => {
    if (!state.visible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBackdropPress();
      return true;
    });
    return () => sub.remove();
  }, [state.visible, handleBackdropPress]);

  return (
    <>
      {children}
      {state.visible ? (
        // A real <Modal> renders in its own window, so it cannot be painted
        // under a sibling or clipped by a parent — which is what happened to
        // the absolutely-positioned version when it was opened from inside a
        // collapsed/scrolled section. MediaPickerSheet already uses <Modal>
        // here and presents correctly, so the old "Modal never presents"
        // note no longer holds.
        <Modal
          visible
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={handleBackdropPress}
        >
        <Pressable style={[styles.backdrop, styles.overlay]} onPress={handleBackdropPress}>
          {/* Inner Pressable absorbs taps so they don't bubble up to backdrop. */}
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
                      state.buttons.length > 2 && styles.buttonFull,
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
        </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  // Covers the whole app and floats above it, which is what <Modal> used to do.
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    elevation: 24,
    zIndex: 9999,
  },
  backdrop: {
    // Absolutely positioned rather than flex:1 — no longer inside a
    // <Modal>, which does not present on this build.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 24,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 420,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
      },
      android: { elevation: 12 },
    }),
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 8,
  },
  messageScroll: { maxHeight: 240, marginBottom: 18 },
  messageContainer: { paddingRight: 4 },
  message: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionsStacked: {
    flexDirection: 'column-reverse',
  },
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
