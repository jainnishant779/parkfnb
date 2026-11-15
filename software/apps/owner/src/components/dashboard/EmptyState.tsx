import React, { memo, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../theme/colors';
import { palette, radii, fonts } from '../../theme/kit';

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
          { backgroundColor: palette.peachSoft },
          compact && styles.iconContainerCompact,
        ]}
      >
        <Ionicons
          name={icon}
          size={compact ? 22 : 30}
          color={palette.text}
        />
      </View>

      <Text
        style={[
          styles.title,
          { color: theme.text },
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
        <TouchableOpacity
          onPress={onAction}
          activeOpacity={0.8}
          style={styles.actionButton}
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
        >
          <Text style={styles.actionButtonText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  containerCompact: {
    paddingVertical: 16,
  },
  iconContainer: {
    width: 76,
    height: 76,
    borderRadius: 38,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  iconContainerCompact: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginBottom: 10,
  },
  title: {
    ...fonts.semibold,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 6,
  },
  titleCompact: {
    fontSize: 15,
  },
  description: {
    ...fonts.medium,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
  descriptionCompact: {
    fontSize: 13,
  },
  actionButton: {
    marginTop: 18,
    paddingHorizontal: 22,
    height: 48,
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: palette.ink,
  },
  actionButtonText: {
    ...fonts.semibold,
    color: palette.textInverse,
    fontSize: 15,
  },
});

export default memo(EmptyState);
