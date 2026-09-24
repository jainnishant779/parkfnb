/**
 * SheetModal — bottom sheet popup. The dark backdrop fades in on its own
 * while only the white card slides up from the bottom (a plain
 * `<Modal animationType="slide">` slid the backdrop up together with the
 * card). Tapping the backdrop or the Android back button closes it.
 *
 *   <SheetModal visible={open} onClose={() => setOpen(false)}>
 *     ...sheet content (grabber is drawn for you)...
 *   </SheetModal>
 */
import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Pressable, Animated, Easing, StyleSheet, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import KeyboardInset from '../KeyboardInset';
import { palette, radii } from '../../theme';

const SCREEN_H = Dimensions.get('window').height;

const SheetModal = ({ visible, onClose, children, style, maxHeight = '88%', grabber = true }) => {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(SCREEN_H)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      fade.setValue(0);
      slide.setValue(SCREEN_H);
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(slide, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(slide, {
          toValue: SCREEN_H,
          duration: 220,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      // Unmount on a timer, not the animation callback: if the close
      // animation is interrupted, `finished` is false and the invisible
      // Modal stayed mounted, swallowing every tap on the screen.
      const t = setTimeout(() => setMounted(false), 240);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardInset>
        <View style={styles.root}>
          <Animated.View style={[styles.backdrop, { opacity: fade }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          </Animated.View>
          <Animated.View
            style={[
              styles.sheet,
              { maxHeight, paddingBottom: insets.bottom + 20, transform: [{ translateY: slide }] },
              style,
            ]}
          >
            {grabber ? <View style={styles.grabber} /> : null}
            {children}
          </Animated.View>
        </View>
      </KeyboardInset>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.line,
    marginBottom: 16,
  },
});

export default SheetModal;
