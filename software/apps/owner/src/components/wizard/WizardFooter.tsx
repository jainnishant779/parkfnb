import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, radii, fonts } from '../../theme/kit';

interface Props {
  primaryLabel: string;
  onPrimary: () => void;
  disabled?: boolean;
  loading?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  errorText?: string;
}

export default function WizardFooter({
  primaryLabel,
  onPrimary,
  disabled,
  loading,
  secondaryLabel,
  onSecondary,
  errorText,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(12, insets.bottom + 8) }]}>
      {errorText ? <Text style={styles.error}>{errorText}</Text> : null}
      {secondaryLabel && onSecondary ? (
        <TouchableOpacity
          style={styles.secondary}
          onPress={onSecondary}
          disabled={loading}
          activeOpacity={0.7}
        >
          <Text style={styles.secondaryText}>{secondaryLabel}</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        style={[styles.primary, (disabled || loading) && styles.primaryDisabled]}
        onPress={onPrimary}
        disabled={disabled || loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color={palette.textInverse} />
        ) : (
          <Text style={styles.primaryText}>{primaryLabel}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: palette.surface,
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 8,
  },
  primary: {
    backgroundColor: palette.ink,
    borderRadius: radii.pill,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryDisabled: { backgroundColor: '#D6D6D6' },
  primaryText: { ...fonts.semibold, color: palette.textInverse, fontSize: 16 },
  secondary: {
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  secondaryText: { ...fonts.semibold, color: palette.text, fontSize: 15 },
  error: {
    ...fonts.medium,
    color: palette.danger,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 10,
  },
});
