// PromoSearchBar Component - Search input for promotions
import React, { memo, useCallback, useRef } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Pressable,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { palette, radii, fonts } from '../../../theme/kit';

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
    borderColor: isFocused.value === 1 ? palette.ink : 'transparent',
    borderWidth: 1.5,
  }));

  const clearButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: clearScale.value }],
    opacity: clearScale.value,
  }));

  return (
    <Animated.View
      style={[
        styles.container,
        containerAnimatedStyle,
      ]}
      testID={testID}
    >
      <Ionicons
        name="search"
        size={18}
        color={palette.textMuted}
        style={styles.searchIcon}
      />
      <TextInput
        ref={inputRef}
        style={styles.input}
        value={value}
        onChangeText={handleChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.textMuted}
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
        <View style={styles.clearIcon}>
          <Ionicons
            name="close"
            size={14}
            color={palette.textMuted}
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
    borderRadius: radii.pill,
    paddingHorizontal: 18,
    height: 52,
    backgroundColor: palette.surface,
  },
  searchIcon: {
    marginRight: 10,
  },
  input: {
    ...fonts.medium,
    flex: 1,
    fontSize: 15,
    color: palette.text,
    paddingVertical: 8,
  },
  clearButton: {
    marginLeft: 8,
  },
  clearIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default memo(PromoSearchBar);
