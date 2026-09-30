import React, { memo, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../theme/colors';
import { palette, fonts } from '../../theme/kit';
import { formatRelativeTime } from '../../utils/formatters';

export interface ReviewCardProps {
  renterName: string;
  rating: number;
  comment: string;
  createdAt: string;
  isLast?: boolean;
}

function ReviewCard({
  renterName,
  rating,
  comment,
  createdAt,
  isLast = false,
}: ReviewCardProps) {
  // Force light mode
  const theme = useMemo(() => getTheme(false), []);

  // Render stars
  const renderStars = () => {
    return Array.from({ length: 5 }, (_, i) => (
      <Ionicons
        key={i}
        name={i < rating ? 'star' : 'star-outline'}
        size={14}
        color={i < rating ? palette.peachDeep : palette.textSubtle}
      />
    ));
  };

  return (
    <View
      style={[
        styles.container,
        !isLast && [styles.withBorder, { borderBottomColor: theme.borderLight }],
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.renterInfo}>
          <Text style={[styles.renterName, { color: theme.text }]}>
            {renterName}
          </Text>
          <View style={styles.stars}>{renderStars()}</View>
        </View>
        <Text style={[styles.date, { color: theme.textMuted }]}>
          {formatRelativeTime(createdAt)}
        </Text>
      </View>

      {/* Comment */}
      <Text
        style={[styles.comment, { color: theme.textSecondary }]}
        numberOfLines={3}
      >
        {comment}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 14,
  },
  withBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  renterInfo: {
    gap: 4,
  },
  renterName: {
    ...fonts.semibold,
    fontSize: 15.5,
  },
  stars: {
    flexDirection: 'row',
    gap: 2,
  },
  date: {
    ...fonts.medium,
    fontSize: 12,
  },
  comment: {
    ...fonts.medium,
    fontSize: 14,
    lineHeight: 20,
  },
});

export default memo(ReviewCard);
