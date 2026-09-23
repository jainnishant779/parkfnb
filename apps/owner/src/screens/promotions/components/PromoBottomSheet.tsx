// PromoBottomSheet Component - Reusable bottom sheet for promotions screen
import React, { memo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { palette, radii, fonts } from '../../../theme/kit';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface PromoBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  showHandle?: boolean;
  maxHeight?: number;
  testID?: string;
}

function PromoBottomSheet({
  visible,
  onClose,
  title,
  children,
  showHandle = true,
  maxHeight = SCREEN_HEIGHT * 0.7,
  testID,
}: PromoBottomSheetProps) {
  const insets = useSafeAreaInsets();

  const translateY = useSharedValue(maxHeight);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, {
        damping: 20,
        stiffness: 200,
      });
      backdropOpacity.value = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withSpring(maxHeight, {
        damping: 20,
        stiffness: 200,
      });
      backdropOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible, maxHeight, translateY, backdropOpacity]);

  const handleClose = useCallback(() => {
    translateY.value = withSpring(maxHeight, {
      damping: 20,
      stiffness: 200,
    });
    backdropOpacity.value = withTiming(0, { duration: 200 });
    setTimeout(onClose, 200);
  }, [maxHeight, onClose, translateY, backdropOpacity]);

  const gesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > maxHeight * 0.3 || event.velocityY > 500) {
        runOnJS(handleClose)();
      } else {
        translateY.value = withSpring(0, {
          damping: 20,
          stiffness: 200,
        });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (!visible) return null;

  return visible ? (

      <GestureHandlerRootView style={styles.modalContainer}>
        {/* Backdrop */}
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={handleClose}
            accessibilityLabel="Close sheet"
            accessibilityRole="button"
          />
        </Animated.View>

        {/* Sheet */}
        <GestureDetector gesture={gesture}>
          <Animated.View
            style={[
              styles.sheet,
              {
                maxHeight,
                paddingBottom: insets.bottom + 16,
              },
              sheetStyle,
            ]}
            testID={testID}
          >
            {/* Handle */}
            {showHandle && (
              <View style={styles.handleContainer}>
                <View style={styles.handle} />
              </View>
            )}

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <TouchableOpacity
                onPress={handleClose}
                activeOpacity={0.7}
                style={styles.closeButton}
                accessibilityLabel="Close"
                accessibilityRole="button"
              >
                <Ionicons name="close" size={20} color={palette.text} />
              </TouchableOpacity>
            </View>

            {/* Content */}
            <ScrollView
              style={styles.content}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {children}
            </ScrollView>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    
    ) : null;
}

const styles = StyleSheet.create({
  modalContainer: {
    // Absolutely positioned rather than flex:1 — no longer inside a
    // <Modal>, which does not present on this build.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 24,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.line,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    ...fonts.semibold,
    fontSize: 22,
    letterSpacing: -0.4,
    color: palette.text,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
});

export default memo(PromoBottomSheet);
