import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  memo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  Modal,
  Animated,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  LayoutAnimation,
  UIManager,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ============================================================================
// CONSTANTS & CONFIG
// ============================================================================

const STORAGE_KEYS = {
  REVIEWS_STATE: '@ownerapp/reviews_state_v1',
  UI_PREFS: '@ownerapp/reviews_ui_prefs_v1',
};

const MAX_REPLY_LENGTH = 500;
const MIN_REPLY_LENGTH = 10;

// ============================================================================
// THEME & COLORS
// ============================================================================

const colors = {
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceSecondary: '#F1F5F9',
  text: '#1E293B',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  primary: '#0D7377',
  primaryLight: '#E8F5F4',
  success: '#10B981',
  successLight: '#ECFDF5',
  warning: '#F59E0B',
  warningLight: '#FFFBEB',
  danger: '#EF4444',
  dangerLight: '#FEF2F2',
  star: '#FBBF24',
  starEmpty: '#E2E8F0',
  purple: '#8B5CF6',
  purpleLight: '#F5F3FF',
};

const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

// ============================================================================
// TYPES
// ============================================================================

interface OwnerReply {
  message: string;
  updatedAt: number;
}

interface ReviewState {
  ownerReply?: OwnerReply;
  addressed?: boolean;
  internalNote?: string;
  flagged?: boolean;
  hidden?: boolean;
}

interface Review {
  id: string;
  listingId: string;
  listingName: string;
  rating: 1 | 2 | 3 | 4 | 5;
  createdAt: number;
  reviewerName: string;
  comment?: string;
  tags: string[];
  vehicleType?: string;
  bookingRef?: string;
  bookingDate?: number;
  ownerReply?: OwnerReply;
  addressed?: boolean;
  internalNote?: string;
  flagged?: boolean;
  hidden?: boolean;
}

interface ReviewStateMap {
  [reviewId: string]: ReviewState;
}

interface UIPrefs {
  selectedListingId: string | null;
  ratingFilter: 'all' | '5' | '4' | '1-3';
  sortBy: 'newest' | 'oldest' | 'highest' | 'lowest';
  showWithComment: boolean;
  showUnreplied: boolean;
  showAddressed: boolean;
  dismissedTips: boolean;
  searchQuery: string;
}

interface ToastState {
  visible: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
  action?: { label: string; onPress: () => void };
}

interface RatingSummary {
  average: number;
  total: number;
  distribution: { rating: number; count: number; percentage: number }[];
  trend: number;
  topTags: string[];
  needsAttention: string | null;
}

// ============================================================================
// SEED DATA
// ============================================================================

const LISTINGS = [
  { id: 'listing_1', name: 'Downtown Secure Parking' },
  { id: 'listing_2', name: 'Airport Long-Term Lot' },
  { id: 'listing_3', name: 'Mall Adjacent Spot' },
  { id: 'listing_4', name: 'Residential Driveway' },
  { id: 'listing_5', name: 'Office Complex Garage' },
];

const REVIEW_TAGS = [
  'Clean', 'Secure', 'Easy entry', 'Good value', 'Well-lit',
  'Convenient location', 'Spacious', 'Quick access', 'Safe neighborhood',
  'Clear instructions', 'Friendly owner', 'As described',
];

const VEHICLE_TYPES = ['Sedan', 'SUV', 'Hatchback', 'Truck', 'Motorcycle', 'Van'];

const REVIEWER_NAMES = [
  'Amit Sharma', 'Priya Patel', 'Rahul Kumar', 'Sneha Gupta', 'Vikram Singh',
  'Ananya Reddy', 'Karan Mehta', 'Neha Verma', 'Arjun Das', 'Pooja Iyer',
  'Sanjay Nair', 'Divya Joshi', 'Rohan Kapoor', 'Meera Shah', 'Aditya Rao',
  'Kavita Saxena', 'Rajesh Pillai', 'Sunita Malhotra', 'Deepak Choudhury', 'Anjali Bose',
];

const REVIEW_COMMENTS = [
  'Great parking spot! Very convenient and secure. The owner was responsive and helpful.',
  'Perfect location for my daily commute. Easy to access and well-maintained.',
  'Excellent value for money. The spot is exactly as described.',
  'Very clean and well-lit area. Felt safe leaving my car overnight.',
  'The instructions were a bit confusing initially, but once I figured it out, everything was smooth.',
  'Spacious spot, my SUV fit perfectly. Will definitely book again.',
  'Owner responded quickly to my questions. Professional service.',
  'Good location but the entry gate code didnt work the first time. Eventually got in.',
  'Fantastic! Close to my office and very affordable.',
  'The area could be cleaner, but overall a decent parking spot.',
  'Easy to find and secure. Highly recommend!',
  'Bit tight for larger vehicles but works fine for sedans.',
  'Best parking experience I have had. Five stars!',
  'Convenient and hassle-free. The covered area is a plus.',
  '',
  'Nice spot, though the lighting could be better at night.',
  '',
  'Great for airport parking. Left my car for a week with no issues.',
  'The neighborhood is safe and the owner is very accommodating.',
  'Good value, though entry instructions need updating.',
  'Perfect for short-term parking. Quick in and out.',
  'The spot was smaller than expected but manageable.',
  'Excellent security measures. CCTV and gate access.',
  '',
  'Would be perfect with better signage to find the spot.',
  'Owner went above and beyond to help when I had trouble finding it.',
  'Reliable parking every time. Been using for 3 months now.',
  'A bit pricey for the area but worth it for the convenience.',
  'Clean, secure, and exactly what I needed.',
  'Instructions were crystal clear. No issues at all.',
];

function generateSeedReviews(): Review[] {
  const reviews: Review[] = [];
  const now = Date.now();

  for (let i = 0; i < 5; i++) {
    const listing = LISTINGS[Math.floor(Math.random() * LISTINGS.length)];
    const rating = Math.random() > 0.3
      ? (Math.random() > 0.5 ? 5 : 4) as 1 | 2 | 3 | 4 | 5
      : (Math.floor(Math.random() * 3) + 1) as 1 | 2 | 3 | 4 | 5;

    const tagCount = Math.floor(Math.random() * 4);
    const shuffledTags = [...REVIEW_TAGS].sort(() => Math.random() - 0.5);
    const tags = shuffledTags.slice(0, tagCount);

    const comment = REVIEW_COMMENTS[i % REVIEW_COMMENTS.length];
    const daysAgo = Math.floor(Math.random() * 90);
    const bookingDaysAgo = daysAgo + Math.floor(Math.random() * 7) + 1;

    reviews.push({
      id: `review_${i + 1}`,
      listingId: listing.id,
      listingName: listing.name,
      rating,
      createdAt: now - daysAgo * 24 * 60 * 60 * 1000,
      reviewerName: REVIEWER_NAMES[i % REVIEWER_NAMES.length],
      comment: comment || undefined,
      tags,
      vehicleType: VEHICLE_TYPES[Math.floor(Math.random() * VEHICLE_TYPES.length)],
      bookingRef: `BK${100000 + i}`,
      bookingDate: now - bookingDaysAgo * 24 * 60 * 60 * 1000,
    });
  }

  return reviews.sort((a, b) => b.createdAt - a.createdAt);
}

const SEED_REVIEWS = generateSeedReviews();

