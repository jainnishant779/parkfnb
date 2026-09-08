// PromoBottomSheet Component - Reusable bottom sheet for promotions screen
import React, { memo, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  Dimensions,
  Platform,
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
import { getTheme } from '../../../theme/colors';
import { spacing, borderRadius } from '../../../theme/spacing';
import { fontSize, fontWeight } from '../../../theme/typography';

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
  const theme = useMemo(() => getTheme(false), []);
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
                backgroundColor: theme.surface,
                maxHeight,
                paddingBottom: insets.bottom + spacing[4],
              },
              sheetStyle,
            ]}
            testID={testID}
          >
            {/* Handle */}
            {showHandle && (
              <View style={styles.handleContainer}>
                <View
                  style={[styles.handle, { backgroundColor: theme.border }]}
                />
              </View>
            )}

            {/* Header */}
            <View style={styles.header}>
              <Text style={[styles.title, { color: theme.text }]}>
                {title}
              </Text>
              <Pressable
                onPress={handleClose}
                style={[styles.closeButton, { backgroundColor: theme.borderLight }]}
                accessibilityLabel="Close"
                accessibilityRole="button"
              >
                <Ionicons
                  name="close"
                  size={20}
                  color={theme.textSecondary}
                />
              </Pressable>
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 24,
      },
    }),
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: spacing[2],
    paddingBottom: spacing[1],
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
  },
});

export default memo(PromoBottomSheet);
