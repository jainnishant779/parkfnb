// CodePill Component - Displays promo code with copy functionality
import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { palette, radii, fonts } from '../../../theme/kit';

interface CodePillProps {
  code: string;
  onCopy?: () => void;
  size?: 'small' | 'medium';
  testID?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function CodePill({ code, onCopy, size = 'medium', testID }: CodePillProps) {
  const scale = useSharedValue(1);

  const handleCopy = useCallback(() => {
    Clipboard.setString(code);

    // Animate feedback
    scale.value = withSequence(
      withSpring(0.95, { damping: 15, stiffness: 400 }),
      withSpring(1, { damping: 15, stiffness: 400 })
    );

    onCopy?.();
  }, [code, onCopy, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const isSmall = size === 'small';

  return (
    <AnimatedPressable
      onPress={handleCopy}
      style={[
        styles.container,
        isSmall && styles.containerSmall,
        animatedStyle,
      ]}
      accessibilityLabel={`Copy promo code ${code}`}
      accessibilityRole="button"
      accessibilityHint="Double tap to copy code to clipboard"
      testID={testID}
    >
      <Text
        style={[
          styles.code,
          isSmall && styles.codeSmall,
        ]}
        numberOfLines={1}
      >
        {code}
      </Text>
      <View style={styles.iconContainer}>
        <Ionicons
          name="copy-outline"
          size={isSmall ? 12 : 14}
          color={palette.textInverse}
        />
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 4,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: palette.surface,
    gap: 8,
    alignSelf: 'flex-start',
  },
  containerSmall: {
    paddingLeft: 12,
    paddingVertical: 3,
    gap: 6,
  },
  code: {
    ...fonts.bold,
    fontSize: 14,
    letterSpacing: 1,
    color: palette.text,
  },
  codeSmall: {
    fontSize: 13,
    letterSpacing: 0.8,
  },
  iconContainer: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default memo(CodePill);