const INITIAL_STATE: ReviewStateMap = {
  'review_1': {
    ownerReply: {
      message: 'Thank you so much for your kind words! We are glad you had a great experience. Looking forward to hosting you again!',
      updatedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
    },
    addressed: true,
  },
  'review_3': {
    ownerReply: {
      message: 'We appreciate your feedback! Its great to hear you found the spot convenient.',
      updatedAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
    },
  },
  'review_5': {
    internalNote: 'Need to update the entry instructions PDF',
    addressed: false,
  },
  'review_8': {
    flagged: true,
    internalNote: 'Gate code issue - need to check with building management',
  },
};

const DEFAULT_UI_PREFS: UIPrefs = {
  selectedListingId: null,
  ratingFilter: 'all',
  sortBy: 'newest',
  showWithComment: false,
  showUnreplied: false,
  showAddressed: false,
  dismissedTips: false,
  searchQuery: '',
};

// ============================================================================
// HELPERS
// ============================================================================

function maskName(name: string): string {
  const parts = name.split(' ');
  return parts.map(part => {
    if (part.length <= 1) return part;
    return part[0] + '*'.repeat(Math.min(part.length - 1, 3));
  }).join(' ');
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatFullDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function safeGetItem<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const value = await AsyncStorage.getItem(key);
    return value ? JSON.parse(value) : defaultValue;
  } catch {
    return defaultValue;
  }
}

async function safeSetItem<T>(key: string, value: T): Promise<boolean> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function calculateSummary(reviews: Review[], allReviews: Review[]): RatingSummary {
  const allVisible = allReviews.filter(r => !r.hidden);

  if (allVisible.length === 0) {
    return {
      average: 0,
      total: 0,
      distribution: [5, 4, 3, 2, 1].map(r => ({ rating: r, count: 0, percentage: 0 })),
      trend: 0,
      topTags: [],
      needsAttention: null,
    };
  }

  const total = allVisible.length;
  const sum = allVisible.reduce((acc, r) => acc + r.rating, 0);
  const average = Math.round((sum / total) * 10) / 10;

  const distribution = [5, 4, 3, 2, 1].map(rating => {
    const count = allVisible.filter(r => r.rating === rating).length;
    return {
      rating,
      count,
      percentage: Math.round((count / total) * 100),
    };
  });

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const sixtyDaysAgo = now - 60 * 24 * 60 * 60 * 1000;

  const recentReviews = allVisible.filter(r => r.createdAt >= thirtyDaysAgo);
  const previousReviews = allVisible.filter(r => r.createdAt >= sixtyDaysAgo && r.createdAt < thirtyDaysAgo);

  let trend = 0;
  if (recentReviews.length > 0 && previousReviews.length > 0) {
    const recentAvg = recentReviews.reduce((acc, r) => acc + r.rating, 0) / recentReviews.length;
    const prevAvg = previousReviews.reduce((acc, r) => acc + r.rating, 0) / previousReviews.length;
    trend = Math.round((recentAvg - prevAvg) * 10) / 10;
  }

  const tagCounts: Record<string, number> = {};
  allVisible.forEach(r => {
    r.tags.forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);

  const lowRatedReviews = allVisible.filter(r => r.rating <= 3);
  const lowRatedTags: Record<string, number> = {};
  lowRatedReviews.forEach(r => {
    r.tags.forEach(tag => {
      lowRatedTags[tag] = (lowRatedTags[tag] || 0) + 1;
    });
  });
  const needsAttention = Object.entries(lowRatedTags)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 1)
    .map(([tag]) => tag)[0] || null;

  return { average, total, distribution, trend, topTags, needsAttention };
}

// ============================================================================
// STAR RATING COMPONENT
// ============================================================================

interface StarRatingRowProps {
  rating: number;
  size?: number;
  showNumber?: boolean;
}

const StarRatingRow = memo(({ rating, size = 16, showNumber = false }: StarRatingRowProps) => {
  return (
    <View style={starStyles.container}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Ionicons
          key={star}
          name={star <= rating ? 'star' : 'star-outline'}
          size={size}
          color={star <= rating ? colors.star : colors.starEmpty}
          style={{ marginRight: 2 }}
        />
      ))}
      {showNumber && (
        <Text style={[starStyles.number, { fontSize: size - 2 }]}>{rating.toFixed(1)}</Text>
      )}
    </View>
  );
});

const starStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  number: {
    marginLeft: spacing.sm,
    fontWeight: '600',
    color: colors.text,
  },
});

// ============================================================================
// RATING DISTRIBUTION BAR
// ============================================================================

interface RatingDistributionBarProps {
  rating: number;
  percentage: number;
  count: number;
}

const RatingDistributionBar = memo(({ rating, percentage, count }: RatingDistributionBarProps) => {
  return (
    <View style={distStyles.row}>
      <Text style={distStyles.label}>{rating}★</Text>
      <View style={distStyles.barContainer}>
        <View style={[distStyles.barFill, { width: `${percentage}%` }]} />
      </View>
      <Text style={distStyles.count}>{count}</Text>
    </View>
  );
});

const distStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 3,
  },
  label: {
    width: 28,
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  barContainer: {
    flex: 1,
    height: 8,
    backgroundColor: colors.borderLight,
    borderRadius: 4,
    marginHorizontal: spacing.sm,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: colors.star,
    borderRadius: 4,
  },
  count: {
    width: 24,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'right',
  },
});

// ============================================================================
// FILTER CHIP COMPONENT
// ============================================================================

interface FilterChipProps {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  count?: number;
}

const FilterChip = memo(({ label, isSelected, onPress, count }: FilterChipProps) => (
  <Pressable
    onPress={onPress}
    style={[
      chipStyles.chip,
      isSelected && chipStyles.chipSelected,
    ]}
    accessibilityRole="button"
    accessibilityState={{ selected: isSelected }}
    accessibilityLabel={`${label} filter${count !== undefined ? `, ${count} reviews` : ''}`}
  >
    <Text style={[chipStyles.chipText, isSelected && chipStyles.chipTextSelected]}>
      {label}
    </Text>
    {count !== undefined && (
      <View style={[chipStyles.badge, isSelected && chipStyles.badgeSelected]}>
        <Text style={[chipStyles.badgeText, isSelected && chipStyles.badgeTextSelected]}>
          {count}
        </Text>
      </View>
    )}
  </Pressable>
));

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
    gap: spacing.xs,
  },
  chipSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  chipTextSelected: {
    color: colors.primary,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeSelected: {
    backgroundColor: colors.primary,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  badgeTextSelected: {
    color: colors.surface,
  },
});

// ============================================================================
// REVIEW CARD COMPONENT
// ============================================================================

interface ReviewCardProps {
  review: Review;
  onPress: () => void;
  onLongPress: () => void;
  onQuickAction: (action: 'reply' | 'addressed' | 'more') => void;
}

