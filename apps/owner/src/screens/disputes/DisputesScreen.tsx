import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  FlatList,
  Modal,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize } from '../../theme/typography';

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
  open: { label: 'Open', color: '#1976D2', bg: '#E3F2FD' },
  under_review: { label: 'Under Review', color: '#F57C00', bg: '#FFF3E0' },
  resolved: { label: 'Resolved', color: '#388E3C', bg: '#E8F5E9' },
  rejected: { label: 'Rejected', color: '#D32F2F', bg: '#FFEBEE' },
  archived: { label: 'Archived', color: '#757575', bg: '#F5F5F5' },
};

const PRIORITY_CONFIG: Record<DisputePriority, { label: string; color: string; bg: string }> = {
  low: { label: 'Low', color: '#388E3C', bg: '#E8F5E9' },
  medium: { label: 'Medium', color: '#F57C00', bg: '#FFF3E0' },
  high: { label: 'High', color: '#D32F2F', bg: '#FFEBEE' },
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
const StatusPill = ({ status }: { status: DisputeStatus }) => {
  const cfg = STATUS_CONFIG[status];
  return (
    <View style={[styles.pill, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.pillText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
};

const PriorityPill = ({ priority }: { priority: DisputePriority }) => {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <View style={[styles.pill, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.pillText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
};

const KpiCard = ({ label, count, active, onPress }: { label: string; count: number; active: boolean; onPress: () => void }) => {
  const theme = getTheme(false);
  return (
    <TouchableOpacity
      style={[styles.kpiCard, active && { borderColor: theme.primary, borderWidth: 2 }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.kpiCount, { color: theme.primary }]}>{count}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </TouchableOpacity>
  );
};

const FilterChip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => {
  const theme = getTheme(false);
  return (
    <TouchableOpacity
      style={[styles.chip, active && { backgroundColor: theme.primary }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.chipText, active && { color: '#FFF' }]}>{label}</Text>
    </TouchableOpacity>
  );
};

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
  <View style={styles.emptyState}>
    <Ionicons name="document-text-outline" size={64} color="#CCC" />
    <Text style={styles.emptyTitle}>{title}</Text>
    <Text style={styles.emptyBody}>{body}</Text>
    {actionLabel && onAction && (
      <TouchableOpacity style={styles.emptyBtn} onPress={onAction}>
        <Text style={styles.emptyBtnText}>{actionLabel}</Text>
      </TouchableOpacity>
    )}
  </View>
);

// ============================================================================
// DISPUTE CARD
// ============================================================================
const DisputeCard = ({ item, onPress, onLongPress }: { item: DisputeCase; onPress: () => void; onLongPress: () => void }) => {
  const theme = getTheme(false);
  const lastNote = item.notes[item.notes.length - 1];
  return (
    <TouchableOpacity style={styles.disputeCard} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          <View style={styles.cardPills}>
            <StatusPill status={item.status} />
            <PriorityPill priority={item.priority} />
            {item.requiresAction && (
              <View style={[styles.pill, { backgroundColor: '#FFEBEE' }]}>
                <Text style={[styles.pillText, { color: '#D32F2F' }]}>Action Required</Text>
              </View>
            )}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#999" />
      </View>
      <View style={styles.cardMeta}>
        <View style={styles.metaRow}>
          <Ionicons name="bookmark-outline" size={14} color="#666" />
          <Text style={styles.metaText}>{item.bookingRef.id}</Text>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={14} color="#666" />
          <Text style={styles.metaText}>{item.lotSection.name}</Text>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name={CATEGORY_CONFIG[item.category].icon as any} size={14} color="#666" />
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
  const theme = getTheme(false);
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
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBackBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#1E293B" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Disputes</Text>
        </View>
        <TouchableOpacity style={[styles.newBtn, { backgroundColor: theme.primary }]} onPress={() => setShowCreate(true)}>
          <Ionicons name="add" size={20} color="#FFF" />
          <Text style={styles.newBtnText}>New</Text>
        </TouchableOpacity>
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
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        ListHeaderComponent={
          <>
            {/* Save failed banner */}
            {saveFailed && (
              <View style={styles.banner}>
                <Ionicons name="warning-outline" size={18} color="#F57C00" />
                <Text style={styles.bannerText}>Couldn't save locally. Changes may not persist.</Text>
                <TouchableOpacity onPress={() => setSaveFailed(false)}><Ionicons name="close" size={18} color="#666" /></TouchableOpacity>
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
              <View style={[styles.searchBar, { backgroundColor: theme.surface }]}>
                <Ionicons name="search-outline" size={18} color={theme.textMuted} />
                <TextInput
                  style={[styles.searchInput, { color: theme.text }]}
                  placeholder="Search by booking ID"
                  placeholderTextColor={theme.textMuted}
                  value={prefs.searchText}
                  onChangeText={t => updatePrefs({ searchText: t })}
                />
                {prefs.searchText.length > 0 && (
                  <TouchableOpacity onPress={() => updatePrefs({ searchText: '' })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={18} color={theme.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity style={[styles.sortBtn, { backgroundColor: theme.surface }]} onPress={() => setShowSortSheet(true)}>
                <Ionicons name="funnel-outline" size={20} color={theme.text} />
              </TouchableOpacity>
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

        <Pressable style={styles.modalOverlay} onPress={() => setShowQuickActions(false)}>
          <View style={[styles.actionSheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.sheetTitle}>Quick Actions</Text>
            {quickActionTarget && (
              <>
                <TouchableOpacity style={styles.actionRow} onPress={() => { setShowQuickActions(false); setSelectedDispute(quickActionTarget); setShowAddNote(true); }}>
                  <Ionicons name="create-outline" size={22} color="#333" /><Text style={styles.actionText}>Add Note</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionRow} onPress={() => { setShowQuickActions(false); setSelectedDispute(quickActionTarget); addEvidence(`evidence_${Date.now()}.jpg`, 'photo'); }}>
                  <Ionicons name="attach-outline" size={22} color="#333" /><Text style={styles.actionText}>Attach Evidence</Text>
                </TouchableOpacity>
                {(quickActionTarget.status === 'open' || quickActionTarget.status === 'under_review') && (
                  <TouchableOpacity style={styles.actionRow} onPress={() => markResolved(quickActionTarget)}>
                    <Ionicons name="checkmark-circle-outline" size={22} color="#388E3C" /><Text style={[styles.actionText, { color: '#388E3C' }]}>Mark Resolved</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.actionRow} onPress={() => archiveDispute(quickActionTarget)}>
                  <Ionicons name="archive-outline" size={22} color="#666" /><Text style={styles.actionText}>Archive</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={[styles.actionRow, styles.cancelRow]} onPress={() => setShowQuickActions(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      
      ) : null}

      {/* Sort Sheet */}
      {showSortSheet ? (

        <Pressable style={styles.modalOverlay} onPress={() => setShowSortSheet(false)}>
          <View style={[styles.actionSheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.sheetTitle}>Sort By</Text>
            {[
              { key: 'newest', label: 'Newest first' },
              { key: 'oldest', label: 'Oldest first' },
              { key: 'priority', label: 'Priority (High→Low)' },
              { key: 'requires_action', label: 'Requires action first' },
            ].map(opt => (
              <TouchableOpacity key={opt.key} style={styles.actionRow} onPress={() => { updatePrefs({ sortBy: opt.key as any }); setShowSortSheet(false); }}>
                <Text style={[styles.actionText, prefs.sortBy === opt.key && { color: theme.primary, fontWeight: '600' }]}>{opt.label}</Text>
                {prefs.sortBy === opt.key && <Ionicons name="checkmark" size={20} color={theme.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      
      ) : null}

      {/* Details Modal */}
      {showDetails ? (

        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
          {selectedDispute && (
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles.detailHeader}>
                <TouchableOpacity onPress={() => setShowDetails(false)} style={styles.backBtn}>
                  <Ionicons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.detailTitle} numberOfLines={1}>{selectedDispute.title}</Text>
              </View>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.detailContent}>
                {/* Status & Priority */}
                <View style={styles.detailPills}>
                  <StatusPill status={selectedDispute.status} />
                  <PriorityPill priority={selectedDispute.priority} />
                  {selectedDispute.requiresAction && (
                    <View style={[styles.pill, { backgroundColor: '#FFEBEE' }]}>
                      <Text style={[styles.pillText, { color: '#D32F2F' }]}>Action Required</Text>
                    </View>
                  )}
                </View>

                {/* Meta */}
                <View style={styles.detailMeta}>
                  <View style={styles.metaItem}><Text style={styles.metaLabel}>Booking</Text><Text style={styles.metaValue}>{selectedDispute.bookingRef.id}</Text></View>
                  <View style={styles.metaItem}><Text style={styles.metaLabel}>Section</Text><Text style={styles.metaValue}>{selectedDispute.lotSection.name}</Text></View>
                  <View style={styles.metaItem}><Text style={styles.metaLabel}>Category</Text><Text style={styles.metaValue}>{CATEGORY_CONFIG[selectedDispute.category].label}</Text></View>
                  <View style={styles.metaItem}><Text style={styles.metaLabel}>Created</Text><Text style={styles.metaValue}>{formatDate(selectedDispute.createdAt)}</Text></View>
                </View>

                {/* Description */}
                <View style={styles.section}><Text style={styles.sectionTitle}>Description</Text><Text style={styles.descText}>{selectedDispute.description}</Text></View>

                {/* Timeline */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Timeline</Text>
                  {selectedDispute.timeline.map((ev, i) => (
                    <View key={ev.id} style={styles.timelineItem}>
                      <View style={[styles.timelineDot, i === 0 && { backgroundColor: theme.primary }]} />
                      {i < selectedDispute.timeline.length - 1 && <View style={styles.timelineLine} />}
                      <View style={styles.timelineContent}>
                        <Text style={styles.timelineLabel}>{ev.label}</Text>
                        <Text style={styles.timelineTime}>{formatRelativeTime(ev.createdAt)}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Evidence */}
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Evidence</Text>
                    <TouchableOpacity onPress={() => addEvidence(`photo_${Date.now()}.jpg`, 'photo')}>
                      <Text style={[styles.addLink, { color: theme.primary }]}>+ Add</Text>
                    </TouchableOpacity>
                  </View>
                  {selectedDispute.evidence.length === 0 ? (
                    <Text style={styles.emptyText}>No evidence added yet</Text>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {selectedDispute.evidence.map(ev => (
                        <View key={ev.id} style={styles.evidenceChip}>
                          <Ionicons name={ev.type === 'photo' ? 'image-outline' : ev.type === 'video' ? 'videocam-outline' : 'document-outline'} size={16} color="#666" />
                          <Text style={styles.evidenceName} numberOfLines={1}>{ev.name}</Text>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                </View>

                {/* Notes */}
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Notes</Text>
                    <TouchableOpacity onPress={() => setShowAddNote(true)}>
                      <Text style={[styles.addLink, { color: theme.primary }]}>+ Add Note</Text>
                    </TouchableOpacity>
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
                </View>

                {/* Actions */}
                <View style={styles.detailActions}>
                  {(selectedDispute.status === 'open' || selectedDispute.status === 'under_review') && (
                    <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.primary }]} onPress={() => markResolved(selectedDispute)}>
                      <Text style={styles.primaryBtnText}>Mark as Resolved</Text>
                    </TouchableOpacity>
                  )}
                  {selectedDispute.status === 'resolved' && (
                    <TouchableOpacity style={styles.secondaryBtn} onPress={() => reopenDispute(selectedDispute)}>
                      <Text style={styles.secondaryBtnText}>Reopen Dispute</Text>
                    </TouchableOpacity>
                  )}
                  {selectedDispute.status === 'rejected' && selectedDispute.rejectionReason && (
                    <View style={styles.rejectionBox}><Text style={styles.rejectionTitle}>Rejection Reason</Text><Text style={styles.rejectionText}>{selectedDispute.rejectionReason}</Text></View>
                  )}
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          )}
        </SafeAreaView>
      
      ) : null}

      {/* Add Note Modal */}
      {showAddNote ? (

        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.noteModal}>
            <Text style={styles.noteModalTitle}>Add Note</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="Enter your note (min 10 characters)"
              placeholderTextColor="#999"
              multiline
              value={noteText}
              onChangeText={setNoteText}
            />
            {noteText.length > 0 && noteText.length < 10 && <Text style={styles.errorText}>Note must be at least 10 characters</Text>}
            <View style={styles.noteModalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowAddNote(false); setNoteText(''); }}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitBtn, { backgroundColor: noteText.length >= 10 ? theme.primary : '#CCC' }]} onPress={addNote} disabled={noteText.length < 10}>
                <Text style={styles.submitBtnText}>Add Note</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      
      ) : null}

      {/* Create Dispute Modal */}
      {showCreate ? (

        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.createHeader}>
              <TouchableOpacity onPress={() => { setShowCreate(false); resetCreateForm(); }}>
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
              <Text style={styles.createTitle}>Create Dispute</Text>
              <View style={{ width: 28 }} />
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.createContent}>
              {/* Category */}
              <Text style={styles.fieldLabel}>Category *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
                {(Object.keys(CATEGORY_CONFIG) as DisputeCategory[]).map(cat => (
                  <TouchableOpacity key={cat} style={[styles.categoryChip, createCategory === cat && { backgroundColor: theme.primary }]} onPress={() => setCreateCategory(cat)}>
                    <Ionicons name={CATEGORY_CONFIG[cat].icon as any} size={18} color={createCategory === cat ? '#FFF' : '#666'} />
                    <Text style={[styles.categoryText, createCategory === cat && { color: '#FFF' }]}>{CATEGORY_CONFIG[cat].label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Booking — TODO: populate from real bookings API */}
              {/* <Text style={styles.fieldLabel}>Related Booking *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectRow}>
                {MOCK_BOOKINGS.map(b => (
                  <TouchableOpacity key={b.id} style={[styles.selectChip, createBooking?.id === b.id && { borderColor: theme.primary, backgroundColor: '#E3F2FD' }]} onPress={() => setCreateBooking(b)}>
                    <Text style={styles.selectChipTitle}>{b.id}</Text>
                    <Text style={styles.selectChipSub}>{b.renterName}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView> */}

              {/* Section — TODO: populate from real lot sections API */}
              {/* <Text style={styles.fieldLabel}>Lot Section *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectRow}>
                {MOCK_SECTIONS.map(s => (
                  <TouchableOpacity key={s.id} style={[styles.selectChip, createSection?.id === s.id && { borderColor: theme.primary, backgroundColor: '#E3F2FD' }]} onPress={() => setCreateSection(s)}>
                    <Text style={styles.selectChipTitle}>{s.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView> */}

              {/* Title */}
              <Text style={styles.fieldLabel}>Title * (min 6 chars)</Text>
              <TextInput style={styles.textInput} placeholder="Brief title for this dispute" placeholderTextColor="#999" value={createTitle} onChangeText={setCreateTitle} />
              {createTitle.length > 0 && createTitle.length < 6 && <Text style={styles.errorText}>Title must be at least 6 characters</Text>}

              {/* Description */}
              <Text style={styles.fieldLabel}>Description * (min 20 chars)</Text>
              <TextInput style={[styles.textInput, styles.textArea]} placeholder="Describe the issue in detail..." placeholderTextColor="#999" multiline value={createDesc} onChangeText={setCreateDesc} />
              {createDesc.length > 0 && createDesc.length < 20 && <Text style={styles.errorText}>Description must be at least 20 characters</Text>}

              {/* Priority */}
              <Text style={styles.fieldLabel}>Priority</Text>
              <View style={styles.priorityRow}>
                {(['low', 'medium', 'high'] as DisputePriority[]).map(p => (
                  <TouchableOpacity key={p} style={[styles.priorityChip, createPriority === p && { backgroundColor: PRIORITY_CONFIG[p].bg, borderColor: PRIORITY_CONFIG[p].color }]} onPress={() => setCreatePriority(p)}>
                    <Text style={[styles.priorityText, createPriority === p && { color: PRIORITY_CONFIG[p].color }]}>{PRIORITY_CONFIG[p].label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Pause Listing */}
              <TouchableOpacity style={styles.checkRow} onPress={() => setCreatePause(!createPause)}>
                <Ionicons name={createPause ? 'checkbox' : 'square-outline'} size={24} color={createPause ? theme.primary : '#666'} />
                <Text style={styles.checkLabel}>Pause listing temporarily</Text>
              </TouchableOpacity>
              {createPause && (
                <View style={styles.warningBanner}>
                  <Ionicons name="warning-outline" size={18} color="#F57C00" />
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
                      <Ionicons name="close-circle" size={18} color="#999" />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={styles.addEvidenceBtn} onPress={() => setCreateEvidence(prev => [...prev, { id: generateId(), name: `photo_${prev.length + 1}.jpg`, type: 'photo', createdAt: new Date().toISOString() }])}>
                  <Ionicons name="add" size={20} color="#666" />
                  <Text style={styles.addEvidenceText}>Add</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
            <View style={[styles.createFooter, { paddingBottom: insets.bottom + 16 }]}>
              <TouchableOpacity style={[styles.submitBtn, { backgroundColor: canSubmitCreate ? theme.primary : '#CCC', flex: 1 }]} onPress={createDispute} disabled={!canSubmitCreate}>
                <Text style={styles.submitBtnText}>Create Dispute</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      
      ) : null}
    </SafeAreaView>
  );
}

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  headerBackBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', marginRight: 8, backgroundColor: '#E8F5F4', borderRadius: 20 },
  headerContent: { flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#1E293B' },
  headerSubtitle: { fontSize: 13, color: '#64748B', marginTop: 2 },
  newBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  newBtnText: { color: '#FFF', fontWeight: '600', marginLeft: 4 },
  banner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF3E0', paddingHorizontal: 16, paddingVertical: 10, marginHorizontal: 16, borderRadius: 8, marginBottom: 8 },
  bannerText: { flex: 1, fontSize: 13, color: '#666', marginLeft: 8 },
  kpiWrapper: { overflow: 'visible', marginBottom: 4 },
  kpiStrip: { overflow: 'visible' },
  kpiContent: { marginLeft: -4, paddingRight: 16, paddingVertical: 8 },
  kpiCard: { backgroundColor: '#FFF', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, marginHorizontal: 4, minWidth: 90, alignItems: 'center', ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }, android: { elevation: 2 } }) },
  kpiCount: { fontSize: 24, fontWeight: '700' },
  kpiLabel: { fontSize: 12, color: '#666', marginTop: 2 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', paddingLeft: 0, paddingRight: spacing[4], marginBottom: spacing[2], gap: spacing[2] },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: borderRadius.lg, gap: spacing[2] },
  searchInput: { flex: 1, fontSize: fontSize.sm, padding: 0 },
  sortBtn: { width: 40, height: 40, borderRadius: borderRadius.lg, justifyContent: 'center', alignItems: 'center' },
  filterWrapper: { marginBottom: 8 },
  filterStrip: {},
  filterContent: { paddingLeft: 0, paddingRight: 16, paddingVertical: 4 },
  list: { flex: 1 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F0F0F0', marginLeft: 0, marginRight: 8 },
  chipText: { fontSize: 13, color: '#333', fontWeight: '500' },
  listContent: { paddingHorizontal: 16, paddingBottom: 16 },
  disputeCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginTop: 12, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }, android: { elevation: 2 } }) },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#1A1A1A', marginBottom: 8 },
  cardPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  pillText: { fontSize: 12, fontWeight: '600' },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, gap: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  metaText: { fontSize: 13, color: '#666', marginLeft: 4 },
  cardSnippet: { fontSize: 13, color: '#666', fontStyle: 'italic', marginTop: 10 },
  cardTime: { fontSize: 12, color: '#999', marginTop: 8 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#333', marginTop: 16 },
  emptyBody: { fontSize: 14, color: '#666', marginTop: 8, textAlign: 'center', paddingHorizontal: 40 },
  emptyBtn: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#1976D2', borderRadius: 24 },
  emptyBtnText: { color: '#FFF', fontWeight: '600' },
  toast: { position: 'absolute', bottom: 100, left: 24, right: 24, backgroundColor: '#333', borderRadius: 10, padding: 14, alignItems: 'center' },
  toastText: { color: '#FFF', fontSize: 14, fontWeight: '500' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  actionSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '600', color: '#333', textAlign: 'center', marginBottom: 16 },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20 },
  actionText: { fontSize: 16, color: '#333', marginLeft: 12, flex: 1 },
  cancelRow: { borderTopWidth: 1, borderTopColor: '#EEE', marginTop: 8 },
  cancelText: { fontSize: 16, color: '#666', textAlign: 'center', flex: 1 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  backBtn: { width: 44, height: 44, justifyContent: 'center' },
  detailTitle: { flex: 1, fontSize: 18, fontWeight: '600', color: '#333' },
  detailContent: { padding: 16, paddingBottom: 40 },
  detailPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detailMeta: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, backgroundColor: '#F9F9F9', borderRadius: 12, padding: 12, gap: 16 },
  metaItem: {},
  metaLabel: { fontSize: 11, color: '#999', textTransform: 'uppercase' },
  metaValue: { fontSize: 14, color: '#333', fontWeight: '500', marginTop: 2 },
  section: { marginTop: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#333' },
  addLink: { fontSize: 14, fontWeight: '600' },
  descText: { fontSize: 15, color: '#444', lineHeight: 22, marginTop: 8 },
  timelineItem: { flexDirection: 'row', marginTop: 12, minHeight: 40 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#CCC', marginTop: 4 },
  timelineLine: { position: 'absolute', left: 4, top: 18, width: 2, height: '100%', backgroundColor: '#EEE' },
  timelineContent: { marginLeft: 12, flex: 1 },
  timelineLabel: { fontSize: 14, color: '#333' },
  timelineTime: { fontSize: 12, color: '#999', marginTop: 2 },
  emptyText: { fontSize: 14, color: '#999', marginTop: 8 },
  evidenceChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginRight: 8, marginTop: 8 },
  evidenceName: { fontSize: 13, color: '#333', marginLeft: 6, maxWidth: 120 },
  noteCard: { backgroundColor: '#F9F9F9', borderRadius: 10, padding: 12, marginTop: 10 },
  noteText: { fontSize: 14, color: '#333', lineHeight: 20 },
  noteTime: { fontSize: 12, color: '#999', marginTop: 6 },
  detailActions: { marginTop: 32 },
  primaryBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  secondaryBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#DDD' },
  secondaryBtnText: { color: '#333', fontSize: 16, fontWeight: '600' },
  rejectionBox: { backgroundColor: '#FFEBEE', borderRadius: 10, padding: 14 },
  rejectionTitle: { fontSize: 14, fontWeight: '600', color: '#D32F2F' },
  rejectionText: { fontSize: 14, color: '#666', marginTop: 4 },
  noteModal: { backgroundColor: '#FFF', marginHorizontal: 20, borderRadius: 16, padding: 20 },
  noteModalTitle: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 16 },
  noteInput: { backgroundColor: '#F5F5F5', borderRadius: 10, padding: 14, fontSize: 15, color: '#333', minHeight: 100, textAlignVertical: 'top' },
  errorText: { fontSize: 12, color: '#D32F2F', marginTop: 4 },
  noteModalBtns: { flexDirection: 'row', marginTop: 16, gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#F0F0F0', alignItems: 'center' },
  cancelBtnText: { fontSize: 15, color: '#666', fontWeight: '600' },
  submitBtn: { paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  submitBtnText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  createHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  createTitle: { fontSize: 18, fontWeight: '600', color: '#333' },
  createContent: { padding: 16, paddingBottom: 40 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 16, marginBottom: 8 },
  categoryRow: { flexDirection: 'row' },
  categoryChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: '#F0F0F0', marginRight: 8 },
  categoryText: { fontSize: 13, color: '#333', marginLeft: 6, fontWeight: '500' },
  selectRow: { flexDirection: 'row' },
  selectChip: { borderWidth: 1, borderColor: '#DDD', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginRight: 8, minWidth: 80 },
  selectChipTitle: { fontSize: 14, fontWeight: '600', color: '#333' },
  selectChipSub: { fontSize: 12, color: '#666', marginTop: 2 },
  textInput: { backgroundColor: '#F5F5F5', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#333' },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  priorityRow: { flexDirection: 'row', gap: 10 },
  priorityChip: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#DDD' },
  priorityText: { fontSize: 14, fontWeight: '600', color: '#666' },
  checkRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, paddingVertical: 8 },
  checkLabel: { fontSize: 15, color: '#333', marginLeft: 10 },
  warningBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF3E0', padding: 12, borderRadius: 10, marginTop: 8 },
  warningText: { fontSize: 13, color: '#666', marginLeft: 8, flex: 1 },
  evidenceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  addEvidenceBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#DDD', borderStyle: 'dashed', marginTop: 8 },
  addEvidenceText: { fontSize: 13, color: '#666', marginLeft: 4 },
  createFooter: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#EEE' },
});
