import React, { memo, useMemo, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Switch,
  Image,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../theme/colors';
import { palette, radii, fonts } from '../../theme/kit';
import { resolveImageUri } from '../../utils/imageUri';

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
        <View style={[styles.thumbnail, { backgroundColor: palette.peachSoft }]}>
          {photoUri ? (
            <Image
              source={{ uri: resolveImageUri(photoUri) }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
            />
          ) : (
            <Ionicons
              name="car-outline"
              size={24}
              color={palette.text}
            />
          )}
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
          trackColor={{ false: palette.line, true: palette.ink }}
          thumbColor={palette.surface}
          ios_backgroundColor={palette.line}
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
    paddingVertical: 14,
  },
  withBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thumbnail: {
    width: 58,
    height: 58,
    borderRadius: radii.md,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
    gap: 2,
  },
  title: {
    ...fonts.semibold,
    fontSize: 15.5,
  },
  location: {
    ...fonts.medium,
    fontSize: 12.5,
  },
  availabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  availabilityDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  availabilityText: {
    ...fonts.semibold,
    fontSize: 12,
  },
});

export default memo(ListingRow);
