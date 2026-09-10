// ListingPicker Component - Modal for selecting listings to apply promo
import React, { memo, useMemo, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  Pressable,
  TextInput,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { getTheme } from '../../../theme/colors';
import { spacing, borderRadius } from '../../../theme/spacing';
import { fontSize, fontWeight } from '../../../theme/typography';
import type { PromoListing } from '../../../types/promo';
// import { mockPromoListings } from '../../../constants/mockPromoListings';

interface ListingPickerProps {
  visible: boolean;
  onClose: () => void;
  selectedIds: string[];
  onApply: (ids: string[]) => void;
  testID?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ListingRowProps {
  listing: PromoListing;
  isSelected: boolean;
  onToggle: () => void;
  theme: ReturnType<typeof getTheme>;
}

const ListingRow = memo(function ListingRow({
  listing,
  isSelected,
  onToggle,
  theme,
}: ListingRowProps) {
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.98, { damping: 15 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15 });
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onToggle}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.listingRow,
        isSelected && { backgroundColor: theme.primaryLight },
        animatedStyle,
      ]}
      accessibilityLabel={`${listing.name}, ${isSelected ? 'selected' : 'not selected'}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isSelected }}
    >
      {/* Thumbnail Placeholder */}
      <View
        style={[
          styles.thumbnail,
          { backgroundColor: theme.borderLight },
        ]}
      >
        <Ionicons
          name="car-outline"
          size={20}
          color={theme.textMuted}
        />
      </View>

      {/* Listing Info */}
      <View style={styles.listingInfo}>
        <Text
          style={[styles.listingName, { color: theme.text }]}
          numberOfLines={1}
        >
          {listing.name}
        </Text>
        <Text
          style={[styles.listingAddress, { color: theme.textSecondary }]}
          numberOfLines={1}
        >
          {listing.addressShort}
        </Text>
      </View>

      {/* Price Hint */}
      <Text style={[styles.priceHint, { color: theme.textMuted }]}>
        ₹{listing.priceHint}
      </Text>

      {/* Checkbox */}
      <View
        style={[
          styles.checkbox,
          {
            borderColor: isSelected ? theme.primary : theme.border,
            backgroundColor: isSelected ? theme.primary : 'transparent',
          },
        ]}
      >
        {isSelected && (
          <Ionicons name="checkmark" size={14} color="#FFFFFF" />
        )}
      </View>
    </AnimatedPressable>
  );
});

function ListingPicker({
  visible,
  onClose,
  selectedIds,
  onApply,
  testID,
}: ListingPickerProps) {
  const theme = useMemo(() => getTheme(false), []);
  const insets = useSafeAreaInsets();
  const [searchText, setSearchText] = useState('');
  const [localSelectedIds, setLocalSelectedIds] = useState<string[]>(selectedIds);

  // Reset local selection when modal opens
  React.useEffect(() => {
    if (visible) {
      setLocalSelectedIds(selectedIds);
      setSearchText('');
    }
  }, [visible, selectedIds]);

  // Filter listings by search
  // TODO: replace mockPromoListings with real listings fetched from API
  const filteredListings = useMemo<PromoListing[]>(() => {
    return []; // mockPromoListings filtered by searchText
    // const source = mockPromoListings;
    // if (!searchText.trim()) return source;
    // const search = searchText.toLowerCase().trim();
    // return source.filter(
    //   l =>
    //     l.name.toLowerCase().includes(search) ||
    //     l.addressShort.toLowerCase().includes(search)
    // );
  }, [searchText]);

  const toggleListing = useCallback((id: string) => {
    setLocalSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    // TODO: use real listings length
    // if (localSelectedIds.length === mockPromoListings.length) {
    if (localSelectedIds.length === filteredListings.length && filteredListings.length > 0) {
      setLocalSelectedIds([]);
    } else {
      setLocalSelectedIds(filteredListings.map(l => l.id));
    }
  }, [localSelectedIds.length, filteredListings]);

  const handleApply = useCallback(() => {
    onApply(localSelectedIds);
    onClose();
  }, [localSelectedIds, onApply, onClose]);

  const renderItem = useCallback(
    ({ item }: { item: PromoListing }) => (
      <ListingRow
        listing={item}
        isSelected={localSelectedIds.includes(item.id)}
        onToggle={() => toggleListing(item.id)}
        theme={theme}
      />
    ),
    [localSelectedIds, toggleListing, theme]
  );

  const keyExtractor = useCallback((item: PromoListing) => item.id, []);

  const isAllSelected = filteredListings.length > 0 && localSelectedIds.length === filteredListings.length;

  return visible ? (

      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.background,
            paddingTop: insets.top,
          },
        ]}
        testID={testID}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.surface }]}>
          <Pressable
            onPress={onClose}
            style={styles.closeButton}
            accessibilityLabel="Close"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={24} color={theme.text} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>
              Select Listings
            </Text>
            <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
              Selected: {localSelectedIds.length}
            </Text>
          </View>
          <Pressable
            onPress={handleSelectAll}
            style={styles.selectAllButton}
            accessibilityLabel={isAllSelected ? 'Deselect all' : 'Select all'}
          >
            <Text style={[styles.selectAllText, { color: theme.primary }]}>
              {isAllSelected ? 'Clear' : 'All'}
            </Text>
          </Pressable>
        </View>

        {/* Search */}
        <View
          style={[
            styles.searchContainer,
            { backgroundColor: theme.surface },
          ]}
        >
          <View
            style={[
              styles.searchInput,
              { backgroundColor: theme.borderLight, borderColor: theme.border },
            ]}
          >
            <Ionicons
              name="search"
              size={18}
              color={theme.textMuted}
            />
            <TextInput
              style={[styles.searchTextInput, { color: theme.text }]}
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search listings..."
              placeholderTextColor={theme.textMuted}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchText.length > 0 && (
              <Pressable onPress={() => setSearchText('')}>
                <Ionicons name="close-circle" size={18} color={theme.textMuted} />
              </Pressable>
            )}
          </View>
        </View>

        {/* List */}
        <FlatList
          data={filteredListings}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons
                name="search-outline"
                size={48}
                color={theme.textMuted}
              />
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                No listings found
              </Text>
            </View>
          }
        />

        {/* Footer */}
        <View
          style={[
            styles.footer,
            {
              backgroundColor: theme.surface,
              paddingBottom: insets.bottom + spacing[4],
            },
          ]}
        >
          <Pressable
            onPress={handleApply}
            style={[
              styles.applyButton,
              {
                backgroundColor: localSelectedIds.length > 0 ? theme.primary : theme.borderLight,
              },
            ]}
            disabled={localSelectedIds.length === 0}
            accessibilityLabel="Apply selection"
            accessibilityRole="button"
            accessibilityState={{ disabled: localSelectedIds.length === 0 }}
            testID={testID ? `${testID}-apply` : undefined}
          >
            <Text
              style={[
                styles.applyButtonText,
                {
                  color: localSelectedIds.length > 0 ? '#FFFFFF' : theme.textMuted,
                },
              ]}
            >
              Apply Selection ({localSelectedIds.length})
            </Text>
          </Pressable>
        </View>
      </View>
    
    ) : null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -spacing[2],
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
  },
  headerSubtitle: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  selectAllButton: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
  },
  selectAllText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
  },
  searchContainer: {
    padding: spacing[4],
    paddingTop: spacing[3],
  },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing[3],
    height: 44,
    gap: spacing[2],
  },
  searchTextInput: {
    flex: 1,
    fontSize: fontSize.base,
  },
  listContent: {
    padding: spacing[4],
    paddingTop: 0,
  },
  listingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    borderRadius: borderRadius.lg,
    marginBottom: spacing[2],
    gap: spacing[3],
  },
  thumbnail: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listingInfo: {
    flex: 1,
    gap: 2,
  },
  listingName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  listingAddress: {
    fontSize: fontSize.xs,
  },
  priceHint: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing[12],
    gap: spacing[3],
  },
  emptyText: {
    fontSize: fontSize.base,
  },
  footer: {
    padding: spacing[4],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.1)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  applyButton: {
    height: 52,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
});

export default memo(ListingPicker);
