import React, { memo, useMemo, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Switch,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';

export interface ListingRowProps {
  id: string;
  title: string;
  location: string;
  isLive: boolean;
  availabilityNote?: string;
  photoUri?: string;
  onToggle: (id: string) => void;
  onPress?: () => void;
  isLast?: boolean;
}

function ListingRow({
  id,
  title,
  location,
  isLive,
  availabilityNote,
  photoUri,
  onToggle,
  onPress,
  isLast = false,
}: ListingRowProps) {
  // Force light mode
  const theme = useMemo(() => getTheme(false), []);
  const scale = useSharedValue(1);
  const [localIsLive, setLocalIsLive] = useState(isLive);

  const handleToggle = useCallback(() => {
    // Optimistic update
    setLocalIsLive(prev => !prev);
    onToggle(id);
  }, [id, onToggle]);

  const handlePressIn = useCallback(() => {
    if (onPress) {
      scale.value = withSpring(0.98, { damping: 15, stiffness: 150 });
    }
  }, [onPress, scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 150 });
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Sync local state with prop when it changes
  React.useEffect(() => {
    setLocalIsLive(isLive);
  }, [isLive]);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={!onPress}
      accessibilityLabel={`${title}, ${localIsLive ? 'Live' : 'Paused'}`}
      accessibilityRole="button"
    >
      <Animated.View
        style={[
          styles.container,
          !isLast && [styles.withBorder, { borderBottomColor: theme.borderLight }],
          animatedStyle,
        ]}
      >
        {/* Thumbnail */}
        <View style={[styles.thumbnail, { backgroundColor: theme.borderLight }]}>
          <Ionicons
            name="car-outline"
            size={24}
            color={theme.textMuted}
          />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text
            style={[styles.title, { color: theme.text }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text
            style={[styles.location, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {location}
          </Text>
          {availabilityNote && (
            <View style={styles.availabilityRow}>
              <View
                style={[
                  styles.availabilityDot,
                  {
                    backgroundColor: localIsLive
                      ? theme.success
                      : theme.textMuted,
                  },
                ]}
              />
              <Text
                style={[
                  styles.availabilityText,
                  { color: localIsLive ? theme.success : theme.textMuted },
                ]}
              >
                {localIsLive ? availabilityNote : 'Paused'}
              </Text>
            </View>
          )}
        </View>

        {/* Toggle Switch */}
        <Switch
          value={localIsLive}
          onValueChange={handleToggle}
          trackColor={{ false: theme.border, true: theme.successLight }}
          thumbColor={localIsLive ? theme.success : theme.textMuted}
          accessibilityLabel={`Toggle ${title} ${localIsLive ? 'off' : 'on'}`}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[3],
  },
  withBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    marginLeft: spacing[3],
    marginRight: spacing[2],
    gap: 2,
  },
  title: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  location: {
    fontSize: fontSize.xs,
  },
  availabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    marginTop: 2,
  },
  availabilityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  availabilityText: {
    fontSize: fontSize.xs - 1,
  },
});

export default memo(ListingRow);
