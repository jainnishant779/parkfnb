import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
        <Pressable style={styles.secondary} onPress={onSecondary} disabled={loading}>
          <Text style={styles.secondaryText}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
      <Pressable
        style={[styles.primary, (disabled || loading) && styles.primaryDisabled]}
        onPress={onPrimary}
        disabled={disabled || loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryText}>{primaryLabel}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  primary: {
    backgroundColor: '#0D7377',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryDisabled: { backgroundColor: '#9CA3AF' },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  secondary: {
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  secondaryText: { color: '#0D7377', fontSize: 15, fontWeight: '500' },
  error: {
    color: '#EF4444',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
  },
});
