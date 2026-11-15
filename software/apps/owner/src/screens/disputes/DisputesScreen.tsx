import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { palette, radii, fonts } from '../../theme/kit';
import {
  PillButton,
  IconCircle,
  SearchPill,
  ScreenHeader,
  StatusTag,
  InfoGrid,
  TimelineItem,
  IsoBlock,
  EmptyState as KitEmptyState,
} from '../../components/ui';

type TagTone = 'ink' | 'warning' | 'success' | 'danger' | 'grey';

// ============================================================================
// TYPES
// ============================================================================
type DisputeStatus = 'open' | 'under_review' | 'resolved' | 'rejected' | 'archived';
type DisputePriority = 'low' | 'medium' | 'high';
type DisputeCategory = 'booking' | 'payment' | 'damage' | 'access_qr' | 'safety_regulatory' | 'other';

interface EvidenceItem {
  id: string;
  name: string;
  type: 'photo' | 'video' | 'doc';
  createdAt: string;
}

interface DisputeNote {
  id: string;
  message: string;
  createdAt: string;
}

interface DisputeTimelineEvent {
  id: string;
  type: 'created' | 'note_added' | 'evidence_added' | 'status_changed' | 'resolved' | 'reopened';
  label: string;
  createdAt: string;
}

interface BookingRef {
  id: string;
  startAt: string;
  endAt: string;
  renterName: string;
}

interface LotSection {
  id: string;
  name: string;
}

interface DisputeCase {
  id: string;
  title: string;
  description: string;
  status: DisputeStatus;
  priority: DisputePriority;
  category: DisputeCategory;
  bookingRef: BookingRef;
  lotSection: LotSection;
  requiresAction: boolean;
  evidence: EvidenceItem[];
  notes: DisputeNote[];
  timeline: DisputeTimelineEvent[];
  createdAt: string;
  updatedAt: string;
  pauseListing?: boolean;
  rejectionReason?: string;
}

interface UIPrefs {
  statusFilter: DisputeStatus | 'all';
  categoryFilter: DisputeCategory | 'all';
  sortBy: 'newest' | 'oldest' | 'priority' | 'requires_action';
  searchText: string;
}

// ============================================================================
// CONSTANTS & UTILS
// ============================================================================
const STORAGE_KEY = '@ownerapp/disputes_v1';
const PREFS_KEY = '@ownerapp/disputes_ui_prefs_v1';

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatRelativeTime = (dateStr: string) => {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateStr);
};

const STATUS_CONFIG: Record<DisputeStatus, { label: string; color: string; bg: string }> = {
  open: { label: 'Open', color: palette.textInverse, bg: palette.ink },
  under_review: { label: 'Under Review', color: palette.warning, bg: palette.warningSoft },
  resolved: { label: 'Resolved', color: palette.success, bg: palette.successSoft },
  rejected: { label: 'Rejected', color: palette.danger, bg: palette.dangerSoft },
  archived: { label: 'Archived', color: palette.textMuted, bg: palette.fill },
};

const STATUS_TONE: Record<DisputeStatus, TagTone> = {
  open: 'ink',
  under_review: 'warning',
  resolved: 'success',
  rejected: 'danger',
  archived: 'grey',
};

const PRIORITY_CONFIG: Record<DisputePriority, { label: string; color: string; bg: string }> = {
  low: { label: 'Low', color: palette.success, bg: palette.successSoft },
  medium: { label: 'Medium', color: palette.warning, bg: palette.warningSoft },
  high: { label: 'High', color: palette.danger, bg: palette.dangerSoft },
};

const PRIORITY_TONE: Record<DisputePriority, TagTone> = {
  low: 'grey',
  medium: 'warning',
  high: 'danger',
};

const CATEGORY_CONFIG: Record<DisputeCategory, { label: string; icon: string }> = {
  booking: { label: 'Booking', icon: 'calendar-outline' },
  payment: { label: 'Payment/Payout', icon: 'card-outline' },
  damage: { label: 'Property Damage', icon: 'warning-outline' },
  access_qr: { label: 'Access/QR', icon: 'qr-code-outline' },
  safety_regulatory: { label: 'Safety/Regulatory', icon: 'shield-outline' },
  other: { label: 'Other', icon: 'ellipsis-horizontal-outline' },
};

// Mock data
const MOCK_BOOKINGS: BookingRef[] = [
  { id: 'BK001', startAt: '2025-01-10T08:00:00Z', endAt: '2025-01-10T18:00:00Z', renterName: 'John Smith' },
  { id: 'BK002', startAt: '2025-01-12T09:00:00Z', endAt: '2025-01-12T17:00:00Z', renterName: 'Sarah Johnson' },
  { id: 'BK003', startAt: '2025-01-15T07:00:00Z', endAt: '2025-01-15T19:00:00Z', renterName: 'Mike Wilson' },
  { id: 'BK004', startAt: '2025-01-18T10:00:00Z', endAt: '2025-01-18T16:00:00Z', renterName: 'Emily Brown' },
  { id: 'BK005', startAt: '2025-01-20T08:00:00Z', endAt: '2025-01-20T20:00:00Z', renterName: 'David Lee' },
  { id: 'BK006', startAt: '2025-01-22T06:00:00Z', endAt: '2025-01-22T14:00:00Z', renterName: 'Anna Davis' },
];

const MOCK_SECTIONS: LotSection[] = [
  { id: 'SEC-A', name: 'Section A' },
  { id: 'SEC-B', name: 'Section B' },
  { id: 'SEC-C', name: 'Section C' },
  { id: 'NORTH', name: 'North Gate' },
  { id: 'SOUTH', name: 'South Gate' },
  { id: 'MAIN', name: 'Main Lot' },
];

