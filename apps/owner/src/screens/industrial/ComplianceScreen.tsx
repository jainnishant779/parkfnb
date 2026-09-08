// ============================================================================
// COMPLIANCE SCREEN - Industrial Owner Flow
// Main screen for managing compliance requirements
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  FlatList,
  Pressable,
  TextInput,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import { AppHeader } from '../../components/headers';
import BottomSheetModal from '../../components/modals/BottomSheetModal';

// Local Components
import {
  ComplianceStatCard,
  ComplianceFilterChips,
  BookingComplianceCard,
  ComplianceChecklistItem,
  DatePickerModal,
  TemplateCard,
  TemplateEditorModal,
  WhitelistSection,
} from './components';

// Types
import type {
  BookingCompliance,
  ComplianceTemplate,
  WhitelistConfig,
  ComplianceHistoryEvent,
  ComplianceFilters,
  ComplianceStats,
  ComplianceItem,
  BookingComplianceStatus,
} from '../../types/compliance';

// Storage utilities
import {
  loadAllComplianceData,
  loadBookings,
  saveBookings,
  updateBooking,
  updateComplianceItem,
  loadTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  loadWhitelist,
  saveWhitelist,
  toggleWhitelist,
  addWhitelistClient,
  removeWhitelistClient,
  loadHistory,
  addHistoryEvent,
  deriveBookingStatus,
  computeStats,
  getLastStorageError,
  clearStorageError,
  generateId,
} from '../../services/complianceStorage';

// ============================================================================
// TYPES
// ============================================================================

interface DatePickerState {
  visible: boolean;
  field: 'issuedAt' | 'expiresAt';
  currentValue?: string;
  itemId?: string;
}

// ============================================================================
// INLINE BANNER COMPONENT
// ============================================================================

interface InlineBannerProps {
  message: string;
  variant: 'error' | 'success';
  onDismiss?: () => void;
}

const InlineBanner = React.memo(function InlineBanner({
  message,
  variant,
  onDismiss,
}: InlineBannerProps) {
  const isError = variant === 'error';

  return (
    <View
      style={[
        bannerStyles.container,
        { backgroundColor: isError ? '#FEF2F2' : '#ECFDF5' },
      ]}
    >
      <Ionicons
        name={isError ? 'warning-outline' : 'checkmark-circle-outline'}
        size={18}
        color={isError ? '#DC2626' : '#059669'}
      />
      <Text
        style={[
          bannerStyles.text,
          { color: isError ? '#DC2626' : '#059669' },
        ]}
      >
        {message}
      </Text>
      {onDismiss && (
        <Pressable onPress={onDismiss} style={bannerStyles.dismiss}>
          <Ionicons name="close" size={18} color={isError ? '#DC2626' : '#059669'} />
        </Pressable>
      )}
    </View>
  );
});

const bannerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    marginHorizontal: spacing[4],
    marginBottom: spacing[3],
    borderRadius: borderRadius.md,
    gap: spacing[2],
  },
  text: {
    flex: 1,
    fontSize: fontSize.sm,
  },
  dismiss: {
    padding: spacing[1],
  },
});

// ============================================================================
// HISTORY MODAL COMPONENT
// ============================================================================

interface HistoryModalProps {
  visible: boolean;
  onClose: () => void;
  history: ComplianceHistoryEvent[];
}

