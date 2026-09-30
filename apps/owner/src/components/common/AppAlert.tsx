import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  BackHandler,
} from 'react-native';
import { palette, radii, fonts } from '../../theme/kit';

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
                const isStacked = state.buttons.length > 2;
                // Explicit margins instead of `gap`: horizontal in a row,
                // vertical when stacked (column-reverse, so below).
                const spacingStyle =
                  idx === 0 ? null : isStacked ? styles.stackGap : styles.rowGap;
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
                      numberOfLines={1}
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
        </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  // Covers the whole modal window.
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
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    padding: 24,
    width: '100%',
    maxWidth: 420,
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
  title: {
    ...fonts.semibold,
    fontSize: 20,
    letterSpacing: -0.3,
    color: palette.text,
    marginBottom: 8,
  },
  messageScroll: { maxHeight: 240, marginBottom: 22 },
  messageContainer: { paddingRight: 4 },
  message: {
    ...fonts.medium,
    fontSize: 14.5,
    color: palette.textMuted,
    lineHeight: 21,
  },
  // Two buttons share a row at equal width; more than two stack.
  actions: { flexDirection: 'row', alignItems: 'center' },
  actionsStacked: { flexDirection: 'column-reverse', alignItems: 'stretch' },
  rowGap: { marginLeft: 8 },
  stackGap: { marginBottom: 8 },
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
  // failed to paint inside a nested modal.
  buttonPrimary: { backgroundColor: palette.ink, borderWidth: 1.5, borderColor: palette.ink },
  buttonCancel: { backgroundColor: palette.fill, borderWidth: 1.5, borderColor: palette.fill },
  buttonDestructive: {
    backgroundColor: palette.danger,
    borderWidth: 1.5,
    borderColor: palette.danger,
  },
  buttonText: { ...fonts.semibold, fontSize: 15 },
  buttonTextPrimary: { color: palette.textInverse },
  buttonTextCancel: { color: palette.text },
  buttonTextDestructive: { color: palette.textInverse },
});

export default AppAlert;
