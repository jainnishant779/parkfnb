import React, { memo, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { getTheme } from '../../theme/colors';
import { palette, radii, fonts, shadow } from '../../theme/kit';

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
      style={[styles.container, { backgroundColor: palette.fill }]}
      testID={testID}
    >
      {options.map((option) => {
        const isSelected = option.key === selectedKey;

        return (
          <TouchableOpacity
            key={option.key}
            activeOpacity={0.8}
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
              ]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
            {option.badge !== undefined && option.badge > 0 && (
              <View
                style={[
                  styles.badge,
                  { backgroundColor: isSelected ? palette.ink : palette.textSubtle },
                ]}
              >
                <Text style={styles.badgeText}>
                  {option.badge > 9 ? '9+' : option.badge}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: radii.pill,
    padding: 5,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 42,
    paddingHorizontal: 8,
    borderRadius: radii.pill,
    gap: 6,
  },
  segmentSelected: {
    ...shadow.press,
  },
  segmentText: {
    ...fonts.semibold,
    fontSize: 14,
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
    ...fonts.bold,
    color: palette.textInverse,
    fontSize: 10,
  },
});

export default memo(SegmentedControl) as typeof SegmentedControl;