const INITIAL_DISPUTES: DisputeCase[] = [
  {
    id: 'DSP001',
    title: 'Damage claim for Section B',
    description: 'Renter reported tire marks and minor damage to the gravel surface in Section B after an event.',
    status: 'open',
    priority: 'high',
    category: 'damage',
    bookingRef: MOCK_BOOKINGS[0],
    lotSection: MOCK_SECTIONS[1],
    requiresAction: true,
    evidence: [{ id: 'ev1', name: 'damage_photo.jpg', type: 'photo', createdAt: '2025-01-11T10:00:00Z' }],
    notes: [{ id: 'n1', message: 'Initial assessment shows minor surface damage. Need contractor quote.', createdAt: '2025-01-11T11:00:00Z' }],
    timeline: [
      { id: 't1', type: 'created', label: 'Dispute created', createdAt: '2025-01-11T09:00:00Z' },
      { id: 't2', type: 'evidence_added', label: 'Evidence attached', createdAt: '2025-01-11T10:00:00Z' },
      { id: 't3', type: 'note_added', label: 'Owner added note', createdAt: '2025-01-11T11:00:00Z' },
    ],
    createdAt: '2025-01-11T09:00:00Z',
    updatedAt: '2025-01-11T11:00:00Z',
  },
  {
    id: 'DSP002',
    title: 'QR code not scanning at North Gate',
    description: 'Multiple renters reported QR code scanning issues at the North Gate entrance.',
    status: 'under_review',
    priority: 'medium',
    category: 'access_qr',
    bookingRef: MOCK_BOOKINGS[1],
    lotSection: MOCK_SECTIONS[3],
    requiresAction: false,
    evidence: [],
    notes: [],
    timeline: [
      { id: 't1', type: 'created', label: 'Dispute created', createdAt: '2025-01-13T14:00:00Z' },
      { id: 't2', type: 'status_changed', label: 'Status changed to Under Review', createdAt: '2025-01-13T15:00:00Z' },
    ],
    createdAt: '2025-01-13T14:00:00Z',
    updatedAt: '2025-01-13T15:00:00Z',
  },
  {
    id: 'DSP003',
    title: 'Payout discrepancy for event booking',
    description: 'Expected payout amount does not match the confirmed booking rate.',
    status: 'resolved',
    priority: 'low',
    category: 'payment',
    bookingRef: MOCK_BOOKINGS[2],
    lotSection: MOCK_SECTIONS[5],
    requiresAction: false,
    evidence: [{ id: 'ev2', name: 'invoice.pdf', type: 'doc', createdAt: '2025-01-16T08:00:00Z' }],
    notes: [{ id: 'n2', message: 'Issue was due to platform fee calculation. Corrected and paid.', createdAt: '2025-01-17T10:00:00Z' }],
    timeline: [
      { id: 't1', type: 'created', label: 'Dispute created', createdAt: '2025-01-16T08:00:00Z' },
      { id: 't2', type: 'resolved', label: 'Dispute resolved', createdAt: '2025-01-17T10:00:00Z' },
    ],
    createdAt: '2025-01-16T08:00:00Z',
    updatedAt: '2025-01-17T10:00:00Z',
  },
  {
    id: 'DSP004',
    title: 'Safety concern during event',
    description: 'Report of unsafe vehicle parking practices during large event that blocked emergency access.',
    status: 'open',
    priority: 'high',
    category: 'safety_regulatory',
    bookingRef: MOCK_BOOKINGS[3],
    lotSection: MOCK_SECTIONS[0],
    requiresAction: true,
    evidence: [
      { id: 'ev3', name: 'blocked_access.jpg', type: 'photo', createdAt: '2025-01-19T12:00:00Z' },
      { id: 'ev4', name: 'incident_video.mp4', type: 'video', createdAt: '2025-01-19T12:30:00Z' },
    ],
    notes: [],
    timeline: [{ id: 't1', type: 'created', label: 'Dispute created', createdAt: '2025-01-19T11:00:00Z' }],
    createdAt: '2025-01-19T11:00:00Z',
    updatedAt: '2025-01-19T12:30:00Z',
    pauseListing: true,
  },
];

// ============================================================================
// STORAGE HELPERS
// ============================================================================
async function loadDisputes(): Promise<DisputeCase[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    if (data) return JSON.parse(data);
    // TODO: fetch disputes from API; mock seed removed
    // await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_DISPUTES));
    // return INITIAL_DISPUTES;
    return [];
  } catch {
    // return INITIAL_DISPUTES;
    return [];
  }
}

async function saveDisputes(disputes: DisputeCase[]): Promise<boolean> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(disputes));
    return true;
  } catch {
    return false;
  }
}

async function loadPrefs(): Promise<UIPrefs> {
  const defaults: UIPrefs = { statusFilter: 'all', categoryFilter: 'all', sortBy: 'newest', searchText: '' };
  try {
    const data = await AsyncStorage.getItem(PREFS_KEY);
    return data ? { ...defaults, ...JSON.parse(data) } : defaults;
  } catch {
    return defaults;
  }
}

async function savePrefs(prefs: UIPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

// ============================================================================
// COMPONENTS
// ============================================================================
const StatusPill = ({ status }: { status: DisputeStatus }) => (
  <StatusTag label={STATUS_CONFIG[status].label} tone={STATUS_TONE[status]} />
);

const PriorityPill = ({ priority }: { priority: DisputePriority }) => (
  <StatusTag label={`${PRIORITY_CONFIG[priority].label} priority`} tone={PRIORITY_TONE[priority]} />
);

const KpiCard = ({ label, count, active, onPress }: { label: string; count: number; active: boolean; onPress: () => void }) => (
  <TouchableOpacity
    style={[styles.kpiCard, active && styles.kpiCardActive]}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <Text style={[styles.kpiCount, active && styles.kpiTextActive]}>{count}</Text>
    <Text style={[styles.kpiLabel, active && styles.kpiLabelActive]} numberOfLines={1}>{label}</Text>
  </TouchableOpacity>
);

const FilterChip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
  <TouchableOpacity
    style={[styles.chip, active && styles.chipActive]}
    onPress={onPress}
    activeOpacity={0.75}
  >
    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
  </TouchableOpacity>
);

const Toast = ({ message, visible, onHide }: { message: string; visible: boolean; onHide: () => void }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(2000),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => onHide());
    }
  }, [visible]);
  if (!visible) return null;
  return (
    <Animated.View style={[styles.toast, { opacity }]}>
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
};

