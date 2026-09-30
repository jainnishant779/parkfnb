import React, { memo, ReactNode, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { getTheme } from '../../theme/colors';
import { radii, fonts } from '../../theme/kit';

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
          <TouchableOpacity
            onPress={rightAction.onPress}
            activeOpacity={0.7}
            style={[styles.action, { backgroundColor: theme.background }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={rightAction.label}
            accessibilityRole="button"
          >
            <Text style={[styles.actionText, { color: theme.text }]}>
              {rightAction.label}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      <View style={noPadding ? undefined : styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.xl,
    marginBottom: 0,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  title: {
    ...fonts.semibold,
    fontSize: 19,
    letterSpacing: -0.3,
  },
  action: {
    paddingHorizontal: 12,
    height: 30,
    borderRadius: radii.pill,
    justifyContent: 'center',
  },
  actionText: {
    ...fonts.semibold,
    fontSize: 13,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
});

export default memo(SectionCard);
