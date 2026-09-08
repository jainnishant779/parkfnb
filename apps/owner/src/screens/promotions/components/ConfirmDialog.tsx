// ConfirmDialog Component - Confirmation modal for delete/deactivate actions
import React, { memo, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../../theme/colors';
import { spacing, borderRadius } from '../../../theme/spacing';
import { fontSize, fontWeight } from '../../../theme/typography';

interface ConfirmDialogProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  testID?: string;
}

function ConfirmDialog({
  visible,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  testID,
}: ConfirmDialogProps) {
  const theme = useMemo(() => getTheme(false), []);
  const scale = useSharedValue(0.9);
  const opacity = useSharedValue(0);

  React.useEffect(() => {
    if (visible) {
      scale.value = withSpring(1, { damping: 15, stiffness: 200 });
      opacity.value = withTiming(1, { duration: 200 });
    } else {
      scale.value = withSpring(0.9, { damping: 15, stiffness: 200 });
      opacity.value = withTiming(0, { duration: 150 });
    }
  }, [visible, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const getVariantColors = useCallback(() => {
    switch (variant) {
      case 'danger':
        return {
          icon: 'warning',
          iconColor: theme.danger,
          bgColor: theme.dangerLight,
          buttonBg: theme.danger,
        };
      case 'warning':
        return {
          icon: 'alert-circle',
          iconColor: theme.warning,
          bgColor: theme.warningLight,
          buttonBg: theme.warning,
        };
      case 'info':
      default:
        return {
          icon: 'information-circle',
          iconColor: theme.info,
          bgColor: theme.infoLight,
          buttonBg: theme.primary,
        };
    }
  }, [variant, theme]);

  const variantColors = getVariantColors();

  const handleConfirm = useCallback(() => {
    onConfirm();
    onClose();
  }, [onConfirm, onClose]);

  if (!visible) return null;

  return visible ? (

      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close dialog"
        />
        <Animated.View
          style={[
            styles.dialog,
            { backgroundColor: theme.surface },
            animatedStyle,
          ]}
          testID={testID}
        >
          {/* Icon */}
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: variantColors.bgColor },
            ]}
          >
            <Ionicons
              name={variantColors.icon}
              size={32}
              color={variantColors.iconColor}
            />
          </View>

          {/* Content */}
          <Text style={[styles.title, { color: theme.text }]}>
            {title}
          </Text>
          <Text style={[styles.message, { color: theme.textSecondary }]}>
            {message}
          </Text>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              style={[
                styles.button,
                styles.cancelButton,
                { backgroundColor: theme.borderLight },
              ]}
              accessibilityLabel={cancelLabel}
              accessibilityRole="button"
              testID={testID ? `${testID}-cancel` : undefined}
            >
              <Text style={[styles.buttonText, { color: theme.text }]}>
                {cancelLabel}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleConfirm}
              style={[
                styles.button,
                styles.confirmButton,
                { backgroundColor: variantColors.buttonBg },
              ]}
              accessibilityLabel={confirmLabel}
              accessibilityRole="button"
              testID={testID ? `${testID}-confirm` : undefined}
            >
              <Text style={[styles.buttonText, styles.confirmButtonText]}>
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    
    ) : null;
}

const styles = StyleSheet.create({
  overlay: {
    // Absolutely positioned rather than flex:1 — no longer inside a
    // <Modal>, which does not present on this build.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[6],
  },
  dialog: {
    width: '100%',
    maxWidth: 340,
    borderRadius: borderRadius.xl,
    padding: spacing[6],
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[4],
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
    textAlign: 'center',
    marginBottom: spacing[2],
  },
  message: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing[5],
  },
  actions: {
    flexDirection: 'row',
    gap: spacing[3],
    width: '100%',
  },
  button: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {},
  confirmButton: {},
  buttonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  confirmButtonText: {
    color: '#FFFFFF',
  },
});

export default memo(ConfirmDialog);