const EmptyState = ({ title, body, actionLabel, onAction }: { title: string; body: string; actionLabel?: string; onAction?: () => void }) => (
  <KitEmptyState
    tone="peach"
    title={title}
    subtitle={body}
    action={actionLabel && onAction ? actionLabel : undefined}
    onAction={onAction}
  />
);

// ============================================================================
// DISPUTE CARD
// ============================================================================
const DisputeCard = ({ item, onPress, onLongPress }: { item: DisputeCase; onPress: () => void; onLongPress: () => void }) => {
  const lastNote = item.notes[item.notes.length - 1];
  return (
    <TouchableOpacity style={styles.disputeCard} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.85}>
      <View style={styles.cardHeader}>
        <View style={styles.cardPills}>
          <StatusPill status={item.status} />
          <PriorityPill priority={item.priority} />
          {item.requiresAction && <StatusTag label="Action Required" tone="danger" />}
        </View>
        <Ionicons name="chevron-forward" size={20} color={palette.textSubtle} />
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
      <View style={styles.cardMeta}>
        <View style={styles.metaRow}>
          <Ionicons name="bookmark-outline" size={13} color={palette.text} />
          <Text style={styles.metaText}>{item.bookingRef.id}</Text>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={13} color={palette.text} />
          <Text style={styles.metaText}>{item.lotSection.name}</Text>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name={CATEGORY_CONFIG[item.category].icon as any} size={13} color={palette.text} />
          <Text style={styles.metaText}>{CATEGORY_CONFIG[item.category].label}</Text>
        </View>
      </View>
      {lastNote && (
        <Text style={styles.cardSnippet} numberOfLines={2}>"{lastNote.message}"</Text>
      )}
      <Text style={styles.cardTime}>Updated {formatRelativeTime(item.updatedAt)}</Text>
    </TouchableOpacity>
  );
};

