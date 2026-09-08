// PromotionsScreen - Main screen for managing promotions/discount codes
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
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
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import AppHeader from '../../components/headers/AppHeader';
import SegmentedControl from '../../components/dashboard/SegmentedControl';
import type { Promo, PromoStatus, PromoSortOption, PromoTabCounts } from '../../types/promo';
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
  theme: ReturnType<typeof getTheme>;
}

function EmptyState({ status, onCreatePress, theme }: EmptyStateProps) {
  const getEmptyContent = () => {
    switch (status) {
      case 'ACTIVE':
        return {
          icon: 'pricetags-outline',
          title: 'No active promotions',
          subtitle: 'Create a promotion to attract more customers',
        };
      case 'SCHEDULED':
        return {
          icon: 'calendar-outline',
          title: 'No scheduled promotions',
          subtitle: 'Plan ahead by scheduling promotions',
        };
      case 'EXPIRED':
        return {
          icon: 'time-outline',
          title: 'No expired promotions',
          subtitle: 'Expired promotions will appear here',
        };
      case 'DRAFT':
        return {
          icon: 'document-outline',
          title: 'No draft promotions',
          subtitle: 'Save incomplete promotions as drafts',
        };
      default:
        return {
          icon: 'pricetags-outline',
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
    >
      <View style={[styles.emptyIcon, { backgroundColor: theme.borderLight }]}>
        <Ionicons name={content.icon} size={40} color={theme.textMuted} />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>
        {content.title}
      </Text>
      <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
        {content.subtitle}
      </Text>
      <Pressable
        onPress={onCreatePress}
        style={[styles.emptyButton, { backgroundColor: theme.primary }]}
        accessibilityLabel="Create promotion"
        accessibilityRole="button"
      >
        <Ionicons name="add" size={20} color="#FFFFFF" />
        <Text style={styles.emptyButtonText}>Create Promo</Text>
      </Pressable>
    </Animated.View>
  );
}

// Skeleton loader
function PromoSkeleton({ theme }: { theme: ReturnType<typeof getTheme> }) {
  return (
    <View style={[styles.skeletonCard, { backgroundColor: theme.surface }]}>
      <View style={styles.skeletonHeader}>
        <View style={[styles.skeletonCircle, { backgroundColor: theme.borderLight }]} />
        <View style={styles.skeletonTitleArea}>
          <View style={[styles.skeletonTitle, { backgroundColor: theme.borderLight }]} />
          <View style={[styles.skeletonBadge, { backgroundColor: theme.borderLight }]} />
        </View>
      </View>
      <View style={[styles.skeletonLine, { backgroundColor: theme.borderLight }]} />
      <View style={[styles.skeletonLineShort, { backgroundColor: theme.borderLight }]} />
    </View>
  );
}

export default function PromotionsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const theme = useMemo(() => getTheme(false), []);

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
  const viewingListings = useMemo(() => {
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
    ({ item }: { item: Promo }) => (
      <PromoCard
        promo={item}
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
          <Ionicons name="search-outline" size={48} color={theme.textMuted} />
          <Text style={[styles.noResultsText, { color: theme.textMuted }]}>
            No promotions match "{searchText}"
          </Text>
        </View>
      );
    }
    return (
      <EmptyState
        status={selectedTab}
        onCreatePress={handleCreatePromo}
        theme={theme}
      />
    );
  }, [searchText, selectedTab, handleCreatePromo, theme]);

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <AppHeader
          variant="standard"
          title="Promotions"
          leftAction={{
            icon: 'back',
            label: 'Back',
            onPress: () => navigation.goBack(),
            showBackground: true,
          }}
          showDivider={false}
        />
        <View style={styles.loadingContainer}>
          {[1, 2, 3].map(i => (
            <PromoSkeleton key={i} theme={theme} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <AppHeader
        variant="standard"
        title="Promotions"
        leftAction={{
          icon: 'back',
          label: 'Back',
          onPress: () => navigation.goBack(),
          showBackground: true,
        }}
        rightActions={[
          {
            icon: 'add',
            label: 'Create promotion',
            onPress: handleCreatePromo,
          },
        ]}
        showDivider={false}
        testID="promotions_header"
      />

      {/* Tabs */}
      <View style={[styles.tabsContainer, { backgroundColor: theme.surface }]}>
        <SegmentedControl
          options={tabOptions}
          selectedKey={selectedTab}
          onSelect={handleTabChange}
          testID="promo_tabs"
        />
      </View>

      {/* Search & Sort Row */}
      <View style={styles.searchSortRow}>
        <View style={styles.searchWrapper}>
          <PromoSearchBar
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search by name or code..."
            testID="promo_search"
          />
        </View>
        <Pressable
          onPress={() => setShowSortSheet(true)}
          style={[styles.sortButton, { backgroundColor: theme.surface }]}
          accessibilityLabel="Sort promotions"
          accessibilityRole="button"
        >
          <Ionicons name="swap-vertical" size={20} color={theme.text} />
        </Pressable>
      </View>

      {/* Promo List */}
      <FlatList
        data={filteredPromos}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          styles.listContent,
          filteredPromos.length === 0 && styles.listContentEmpty,
          { paddingBottom: insets.bottom + spacing[4] },
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.primary}
            colors={[theme.primary]}
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
        {SORT_OPTIONS.map(option => (
          <Pressable
            key={option.key}
            onPress={() => handleSortChange(option.key)}
            style={[
              styles.sortOption,
              sortOption === option.key && { backgroundColor: theme.primaryLight },
            ]}
            accessibilityLabel={option.label}
            accessibilityRole="radio"
            accessibilityState={{ checked: sortOption === option.key }}
          >
            <Ionicons
              name={option.icon}
              size={20}
              color={sortOption === option.key ? theme.primary : theme.textMuted}
            />
            <Text
              style={[
                styles.sortOptionText,
                { color: sortOption === option.key ? theme.primary : theme.text },
              ]}
            >
              {option.label}
            </Text>
            {sortOption === option.key && (
              <Ionicons name="checkmark" size={20} color={theme.primary} />
            )}
          </Pressable>
        ))}
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
          <View
            key={listing.id}
            style={[styles.listingPreviewRow, { borderBottomColor: theme.borderLight }]}
          >
            <View style={[styles.listingPreviewThumb, { backgroundColor: theme.borderLight }]}>
              <Ionicons name="car-outline" size={18} color={theme.textMuted} />
            </View>
            <View style={styles.listingPreviewInfo}>
              <Text style={[styles.listingPreviewName, { color: theme.text }]}>
                {listing.name}
              </Text>
              <Text style={[styles.listingPreviewAddress, { color: theme.textSecondary }]}>
                {listing.addressShort}
              </Text>
            </View>
            <Text style={[styles.listingPreviewPrice, { color: theme.textMuted }]}>
              ₹{listing.priceHint}
            </Text>
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
  },
  loadingContainer: {
    flex: 1,
    padding: spacing[4],
  },
  tabsContainer: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  searchSortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[2],
  },
  searchWrapper: {
    flex: 1,
  },
  sortButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  listContent: {
    paddingTop: spacing[2],
  },
  listContentEmpty: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[4],
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[2],
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing[5],
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[5],
    borderRadius: borderRadius.lg,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  noResults: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
    gap: spacing[3],
  },
  noResultsText: {
    fontSize: fontSize.base,
    textAlign: 'center',
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.md,
    marginBottom: spacing[1],
  },
  sortOptionText: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium as any,
  },
  listingPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing[3],
  },
  listingPreviewThumb: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listingPreviewInfo: {
    flex: 1,
    gap: 2,
  },
  listingPreviewName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  listingPreviewAddress: {
    fontSize: fontSize.xs,
  },
  listingPreviewPrice: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },
  // Skeleton styles
  skeletonCard: {
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    marginBottom: spacing[3],
  },
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  skeletonCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  skeletonTitleArea: {
    flex: 1,
    marginLeft: spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  skeletonTitle: {
    width: 120,
    height: 16,
    borderRadius: 4,
  },
  skeletonBadge: {
    width: 60,
    height: 20,
    borderRadius: 10,
  },
  skeletonLine: {
    width: '100%',
    height: 12,
    borderRadius: 4,
    marginBottom: spacing[2],
  },
  skeletonLineShort: {
    width: '60%',
    height: 12,
    borderRadius: 4,
  },
});
