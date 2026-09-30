// PromotionsScreen - Main screen for managing promotions/discount codes
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  Platform,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Animated, {
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { palette, radii, fonts } from '../../theme/kit';
import {
  IconCircle,
  PillButton,
  Chip,
  EmptyState as KitEmptyState,
} from '../../components/ui';
import type { Promo, PromoStatus, PromoSortOption, PromoTabCounts, PromoListing } from '../../types/promo';
import {
  loadAllPromosData,
  filterAndSortPromos,
  togglePromoEnabled,
  duplicatePromo,
  deletePromo,
  restorePromo,
  savePromoSortPref,
} from '../../services/promoStorage';
// import { mockPromoListings } from '../../constants/mockPromoListings';
import {
  PromoCard,
  PromoSearchBar,
  PromoBottomSheet,
  PromoFormModal,
  ConfirmDialog,
  Snackbar,
} from './components';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Tab configuration
const TABS: { key: PromoStatus; label: string }[] = [
  { key: 'ACTIVE', label: 'Active' },
  { key: 'SCHEDULED', label: 'Scheduled' },
  { key: 'EXPIRED', label: 'Expired' },
  { key: 'DRAFT', label: 'Draft' },
];

// Sort options
const SORT_OPTIONS: { key: PromoSortOption; label: string; icon: string }[] = [
  { key: 'newest', label: 'Newest Updated', icon: 'time-outline' },
  { key: 'ending_soon', label: 'Soonest Ending', icon: 'hourglass-outline' },
  { key: 'highest_value', label: 'Highest Discount', icon: 'trending-up-outline' },
  { key: 'alphabetical', label: 'A–Z', icon: 'text-outline' },
];

// Empty state component
interface EmptyStateProps {
  status: PromoStatus;
  onCreatePress: () => void;
}

function EmptyState({ status, onCreatePress }: EmptyStateProps) {
  const getEmptyContent = () => {
    switch (status) {
      case 'ACTIVE':
        return {
          tone: 'peach',
          title: 'No active promotions',
          subtitle: 'Create a promotion to attract more customers',
        };
      case 'SCHEDULED':
        return {
          tone: 'blue',
          title: 'No scheduled promotions',
          subtitle: 'Plan ahead by scheduling promotions',
        };
      case 'EXPIRED':
        return {
          tone: 'grey',
          title: 'No expired promotions',
          subtitle: 'Expired promotions will appear here',
        };
      case 'DRAFT':
        return {
          tone: 'blue',
          title: 'No draft promotions',
          subtitle: 'Save incomplete promotions as drafts',
        };
      default:
        return {
          tone: 'peach',
          title: 'No promotions',
          subtitle: 'Create your first promotion',
        };
    }
  };

  const content = getEmptyContent();

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
      style={styles.emptyState}
      accessibilityLabel="Create promotion"
    >
      <KitEmptyState
        tone={content.tone}
        title={content.title}
        subtitle={content.subtitle}
        action="Create Promo"
        onAction={onCreatePress}
      />
    </Animated.View>
  );
}

// Skeleton loader
function PromoSkeleton() {
  return (
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonBadge} />
      <View style={styles.skeletonTitle} />
      <View style={styles.skeletonLine} />
      <View style={styles.skeletonLineShort} />
    </View>
  );
}