const ReviewCard = memo(({ review, onPress, onLongPress, onQuickAction }: ReviewCardProps) => {
  const hasReply = !!review.ownerReply;
  const isAddressed = review.addressed;
  const hasComment = !!review.comment;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        cardStyles.container,
        pressed && cardStyles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Review by ${maskName(review.reviewerName)}, ${review.rating} stars`}
    >
      <View style={cardStyles.header}>
        <View style={cardStyles.headerLeft}>
          <StarRatingRow rating={review.rating} size={14} />
          <Text style={cardStyles.date}>{formatDate(review.createdAt)}</Text>
        </View>
        {review.flagged && (
          <View style={cardStyles.flagBadge}>
            <Ionicons name="flag" size={12} color={colors.danger} />
          </View>
        )}
      </View>

      <Text style={cardStyles.reviewer}>{maskName(review.reviewerName)}</Text>
      <Text style={cardStyles.listing}>{review.listingName}</Text>

      {hasComment && (
        <Text style={cardStyles.comment} numberOfLines={3}>
          {review.comment}
        </Text>
      )}

      {review.tags.length > 0 && (
        <View style={cardStyles.tagsRow}>
          {review.tags.slice(0, 3).map((tag) => (
            <View key={tag} style={cardStyles.tag}>
              <Text style={cardStyles.tagText}>{tag}</Text>
            </View>
          ))}
          {review.tags.length > 3 && (
            <Text style={cardStyles.moreTagsText}>+{review.tags.length - 3}</Text>
          )}
        </View>
      )}

      <View style={cardStyles.statusRow}>
        <View style={[cardStyles.statusPill, hasReply ? cardStyles.statusReplied : cardStyles.statusUnreplied]}>
          <Ionicons
            name={hasReply ? 'checkmark-circle' : 'chatbubble-outline'}
            size={12}
            color={hasReply ? colors.success : colors.textMuted}
          />
          <Text style={[cardStyles.statusText, hasReply && cardStyles.statusTextReplied]}>
            {hasReply ? 'Replied' : 'Unreplied'}
          </Text>
        </View>
        {isAddressed && (
          <View style={[cardStyles.statusPill, cardStyles.statusAddressed]}>
            <Ionicons name="checkmark-done" size={12} color={colors.purple} />
            <Text style={cardStyles.statusTextAddressed}>Addressed</Text>
          </View>
        )}
      </View>

      <View style={cardStyles.actionsRow}>
        <Pressable
          onPress={() => onQuickAction('reply')}
          style={cardStyles.actionButton}
          accessibilityLabel={hasReply ? 'Edit reply' : 'Reply to review'}
        >
          <Ionicons name={hasReply ? 'create-outline' : 'chatbubble-outline'} size={16} color={colors.primary} />
          <Text style={cardStyles.actionText}>{hasReply ? 'Edit' : 'Reply'}</Text>
        </Pressable>
        <Pressable
          onPress={() => onQuickAction('addressed')}
          style={cardStyles.actionButton}
          accessibilityLabel={isAddressed ? 'Unmark as addressed' : 'Mark as addressed'}
        >
          <Ionicons
            name={isAddressed ? 'checkbox' : 'checkbox-outline'}
            size={16}
            color={isAddressed ? colors.purple : colors.textSecondary}
          />
          <Text style={[cardStyles.actionText, isAddressed && { color: colors.purple }]}>
            {isAddressed ? 'Addressed' : 'Mark done'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onQuickAction('more')}
          style={cardStyles.actionButton}
          accessibilityLabel="More options"
        >
          <Ionicons name="ellipsis-horizontal" size={16} color={colors.textSecondary} />
        </Pressable>
      </View>
    </Pressable>
  );
});

const cardStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  pressed: {
    opacity: 0.95,
    transform: [{ scale: 0.99 }],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  date: {
    fontSize: 12,
    color: colors.textMuted,
  },
  flagBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.dangerLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviewer: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  listing: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  comment: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  moreTagsText: {
    fontSize: 11,
    color: colors.textMuted,
    alignSelf: 'center',
    marginLeft: spacing.xs,
  },
  statusRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 12,
    gap: 4,
  },
  statusReplied: {
    backgroundColor: colors.successLight,
  },
  statusUnreplied: {
    backgroundColor: colors.surfaceSecondary,
  },
  statusAddressed: {
    backgroundColor: colors.purpleLight,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
  },
  statusTextReplied: {
    color: colors.success,
  },
  statusTextAddressed: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.purple,
  },
  actionsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.md,
    gap: spacing.lg,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.primary,
  },
});

// ============================================================================
// EMPTY STATE COMPONENT
// ============================================================================

interface EmptyStateProps {
  icon: string;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}

const EmptyState = memo(({ icon, title, subtitle, actionLabel, onAction }: EmptyStateProps) => (
  <View style={emptyStyles.container}>
    <View style={emptyStyles.iconContainer}>
      <Ionicons name={icon as any} size={48} color={colors.textMuted} />
    </View>
    <Text style={emptyStyles.title}>{title}</Text>
    <Text style={emptyStyles.subtitle}>{subtitle}</Text>
    {actionLabel && onAction && (
      <Pressable onPress={onAction} style={emptyStyles.actionButton}>
        <Text style={emptyStyles.actionText}>{actionLabel}</Text>
      </Pressable>
    )}
  </View>
));

const emptyStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl * 2,
    paddingHorizontal: spacing.xl,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  actionButton: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: 20,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
});

// ============================================================================
// TOAST COMPONENT
// ============================================================================

interface ToastProps {
  toast: ToastState;
  onDismiss: () => void;
}

const Toast = memo(({ toast, onDismiss }: ToastProps) => {
  const translateY = useRef(new Animated.Value(100)).current;

  useEffect(() => {
    if (toast.visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }).start();

      const timer = setTimeout(() => {
        Animated.timing(translateY, {
          toValue: 100,
          duration: 200,
          useNativeDriver: true,
        }).start(onDismiss);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [toast.visible, translateY, onDismiss]);

  if (!toast.visible) return null;

  const bgColor = toast.type === 'success' ? colors.success
    : toast.type === 'error' ? colors.danger
    : colors.primary;

  return (
    <Animated.View
      style={[
        toastStyles.container,
        { backgroundColor: bgColor, transform: [{ translateY }] },
      ]}
    >
      <Text style={toastStyles.message}>{toast.message}</Text>
      {toast.action && (
        <Pressable onPress={toast.action.onPress} style={toastStyles.actionButton}>
          <Text style={toastStyles.actionText}>{toast.action.label}</Text>
        </Pressable>
      )}
    </Animated.View>
  );
});

const toastStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderRadius: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: colors.surface,
  },
  actionButton: {
    marginLeft: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.surface,
  },
});

// ============================================================================
// BOTTOM SHEET MODAL
// ============================================================================

interface BottomSheetModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

const BottomSheetModal = memo(({ visible, onClose, title, children }: BottomSheetModalProps) => {
  const translateY = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 50,
          friction: 10,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SCREEN_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, translateY, opacity]);

  return visible ? (

      <View style={sheetStyles.overlay}>
        <Animated.View style={[sheetStyles.backdrop, { opacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            sheetStyles.sheet,
            { transform: [{ translateY }] },
          ]}
        >
          <View style={sheetStyles.handle} />
          {title && (
            <View style={sheetStyles.header}>
              <Text style={sheetStyles.title}>{title}</Text>
              <Pressable onPress={onClose} style={sheetStyles.closeButton}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>
          )}
          {children}
        </Animated.View>
      </View>
    
    ) : null;
});

const sheetStyles = StyleSheet.create({
  overlay: {
    // Absolutely positioned rather than flex:1 — no longer inside a
    // <Modal>, which does not present on this build.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 24,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: spacing.xl,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

// ============================================================================
// LISTING SELECTOR
// ============================================================================

interface ListingSelectorProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const ListingSelector = memo(({ selectedId, onSelect }: ListingSelectorProps) => {
  const [expanded, setExpanded] = useState(false);

  const selectedLabel = selectedId
    ? LISTINGS.find(l => l.id === selectedId)?.name || 'Select listing'
    : 'All listings';

  return (
    <View style={listingSelectorStyles.container}>
      <Pressable
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setExpanded(!expanded);
        }}
        style={listingSelectorStyles.button}
        accessibilityLabel="Select listing filter"
      >
        <Ionicons name="location-outline" size={18} color={colors.primary} />
        <Text style={listingSelectorStyles.label} numberOfLines={1}>{selectedLabel}</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textSecondary}
        />
      </Pressable>
      {expanded && (
        <View style={listingSelectorStyles.dropdown}>
          <Pressable
            onPress={() => { onSelect(null); setExpanded(false); }}
            style={[listingSelectorStyles.option, !selectedId && listingSelectorStyles.optionSelected]}
          >
            <Text style={[listingSelectorStyles.optionText, !selectedId && listingSelectorStyles.optionTextSelected]}>
              All listings
            </Text>
            {!selectedId && <Ionicons name="checkmark" size={18} color={colors.primary} />}
          </Pressable>
          {LISTINGS.map((listing) => (
            <Pressable
              key={listing.id}
              onPress={() => { onSelect(listing.id); setExpanded(false); }}
              style={[
                listingSelectorStyles.option,
                selectedId === listing.id && listingSelectorStyles.optionSelected,
              ]}
            >
              <Text
                style={[
                  listingSelectorStyles.optionText,
                  selectedId === listing.id && listingSelectorStyles.optionTextSelected,
                ]}
                numberOfLines={1}
              >
                {listing.name}
              </Text>
              {selectedId === listing.id && <Ionicons name="checkmark" size={18} color={colors.primary} />}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
});

const listingSelectorStyles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  label: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  dropdown: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  optionSelected: {
    backgroundColor: colors.primaryLight,
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  optionTextSelected: {
    fontWeight: '600',
    color: colors.primary,
  },
});

// ============================================================================
// REVIEW DETAILS MODAL
// ============================================================================

interface ReviewDetailsModalProps {
  review: Review | null;
  visible: boolean;
  onClose: () => void;
  onSaveReply: (message: string) => void;
  onSaveNote: (note: string) => void;
  onToggleAddressed: () => void;
  onFlag: () => void;
}

const ReviewDetailsModal = memo(({
  review,
  visible,
  onClose,
  onSaveReply,
  onSaveNote,
  onToggleAddressed,
  onFlag,
}: ReviewDetailsModalProps) => {
  const insets = useSafeAreaInsets();
  const [replyText, setReplyText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [isEditingReply, setIsEditingReply] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);

  useEffect(() => {
    if (review) {
      setReplyText(review.ownerReply?.message || '');
      setNoteText(review.internalNote || '');
      setIsEditingReply(!review.ownerReply);
      setIsEditingNote(false);
    }
  }, [review]);

  if (!review) return null;

  const isValidReply = replyText.length >= MIN_REPLY_LENGTH && replyText.length <= MAX_REPLY_LENGTH;

  return (
    <BottomSheetModal visible={visible} onClose={onClose} title="Review Details">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={detailStyles.scroll}
          contentContainerStyle={[detailStyles.content, { paddingBottom: insets.bottom + spacing.lg }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={detailStyles.reviewHeader}>
            <StarRatingRow rating={review.rating} size={20} showNumber />
            <Text style={detailStyles.date}>{formatFullDate(review.createdAt)}</Text>
          </View>

          <Text style={detailStyles.reviewer}>{maskName(review.reviewerName)}</Text>

          {review.tags.length > 0 && (
            <View style={detailStyles.tagsRow}>
              {review.tags.map((tag) => (
                <View key={tag} style={detailStyles.tag}>
                  <Text style={detailStyles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          {review.comment && (
            <Text style={detailStyles.comment}>{review.comment}</Text>
          )}

          <View style={detailStyles.bookingCard}>
            <Text style={detailStyles.sectionTitle}>Booking Information</Text>
            <View style={detailStyles.bookingRow}>
              <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
              <Text style={detailStyles.bookingText}>{review.listingName}</Text>
            </View>
            {review.bookingRef && (
              <View style={detailStyles.bookingRow}>
                <Ionicons name="receipt-outline" size={16} color={colors.textSecondary} />
                <Text style={detailStyles.bookingText}>Ref: {review.bookingRef}</Text>
              </View>
            )}
            {review.bookingDate && (
              <View style={detailStyles.bookingRow}>
                <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
                <Text style={detailStyles.bookingText}>{formatFullDate(review.bookingDate)}</Text>
              </View>
            )}
            {review.vehicleType && (
              <View style={detailStyles.bookingRow}>
                <Ionicons name="car-outline" size={16} color={colors.textSecondary} />
                <Text style={detailStyles.bookingText}>{review.vehicleType}</Text>
              </View>
            )}
          </View>

          <View style={detailStyles.replySection}>
            <View style={detailStyles.sectionHeader}>
              <Text style={detailStyles.sectionTitle}>Your Reply</Text>
              {review.ownerReply && !isEditingReply && (
                <Pressable onPress={() => setIsEditingReply(true)} style={detailStyles.editButton}>
                  <Ionicons name="create-outline" size={16} color={colors.primary} />
                  <Text style={detailStyles.editButtonText}>Edit</Text>
                </Pressable>
              )}
            </View>

            {isEditingReply ? (
              <View style={detailStyles.composer}>
                <Text style={detailStyles.hint}>Be polite and helpful in your response.</Text>
                <TextInput
                  value={replyText}
                  onChangeText={setReplyText}
                  style={detailStyles.textInput}
                  placeholder="Write your reply..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  maxLength={MAX_REPLY_LENGTH}
                  accessibilityLabel="Reply text input"
                />
                <View style={detailStyles.composerFooter}>
                  <Text style={[
                    detailStyles.charCount,
                    replyText.length > MAX_REPLY_LENGTH && { color: colors.danger },
                  ]}>
                    {replyText.length}/{MAX_REPLY_LENGTH}
                  </Text>
                  <View style={detailStyles.composerButtons}>
                    <Pressable
                      onPress={() => {
                        setReplyText(review.ownerReply?.message || '');
                        setIsEditingReply(!!review.ownerReply ? false : true);
                      }}
                      style={detailStyles.cancelButton}
                    >
                      <Text style={detailStyles.cancelButtonText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        onSaveReply(replyText);
                        setIsEditingReply(false);
                      }}
                      style={[detailStyles.saveButton, !isValidReply && detailStyles.saveButtonDisabled]}
                      disabled={!isValidReply}
                    >
                      <Text style={[detailStyles.saveButtonText, !isValidReply && detailStyles.saveButtonTextDisabled]}>
                        Save Reply
                      </Text>
                    </Pressable>
                  </View>
                </View>
                {replyText.length > 0 && replyText.length < MIN_REPLY_LENGTH && (
                  <Text style={detailStyles.validationHint}>
                    Minimum {MIN_REPLY_LENGTH} characters required
                  </Text>
                )}
              </View>
            ) : review.ownerReply ? (
              <View style={detailStyles.replyBubble}>
                <Text style={detailStyles.replyText}>{review.ownerReply.message}</Text>
                <Text style={detailStyles.replyDate}>
                  Replied {formatDate(review.ownerReply.updatedAt)}
                </Text>
              </View>
            ) : (
              <Pressable onPress={() => setIsEditingReply(true)} style={detailStyles.addReplyButton}>
                <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                <Text style={detailStyles.addReplyText}>Add a reply</Text>
              </Pressable>
            )}
          </View>

          <View style={detailStyles.noteSection}>
            <View style={detailStyles.sectionHeader}>
              <View style={detailStyles.sectionTitleRow}>
                <Text style={detailStyles.sectionTitle}>Internal Note</Text>
                <View style={detailStyles.privateBadge}>
                  <Ionicons name="lock-closed" size={10} color={colors.textMuted} />
                  <Text style={detailStyles.privateBadgeText}>Private</Text>
                </View>
              </View>
              {review.internalNote && !isEditingNote && (
                <Pressable onPress={() => setIsEditingNote(true)} style={detailStyles.editButton}>
                  <Ionicons name="create-outline" size={16} color={colors.primary} />
                  <Text style={detailStyles.editButtonText}>Edit</Text>
                </Pressable>
              )}
            </View>

            {isEditingNote ? (
              <View style={detailStyles.composer}>
                <TextInput
                  value={noteText}
                  onChangeText={setNoteText}
                  style={[detailStyles.textInput, { minHeight: 80 }]}
                  placeholder="Add a private note for yourself..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  accessibilityLabel="Internal note input"
                />
                <View style={detailStyles.composerButtons}>
                  <Pressable
                    onPress={() => {
                      setNoteText(review.internalNote || '');
                      setIsEditingNote(false);
                    }}
                    style={detailStyles.cancelButton}
                  >
                    <Text style={detailStyles.cancelButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      onSaveNote(noteText);
                      setIsEditingNote(false);
                    }}
                    style={detailStyles.saveButton}
                  >
                    <Text style={detailStyles.saveButtonText}>Save Note</Text>
                  </Pressable>
                </View>
              </View>
            ) : review.internalNote ? (
              <View style={detailStyles.noteCard}>
                <Text style={detailStyles.noteText}>{review.internalNote}</Text>
              </View>
            ) : (
              <Pressable onPress={() => setIsEditingNote(true)} style={detailStyles.addReplyButton}>
                <Ionicons name="add-circle-outline" size={20} color={colors.textSecondary} />
                <Text style={[detailStyles.addReplyText, { color: colors.textSecondary }]}>Add internal note</Text>
              </Pressable>
            )}
          </View>

          <View style={detailStyles.actionsSection}>
            <Pressable
              onPress={onToggleAddressed}
              style={[detailStyles.actionRow, review.addressed && detailStyles.actionRowActive]}
            >
              <Ionicons
                name={review.addressed ? 'checkbox' : 'checkbox-outline'}
                size={22}
                color={review.addressed ? colors.purple : colors.textSecondary}
              />
              <View style={detailStyles.actionContent}>
                <Text style={[detailStyles.actionTitle, review.addressed && { color: colors.purple }]}>
                  Mark as addressed
                </Text>
                <Text style={detailStyles.actionSubtitle}>
                  {review.addressed ? 'This review has been resolved' : 'Mark when you have resolved this feedback'}
                </Text>
              </View>
            </Pressable>

            <Pressable
              onPress={onFlag}
              style={[detailStyles.actionRow, review.flagged && detailStyles.actionRowDanger]}
            >
              <Ionicons
                name={review.flagged ? 'flag' : 'flag-outline'}
                size={22}
                color={review.flagged ? colors.danger : colors.textSecondary}
              />
              <View style={detailStyles.actionContent}>
                <Text style={[detailStyles.actionTitle, review.flagged && { color: colors.danger }]}>
                  {review.flagged ? 'Flagged for review' : 'Flag this review'}
                </Text>
                <Text style={detailStyles.actionSubtitle}>
                  {review.flagged ? 'Remove flag if issue is resolved' : 'Report inappropriate content'}
                </Text>
              </View>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheetModal>
  );
});

const detailStyles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  date: {
    fontSize: 12,
    color: colors.textMuted,
  },
  reviewer: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  comment: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  bookingCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  bookingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  bookingText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  privateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 8,
  },
  privateBadgeText: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textMuted,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.primary,
  },
  replySection: {
    marginBottom: spacing.lg,
  },
  noteSection: {
    marginBottom: spacing.lg,
  },
  composer: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    padding: spacing.md,
  },
  hint: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
    fontSize: 14,
    color: colors.text,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  composerFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  charCount: {
    fontSize: 12,
    color: colors.textMuted,
  },
  composerButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cancelButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  saveButtonDisabled: {
    backgroundColor: colors.border,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.surface,
  },
  saveButtonTextDisabled: {
    color: colors.textMuted,
  },
  validationHint: {
    fontSize: 12,
    color: colors.warning,
    marginTop: spacing.sm,
  },
  replyBubble: {
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  replyText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  replyDate: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  addReplyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  addReplyText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary,
  },
  noteCard: {
    backgroundColor: colors.warningLight,
    borderRadius: 12,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  noteText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  actionsSection: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.lg,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    marginBottom: spacing.sm,
  },
  actionRowActive: {
    backgroundColor: colors.purpleLight,
  },
  actionRowDanger: {
    backgroundColor: colors.dangerLight,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  actionSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
});

// ============================================================================
// ACTION SHEET
// ============================================================================

interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  review: Review | null;
  onReply: () => void;
  onMarkAddressed: () => void;
  onAddNote: () => void;
  onFlag: () => void;
  onHide: () => void;
}

const ActionSheet = memo(({
  visible,
  onClose,
  review,
  onReply,
  onMarkAddressed,
  onAddNote,
  onFlag,
  onHide,
}: ActionSheetProps) => {
  if (!review) return null;

  return (
    <BottomSheetModal visible={visible} onClose={onClose} title="Actions">
      <View style={actionSheetStyles.content}>
        <Pressable onPress={onReply} style={actionSheetStyles.option}>
          <View style={actionSheetStyles.optionIcon}>
            <Ionicons name={review.ownerReply ? 'create-outline' : 'chatbubble-outline'} size={22} color={colors.primary} />
          </View>
          <Text style={actionSheetStyles.optionText}>
            {review.ownerReply ? 'Edit reply' : 'Reply to review'}
          </Text>
        </Pressable>

        <Pressable onPress={onMarkAddressed} style={actionSheetStyles.option}>
          <View style={[actionSheetStyles.optionIcon, review.addressed && { backgroundColor: colors.purpleLight }]}>
            <Ionicons
              name={review.addressed ? 'checkbox' : 'checkbox-outline'}
              size={22}
              color={review.addressed ? colors.purple : colors.textSecondary}
            />
          </View>
          <Text style={actionSheetStyles.optionText}>
            {review.addressed ? 'Unmark as addressed' : 'Mark as addressed'}
          </Text>
        </Pressable>

        <Pressable onPress={onAddNote} style={actionSheetStyles.option}>
          <View style={actionSheetStyles.optionIcon}>
            <Ionicons name="document-text-outline" size={22} color={colors.textSecondary} />
          </View>
          <Text style={actionSheetStyles.optionText}>
            {review.internalNote ? 'Edit internal note' : 'Add internal note'}
          </Text>
        </Pressable>

        <Pressable onPress={onFlag} style={actionSheetStyles.option}>
          <View style={[actionSheetStyles.optionIcon, review.flagged && { backgroundColor: colors.dangerLight }]}>
            <Ionicons
              name={review.flagged ? 'flag' : 'flag-outline'}
              size={22}
              color={review.flagged ? colors.danger : colors.textSecondary}
            />
          </View>
          <Text style={[actionSheetStyles.optionText, review.flagged && { color: colors.danger }]}>
            {review.flagged ? 'Remove flag' : 'Flag review'}
          </Text>
        </Pressable>

        <Pressable onPress={onHide} style={[actionSheetStyles.option, actionSheetStyles.optionDanger]}>
          <View style={[actionSheetStyles.optionIcon, { backgroundColor: colors.dangerLight }]}>
            <Ionicons name="eye-off-outline" size={22} color={colors.danger} />
          </View>
          <Text style={[actionSheetStyles.optionText, { color: colors.danger }]}>Hide from view</Text>
        </Pressable>
      </View>
    </BottomSheetModal>
  );
});

const actionSheetStyles = StyleSheet.create({
  content: {
    padding: spacing.lg,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  optionDanger: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    marginTop: spacing.sm,
    paddingTop: spacing.lg,
  },
});

// ============================================================================
// TIPS PANEL
// ============================================================================

interface TipsPanelProps {
  dismissed: boolean;
  onDismiss: () => void;
}

const TipsPanel = memo(({ dismissed, onDismiss }: TipsPanelProps) => {
  if (dismissed) return null;

  return (
    <View style={tipsStyles.container}>
      <View style={tipsStyles.header}>
        <Ionicons name="bulb-outline" size={20} color={colors.warning} />
        <Text style={tipsStyles.title}>Pro Tips</Text>
        <Pressable onPress={onDismiss} style={tipsStyles.dismissButton}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
      <Text style={tipsStyles.tip}>• Responding quickly to reviews improves trust</Text>
      <Text style={tipsStyles.tip}>• Address negative feedback professionally</Text>
      <Text style={tipsStyles.tip}>• Update listing instructions to reduce confusion</Text>
    </View>
  );
});

const tipsStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.warningLight,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  dismissButton: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tip: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});

// ============================================================================
// FILTER MODAL
// ============================================================================

interface FilterModalProps {
  visible: boolean;
  onClose: () => void;
  prefs: UIPrefs;
  onUpdatePrefs: (prefs: Partial<UIPrefs>) => void;
  onReset: () => void;
}

const FilterModal = memo(({
  visible,
  onClose,
  prefs,
  onUpdatePrefs,
  onReset,
}: FilterModalProps) => {
  return (
    <BottomSheetModal visible={visible} onClose={onClose} title="Filters & Sort">
      <ScrollView style={filterModalStyles.scroll} contentContainerStyle={filterModalStyles.content}>
        <View style={filterModalStyles.section}>
          <Text style={filterModalStyles.sectionTitle}>Sort by</Text>
          <View style={filterModalStyles.optionsGrid}>
            {[
              { key: 'newest', label: 'Newest first' },
              { key: 'oldest', label: 'Oldest first' },
              { key: 'highest', label: 'Highest rating' },
              { key: 'lowest', label: 'Lowest rating' },
            ].map((option) => (
              <Pressable
                key={option.key}
                onPress={() => onUpdatePrefs({ sortBy: option.key as UIPrefs['sortBy'] })}
                style={[
                  filterModalStyles.option,
                  prefs.sortBy === option.key && filterModalStyles.optionSelected,
                ]}
              >
                <Text style={[
                  filterModalStyles.optionText,
                  prefs.sortBy === option.key && filterModalStyles.optionTextSelected,
                ]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={filterModalStyles.section}>
          <Text style={filterModalStyles.sectionTitle}>Rating</Text>
          <View style={filterModalStyles.optionsRow}>
            {[
              { key: 'all', label: 'All' },
              { key: '5', label: '5★' },
              { key: '4', label: '4★' },
              { key: '1-3', label: '1-3★' },
            ].map((option) => (
              <Pressable
                key={option.key}
                onPress={() => onUpdatePrefs({ ratingFilter: option.key as UIPrefs['ratingFilter'] })}
                style={[
                  filterModalStyles.chipOption,
                  prefs.ratingFilter === option.key && filterModalStyles.chipOptionSelected,
                ]}
              >
                <Text style={[
                  filterModalStyles.chipOptionText,
                  prefs.ratingFilter === option.key && filterModalStyles.chipOptionTextSelected,
                ]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={filterModalStyles.section}>
          <Text style={filterModalStyles.sectionTitle}>Show only</Text>
          <Pressable
            onPress={() => onUpdatePrefs({ showWithComment: !prefs.showWithComment })}
            style={filterModalStyles.checkRow}
          >
            <Ionicons
              name={prefs.showWithComment ? 'checkbox' : 'square-outline'}
              size={22}
              color={prefs.showWithComment ? colors.primary : colors.textSecondary}
            />
            <Text style={filterModalStyles.checkLabel}>Reviews with comments</Text>
          </Pressable>
          <Pressable
            onPress={() => onUpdatePrefs({ showUnreplied: !prefs.showUnreplied })}
            style={filterModalStyles.checkRow}
          >
            <Ionicons
              name={prefs.showUnreplied ? 'checkbox' : 'square-outline'}
              size={22}
              color={prefs.showUnreplied ? colors.primary : colors.textSecondary}
            />
            <Text style={filterModalStyles.checkLabel}>Unreplied reviews</Text>
          </Pressable>
          <Pressable
            onPress={() => onUpdatePrefs({ showAddressed: !prefs.showAddressed })}
            style={filterModalStyles.checkRow}
          >
            <Ionicons
              name={prefs.showAddressed ? 'checkbox' : 'square-outline'}
              size={22}
              color={prefs.showAddressed ? colors.primary : colors.textSecondary}
            />
            <Text style={filterModalStyles.checkLabel}>Addressed reviews only</Text>
          </Pressable>
        </View>

        <Pressable onPress={onReset} style={filterModalStyles.resetButton}>
          <Ionicons name="refresh-outline" size={18} color={colors.danger} />
          <Text style={filterModalStyles.resetText}>Reset all filters</Text>
        </Pressable>
      </ScrollView>
    </BottomSheetModal>
  );
});

const filterModalStyles = StyleSheet.create({
  scroll: {
    maxHeight: 400,
  },
  content: {
    padding: spacing.lg,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  option: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.surfaceSecondary,
    minWidth: '45%',
  },
  optionSelected: {
    backgroundColor: colors.primaryLight,
  },
  optionText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  optionTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  chipOption: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
  },
  chipOptionSelected: {
    backgroundColor: colors.primaryLight,
  },
  chipOptionText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  chipOptionTextSelected: {
    color: colors.primary,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  checkLabel: {
    fontSize: 14,
    color: colors.text,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  resetText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.danger,
  },
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ReviewsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [isLoading, setIsLoading] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewStates, setReviewStates] = useState<ReviewStateMap>({});
  const [prefs, setPrefs] = useState<UIPrefs>(DEFAULT_UI_PREFS);
  const [toast, setToast] = useState<ToastState>({ visible: false, message: '', type: 'success' });
  const [storageError, setStorageError] = useState(false);

  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [actionSheetReview, setActionSheetReview] = useState<Review | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [savedStates, savedPrefs] = await Promise.all([
          safeGetItem<ReviewStateMap>(STORAGE_KEYS.REVIEWS_STATE, INITIAL_STATE),
          safeGetItem<UIPrefs>(STORAGE_KEYS.UI_PREFS, DEFAULT_UI_PREFS),
        ]);

        const mergedReviews = SEED_REVIEWS.map((review) => ({
          ...review,
          ...(savedStates[review.id] || {}),
        }));

        setReviews(mergedReviews);
        setReviewStates(savedStates);
        setPrefs(savedPrefs);
      } catch (error) {
        console.error('Failed to load reviews data:', error);
        setReviews(SEED_REVIEWS);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const saveStates = useCallback(async (newStates: ReviewStateMap) => {
    const success = await safeSetItem(STORAGE_KEYS.REVIEWS_STATE, newStates);
    if (!success) {
      setStorageError(true);
      setToast({ visible: true, message: 'Couldnt save changes locally', type: 'error' });
    }
  }, []);

  const savePrefs = useCallback(async (newPrefs: UIPrefs) => {
    await safeSetItem(STORAGE_KEYS.UI_PREFS, newPrefs);
  }, []);

  const updatePrefs = useCallback((updates: Partial<UIPrefs>) => {
    setPrefs((prev) => {
      const updated = { ...prev, ...updates };
      savePrefs(updated);
      return updated;
    });
  }, [savePrefs]);

  const updateReviewState = useCallback((reviewId: string, updates: Partial<ReviewState>) => {
    setReviewStates((prev) => {
      const updated = {
        ...prev,
        [reviewId]: { ...(prev[reviewId] || {}), ...updates },
      };
      saveStates(updated);
      return updated;
    });

    setReviews((prev) =>
      prev.map((r) =>
        r.id === reviewId ? { ...r, ...updates } : r
      )
    );
  }, [saveStates]);

  const filteredReviews = useMemo(() => {
    let result = [...reviews];

    result = result.filter((r) => !r.hidden);

    if (prefs.selectedListingId) {
      result = result.filter((r) => r.listingId === prefs.selectedListingId);
    }

    if (prefs.ratingFilter === '5') {
      result = result.filter((r) => r.rating === 5);
    } else if (prefs.ratingFilter === '4') {
      result = result.filter((r) => r.rating === 4);
    } else if (prefs.ratingFilter === '1-3') {
      result = result.filter((r) => r.rating <= 3);
    }

    if (prefs.showWithComment) {
      result = result.filter((r) => !!r.comment);
    }
    if (prefs.showUnreplied) {
      result = result.filter((r) => !r.ownerReply);
    }
    if (prefs.showAddressed) {
      result = result.filter((r) => r.addressed);
    }

    if (prefs.searchQuery.trim()) {
      const query = prefs.searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.reviewerName.toLowerCase().includes(query) ||
          r.comment?.toLowerCase().includes(query) ||
          r.listingName.toLowerCase().includes(query)
      );
    }

    switch (prefs.sortBy) {
      case 'oldest':
        result.sort((a, b) => a.createdAt - b.createdAt);
        break;
      case 'highest':
        result.sort((a, b) => b.rating - a.rating);
        break;
      case 'lowest':
        result.sort((a, b) => a.rating - b.rating);
        break;
      case 'newest':
      default:
        result.sort((a, b) => b.createdAt - a.createdAt);
        break;
    }

    return result;
  }, [reviews, prefs]);

  const summary = useMemo(() => calculateSummary(filteredReviews, reviews), [filteredReviews, reviews]);

  const filterCounts = useMemo(() => {
    const visible = reviews.filter((r) => !r.hidden);
    return {
      all: visible.length,
      five: visible.filter((r) => r.rating === 5).length,
      four: visible.filter((r) => r.rating === 4).length,
      low: visible.filter((r) => r.rating <= 3).length,
      withComment: visible.filter((r) => !!r.comment).length,
      unreplied: visible.filter((r) => !r.ownerReply).length,
      addressed: visible.filter((r) => r.addressed).length,
    };
  }, [reviews]);

  const handleReviewPress = useCallback((review: Review) => {
    setSelectedReview(review);
    setShowDetailsModal(true);
  }, []);

  const handleReviewLongPress = useCallback((review: Review) => {
    setActionSheetReview(review);
    setShowActionSheet(true);
  }, []);

  const handleQuickAction = useCallback((review: Review, action: 'reply' | 'addressed' | 'more') => {
    if (action === 'more') {
      setActionSheetReview(review);
      setShowActionSheet(true);
    } else if (action === 'addressed') {
      updateReviewState(review.id, { addressed: !review.addressed });
      setToast({
        visible: true,
        message: review.addressed ? 'Unmarked as addressed' : 'Marked as addressed',
        type: 'success',
      });
    } else if (action === 'reply') {
      setSelectedReview(review);
      setShowDetailsModal(true);
    }
  }, [updateReviewState]);

  const handleSaveReply = useCallback((message: string) => {
    if (!selectedReview) return;
    updateReviewState(selectedReview.id, {
      ownerReply: { message, updatedAt: Date.now() },
    });
    setToast({ visible: true, message: 'Reply saved', type: 'success' });
  }, [selectedReview, updateReviewState]);

  const handleSaveNote = useCallback((note: string) => {
    if (!selectedReview) return;
    updateReviewState(selectedReview.id, { internalNote: note || undefined });
    setToast({ visible: true, message: 'Note saved', type: 'success' });
  }, [selectedReview, updateReviewState]);

  const handleToggleAddressed = useCallback(() => {
    if (!selectedReview) return;
    updateReviewState(selectedReview.id, { addressed: !selectedReview.addressed });
    setToast({
      visible: true,
      message: selectedReview.addressed ? 'Unmarked as addressed' : 'Marked as addressed',
      type: 'success',
    });
  }, [selectedReview, updateReviewState]);

  const handleFlag = useCallback(() => {
    if (!selectedReview) return;
    updateReviewState(selectedReview.id, { flagged: !selectedReview.flagged });
    setToast({
      visible: true,
      message: selectedReview.flagged ? 'Flag removed' : 'Review flagged',
      type: 'info',
    });
  }, [selectedReview, updateReviewState]);

  const handleHide = useCallback(() => {
    const review = actionSheetReview;
    if (!review) return;

    updateReviewState(review.id, { hidden: true });
    setShowActionSheet(false);

    setToast({
      visible: true,
      message: 'Review hidden',
      type: 'info',
      action: {
        label: 'Undo',
        onPress: () => {
          updateReviewState(review.id, { hidden: false });
          setToast({ visible: true, message: 'Review restored', type: 'success' });
        },
      },
    });
  }, [actionSheetReview, updateReviewState]);

  const handleDismissToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  const handleResetFilters = useCallback(() => {
    updatePrefs({
      ratingFilter: 'all',
      sortBy: 'newest',
      showWithComment: false,
      showUnreplied: false,
      showAddressed: false,
      searchQuery: '',
    });
  }, [updatePrefs]);

  const renderReviewItem = useCallback(({ item }: { item: Review }) => (
    <ReviewCard
      review={item}
      onPress={() => handleReviewPress(item)}
      onLongPress={() => handleReviewLongPress(item)}
      onQuickAction={(action) => handleQuickAction(item, action)}
    />
  ), [handleReviewPress, handleReviewLongPress, handleQuickAction]);

  const keyExtractor = useCallback((item: Review) => item.id, []);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const hasActiveFilters =
    prefs.ratingFilter !== 'all' ||
    prefs.showWithComment ||
    prefs.showUnreplied ||
    prefs.showAddressed ||
    prefs.searchQuery.trim().length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            accessibilityLabel="Go back"
          >
            <View style={styles.backButtonBg}>
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </View>
          </Pressable>
          <View>
            <Text style={styles.headerTitle}>Reviews</Text>
            <Text style={styles.headerSubtitle}>See what renters are saying</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            onPress={() => setShowSearch(!showSearch)}
            style={styles.headerButton}
            accessibilityLabel="Search reviews"
          >
            <Ionicons name="search-outline" size={22} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => setShowFilterModal(true)}
            style={[styles.headerButton, hasActiveFilters && styles.headerButtonActive]}
            accessibilityLabel="Filter reviews"
          >
            <Ionicons name="options-outline" size={22} color={hasActiveFilters ? colors.primary : colors.text} />
          </Pressable>
        </View>
      </View>

      {showSearch && (
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              value={prefs.searchQuery}
              onChangeText={(text) => updatePrefs({ searchQuery: text })}
              placeholder="Search reviews..."
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              autoFocus
              returnKeyType="search"
            />
            {prefs.searchQuery.length > 0 && (
              <Pressable onPress={() => updatePrefs({ searchQuery: '' })}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
        </View>
      )}

      {storageError && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={18} color={colors.warning} />
          <Text style={styles.errorBannerText}>Some changes couldnt be saved locally</Text>
          <Pressable onPress={() => setStorageError(false)}>
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      )}

      <FlatList
        data={filteredReviews}
        renderItem={renderReviewItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <View style={styles.summaryCard}>
              <View style={styles.summaryTop}>
                <View style={styles.summaryRating}>
                  <Text style={styles.bigRating}>{summary.average.toFixed(1)}</Text>
                  <StarRatingRow rating={Math.round(summary.average)} size={18} />
                  <Text style={styles.totalReviews}>{summary.total} reviews</Text>
                </View>
                <View style={styles.summaryBars}>
                  {summary.distribution.map((dist) => (
                    <RatingDistributionBar
                      key={dist.rating}
                      rating={dist.rating}
                      percentage={dist.percentage}
                      count={dist.count}
                    />
                  ))}
                </View>
              </View>

            </View>

            <ListingSelector
              selectedId={prefs.selectedListingId}
              onSelect={(id) => updatePrefs({ selectedListingId: id })}
            />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filtersScroll}
              contentContainerStyle={styles.filtersContent}
            >
              <FilterChip
                label="All"
                isSelected={prefs.ratingFilter === 'all' && !prefs.showWithComment && !prefs.showUnreplied && !prefs.showAddressed}
                onPress={() => {
                  updatePrefs({
                    ratingFilter: 'all',
                    showWithComment: false,
                    showUnreplied: false,
                    showAddressed: false,
                  });
                }}
                count={filterCounts.all}
              />
              <FilterChip
                label="5★"
                isSelected={prefs.ratingFilter === '5'}
                onPress={() => updatePrefs({ ratingFilter: prefs.ratingFilter === '5' ? 'all' : '5' })}
                count={filterCounts.five}
              />
              <FilterChip
                label="4★"
                isSelected={prefs.ratingFilter === '4'}
                onPress={() => updatePrefs({ ratingFilter: prefs.ratingFilter === '4' ? 'all' : '4' })}
                count={filterCounts.four}
              />
              <FilterChip
                label="1-3★"
                isSelected={prefs.ratingFilter === '1-3'}
                onPress={() => updatePrefs({ ratingFilter: prefs.ratingFilter === '1-3' ? 'all' : '1-3' })}
                count={filterCounts.low}
              />
              <FilterChip
                label="Unreplied"
                isSelected={prefs.showUnreplied}
                onPress={() => updatePrefs({ showUnreplied: !prefs.showUnreplied })}
                count={filterCounts.unreplied}
              />
              <FilterChip
                label="Addressed"
                isSelected={prefs.showAddressed}
                onPress={() => updatePrefs({ showAddressed: !prefs.showAddressed })}
                count={filterCounts.addressed}
              />
            </ScrollView>

            <View style={styles.resultsHeader}>
              <Text style={styles.resultsText}>
                {filteredReviews.length} review{filteredReviews.length !== 1 ? 's' : ''}
                {hasActiveFilters ? ' (filtered)' : ''}
              </Text>
              {hasActiveFilters && (
                <Pressable onPress={handleResetFilters}>
                  <Text style={styles.clearFiltersText}>Clear filters</Text>
                </Pressable>
              )}
            </View>
          </>
        }
        ListEmptyComponent={
          hasActiveFilters ? (
            <EmptyState
              icon="search-outline"
              title="No matching reviews"
              subtitle="Try adjusting your filters or search query"
              actionLabel="Clear filters"
              onAction={handleResetFilters}
            />
          ) : (
            <EmptyState
              icon="star-outline"
              title="No reviews yet"
              subtitle="When renters leave reviews, they will appear here"
              actionLabel="How to get more reviews"
              onAction={() => {
                setToast({
                  visible: true,
                  message: 'Keep your listing updated and respond promptly!',
                  type: 'info',
                });
              }}
            />
          )
        }
      />

      <FilterModal
        visible={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        prefs={prefs}
        onUpdatePrefs={updatePrefs}
        onReset={handleResetFilters}
      />

      <ReviewDetailsModal
        review={selectedReview}
        visible={showDetailsModal}
        onClose={() => {
          setShowDetailsModal(false);
          if (selectedReview) {
            const updated = reviews.find((r) => r.id === selectedReview.id);
            if (updated) setSelectedReview(updated);
          }
        }}
        onSaveReply={handleSaveReply}
        onSaveNote={handleSaveNote}
        onToggleAddressed={handleToggleAddressed}
        onFlag={handleFlag}
      />

      <ActionSheet
        visible={showActionSheet}
        onClose={() => setShowActionSheet(false)}
        review={actionSheetReview}
        onReply={() => {
          setShowActionSheet(false);
          if (actionSheetReview) {
            setSelectedReview(actionSheetReview);
            setShowDetailsModal(true);
          }
        }}
        onMarkAddressed={() => {
          if (actionSheetReview) {
            updateReviewState(actionSheetReview.id, { addressed: !actionSheetReview.addressed });
            setToast({
              visible: true,
              message: actionSheetReview.addressed ? 'Unmarked as addressed' : 'Marked as addressed',
              type: 'success',
            });
          }
          setShowActionSheet(false);
        }}
        onAddNote={() => {
          setShowActionSheet(false);
          if (actionSheetReview) {
            setSelectedReview(actionSheetReview);
            setShowDetailsModal(true);
          }
        }}
        onFlag={() => {
          if (actionSheetReview) {
            updateReviewState(actionSheetReview.id, { flagged: !actionSheetReview.flagged });
            setToast({
              visible: true,
              message: actionSheetReview.flagged ? 'Flag removed' : 'Review flagged',
              type: 'info',
            });
          }
          setShowActionSheet(false);
        }}
        onHide={handleHide}
      />

      <Toast toast={toast} onDismiss={handleDismissToast} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerButtonActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: spacing.xs,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningLight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
  },
  listContent: {
    padding: spacing.lg,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  summaryTop: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  summaryRating: {
    alignItems: 'center',
    paddingRight: spacing.lg,
    borderRightWidth: 1,
    borderRightColor: colors.borderLight,
  },
  bigRating: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 52,
  },
  totalReviews: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  summaryBars: {
    flex: 1,
    justifyContent: 'center',
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  trendText: {
    fontSize: 13,
    fontWeight: '500',
  },
  insightsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  insightChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 12,
  },
  insightText: {
    fontSize: 12,
    fontWeight: '500',
  },
  filtersScroll: {
    marginBottom: spacing.md,
    marginHorizontal: -spacing.lg,
  },
  filtersContent: {
    paddingHorizontal: spacing.lg,
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  resultsText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  clearFiltersText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary,
  },
});