const HistoryModal = React.memo(function HistoryModal({
  visible,
  onClose,
  history,
}: HistoryModalProps) {
  const formatHistoryDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getEventIcon = (eventType: ComplianceHistoryEvent['eventType']) => {
    switch (eventType) {
      case 'status_change':
        return 'checkmark-circle-outline';
      case 'document_update':
        return 'document-text-outline';
      case 'verification':
        return 'shield-checkmark-outline';
      case 'flag':
        return 'flag-outline';
      case 'whitelist':
        return 'people-outline';
      case 'template':
        return 'clipboard-outline';
      default:
        return 'time-outline';
    }
  };

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      title="Compliance History"
      subtitle="Recent compliance activities"
    >
      {history.length === 0 ? (
        <View style={historyStyles.empty}>
          <Ionicons name="time-outline" size={40} color="#94A3B8" />
          <Text style={historyStyles.emptyText}>No history yet</Text>
        </View>
      ) : (
        <View>
          {history.slice(0, 20).map((event) => (
            <View key={event.id} style={historyStyles.item}>
              <View style={historyStyles.iconContainer}>
                <Ionicons
                  name={getEventIcon(event.eventType) as any}
                  size={16}
                  color="#64748B"
                />
              </View>
              <View style={historyStyles.content}>
                <Text style={historyStyles.label}>{event.label}</Text>
                <Text style={historyStyles.date}>
                  {formatHistoryDate(event.createdAt)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </BottomSheetModal>
  );
});

const historyStyles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    paddingVertical: spacing[8],
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: '#94A3B8',
    marginTop: spacing[2],
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing[3],
  },
  content: {
    flex: 1,
  },
  label: {
    fontSize: fontSize.sm,
    color: '#1E293B',
  },
  date: {
    fontSize: fontSize.xs,
    color: '#94A3B8',
    marginTop: 2,
  },
});

// ============================================================================
// BOOKING DETAIL SHEET COMPONENT
// ============================================================================

interface BookingDetailSheetProps {
  visible: boolean;
  onClose: () => void;
  booking: BookingCompliance | null;
  onUpdateItem: (itemId: string, updates: Partial<ComplianceItem>) => void;
  onOpenDatePicker: (field: 'issuedAt' | 'expiresAt', itemId: string, currentValue?: string) => void;
  onMarkCompliant: () => void;
  onFlagIssue: () => void;
  onSaveChanges: () => void;
  onUpdateNotes: (notes: string) => void;
}

const BookingDetailSheet = React.memo(function BookingDetailSheet({
  visible,
  onClose,
  booking,
  onUpdateItem,
  onOpenDatePicker,
  onMarkCompliant,
  onFlagIssue,
  onSaveChanges,
  onUpdateNotes,
}: BookingDetailSheetProps) {
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [localNotes, setLocalNotes] = useState('');

  useEffect(() => {
    if (booking) {
      setLocalNotes(booking.internalNotes);
    }
  }, [booking]);

  if (!booking) return null;

  const status = deriveBookingStatus(booking);
  const canMarkCompliant = status === 'compliant' || booking.checklist.every(
    (item) => item.state === 'verified'
  );

  const handleOpenDatePicker = (field: 'issuedAt' | 'expiresAt', currentValue?: string) => {
    if (expandedItemId) {
      onOpenDatePicker(field, expandedItemId, currentValue);
    }
  };

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      title={booking.bookingRef}
      subtitle={`${booking.clientName}${booking.clientCompany ? ` • ${booking.clientCompany}` : ''}`}
      maxHeight="90%"
    >
      {/* Checklist */}
      <View style={detailStyles.section}>
        <Text style={detailStyles.sectionTitle}>Required Documents</Text>
        {booking.checklist.map((item) => (
          <ComplianceChecklistItem
            key={item.id}
            item={item}
            onUpdate={onUpdateItem}
            onOpenDatePicker={handleOpenDatePicker}
            isExpanded={expandedItemId === item.id}
            onToggleExpand={() =>
              setExpandedItemId(expandedItemId === item.id ? null : item.id)
            }
          />
        ))}
      </View>

      {/* Internal Notes */}
      <View style={detailStyles.section}>
        <Text style={detailStyles.sectionTitle}>Internal Notes</Text>
        <TextInput
          style={detailStyles.notesInput}
          value={localNotes}
          onChangeText={setLocalNotes}
          onBlur={() => onUpdateNotes(localNotes)}
          placeholder="Add internal notes..."
          placeholderTextColor="#94A3B8"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          accessibilityLabel="Internal notes"
        />
      </View>

      {/* Actions */}
      <View style={detailStyles.actions}>
        <Pressable
          onPress={onFlagIssue}
          style={detailStyles.flagButton}
          accessibilityRole="button"
          accessibilityLabel="Flag issue"
        >
          <Ionicons name="flag-outline" size={18} color="#EF4444" />
          <Text style={detailStyles.flagButtonText}>Flag Issue</Text>
        </Pressable>

        <View style={detailStyles.primaryActions}>
          <Pressable
            onPress={onSaveChanges}
            style={detailStyles.saveButton}
            accessibilityRole="button"
            accessibilityLabel="Save changes"
          >
            <Text style={detailStyles.saveButtonText}>Save</Text>
          </Pressable>

          <Pressable
            onPress={onMarkCompliant}
            style={[
              detailStyles.compliantButton,
              !canMarkCompliant && detailStyles.compliantButtonDisabled,
            ]}
            disabled={!canMarkCompliant}
            accessibilityRole="button"
            accessibilityLabel="Mark booking compliant"
          >
            <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
            <Text style={detailStyles.compliantButtonText}>Mark Compliant</Text>
          </Pressable>
        </View>
      </View>
    </BottomSheetModal>
  );
});

const detailStyles = StyleSheet.create({
  section: {
    marginBottom: spacing[4],
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
    color: '#1E293B',
    marginBottom: spacing[3],
  },
  notesInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    fontSize: fontSize.sm,
    color: '#1E293B',
    minHeight: 80,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing[4],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    gap: spacing[3],
  },
  flagButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    minHeight: 44,
  },
  flagButtonText: {
    fontSize: fontSize.sm,
    color: '#EF4444',
  },
  primaryActions: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  saveButton: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.md,
    backgroundColor: '#F1F5F9',
    minHeight: 44,
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: '#64748B',
  },
  compliantButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.md,
    backgroundColor: '#10B981',
    minHeight: 44,
  },
  compliantButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  compliantButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
    color: '#FFFFFF',
  },
});

