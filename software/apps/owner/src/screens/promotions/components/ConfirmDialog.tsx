// ConfirmDialog Component - Confirmation modal for delete/deactivate actions
import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { PillButton } from '../../../components/ui';
import { palette, radii, fonts } from '../../../theme/kit';

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
          icon: 'trash-outline',
          iconColor: palette.danger,
          bgColor: palette.dangerSoft,
          button: 'ink',
        };
      case 'warning':
        return {
          icon: 'alert-circle-outline',
          iconColor: palette.warning,
          bgColor: palette.warningSoft,
          button: 'ink',
        };
      case 'info':
      default:
        return {
          icon: 'information-circle-outline',
          iconColor: palette.text,
          bgColor: palette.peachSoft,
          button: 'ink',
        };
    }
  }, [variant]);

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
          style={[styles.dialog, animatedStyle]}
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
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          {/* Actions */}
          <View style={styles.actions}>
            <View
              style={styles.button}
              accessibilityLabel={cancelLabel}
              testID={testID ? `${testID}-cancel` : undefined}
            >
              <PillButton label={cancelLabel} variant="grey" size="md" onPress={onClose} />
            </View>
            <View
              style={styles.button}
              accessibilityLabel={confirmLabel}
              testID={testID ? `${testID}-confirm` : undefined}
            >
              <PillButton label={confirmLabel} variant={variantColors.button} size="md" onPress={handleConfirm} />
            </View>
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
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radii.xl,
    padding: 24,
    alignItems: 'center',
    backgroundColor: palette.surface,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    ...fonts.semibold,
    fontSize: 20,
    letterSpacing: -0.3,
    color: palette.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    ...fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: palette.textMuted,
    textAlign: 'center',
    marginBottom: 22,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  button: {
    flex: 1,
  },
});

export default memo(ConfirmDialog);
