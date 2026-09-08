// PromoSearchBar Component - Search input for promotions
import React, { memo, useMemo, useCallback, useRef } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { getTheme } from '../../../theme/colors';
import { spacing, borderRadius } from '../../../theme/spacing';
import { fontSize } from '../../../theme/typography';

interface PromoSearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  testID?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function PromoSearchBar({
  value,
  onChangeText,
  placeholder = 'Search by name or code...',
  onFocus,
  onBlur,
  testID,
}: PromoSearchBarProps) {
  const theme = useMemo(() => getTheme(false), []);
  const inputRef = useRef<TextInput>(null);
  const isFocused = useSharedValue(0);
  const clearScale = useSharedValue(value ? 1 : 0);

  const handleFocus = useCallback(() => {
    isFocused.value = withSpring(1, { damping: 15 });
    onFocus?.();
  }, [isFocused, onFocus]);

  const handleBlur = useCallback(() => {
    isFocused.value = withSpring(0, { damping: 15 });
    onBlur?.();
  }, [isFocused, onBlur]);

  const handleChangeText = useCallback((text: string) => {
    onChangeText(text);
    clearScale.value = withSpring(text.length > 0 ? 1 : 0, { damping: 15 });
  }, [onChangeText, clearScale]);

  const handleClear = useCallback(() => {
    onChangeText('');
    clearScale.value = withSpring(0, { damping: 15 });
    inputRef.current?.blur();
  }, [onChangeText, clearScale]);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    borderColor: isFocused.value === 1 ? theme.primary : theme.border,
    borderWidth: isFocused.value === 1 ? 1.5 : 1,
  }));

  const clearButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: clearScale.value }],
    opacity: clearScale.value,
  }));

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: theme.surface },
        containerAnimatedStyle,
      ]}
      testID={testID}
    >
      <Ionicons
        name="search"
        size={18}
        color={theme.textMuted}
        style={styles.searchIcon}
      />
      <TextInput
        ref={inputRef}
        style={[styles.input, { color: theme.text }]}
        value={value}
        onChangeText={handleChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        onFocus={handleFocus}
        onBlur={handleBlur}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={placeholder}
        testID={testID ? `${testID}-input` : undefined}
      />
      <AnimatedPressable
        onPress={handleClear}
        style={[styles.clearButton, clearButtonStyle]}
        accessibilityLabel="Clear search"
        accessibilityRole="button"
        testID={testID ? `${testID}-clear` : undefined}
      >
        <View style={[styles.clearIcon, { backgroundColor: theme.borderLight }]}>
          <Ionicons
            name="close"
            size={14}
            color={theme.textMuted}
          />
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[3],
    height: 44,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  searchIcon: {
    marginRight: spacing[2],
  },
  input: {
    flex: 1,
    fontSize: fontSize.base,
    paddingVertical: spacing[2],
  },
  clearButton: {
    marginLeft: spacing[2],
  },
  clearIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default memo(PromoSearchBar);