// ============================================================================
// MAIN SCREEN
// ============================================================================
export default function DisputesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  // State
  const [disputes, setDisputes] = useState<DisputeCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [prefs, setPrefs] = useState<UIPrefs>({ statusFilter: 'all', categoryFilter: 'all', sortBy: 'newest', searchText: '' });
  const [toastMsg, setToastMsg] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [selectedDispute, setSelectedDispute] = useState<DisputeCase | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [quickActionTarget, setQuickActionTarget] = useState<DisputeCase | null>(null);
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);

  // Create form state
  const [createCategory, setCreateCategory] = useState<DisputeCategory>('booking');
  const [createBooking, setCreateBooking] = useState<BookingRef | null>(null);
  const [createSection, setCreateSection] = useState<LotSection | null>(null);
  const [createTitle, setCreateTitle] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createPriority, setCreatePriority] = useState<DisputePriority>('medium');
  const [createPause, setCreatePause] = useState(false);
  const [createEvidence, setCreateEvidence] = useState<EvidenceItem[]>([]);

  // Load data
  useEffect(() => {
    (async () => {
      const [d, p] = await Promise.all([loadDisputes(), loadPrefs()]);
      setDisputes(d);
      setPrefs(p);
      setLoading(false);
    })();
  }, []);

  // Refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const d = await loadDisputes();
    setDisputes(d);
    setRefreshing(false);
  }, []);

  // Save prefs
  const updatePrefs = useCallback((updates: Partial<UIPrefs>) => {
    setPrefs(p => {
      const newPrefs = { ...p, ...updates };
      savePrefs(newPrefs);
      return newPrefs;
    });
  }, []);

  // Toast helper
  const toast = (msg: string) => {
    setToastMsg(msg);
    setShowToast(true);
  };

  // Derived counts
  const counts = useMemo(() => ({
    open: disputes.filter(d => d.status === 'open').length,
    under_review: disputes.filter(d => d.status === 'under_review').length,
    resolved: disputes.filter(d => d.status === 'resolved').length,
    requires_action: disputes.filter(d => d.requiresAction).length,
  }), [disputes]);

  // Filtered & sorted
  const filteredDisputes = useMemo(() => {
    let result = [...disputes];
    if (prefs.statusFilter !== 'all') result = result.filter(d => d.status === prefs.statusFilter);
    if (prefs.categoryFilter !== 'all') result = result.filter(d => d.category === prefs.categoryFilter);
    if (prefs.searchText) {
      const q = prefs.searchText.toLowerCase();
      result = result.filter(d =>
        d.title.toLowerCase().includes(q) ||
        d.bookingRef.id.toLowerCase().includes(q) ||
        d.lotSection.name.toLowerCase().includes(q)
      );
    }
    switch (prefs.sortBy) {
      case 'oldest': result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()); break;
      case 'priority': result.sort((a, b) => { const o = { high: 0, medium: 1, low: 2 }; return o[a.priority] - o[b.priority]; }); break;
      case 'requires_action': result.sort((a, b) => (b.requiresAction ? 1 : 0) - (a.requiresAction ? 1 : 0)); break;
      default: result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return result;
  }, [disputes, prefs]);

  // Actions
  const updateDispute = async (id: string, updates: Partial<DisputeCase>, timelineEvent?: Omit<DisputeTimelineEvent, 'id' | 'createdAt'>) => {
    const now = new Date().toISOString();
    setDisputes(prev => {
      const updated = prev.map(d => {
        if (d.id !== id) return d;
        const newTimeline = timelineEvent
          ? [...d.timeline, { ...timelineEvent, id: generateId(), createdAt: now }]
          : d.timeline;
        return { ...d, ...updates, timeline: newTimeline, updatedAt: now };
      });
      saveDisputes(updated).then(ok => { if (!ok) setSaveFailed(true); });
      return updated;
    });
  };

  const createDispute = async () => {
    if (!createBooking || !createSection || createTitle.length < 6 || createDesc.length < 20) return;
    const now = new Date().toISOString();
    const newDispute: DisputeCase = {
      id: generateId(),
      title: createTitle,
      description: createDesc,
      status: 'open',
      priority: createPriority,
      category: createCategory,
      bookingRef: createBooking,
      lotSection: createSection,
      requiresAction: false,
      evidence: createEvidence,
      notes: [],
      timeline: [
        { id: generateId(), type: 'created', label: 'Dispute created', createdAt: now },
        ...(createPause ? [{ id: generateId(), type: 'note_added' as const, label: 'Listing paused due to dispute', createdAt: now }] : []),
      ],
      createdAt: now,
      updatedAt: now,
      pauseListing: createPause,
    };
    setDisputes(prev => {
      const updated = [newDispute, ...prev];
      saveDisputes(updated).then(ok => { if (!ok) setSaveFailed(true); });
      return updated;
    });
    setShowCreate(false);
    resetCreateForm();
    toast('Dispute created successfully');
  };

  const resetCreateForm = () => {
    setCreateCategory('booking');
    setCreateBooking(null);
    setCreateSection(null);
    setCreateTitle('');
    setCreateDesc('');
    setCreatePriority('medium');
    setCreatePause(false);
    setCreateEvidence([]);
  };

  const addNote = () => {
    if (!selectedDispute || noteText.length < 10) return;
    const now = new Date().toISOString();
    const newNote: DisputeNote = { id: generateId(), message: noteText, createdAt: now };
    const newTimelineEvent: DisputeTimelineEvent = { id: generateId(), type: 'note_added', label: 'Owner added note', createdAt: now };
    setDisputes(prev => {
      const updated = prev.map(d => {
        if (d.id !== selectedDispute.id) return d;
        return {
          ...d,
          notes: [...d.notes, newNote],
          timeline: [...d.timeline, newTimelineEvent],
          updatedAt: now,
        };
      });
      saveDisputes(updated);
      return updated;
    });
    setSelectedDispute(prev => prev ? { ...prev, notes: [...prev.notes, newNote] } : null);
    setNoteText('');
    setShowAddNote(false);
    toast('Note added');
  };

  const addEvidence = (name: string, evidenceType: 'photo' | 'video' | 'doc') => {
    if (!selectedDispute) return;
    const now = new Date().toISOString();
    const newEvidence: EvidenceItem = { id: generateId(), name, type: evidenceType, createdAt: now };
    const newTimelineEvent: DisputeTimelineEvent = { id: generateId(), type: 'evidence_added', label: 'Evidence attached', createdAt: now };
    setDisputes(prev => {
      const updated = prev.map(d => {
        if (d.id !== selectedDispute.id) return d;
        return {
          ...d,
          evidence: [...d.evidence, newEvidence],
          timeline: [...d.timeline, newTimelineEvent],
          updatedAt: now,
        };
      });
      saveDisputes(updated);
      return updated;
    });
    setSelectedDispute(prev => prev ? { ...prev, evidence: [...prev.evidence, newEvidence] } : null);
    toast('Evidence added');
  };

  const markResolved = (dispute: DisputeCase) => {
    updateDispute(dispute.id, { status: 'resolved', requiresAction: false }, { type: 'resolved', label: 'Dispute resolved' });
    setShowQuickActions(false);
    setShowDetails(false);
    toast('Marked as resolved');
  };

  const reopenDispute = (dispute: DisputeCase) => {
    updateDispute(dispute.id, { status: 'open' }, { type: 'reopened', label: 'Dispute reopened' });
    toast('Dispute reopened');
  };

  const archiveDispute = (dispute: DisputeCase) => {
    updateDispute(dispute.id, { status: 'archived' });
    setShowQuickActions(false);
    toast('Dispute archived');
  };

  // Create form validation
  const canSubmitCreate = createBooking && createSection && createTitle.length >= 6 && createDesc.length >= 20;

  // Render
  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={palette.ink} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <IconCircle icon="arrow-left" size={46} onPress={() => navigation.goBack()} />
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Disputes</Text>
        </View>
        <PillButton variant="ink" size="sm" icon="plus" label="New" onPress={() => setShowCreate(true)} />
      </View>

      {/* Dispute List */}
      <FlatList
        data={filteredDisputes}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <DisputeCard
            item={item}
            onPress={() => { setSelectedDispute(item); setShowDetails(true); }}
            onLongPress={() => { setQuickActionTarget(item); setShowQuickActions(true); }}
          />
        )}
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.ink} />}
        ListHeaderComponent={
          <>
            {/* Save failed banner */}
            {saveFailed && (
              <View style={styles.banner}>
                <Ionicons name="warning-outline" size={18} color={palette.warning} />
                <Text style={styles.bannerText}>Couldn't save locally. Changes may not persist.</Text>
                <TouchableOpacity onPress={() => setSaveFailed(false)}><Ionicons name="close" size={18} color={palette.textMuted} /></TouchableOpacity>
              </View>
            )}

            {/* KPI Strip */}
            <View style={styles.kpiWrapper}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.kpiStrip}
                contentContainerStyle={styles.kpiContent}
              >
                <KpiCard label="Open" count={counts.open} active={prefs.statusFilter === 'open'} onPress={() => updatePrefs({ statusFilter: prefs.statusFilter === 'open' ? 'all' : 'open' })} />
                <KpiCard label="Under Review" count={counts.under_review} active={prefs.statusFilter === 'under_review'} onPress={() => updatePrefs({ statusFilter: prefs.statusFilter === 'under_review' ? 'all' : 'under_review' })} />
                <KpiCard label="Resolved" count={counts.resolved} active={prefs.statusFilter === 'resolved'} onPress={() => updatePrefs({ statusFilter: prefs.statusFilter === 'resolved' ? 'all' : 'resolved' })} />
                <KpiCard label="Requires Action" count={counts.requires_action} active={prefs.sortBy === 'requires_action'} onPress={() => updatePrefs({ sortBy: prefs.sortBy === 'requires_action' ? 'newest' : 'requires_action' })} />
              </ScrollView>
            </View>

            {/* Search */}
            <View style={styles.searchContainer}>
              <SearchPill
                value={prefs.searchText}
                onChangeText={(t: string) => updatePrefs({ searchText: t })}
                placeholder="Search by booking ID"
                style={styles.searchBar}
                right={
                  prefs.searchText.length > 0 ? (
                    <TouchableOpacity onPress={() => updatePrefs({ searchText: '' })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={18} color={palette.textMuted} />
                    </TouchableOpacity>
                  ) : null
                }
              />
              <IconCircle
                icon="sliders"
                size={52}
                badge={prefs.sortBy !== 'newest'}
                onPress={() => setShowSortSheet(true)}
              />
            </View>

            {/* Category Filters */}
            <View style={styles.filterWrapper}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.filterStrip}
                contentContainerStyle={styles.filterContent}
              >
                <FilterChip label="All" active={prefs.categoryFilter === 'all'} onPress={() => updatePrefs({ categoryFilter: 'all' })} />
                {(Object.keys(CATEGORY_CONFIG) as DisputeCategory[]).map(cat => (
                  <FilterChip key={cat} label={CATEGORY_CONFIG[cat].label} active={prefs.categoryFilter === cat} onPress={() => updatePrefs({ categoryFilter: cat })} />
                ))}
              </ScrollView>
            </View>
          </>
        }
        ListEmptyComponent={
          prefs.searchText || prefs.statusFilter !== 'all' || prefs.categoryFilter !== 'all' ? (
            <EmptyState title="No results" body="Try adjusting your filters." actionLabel="Clear filters" onAction={() => updatePrefs({ statusFilter: 'all', categoryFilter: 'all', searchText: '' })} />
          ) : (
            <EmptyState title="No disputes yet" body="If a renter reports an issue, it will appear here." actionLabel="Create a dispute" onAction={() => setShowCreate(true)} />
          )
        }
      />

      {/* Toast */}
      <Toast message={toastMsg} visible={showToast} onHide={() => setShowToast(false)} />

      {/* Quick Actions Sheet */}
      {showQuickActions ? (
        <View style={styles.modalOverlay}>
          <Pressable style={styles.backdrop} onPress={() => setShowQuickActions(false)} />
          <View style={[styles.actionSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>Quick Actions</Text>
            {quickActionTarget && (
              <>
                <TouchableOpacity style={styles.actionRow} onPress={() => { setShowQuickActions(false); setSelectedDispute(quickActionTarget); setShowAddNote(true); }}>
                  <View style={styles.actionIcon}><Ionicons name="create-outline" size={20} color={palette.text} /></View>
                  <Text style={styles.actionText}>Add Note</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionRow} onPress={() => { setShowQuickActions(false); setSelectedDispute(quickActionTarget); addEvidence(`evidence_${Date.now()}.jpg`, 'photo'); }}>
                  <View style={styles.actionIcon}><Ionicons name="attach-outline" size={20} color={palette.text} /></View>
                  <Text style={styles.actionText}>Attach Evidence</Text>
                </TouchableOpacity>
                {(quickActionTarget.status === 'open' || quickActionTarget.status === 'under_review') && (
                  <TouchableOpacity style={styles.actionRow} onPress={() => markResolved(quickActionTarget)}>
                    <View style={[styles.actionIcon, styles.actionIconSuccess]}><Ionicons name="checkmark-circle-outline" size={20} color={palette.success} /></View>
                    <Text style={[styles.actionText, styles.actionTextSuccess]}>Mark Resolved</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.actionRow} onPress={() => archiveDispute(quickActionTarget)}>
                  <View style={styles.actionIcon}><Ionicons name="archive-outline" size={20} color={palette.text} /></View>
                  <Text style={styles.actionText}>Archive</Text>
                </TouchableOpacity>
              </>
            )}
            <PillButton variant="grey" label="Cancel" onPress={() => setShowQuickActions(false)} style={styles.sheetCancel} />
          </View>
        </View>
      ) : null}

      {/* Sort Sheet */}
      {showSortSheet ? (
        <View style={styles.modalOverlay}>
          <Pressable style={styles.backdrop} onPress={() => setShowSortSheet(false)} />
          <View style={[styles.actionSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>Sort By</Text>
            {[
              { key: 'newest', label: 'Newest first' },
              { key: 'oldest', label: 'Oldest first' },
              { key: 'priority', label: 'Priority (High→Low)' },
              { key: 'requires_action', label: 'Requires action first' },
            ].map((opt, i, arr) => (
              <TouchableOpacity key={opt.key} style={[styles.sortRow, i < arr.length - 1 && styles.sortRowDivider]} onPress={() => { updatePrefs({ sortBy: opt.key as any }); setShowSortSheet(false); }}>
                <Text style={[styles.sortText, prefs.sortBy === opt.key && styles.sortTextActive]}>{opt.label}</Text>
                {prefs.sortBy === opt.key ? (
                  <View style={styles.checkDot}><Ionicons name="checkmark" size={16} color={palette.textInverse} /></View>
                ) : (
                  <View style={styles.uncheckDot} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      {/* Details Modal */}
      {showDetails ? (
        <View style={[styles.fullOverlay, styles.detailRoot, { paddingTop: insets.top }]}>
          {selectedDispute && (
            <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <ScreenHeader title="Details" onBack={() => setShowDetails(false)} />
              <ScrollView style={styles.flex} contentContainerStyle={styles.detailContent}>
                {/* Summary card */}
                <View style={styles.summaryCard}>
                  <View style={styles.summaryArt} pointerEvents="none">
                    <IsoBlock size={140} tone={selectedDispute.requiresAction ? 'peach' : 'blue'} />
                  </View>
                  <View style={styles.detailPills}>
                    <StatusPill status={selectedDispute.status} />
                    <PriorityPill priority={selectedDispute.priority} />
                    {selectedDispute.requiresAction && <StatusTag label="Action Required" tone="danger" />}
                  </View>
                  <Text style={styles.detailTitle}>{selectedDispute.title}</Text>
                  <InfoGrid
                    style={styles.summaryGrid}
                    items={[
                      { label: 'Booking', value: selectedDispute.bookingRef.id },
                      { label: 'Section', value: selectedDispute.lotSection.name },
                      { label: 'Category', value: CATEGORY_CONFIG[selectedDispute.category].label },
                      { label: 'Created', value: formatDate(selectedDispute.createdAt) },
                    ]}
                  />
                </View>

                {/* Sheet */}
                <View style={styles.detailSheet}>
                  <View style={styles.grabber} />

                  {/* Description */}
                  <Text style={styles.sectionTitle}>Description</Text>
                  <Text style={styles.descText}>{selectedDispute.description}</Text>

                  {/* Timeline */}
                  <Text style={[styles.sectionTitle, styles.sectionGap]}>Timeline</Text>
                  {selectedDispute.timeline.map((ev, i) => (
                    <TimelineItem
                      key={ev.id}
                      title={ev.label}
                      time={formatRelativeTime(ev.createdAt)}
                      active={i === 0}
                      isLast={i === selectedDispute.timeline.length - 1}
                    />
                  ))}

                  {/* Evidence */}
                  <View style={[styles.sectionHeader, styles.sectionGap]}>
                    <Text style={styles.sectionTitle}>Evidence</Text>
                    <PillButton size="sm" variant="grey" icon="plus" label="Add" onPress={() => addEvidence(`photo_${Date.now()}.jpg`, 'photo')} />
                  </View>
                  {selectedDispute.evidence.length === 0 ? (
                    <Text style={styles.emptyText}>No evidence added yet</Text>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {selectedDispute.evidence.map(ev => (
                        <View key={ev.id} style={styles.evidenceChip}>
                          <Ionicons name={ev.type === 'photo' ? 'image-outline' : ev.type === 'video' ? 'videocam-outline' : 'document-outline'} size={16} color={palette.text} />
                          <Text style={styles.evidenceName} numberOfLines={1}>{ev.name}</Text>
                        </View>
                      ))}
                    </ScrollView>
                  )}

                  {/* Notes */}
                  <View style={[styles.sectionHeader, styles.sectionGap]}>
                    <Text style={styles.sectionTitle}>Notes</Text>
                    <PillButton size="sm" variant="grey" icon="plus" label="Add Note" onPress={() => setShowAddNote(true)} />
                  </View>
                  {selectedDispute.notes.length === 0 ? (
                    <Text style={styles.emptyText}>No notes yet</Text>
                  ) : (
                    selectedDispute.notes.map(note => (
                      <View key={note.id} style={styles.noteCard}>
                        <Text style={styles.noteText}>{note.message}</Text>
                        <Text style={styles.noteTime}>{formatRelativeTime(note.createdAt)}</Text>
                      </View>
                    ))
                  )}

                  {selectedDispute.status === 'rejected' && selectedDispute.rejectionReason && (
                    <View style={styles.rejectionBox}><Text style={styles.rejectionTitle}>Rejection Reason</Text><Text style={styles.rejectionText}>{selectedDispute.rejectionReason}</Text></View>
                  )}
                </View>
              </ScrollView>

              {/* Sticky actions */}
              {(selectedDispute.status === 'open' || selectedDispute.status === 'under_review' || selectedDispute.status === 'resolved') && (
                <View style={[styles.detailFooter, { paddingBottom: insets.bottom + 12 }]}>
                  {(selectedDispute.status === 'open' || selectedDispute.status === 'under_review') && (
                    <PillButton variant="ink" icon="check-circle" label="Mark as Resolved" onPress={() => markResolved(selectedDispute)} style={styles.flex} />
                  )}
                  {selectedDispute.status === 'resolved' && (
                    <PillButton variant="grey" icon="rotate-ccw" label="Reopen Dispute" onPress={() => reopenDispute(selectedDispute)} style={styles.flex} />
                  )}
                </View>
              )}
            </KeyboardAvoidingView>
          )}
        </View>
      ) : null}

      {/* Add Note Sheet */}
      {showAddNote ? (
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.backdrop} />
          <View style={[styles.actionSheet, styles.noteSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.grabber} />
            <Text style={styles.noteModalTitle}>Add Note</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="Enter your note (min 10 characters)"
              placeholderTextColor={palette.textSubtle}
              multiline
              value={noteText}
              onChangeText={setNoteText}
            />
            {noteText.length > 0 && noteText.length < 10 && <Text style={styles.errorText}>Note must be at least 10 characters</Text>}
            <View style={styles.noteModalBtns}>
              <PillButton variant="grey" label="Cancel" onPress={() => { setShowAddNote(false); setNoteText(''); }} style={styles.flex} />
              <PillButton variant="ink" label="Add Note" onPress={addNote} disabled={noteText.length < 10} style={styles.flexWide} />
            </View>
          </View>
        </KeyboardAvoidingView>
      ) : null}

      {/* Create Dispute Modal */}
      {showCreate ? (
        <View style={[styles.fullOverlay, styles.createRoot, { paddingTop: insets.top }]}>
          <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScreenHeader
              title="Create Dispute"
              right={<IconCircle icon="x" size={40} variant="grey" onPress={() => { setShowCreate(false); resetCreateForm(); }} />}
            />
            <ScrollView style={styles.flex} contentContainerStyle={styles.createContent}>
              {/* Category */}
              <Text style={styles.fieldLabel}>Category *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
                {(Object.keys(CATEGORY_CONFIG) as DisputeCategory[]).map(cat => (
                  <TouchableOpacity key={cat} style={[styles.categoryChip, createCategory === cat && styles.chipActive]} onPress={() => setCreateCategory(cat)}>
                    <Ionicons name={CATEGORY_CONFIG[cat].icon as any} size={17} color={createCategory === cat ? palette.textInverse : palette.text} />
                    <Text style={[styles.categoryText, createCategory === cat && styles.chipTextActive]}>{CATEGORY_CONFIG[cat].label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Booking — TODO: populate from real bookings API */}
              {/* Section — TODO: populate from real lot sections API */}

              {/* Title */}
              <Text style={styles.fieldLabel}>Title * (min 6 chars)</Text>
              <TextInput style={styles.textInput} placeholder="Brief title for this dispute" placeholderTextColor={palette.textSubtle} value={createTitle} onChangeText={setCreateTitle} />
              {createTitle.length > 0 && createTitle.length < 6 && <Text style={styles.errorText}>Title must be at least 6 characters</Text>}

              {/* Description */}
              <Text style={styles.fieldLabel}>Description * (min 20 chars)</Text>
              <TextInput style={[styles.textInput, styles.textArea]} placeholder="Describe the issue in detail..." placeholderTextColor={palette.textSubtle} multiline value={createDesc} onChangeText={setCreateDesc} />
              {createDesc.length > 0 && createDesc.length < 20 && <Text style={styles.errorText}>Description must be at least 20 characters</Text>}

              {/* Priority */}
              <Text style={styles.fieldLabel}>Priority</Text>
              <View style={styles.priorityRow}>
                {(['low', 'medium', 'high'] as DisputePriority[]).map(p => (
                  <TouchableOpacity key={p} style={[styles.priorityChip, createPriority === p && { backgroundColor: PRIORITY_CONFIG[p].bg }]} onPress={() => setCreatePriority(p)}>
                    <Text style={[styles.priorityText, createPriority === p && { color: PRIORITY_CONFIG[p].color }]}>{PRIORITY_CONFIG[p].label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Pause Listing */}
              <TouchableOpacity style={styles.checkRow} onPress={() => setCreatePause(!createPause)}>
                <Ionicons name={createPause ? 'checkbox' : 'square-outline'} size={24} color={createPause ? palette.ink : palette.textMuted} />
                <Text style={styles.checkLabel}>Pause listing temporarily</Text>
              </TouchableOpacity>
              {createPause && (
                <View style={styles.warningBanner}>
                  <Ionicons name="warning-outline" size={18} color={palette.warning} />
                  <Text style={styles.warningText}>This will mark your listing as paused locally.</Text>
                </View>
              )}

              {/* Evidence */}
              <Text style={styles.fieldLabel}>Evidence (optional)</Text>
              <View style={styles.evidenceRow}>
                {createEvidence.map(ev => (
                  <View key={ev.id} style={styles.evidenceChip}>
                    <Text style={styles.evidenceName}>{ev.name}</Text>
                    <TouchableOpacity onPress={() => setCreateEvidence(prev => prev.filter(e => e.id !== ev.id))}>
                      <Ionicons name="close-circle" size={18} color={palette.textMuted} />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={styles.addEvidenceBtn} onPress={() => setCreateEvidence(prev => [...prev, { id: generateId(), name: `photo_${prev.length + 1}.jpg`, type: 'photo', createdAt: new Date().toISOString() }])}>
                  <Ionicons name="add" size={18} color={palette.text} />
                  <Text style={styles.addEvidenceText}>Add</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
            <View style={[styles.createFooter, { paddingBottom: insets.bottom + 16 }]}>
              <PillButton variant="ink" label="Create Dispute" onPress={createDispute} disabled={!canSubmitCreate} />
            </View>
          </KeyboardAvoidingView>
        </View>
      ) : null}
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  flex: { flex: 1 },
  flexWide: { flex: 1.4 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  headerContent: { flex: 1, marginLeft: 12 },
  headerTitle: { ...fonts.semibold, fontSize: 28, letterSpacing: -0.7, color: palette.text },
  banner: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.warningSoft, paddingHorizontal: 16, paddingVertical: 12, borderRadius: radii.pill, marginBottom: 8 },
  bannerText: { ...fonts.medium, flex: 1, fontSize: 13, color: palette.text, marginLeft: 8 },
  kpiWrapper: { overflow: 'visible', marginBottom: 8, marginHorizontal: -16 },
  kpiStrip: { overflow: 'visible' },
  kpiContent: { paddingHorizontal: 16, gap: 10 },
  kpiCard: { backgroundColor: palette.surface, borderRadius: radii.lg, paddingVertical: 14, paddingHorizontal: 16, minWidth: 104 },
  kpiCardActive: { backgroundColor: palette.ink },
  kpiCount: { ...fonts.semibold, fontSize: 32, letterSpacing: -1, color: palette.text },
  kpiTextActive: { color: palette.textInverse },
  kpiLabel: { ...fonts.medium, fontSize: 12.5, color: palette.textMuted, marginTop: 2 },
  kpiLabelActive: { color: palette.textSubtle },
  searchContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginTop: 4, gap: 10 },
  searchBar: { flex: 1, backgroundColor: palette.surface },
  filterWrapper: { marginBottom: 4, marginHorizontal: -16 },
  filterStrip: {},
  filterContent: { paddingHorizontal: 16, paddingVertical: 2 },
  list: { flex: 1 },
  chip: { height: 40, justifyContent: 'center', paddingHorizontal: 16, borderRadius: radii.pill, backgroundColor: palette.surface, marginRight: 8 },
  chipActive: { backgroundColor: palette.ink },
  chipText: { ...fonts.semibold, fontSize: 13.5, color: palette.text },
  chipTextActive: { color: palette.textInverse },
  listContent: { paddingHorizontal: 16, flexGrow: 1 },
  disputeCard: { backgroundColor: palette.surface, borderRadius: radii.xl, padding: 18, marginTop: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  cardTitle: { ...fonts.bold, fontSize: 19, letterSpacing: -0.3, color: palette.text, marginTop: 12 },
  cardPills: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cardTrack: { marginTop: 14, width: '70%' },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, gap: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', height: 30, paddingHorizontal: 11, borderRadius: radii.pill, backgroundColor: palette.fill },
  metaText: { ...fonts.semibold, fontSize: 12, color: palette.text, marginLeft: 5 },
  cardSnippet: { ...fonts.medium, fontSize: 13, color: palette.textMuted, fontStyle: 'italic', marginTop: 12, lineHeight: 18 },
  cardTime: { ...fonts.medium, fontSize: 12, color: palette.textMuted, marginTop: 8 },
  toast: { position: 'absolute', bottom: 100, left: 24, right: 24, backgroundColor: palette.ink, borderRadius: radii.pill, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center' },
  toastText: { ...fonts.semibold, color: palette.textInverse, fontSize: 14 },
  // Overlays — absolutely positioned (modals do not present on this build)
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, elevation: 24, justifyContent: 'flex-end' },
  fullOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9000, elevation: 20 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  actionSheet: { backgroundColor: palette.surface, borderTopLeftRadius: radii.xxl, borderTopRightRadius: radii.xxl, paddingTop: 12, paddingHorizontal: 20 },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: palette.line, marginBottom: 16 },
  sheetTitle: { ...fonts.semibold, fontSize: 22, color: palette.text, marginBottom: 8 },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  actionIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: palette.fill, alignItems: 'center', justifyContent: 'center' },
  actionIconSuccess: { backgroundColor: palette.successSoft },
  actionText: { ...fonts.semibold, fontSize: 15.5, color: palette.text, marginLeft: 14, flex: 1 },
  actionTextSuccess: { color: palette.success },
  sheetCancel: { marginTop: 14 },
  sortRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 },
  sortRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  sortText: { ...fonts.medium, fontSize: 16, color: palette.text },
  sortTextActive: { ...fonts.semibold },
  checkDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: palette.ink, alignItems: 'center', justifyContent: 'center' },
  uncheckDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: palette.line },
  // Details
  detailRoot: { backgroundColor: palette.bgCream },
  detailContent: { flexGrow: 1 },
  summaryCard: { marginHorizontal: 16, marginTop: 4, backgroundColor: palette.surface, borderRadius: radii.xl, padding: 20, overflow: 'hidden' },
  summaryArt: { position: 'absolute', right: -34, top: 84 },
  detailPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  detailTitle: { ...fonts.bold, fontSize: 24, letterSpacing: -0.5, color: palette.text, marginTop: 12 },
  summaryTrack: { marginTop: 16, width: '66%' },
  summaryGrid: { marginTop: 18, width: '72%' },
  detailSheet: { flex: 1, marginTop: 14, backgroundColor: palette.surface, borderTopLeftRadius: radii.xxl, borderTopRightRadius: radii.xxl, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { ...fonts.semibold, fontSize: 18, color: palette.text },
  sectionGap: { marginTop: 22, marginBottom: 12 },
  descText: { ...fonts.medium, fontSize: 14.5, color: palette.textMuted, lineHeight: 21, marginTop: 8 },
  emptyText: { ...fonts.medium, fontSize: 14, color: palette.textMuted },
  evidenceChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.fill, borderRadius: radii.pill, paddingHorizontal: 12, height: 36, marginRight: 8, marginTop: 8 },
  evidenceName: { ...fonts.semibold, fontSize: 12.5, color: palette.text, marginLeft: 6, marginRight: 4, maxWidth: 140 },
  noteCard: { backgroundColor: palette.surfaceDim, borderRadius: radii.lg, padding: 14, marginBottom: 10 },
  noteText: { ...fonts.medium, fontSize: 14, color: palette.text, lineHeight: 20 },
  noteTime: { ...fonts.medium, fontSize: 12, color: palette.textMuted, marginTop: 6 },
  rejectionBox: { backgroundColor: palette.dangerSoft, borderRadius: radii.lg, padding: 16, marginTop: 20 },
  rejectionTitle: { ...fonts.semibold, fontSize: 14, color: palette.danger },
  rejectionText: { ...fonts.medium, fontSize: 14, color: palette.text, marginTop: 4 },
  detailFooter: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, backgroundColor: palette.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line, gap: 10 },
  // Add note sheet
  noteSheet: {},
  noteModalTitle: { ...fonts.semibold, fontSize: 22, color: palette.text, marginBottom: 14 },
  noteInput: { ...fonts.medium, backgroundColor: palette.fill, borderRadius: radii.lg, paddingHorizontal: 18, paddingVertical: 16, fontSize: 15, color: palette.text, minHeight: 110, textAlignVertical: 'top' },
  errorText: { ...fonts.medium, fontSize: 12, color: palette.danger, marginTop: 6, marginLeft: 4 },
  noteModalBtns: { flexDirection: 'row', marginTop: 20, gap: 10 },
  // Create
  createRoot: { backgroundColor: palette.bg },
  createContent: { paddingHorizontal: 20, paddingBottom: 40 },
  fieldLabel: { ...fonts.semibold, fontSize: 14, color: palette.text, marginTop: 18, marginBottom: 8, marginLeft: 4 },
  categoryRow: { flexDirection: 'row' },
  categoryChip: { flexDirection: 'row', alignItems: 'center', height: 42, paddingHorizontal: 16, borderRadius: radii.pill, backgroundColor: palette.surface, marginRight: 8 },
  categoryText: { ...fonts.semibold, fontSize: 13.5, color: palette.text, marginLeft: 6 },
  textInput: { ...fonts.medium, backgroundColor: palette.surface, borderRadius: radii.pill, paddingHorizontal: 20, height: 56, fontSize: 15, color: palette.text },
  textArea: { height: undefined, minHeight: 120, borderRadius: radii.lg, paddingTop: 16, paddingBottom: 16, textAlignVertical: 'top' },
  priorityRow: { flexDirection: 'row', gap: 10 },
  priorityChip: { flex: 1, height: 48, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface },
  priorityText: { ...fonts.semibold, fontSize: 14, color: palette.textMuted },
  checkRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, paddingVertical: 8 },
  checkLabel: { ...fonts.medium, fontSize: 15, color: palette.text, marginLeft: 10 },
  warningBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.warningSoft, padding: 14, borderRadius: radii.lg, marginTop: 8 },
  warningText: { ...fonts.medium, fontSize: 13, color: palette.text, marginLeft: 8, flex: 1 },
  evidenceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  addEvidenceBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 36, borderRadius: radii.pill, borderWidth: 1.5, borderColor: palette.textSubtle, borderStyle: 'dashed', marginTop: 8 },
  addEvidenceText: { ...fonts.semibold, fontSize: 13, color: palette.text, marginLeft: 4 },
  createFooter: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: palette.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
});