export default function PromotionsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [tabCounts, setTabCounts] = useState<PromoTabCounts>({
    active: 0,
    scheduled: 0,
    expired: 0,
    draft: 0,
  });
  const [selectedTab, setSelectedTab] = useState<PromoStatus>('ACTIVE');
  const [searchText, setSearchText] = useState('');
  const [sortOption, setSortOption] = useState<PromoSortOption>('newest');
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promo | undefined>();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingPromo, setDeletingPromo] = useState<Promo | null>(null);
  const [showListingsSheet, setShowListingsSheet] = useState(false);
  const [viewingPromoListings, setViewingPromoListings] = useState<Promo | null>(null);

  // Snackbar state
  const [snackbar, setSnackbar] = useState<{
    visible: boolean;
    message: string;
    variant: 'success' | 'error' | 'info' | 'warning';
    action?: { label: string; onPress: () => void };
  }>({
    visible: false,
    message: '',
    variant: 'info',
  });

  const [deletedPromoSnapshot, setDeletedPromoSnapshot] = useState<Promo | null>(null);

  // Show snackbar helper
  const showSnackbar = useCallback((
    message: string,
    variant: 'success' | 'error' | 'info' | 'warning' = 'info',
    action?: { label: string; onPress: () => void }
  ) => {
    setSnackbar({ visible: true, message, variant, action });
  }, []);

  const hideSnackbar = useCallback(() => {
    setSnackbar(prev => ({ ...prev, visible: false }));
  }, []);

  // Load data
  const loadData = useCallback(async () => {
    try {
      const data = await loadAllPromosData();
      setPromos(data.promos);
      setTabCounts(data.tabCounts);
      setSortOption(data.sortPref);
    } catch (error) {
      console.error('Failed to load promos:', error);
      showSnackbar('Failed to load promotions', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [showSnackbar]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered and sorted promos
  const filteredPromos = useMemo(() => {
    return filterAndSortPromos(promos, {
      status: selectedTab,
      searchText,
      sortOption,
    });
  }, [promos, selectedTab, searchText, sortOption]);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadData();
    showSnackbar('Synced locally', 'success');
  }, [loadData, showSnackbar]);

  // Handle tab change
  const handleTabChange = useCallback((key: PromoStatus) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedTab(key);
    setSearchText('');
  }, []);

  // Handle sort change
  const handleSortChange = useCallback((option: PromoSortOption) => {
    setSortOption(option);
    savePromoSortPref(option);
    setShowSortSheet(false);
  }, []);

  // Handle create promo
  const handleCreatePromo = useCallback(() => {
    setEditingPromo(undefined);
    setShowFormModal(true);
  }, []);

  // Handle edit promo
  const handleEditPromo = useCallback((promo: Promo) => {
    setEditingPromo(promo);
    setShowFormModal(true);
  }, []);

  // Handle promo saved
  const handlePromoSaved = useCallback(async () => {
    await loadData();
    const isNew = !editingPromo;
    showSnackbar(
      isNew ? 'Promotion created' : 'Promotion updated',
      'success'
    );
  }, [editingPromo, loadData, showSnackbar]);

  // Handle toggle enabled
  const handleToggleEnabled = useCallback(async (promo: Promo) => {
    const updated = await togglePromoEnabled(promo.id);
    if (updated) {
      await loadData();
      showSnackbar(
        updated.enabled ? 'Promotion enabled' : 'Promotion disabled',
        'success'
      );
    }
  }, [loadData, showSnackbar]);

  // Handle duplicate
  const handleDuplicate = useCallback(async (promo: Promo) => {
    const duplicated = await duplicatePromo(promo.id);
    if (duplicated) {
      await loadData();
      setEditingPromo(duplicated);
      setShowFormModal(true);
      showSnackbar('Promotion duplicated as draft', 'success');
    }
  }, [loadData, showSnackbar]);

  // Handle delete
  const handleDeletePress = useCallback((promo: Promo) => {
    setDeletingPromo(promo);
    setShowDeleteDialog(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingPromo) return;

    // Save snapshot for undo
    setDeletedPromoSnapshot(deletingPromo);
    const promoToRestore = deletingPromo;

    const success = await deletePromo(deletingPromo.id);
    if (success) {
      await loadData();
      showSnackbar('Promotion deleted', 'warning', {
        label: 'Undo',
        onPress: async () => {
          await restorePromo(promoToRestore);
          await loadData();
          showSnackbar('Promotion restored', 'success');
          setDeletedPromoSnapshot(null);
        },
      });
    }
    setDeletingPromo(null);
  }, [deletingPromo, loadData, showSnackbar]);

  // Handle code copied
  const handleCodeCopied = useCallback(() => {
    showSnackbar('Code copied to clipboard', 'success');
  }, [showSnackbar]);

  // Handle view listings
  const handleViewListings = useCallback((promo: Promo) => {
    setViewingPromoListings(promo);
    setShowListingsSheet(true);
  }, []);

  // Get listings for viewing sheet
  const viewingListings = useMemo<PromoListing[]>(() => {
    if (!viewingPromoListings) return [];
    // TODO: replace with real listings from API
    // if (viewingPromoListings.applyToAllListings) return mockPromoListings;
    // return mockPromoListings.filter(l =>
    //   viewingPromoListings.applicableListingIds.includes(l.id)
    // );
    return [];
  }, [viewingPromoListings]);

  // Tab options with counts
  const tabOptions = useMemo(() => {
    return TABS.map(tab => ({
      key: tab.key,
      label: tab.label,
      badge: tabCounts[tab.key.toLowerCase() as keyof PromoTabCounts] || undefined,
    }));
  }, [tabCounts]);

  // Render promo item
  const renderItem = useCallback(
    ({ item, index }: { item: Promo; index: number }) => (
      <PromoCard
        promo={item}
        tone={index % 2 === 0 ? 'peach' : 'blue'}
        onPress={() => handleEditPromo(item)}
        onToggleEnabled={() => handleToggleEnabled(item)}
        onEdit={() => handleEditPromo(item)}
        onDuplicate={() => handleDuplicate(item)}
        onDelete={() => handleDeletePress(item)}
        onCodeCopied={handleCodeCopied}
        onViewListings={() => handleViewListings(item)}
        testID={`promo_card_${item.id}`}
      />
    ),
    [
      handleEditPromo,
      handleToggleEnabled,
      handleDuplicate,
      handleDeletePress,
      handleCodeCopied,
      handleViewListings,
    ]
  );

  const keyExtractor = useCallback((item: Promo) => item.id, []);

  // Render empty component
  const renderEmpty = useCallback(() => {
    if (searchText) {
      return (
        <View style={styles.noResults}>
          <KitEmptyState
            tone="grey"
            title="No results"
            subtitle={`No promotions match "${searchText}"`}
          />
        </View>
      );
    }
    return (
      <EmptyState
        status={selectedTab}
        onCreatePress={handleCreatePromo}
      />
    );
  }, [searchText, selectedTab, handleCreatePromo]);

  const renderHeader = (withCreate: boolean) => (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]} testID="promotions_header">
      <IconCircle icon="arrow-left" size={46} onPress={() => navigation.goBack()} />
      <Text style={styles.headerTitle}>Promotions</Text>
      {withCreate ? (
        <PillButton
          label="Create"
          icon="plus"
          variant="ink"
          size="sm"
          onPress={handleCreatePromo}
        />
      ) : (
        <View style={styles.headerSpacer} />
      )}
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        {renderHeader(false)}
        <View style={styles.loadingContainer}>
          {[1, 2, 3].map(i => (
            <PromoSkeleton key={i} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      {renderHeader(true)}

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsContainer}
        testID="promo_tabs"
      >
        {tabOptions.map(tab => (
          <Chip
            key={tab.key}
            label={tab.badge ? `${tab.label} · ${tab.badge}` : tab.label}
            selected={selectedTab === tab.key}
            onPress={() => handleTabChange(tab.key)}
          />
        ))}
      </ScrollView>

      {/* Search & Sort Row */}
      <View style={styles.searchSortRow}>
        <View style={styles.searchWrapper}>
          <PromoSearchBar
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search by name or code"
            testID="promo_search"
          />
        </View>
        <TouchableOpacity
          onPress={() => setShowSortSheet(true)}
          activeOpacity={0.75}
          style={styles.sortButton}
          accessibilityLabel="Sort promotions"
          accessibilityRole="button"
        >
          <Ionicons name="swap-vertical" size={20} color={palette.text} />
        </TouchableOpacity>
      </View>

      {/* Promo List */}
      <FlatList
        data={filteredPromos}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          styles.listContent,
          filteredPromos.length === 0 && styles.listContentEmpty,
          { paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={palette.ink}
            colors={[palette.ink]}
          />
        }
        testID="promo_list"
      />

      {/* Sort Bottom Sheet */}
      <PromoBottomSheet
        visible={showSortSheet}
        onClose={() => setShowSortSheet(false)}
        title="Sort By"
        testID="sort_sheet"
      >
        {SORT_OPTIONS.map(option => {
          const isSelected = sortOption === option.key;
          return (
            <TouchableOpacity
              key={option.key}
              onPress={() => handleSortChange(option.key)}
              activeOpacity={0.75}
              style={[styles.sortOption, isSelected && styles.sortOptionSelected]}
              accessibilityLabel={option.label}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
            >
              <View style={[styles.sortIcon, isSelected && styles.sortIconSelected]}>
                <Ionicons
                  name={option.icon}
                  size={18}
                  color={isSelected ? palette.textInverse : palette.text}
                />
              </View>
              <Text style={styles.sortOptionText}>{option.label}</Text>
              {isSelected && (
                <Ionicons name="checkmark" size={20} color={palette.text} />
              )}
            </TouchableOpacity>
          );
        })}
      </PromoBottomSheet>

      {/* Listings Preview Sheet */}
      <PromoBottomSheet
        visible={showListingsSheet}
        onClose={() => {
          setShowListingsSheet(false);
          setViewingPromoListings(null);
        }}
        title={viewingPromoListings?.applyToAllListings ? 'All Listings' : 'Applicable Listings'}
        testID="listings_preview_sheet"
      >
        {viewingListings.map(listing => (
          <View key={listing.id} style={styles.listingPreviewRow}>
            <View style={styles.listingPreviewThumb}>
              <Ionicons name="car-outline" size={18} color={palette.text} />
            </View>
            <View style={styles.listingPreviewInfo}>
              <Text style={styles.listingPreviewName}>{listing.name}</Text>
              <Text style={styles.listingPreviewAddress}>{listing.addressShort}</Text>
            </View>
            <Text style={styles.listingPreviewPrice}>₹{listing.priceHint}</Text>
          </View>
        ))}
      </PromoBottomSheet>

      {/* Create/Edit Modal */}
      <PromoFormModal
        visible={showFormModal}
        onClose={() => {
          setShowFormModal(false);
          setEditingPromo(undefined);
        }}
        promo={editingPromo}
        onSave={handlePromoSaved}
        testID="promo_form"
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        visible={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setDeletingPromo(null);
        }}
        onConfirm={handleDeleteConfirm}
        title="Delete Promotion?"
        message="This can't be undone. The promotion code will no longer work for customers."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        testID="delete_promo_dialog"
      />

      {/* Snackbar */}
      <Snackbar
        visible={snackbar.visible}
        message={snackbar.message}
        variant={snackbar.variant}
        action={snackbar.action}
        duration={snackbar.action ? 0 : 4000}
        onDismiss={hideSnackbar}
        testID="promo_snackbar"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    ...fonts.semibold,
    fontSize: 20,
    letterSpacing: -0.3,
    color: palette.text,
  },
  headerSpacer: {
    width: 46,
  },
  loadingContainer: {
    flex: 1,
    paddingTop: 12,
  },
  tabsScroll: {
    flexGrow: 0,
  },
  tabsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchSortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 10,
  },
  searchWrapper: {
    flex: 1,
  },
  sortButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingTop: 4,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  noResults: {
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: radii.lg,
    marginBottom: 6,
  },
  sortOptionSelected: {
    backgroundColor: palette.surfaceDim,
  },
  sortIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortIconSelected: {
    backgroundColor: palette.ink,
  },
  sortOptionText: {
    ...fonts.semibold,
    flex: 1,
    fontSize: 15,
    color: palette.text,
  },
  listingPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
    gap: 12,
  },
  listingPreviewThumb: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.peachSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listingPreviewInfo: {
    flex: 1,
    gap: 2,
  },
  listingPreviewName: {
    ...fonts.semibold,
    fontSize: 15,
    color: palette.text,
  },
  listingPreviewAddress: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
  },
  listingPreviewPrice: {
    ...fonts.semibold,
    fontSize: 13,
    color: palette.text,
  },
  // Skeleton styles
  skeletonCard: {
    borderRadius: radii.xl,
    padding: 18,
    marginHorizontal: 16,
    marginBottom: 12,
    minHeight: 180,
    backgroundColor: palette.surface,
  },
  skeletonBadge: {
    width: 70,
    height: 24,
    borderRadius: 12,
    backgroundColor: palette.fill,
  },
  skeletonTitle: {
    width: '55%',
    height: 22,
    borderRadius: 6,
    marginTop: 16,
    backgroundColor: palette.fill,
  },
  skeletonLine: {
    width: '40%',
    height: 28,
    borderRadius: 6,
    marginTop: 10,
    backgroundColor: palette.fill,
  },
  skeletonLineShort: {
    width: '60%',
    height: 12,
    borderRadius: 4,
    marginTop: 18,
    backgroundColor: palette.fill,
  },
});
