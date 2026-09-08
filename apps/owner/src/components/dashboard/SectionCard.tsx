import React, { memo, ReactNode, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';

export interface SectionCardProps {
  title: string;
  rightAction?: {
    label: string;
    onPress: () => void;
  };
  children: ReactNode;
  noPadding?: boolean;
  testID?: string;
}

function SectionCard({
  title,
  rightAction,
  children,
  noPadding = false,
  testID,
}: SectionCardProps) {
  // Force light mode
  const theme = useMemo(() => getTheme(false), []);

  return (
    <View
      style={[styles.container, { backgroundColor: theme.surface }]}
      testID={testID}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        {rightAction && (
          <Pressable
            onPress={rightAction.onPress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={rightAction.label}
            accessibilityRole="button"
          >
            <Text style={[styles.actionText, { color: theme.primary }]}>
              {rightAction.label}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Content */}
      <View style={noPadding ? undefined : styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    marginBottom: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[3],
  },
  title: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  actionText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  content: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[4],
  },
});

export default memo(SectionCard);
