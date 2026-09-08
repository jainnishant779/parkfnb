import React, { memo, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
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
        color={i < rating ? '#F59E0B' : theme.textMuted}
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
    paddingVertical: spacing[3],
  },
  withBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing[2],
  },
  renterInfo: {
    gap: spacing[1],
  },
  renterName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  stars: {
    flexDirection: 'row',
    gap: 2,
  },
  date: {
    fontSize: fontSize.xs,
  },
  comment: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});

export default memo(ReviewCard);
