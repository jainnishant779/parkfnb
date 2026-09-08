// CodePill Component - Displays promo code with copy functionality
import React, { memo, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { getTheme } from '../../../theme/colors';
import { spacing, borderRadius } from '../../../theme/spacing';
import { fontSize, fontWeight } from '../../../theme/typography';

interface CodePillProps {
  code: string;
  onCopy?: () => void;
  size?: 'small' | 'medium';
  testID?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function CodePill({ code, onCopy, size = 'medium', testID }: CodePillProps) {
  const theme = useMemo(() => getTheme(false), []);
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
        {
          backgroundColor: theme.borderLight,
          borderColor: theme.border,
        },
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
          { color: theme.text },
          isSmall && styles.codeSmall,
        ]}
        numberOfLines={1}
      >
        {code}
      </Text>
      <View style={[styles.iconContainer, { backgroundColor: theme.surface }]}>
        <Ionicons
          name="copy-outline"
          size={isSmall ? 12 : 14}
          color={theme.textMuted}
        />
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing[3],
    paddingRight: spacing[1],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing[2],
    alignSelf: 'flex-start',
  },
  containerSmall: {
    paddingLeft: spacing[2],
    paddingVertical: 2,
    gap: spacing[1],
  },
  code: {
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
    letterSpacing: 0.5,
  },
  codeSmall: {
    fontSize: fontSize.xs,
    letterSpacing: 0.3,
  },
  iconContainer: {
    padding: 4,
    borderRadius: borderRadius.sm,
  },
});

export default memo(CodePill);
