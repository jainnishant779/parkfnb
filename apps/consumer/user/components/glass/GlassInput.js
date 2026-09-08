/**
 * GlassInput — translucent rounded text field with leading icon slot
 * and trailing accessory slot (e.g., validation tick). Matches the
 * fake-glassmorphism treatment of GlassCard so inputs sit naturally
 * inside cards. Focus state pumps a teal halo into the border.
 */
import React, { useRef, useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Animated,
} from 'react-native';
import { palette, radii, motion, fontStacks } from '../../theme';

const GlassInput = ({
  value,
  onChangeText,
  placeholder,
  leftIcon = null,
  right = null,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'none',
  autoComplete,
  maxLength,
  editable = true,
  onSubmitEditing,
  onFocus,
  onBlur,
  returnKeyType,
  style,
  inputStyle,
  testID,
}) => {
  const [focused, setFocused] = useState(false);
  const halo = useRef(new Animated.Value(0)).current;

  const animate = (to) =>
    Animated.timing(halo, {
      toValue: to,
      duration: motion.fast,
      useNativeDriver: false,
    }).start();

  const borderColor = halo.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0.85)', palette.primary],
  });

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          borderColor,
          backgroundColor: focused
            ? 'rgba(255,255,255,0.95)'
            : 'rgba(255,255,255,0.85)',
        },
        style,
      ]}
    >
      {leftIcon ? <View style={styles.left}>{leftIcon}</View> : null}
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.textSubtle}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        maxLength={maxLength}
        editable={editable}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType}
        underlineColorAndroid="transparent"
        onFocus={(e) => {
          setFocused(true);
          animate(1);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          animate(0);
          onBlur?.(e);
        }}
        style={[styles.input, { fontFamily: fontStacks.regular }, inputStyle]}
      />
      {right ? <View style={styles.right}>{right}</View> : null}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 16,
    minHeight: 56,
    overflow: 'hidden',
  },
  left: {
    marginRight: 10,
    width: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  right: {
    marginLeft: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: palette.text,
    paddingVertical: 12,
    letterSpacing: 0,
    backgroundColor: 'transparent',
    includeFontPadding: false,
  },
});

export default GlassInput;
