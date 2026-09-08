import React, { memo, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';

export interface SegmentOption<T extends string> {
  key: T;
  label: string;
  badge?: number;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  selectedKey: T;
  onSelect: (key: T) => void;
  testID?: string;
}

function SegmentedControl<T extends string>({
  options,
  selectedKey,
  onSelect,
  testID,
}: SegmentedControlProps<T>) {
  // Force light mode
  const theme = useMemo(() => getTheme(false), []);

  return (
    <View
      style={[styles.container, { backgroundColor: theme.borderLight }]}
      testID={testID}
    >
      {options.map((option) => {
        const isSelected = option.key === selectedKey;

        return (
          <Pressable
            key={option.key}
            onPress={() => onSelect(option.key)}
            style={[
              styles.segment,
              isSelected && [styles.segmentSelected, { backgroundColor: theme.surface }],
            ]}
            accessibilityLabel={option.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
          >
            <Text
              style={[
                styles.segmentText,
                { color: isSelected ? theme.text : theme.textMuted },
                isSelected && styles.segmentTextSelected,
              ]}
            >
              {option.label}
            </Text>
            {option.badge !== undefined && option.badge > 0 && (
              <View
                style={[
                  styles.badge,
                  { backgroundColor: isSelected ? theme.danger : theme.textMuted },
                ]}
              >
                <Text style={styles.badgeText}>
                  {option.badge > 9 ? '9+' : option.badge}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: borderRadius.md,
    padding: 3,
    gap: 2,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[2],
    borderRadius: borderRadius.md - 2,
    gap: 4,
  },
  segmentSelected: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },
  segmentTextSelected: {
    fontWeight: fontWeight.semibold as any,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: fontWeight.bold as any,
  },
});

export default memo(SegmentedControl) as typeof SegmentedControl;
