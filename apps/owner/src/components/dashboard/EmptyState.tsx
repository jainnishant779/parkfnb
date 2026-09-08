import React, { memo, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';

export interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

function EmptyState({
  icon = 'folder-open-outline',
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
}: EmptyStateProps) {
  // Force light mode
  const theme = useMemo(() => getTheme(false), []);

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: theme.borderLight },
          compact && styles.iconContainerCompact,
        ]}
      >
        <Ionicons
          name={icon}
          size={compact ? 24 : 32}
          color={theme.textMuted}
        />
      </View>

      <Text
        style={[
          styles.title,
          { color: theme.textSecondary },
          compact && styles.titleCompact,
        ]}
      >
        {title}
      </Text>

      {description && (
        <Text
          style={[
            styles.description,
            { color: theme.textMuted },
            compact && styles.descriptionCompact,
          ]}
        >
          {description}
        </Text>
      )}

      {actionLabel && onAction && (
        <Pressable
          onPress={onAction}
          style={[
            styles.actionButton,
            { backgroundColor: theme.primary },
          ]}
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
        >
          <Text style={styles.actionButtonText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[6],
    paddingHorizontal: spacing[4],
  },
  containerCompact: {
    paddingVertical: spacing[4],
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  iconContainerCompact: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginBottom: spacing[2],
  },
  title: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium as any,
    textAlign: 'center',
    marginBottom: spacing[1],
  },
  titleCompact: {
    fontSize: fontSize.sm,
  },
  description: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
  descriptionCompact: {
    fontSize: fontSize.xs,
  },
  actionButton: {
    marginTop: spacing[4],
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.md,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
  },
});

export default memo(EmptyState);