// ============================================================================
// MAIN COMPLIANCE SCREEN
// ============================================================================

export default function ComplianceScreen() {
  const insets = useSafeAreaInsets();
  const theme = useMemo(() => getTheme(false), []);

  // ============================================================================
  // STATE
  // ============================================================================

  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  // Data state
  const [bookings, setBookings] = useState<BookingCompliance[]>([]);
  const [templates, setTemplates] = useState<ComplianceTemplate[]>([]);
  const [whitelist, setWhitelist] = useState<WhitelistConfig>({ enabled: false, clients: [] });
  const [history, setHistory] = useState<ComplianceHistoryEvent[]>([]);
  const [stats, setStats] = useState<ComplianceStats>({
    pendingReview: 0,
    missingDocs: 0,
    expiringSoon: 0,
    compliant: 0,
    total: 0,
  });

  // UI state
  const [filters, setFilters] = useState<ComplianceFilters>({
    status: 'all',
    vehicleTypes: [],
    slotTiers: [],
    searchQuery: '',
  });
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Modal state
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ComplianceTemplate | undefined>();
  const [selectedBooking, setSelectedBooking] = useState<BookingCompliance | null>(null);
  const [showBookingDetail, setShowBookingDetail] = useState(false);
  const [datePicker, setDatePicker] = useState<DatePickerState>({
    visible: false,
    field: 'issuedAt',
  });

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  const loadData = useCallback(async () => {
    try {
      const data = await loadAllComplianceData();
      setBookings(data.bookings);
      setTemplates(data.templates);
      setWhitelist(data.whitelist);
      setHistory(data.history);
      setStats(data.stats);

      // Check for storage errors
      const error = getLastStorageError();
      if (error.hasError) {
        setErrorBanner(error.message || 'Storage error occurred');
      }
    } catch (error) {
      console.error('Failed to load compliance data:', error);
      setErrorBanner('Failed to load data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    clearStorageError();
    setErrorBanner(null);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // ============================================================================
  // FILTERED BOOKINGS
  // ============================================================================

  const filteredBookings = useMemo(() => {
    let result = [...bookings];

    // Filter by status
    if (filters.status !== 'all') {
      result = result.filter((b) => {
        const status = deriveBookingStatus(b);
        return status === filters.status;
      });
    }

    // Filter by vehicle type
    if (filters.vehicleTypes.length > 0) {
      result = result.filter((b) => filters.vehicleTypes.includes(b.vehicleType));
    }

    // Filter by slot tier
    if (filters.slotTiers.length > 0) {
      result = result.filter((b) => filters.slotTiers.includes(b.slotTier));
    }

    // Filter by search query
    if (filters.searchQuery.length > 0) {
      const query = filters.searchQuery.toLowerCase();
      result = result.filter(
        (b) =>
          b.bookingRef.toLowerCase().includes(query) ||
          b.clientName.toLowerCase().includes(query) ||
          (b.clientCompany?.toLowerCase().includes(query) ?? false)
      );
    }

    // Sort by start date (soonest first)
    result.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

    return result;
  }, [bookings, filters]);

  // ============================================================================
  // BOOKING HANDLERS
  // ============================================================================

  const handleBookingPress = useCallback((booking: BookingCompliance) => {
    setSelectedBooking(booking);
    setShowBookingDetail(true);
  }, []);

  const handleUpdateItem = useCallback(
    async (itemId: string, updates: Partial<ComplianceItem>) => {
      if (!selectedBooking) return;

      const updatedChecklist = selectedBooking.checklist.map((item) =>
        item.id === itemId ? { ...item, ...updates } : item
      );

      const updatedBooking = { ...selectedBooking, checklist: updatedChecklist };
      setSelectedBooking(updatedBooking);

      // Update in main state
      setBookings((prev) =>
        prev.map((b) => (b.id === selectedBooking.id ? updatedBooking : b))
      );
    },
    [selectedBooking]
  );

  const handleOpenDatePicker = useCallback(
    (field: 'issuedAt' | 'expiresAt', itemId: string, currentValue?: string) => {
      setDatePicker({
        visible: true,
        field,
        currentValue,
        itemId,
      });
    },
    []
  );

  const handleDateSelect = useCallback(
    (dateISO: string) => {
      if (datePicker.itemId) {
        handleUpdateItem(datePicker.itemId, { [datePicker.field]: dateISO });
      }
      setDatePicker({ visible: false, field: 'issuedAt' });
    },
    [datePicker, handleUpdateItem]
  );

  const handleMarkCompliant = useCallback(async () => {
    if (!selectedBooking) return;

    const now = new Date().toISOString();
    const updatedBooking = { ...selectedBooking, markedCompliantAt: now };

    await updateBooking(selectedBooking.id, { markedCompliantAt: now });
    await addHistoryEvent({
      label: `Booking ${selectedBooking.bookingRef} marked compliant`,
      bookingId: selectedBooking.id,
      bookingRef: selectedBooking.bookingRef,
      eventType: 'status_change',
    });

    setBookings((prev) =>
      prev.map((b) => (b.id === selectedBooking.id ? updatedBooking : b))
    );
    setStats(computeStats(bookings));
    setHistory(await loadHistory());

    setShowBookingDetail(false);
    setSelectedBooking(null);
    setSuccessBanner('Booking marked as compliant');
    setTimeout(() => setSuccessBanner(null), 3000);
  }, [selectedBooking, bookings]);

  const handleFlagIssue = useCallback(async () => {
    if (!selectedBooking) return;

    const updatedBooking = {
      ...selectedBooking,
      flagged: true,
      flagReason: 'Flagged for review',
    };

    await updateBooking(selectedBooking.id, {
      flagged: true,
      flagReason: 'Flagged for review',
    });
    await addHistoryEvent({
      label: `Booking ${selectedBooking.bookingRef} flagged for review`,
      bookingId: selectedBooking.id,
      bookingRef: selectedBooking.bookingRef,
      eventType: 'flag',
    });

    setBookings((prev) =>
      prev.map((b) => (b.id === selectedBooking.id ? updatedBooking : b))
    );
    setHistory(await loadHistory());

    setShowBookingDetail(false);
    setSelectedBooking(null);
  }, [selectedBooking]);

  const handleSaveChanges = useCallback(async () => {
    if (!selectedBooking) return;

    await saveBookings(
      bookings.map((b) => (b.id === selectedBooking.id ? selectedBooking : b))
    );
    setStats(computeStats(bookings));

    setShowBookingDetail(false);
    setSelectedBooking(null);
    setSuccessBanner('Changes saved');
    setTimeout(() => setSuccessBanner(null), 3000);
  }, [selectedBooking, bookings]);

  const handleUpdateNotes = useCallback(
    (notes: string) => {
      if (!selectedBooking) return;
      const updatedBooking = { ...selectedBooking, internalNotes: notes };
      setSelectedBooking(updatedBooking);
      setBookings((prev) =>
        prev.map((b) => (b.id === selectedBooking.id ? updatedBooking : b))
      );
    },
    [selectedBooking]
  );

  // ============================================================================
  // TEMPLATE HANDLERS
  // ============================================================================

  const handleCreateTemplate = useCallback(
    async (template: Omit<ComplianceTemplate, 'id' | 'createdAt' | 'updatedAt'>) => {
      const newTemplate = await createTemplate(template);
      setTemplates((prev) => [...prev, newTemplate]);
      await addHistoryEvent({
        label: `Template "${template.name}" created`,
        eventType: 'template',
      });
      setHistory(await loadHistory());
      setShowTemplateEditor(false);
      setEditingTemplate(undefined);
    },
    []
  );

  const handleEditTemplate = useCallback((template: ComplianceTemplate) => {
    setEditingTemplate(template);
    setShowTemplateEditor(true);
  }, []);

  const handleUpdateTemplate = useCallback(
    async (updates: Omit<ComplianceTemplate, 'id' | 'createdAt' | 'updatedAt'>) => {
      if (!editingTemplate) return;

      const updated = await updateTemplate(editingTemplate.id, updates);
      if (updated) {
        setTemplates((prev) =>
          prev.map((t) => (t.id === editingTemplate.id ? updated : t))
        );
        await addHistoryEvent({
          label: `Template "${updates.name}" updated`,
          eventType: 'template',
        });
        setHistory(await loadHistory());
      }
      setShowTemplateEditor(false);
      setEditingTemplate(undefined);
    },
    [editingTemplate]
  );

  const handleDeleteTemplate = useCallback(async (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    await deleteTemplate(templateId);
    setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    if (template) {
      await addHistoryEvent({
        label: `Template "${template.name}" deleted`,
        eventType: 'template',
      });
      setHistory(await loadHistory());
    }
  }, [templates]);

  // ============================================================================
  // WHITELIST HANDLERS
  // ============================================================================

  const handleToggleWhitelist = useCallback(async (enabled: boolean) => {
    await toggleWhitelist(enabled);
    setWhitelist((prev) => ({ ...prev, enabled }));
    await addHistoryEvent({
      label: enabled ? 'Whitelist enabled' : 'Whitelist disabled',
      eventType: 'whitelist',
    });
    setHistory(await loadHistory());
  }, []);

  const handleAddWhitelistClient = useCallback(async (name: string, company?: string) => {
    const updated = await addWhitelistClient(name, company);
    setWhitelist(updated);
    await addHistoryEvent({
      label: `Client "${name}" added to whitelist`,
      eventType: 'whitelist',
    });
    setHistory(await loadHistory());
  }, []);

  const handleRemoveWhitelistClient = useCallback(async (clientId: string) => {
    const client = whitelist.clients.find((c) => c.id === clientId);
    const updated = await removeWhitelistClient(clientId);
    setWhitelist(updated);
    if (client) {
      await addHistoryEvent({
        label: `Client "${client.name}" removed from whitelist`,
        eventType: 'whitelist',
      });
      setHistory(await loadHistory());
    }
  }, [whitelist.clients]);

  // ============================================================================
  // RENDER BOOKING ITEM
  // ============================================================================

  const renderBookingItem = useCallback(
    ({ item }: { item: BookingCompliance }) => (
      <BookingComplianceCard
        booking={item}
        onPress={handleBookingPress}
      />
    ),
    [handleBookingPress]
  );

  const keyExtractor = useCallback((item: BookingCompliance) => item.id, []);

  // ============================================================================
  // RENDER
  // ============================================================================

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <AppHeader
          variant="standard"
          title="Compliance"
          subtitle="Track driver, permit, and insurance requirements."
        />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <AppHeader
        variant="standard"
        title="Compliance"
        subtitle="Track driver, permit, and insurance requirements."
        rightActions={[
          {
            icon: 'time-outline',
            label: 'History',
            onPress: () => setShowHistoryModal(true),
          },
        ]}
        elevated={isScrolled}
        isScrolled={isScrolled}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.primary}
          />
        }
        onScroll={(e) => setIsScrolled(e.nativeEvent.contentOffset.y > 10)}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {/* Banners */}
        {errorBanner && (
          <InlineBanner
            message={errorBanner}
            variant="error"
            onDismiss={() => setErrorBanner(null)}
          />
        )}
        {successBanner && (
          <InlineBanner message={successBanner} variant="success" />
        )}

        {/* Stats Row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.statsRow}
          contentContainerStyle={styles.statsRowContent}
        >
          <ComplianceStatCard
            label="Pending"
            value={stats.pendingReview}
            variant="pending"
            icon="hourglass-outline"
            onPress={() => setFilters((f) => ({ ...f, status: 'pending' }))}
          />
          <ComplianceStatCard
            label="Missing"
            value={stats.missingDocs}
            variant="missing"
            icon="alert-circle-outline"
            onPress={() => setFilters((f) => ({ ...f, status: 'missing' }))}
          />
          <ComplianceStatCard
            label="Expiring"
            value={stats.expiringSoon}
            variant="expiring"
            icon="warning-outline"
            onPress={() => setFilters((f) => ({ ...f, status: 'expiring' }))}
          />
          <ComplianceStatCard
            label="Compliant"
            value={stats.compliant}
            variant="compliant"
            icon="checkmark-circle-outline"
            onPress={() => setFilters((f) => ({ ...f, status: 'compliant' }))}
          />
        </ScrollView>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            value={filters.searchQuery}
            onChangeText={(text) =>
              setFilters((f) => ({ ...f, searchQuery: text }))
            }
            placeholder="Search bookings, clients..."
            placeholderTextColor="#94A3B8"
            accessibilityLabel="Search bookings"
          />
          {filters.searchQuery.length > 0 && (
            <Pressable
              onPress={() => setFilters((f) => ({ ...f, searchQuery: '' }))}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </Pressable>
          )}
        </View>

        {/* Filter Chips */}
        <ComplianceFilterChips filters={filters} onFiltersChange={setFilters} />

        {/* Bookings Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Upcoming Bookings</Text>
            <Text style={styles.sectionCount}>{filteredBookings.length}</Text>
          </View>

          {filteredBookings.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No bookings found</Text>
              <Text style={styles.emptySubtitle}>
                {filters.status !== 'all' || filters.vehicleTypes.length > 0
                  ? 'Try adjusting your filters'
                  : 'Upcoming bookings will appear here'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredBookings}
              renderItem={renderBookingItem}
              keyExtractor={keyExtractor}
              scrollEnabled={false}
              style={styles.bookingsList}
              ItemSeparatorComponent={() => <View style={styles.bookingDivider} />}
            />
          )}
        </View>

        {/* Templates Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Compliance Templates</Text>
            <Pressable
              onPress={() => {
                setEditingTemplate(undefined);
                setShowTemplateEditor(true);
              }}
              style={styles.addTemplateButton}
              accessibilityRole="button"
              accessibilityLabel="Create template"
            >
              <Ionicons name="add" size={18} color="#0D7377" />
              <Text style={styles.addTemplateText}>Create</Text>
            </Pressable>
          </View>

          {templates.length === 0 ? (
            <View style={styles.emptyTemplates}>
              <Text style={styles.emptyTemplatesText}>
                No templates yet. Create one to standardize compliance requirements.
              </Text>
            </View>
          ) : (
            templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onEdit={handleEditTemplate}
                onDelete={handleDeleteTemplate}
              />
            ))
          )}
        </View>

        {/* Whitelist Section */}
        <View style={styles.section}>
          <WhitelistSection
            whitelist={whitelist}
            onToggle={handleToggleWhitelist}
            onAddClient={handleAddWhitelistClient}
            onRemoveClient={handleRemoveWhitelistClient}
          />
        </View>

        {/* Bottom spacing */}
        <View style={{ height: insets.bottom + spacing[4] }} />
      </ScrollView>

      {/* Modals */}
      <HistoryModal
        visible={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        history={history}
      />

      <TemplateEditorModal
        visible={showTemplateEditor}
        onClose={() => {
          setShowTemplateEditor(false);
          setEditingTemplate(undefined);
        }}
        onSave={editingTemplate ? handleUpdateTemplate : handleCreateTemplate}
        initialTemplate={editingTemplate}
      />

      <BookingDetailSheet
        visible={showBookingDetail}
        onClose={() => {
          setShowBookingDetail(false);
          setSelectedBooking(null);
        }}
        booking={selectedBooking}
        onUpdateItem={handleUpdateItem}
        onOpenDatePicker={handleOpenDatePicker}
        onMarkCompliant={handleMarkCompliant}
        onFlagIssue={handleFlagIssue}
        onSaveChanges={handleSaveChanges}
        onUpdateNotes={handleUpdateNotes}
      />

      <DatePickerModal
        visible={datePicker.visible}
        onClose={() => setDatePicker({ visible: false, field: 'issuedAt' })}
        onSelect={handleDateSelect}
        initialDate={datePicker.currentValue}
        title={datePicker.field === 'issuedAt' ? 'Select Issued Date' : 'Select Expiry Date'}
      />
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: fontSize.base,
    color: '#64748B',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing[3],
  },
  statsRow: {
    marginBottom: spacing[4],
  },
  statsRowContent: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[3],
    marginHorizontal: spacing[4],
    marginBottom: spacing[3],
    minHeight: 48,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[2],
    fontSize: fontSize.sm,
    color: '#1E293B',
  },
  section: {
    paddingHorizontal: spacing[4],
    marginBottom: spacing[4],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[1],
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
    color: '#1E293B',
  },
  sectionCount: {
    fontSize: fontSize.sm,
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  bookingsList: {
    marginTop: spacing[1],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[5],
  },
  bookingDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: spacing[2],
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing[8],
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.xl,
  },
  emptyTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium as any,
    color: '#1E293B',
    marginTop: spacing[3],
  },
  emptySubtitle: {
    fontSize: fontSize.sm,
    color: '#64748B',
    marginTop: spacing[1],
  },
  addTemplateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[2],
  },
  addTemplateText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: '#0D7377',
  },
  emptyTemplates: {
    backgroundColor: '#F8FAFC',
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    alignItems: 'center',
  },
  emptyTemplatesText: {
    fontSize: fontSize.sm,
    color: '#64748B',
    textAlign: 'center',
  },
});
