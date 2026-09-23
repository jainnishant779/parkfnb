// ListingPicker Component - Modal for selecting listings to apply promo
import React, { memo, useMemo, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { palette, radii, fonts } from '../../../theme/kit';
import { IconCircle, SearchPill, PillButton, EmptyState } from '../../../components/ui';
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
}

const ListingRow = memo(function ListingRow({
  listing,
  isSelected,
  onToggle,
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
        isSelected && styles.listingRowSelected,
        animatedStyle,
      ]}
      accessibilityLabel={`${listing.name}, ${isSelected ? 'selected' : 'not selected'}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isSelected }}
    >
      {/* Thumbnail Placeholder */}
      <View style={styles.thumbnail}>
        <Ionicons name="car-outline" size={20} color={palette.text} />
      </View>

      {/* Listing Info */}
      <View style={styles.listingInfo}>
        <Text style={styles.listingName} numberOfLines={1}>
          {listing.name}
        </Text>
        <Text style={styles.listingAddress} numberOfLines={1}>
          {listing.addressShort}
        </Text>
      </View>

      {/* Price Hint */}
      <Text style={styles.priceHint}>₹{listing.priceHint}</Text>

      {/* Checkbox */}
      <View style={[styles.checkbox, isSelected && styles.checkboxOn]}>
        {isSelected && (
          <Ionicons name="checkmark" size={14} color={palette.textInverse} />
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
      />
    ),
    [localSelectedIds, toggleListing]
  );

  const keyExtractor = useCallback((item: PromoListing) => item.id, []);

  const isAllSelected = filteredListings.length > 0 && localSelectedIds.length === filteredListings.length;

  return visible ? (
      <View
        style={[styles.container, { paddingTop: insets.top }]}
        testID={testID}
      >
        {/* Header */}
        <View style={styles.header}>
          <IconCircle icon="x" size={44} onPress={onClose} />
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Select listings</Text>
            <Text style={styles.headerSubtitle}>
              Selected: {localSelectedIds.length}
            </Text>
          </View>
          <Pressable
            onPress={handleSelectAll}
            style={styles.selectAllButton}
            accessibilityLabel={isAllSelected ? 'Deselect all' : 'Select all'}
          >
            <Text style={styles.selectAllText}>
              {isAllSelected ? 'Clear' : 'All'}
            </Text>
          </Pressable>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <SearchPill
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search listings"
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.searchPill}
            right={
              searchText.length > 0 ? (
                <Pressable onPress={() => setSearchText('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={palette.textMuted} />
                </Pressable>
              ) : null
            }
          />
        </View>

        {/* List */}
        <FlatList
          data={filteredListings}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              tone="blue"
              title="No listings found"
              subtitle="Listings you can attach this promotion to will show here."
            />
          }
        />

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <View testID={testID ? `${testID}-apply` : undefined}>
            <PillButton
              label={`Apply selection (${localSelectedIds.length})`}
              variant="ink"
              onPress={handleApply}
              disabled={localSelectedIds.length === 0}
            />
          </View>
        </View>
      </View>
    ) : null;
}

const styles = StyleSheet.create({
  container: {
    // Full-screen overlay above the promo form (no <Modal> on this build).
    ...StyleSheet.absoluteFillObject,
    zIndex: 9500,
    elevation: 22,
    backgroundColor: palette.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    ...fonts.semibold,
    fontSize: 20,
    letterSpacing: -0.3,
    color: palette.text,
  },
  headerSubtitle: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
    marginTop: 2,
  },
  selectAllButton: {
    minWidth: 44,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectAllText: {
    ...fonts.semibold,
    fontSize: 14,
    color: palette.text,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 12,
  },
  searchPill: {
    backgroundColor: palette.surface,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexGrow: 1,
  },
  listingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: radii.lg,
    marginBottom: 8,
    gap: 12,
    backgroundColor: palette.surface,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  listingRowSelected: {
    borderColor: palette.ink,
  },
  thumbnail: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: palette.peachSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listingInfo: {
    flex: 1,
    gap: 2,
  },
  listingName: {
    ...fonts.semibold,
    fontSize: 15,
    color: palette.text,
  },
  listingAddress: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
  },
  priceHint: {
    ...fonts.semibold,
    fontSize: 13,
    color: palette.text,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: palette.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    borderColor: palette.ink,
    backgroundColor: palette.ink,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: palette.bg,
  },
});

export default memo(ListingPicker);
