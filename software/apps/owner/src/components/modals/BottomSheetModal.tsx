import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  Animated,
  PanResponder,
  Dimensions,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { palette, radii, fonts } from '../../theme/kit';

// ============================================================================
// TYPES
// ============================================================================

export interface BottomSheetModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  showCloseButton?: boolean;
  showHandle?: boolean;
  maxHeight?: number | string;
  children: React.ReactNode;
  testID?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DEFAULT_MAX_HEIGHT = SCREEN_HEIGHT * 0.85;
const SWIPE_THRESHOLD = 100;

// ============================================================================
// COMPONENT
// ============================================================================

export default function BottomSheetModal({
  visible,
  onClose,
  title,
  subtitle,
  showCloseButton = true,
  showHandle = true,
  maxHeight = DEFAULT_MAX_HEIGHT,
  children,
  testID,
}: BottomSheetModalProps) {
  const insets = useSafeAreaInsets();
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  // Calculate max height
  const computedMaxHeight = typeof maxHeight === 'string'
    ? SCREEN_HEIGHT * (parseFloat(maxHeight) / 100)
    : maxHeight;

  // Pan responder for swipe to dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 10;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > SWIPE_THRESHOLD || gestureState.vy > 0.5) {
          handleClose();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            friction: 8,
            tension: 65,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  // Open animation
  useEffect(() => {
    if (visible) {
      translateY.setValue(SCREEN_HEIGHT);
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          friction: 8,
          tension: 65,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, backdropOpacity, translateY]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  };

  if (!visible) return null;

  return visible ? (

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        {/* Backdrop */}
        <Animated.View
          style={[
            styles.backdrop,
            { opacity: backdropOpacity },
          ]}
        >
          <Pressable style={styles.backdropPressable} onPress={handleClose} />
        </Animated.View>

        {/* Sheet */}
        <Animated.View
          style={[
            styles.sheet,
            {
              maxHeight: computedMaxHeight,
              paddingBottom: insets.bottom + 16,
              transform: [{ translateY }],
            },
          ]}
        >
          {/* Handle */}
          {showHandle && (
            <View {...panResponder.panHandlers} style={styles.handleContainer}>
              <View style={styles.handle} />
            </View>
          )}

          {/* Header */}
          {(title || showCloseButton) && (
            <View style={styles.header}>
              <View style={styles.headerText}>
                {title && (
                  <Text style={styles.title} numberOfLines={1}>
                    {title}
                  </Text>
                )}
                {subtitle && (
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {subtitle}
                  </Text>
                )}
              </View>
              {showCloseButton && (
                <TouchableOpacity
                  onPress={handleClose}
                  style={styles.closeButton}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={20} color={palette.text} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Content */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    
    ) : null;
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  backdropPressable: {
    flex: 1,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.12,
        shadowRadius: 20,
      },
      android: {
        elevation: 24,
      },
    }),
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
  },
  handle: {
    width: 44,
    height: 5,
    backgroundColor: palette.line,
    borderRadius: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 6,
  },
  headerText: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    ...fonts.semibold,
    fontSize: 20,
    letterSpacing: -0.3,
    color: palette.text,
  },
  subtitle: {
    ...fonts.medium,
    fontSize: 13.5,
    color: palette.textMuted,
    marginTop: 2,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.fill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
});
