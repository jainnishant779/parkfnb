import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  memo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Pressable,
  Animated as RNAnimated,
  ActivityIndicator,
  Dimensions,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme, type SemanticTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

type StaffRole = 'Manager' | 'Attendant' | 'Finance' | 'Viewer';
type StaffStatus = 'Active' | 'Invited' | 'Suspended';

interface PermissionSet {
  manageListings: boolean;
  manageBookings: boolean;
  manageAvailability: boolean;
  managePricingPromos: boolean;
  viewAnalytics: boolean;
  managePayoutsFinance: boolean;
  manageStaffRoles: boolean;
  viewSupportDisputes: boolean;
}

interface ActivityItem {
  id: string;
  label: string;
  createdAt: number;
}

interface StaffMember {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  role: StaffRole;
  status: StaffStatus;
  createdAt: number;
  updatedAt: number;
  lastSeenAt?: number;
  permissions: PermissionSet;
  notes?: string;
  activity: ActivityItem[];
}

interface StaffUIPrefs {
  filterRole: StaffRole | 'All';
  filterStatus: StaffStatus | 'All';
  sortOption: 'Newest' | 'Name A–Z' | 'Role';
  searchText: string;
}

type RoleFilter = StaffRole | 'All';
type StatusFilter = StaffStatus | 'All';
type SortOption = 'Newest' | 'Name A–Z' | 'Role';

// ============================================================================
// STORAGE KEYS
// ============================================================================

const STORAGE_KEYS = {
  STAFF_MEMBERS: '@ownerapp/staff_members_v1',
  UI_PREFS: '@ownerapp/staff_ui_prefs_v1',
} as const;

// ============================================================================
// HELPERS
// ============================================================================

const generateId = (): string => {
  return `staff_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const generateActivityId = (): string => {
  return `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
};

const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePhone = (phone: string): boolean => {
  const phoneRegex = /^[+]?[\d\s-]{8,15}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
};

// ============================================================================
// ROLE PERMISSION PRESETS
// ============================================================================

const ROLE_PERMISSION_PRESETS: Record<StaffRole, PermissionSet> = {
  Manager: {
    manageListings: true,
    manageBookings: true,
    manageAvailability: true,
    managePricingPromos: true,
    viewAnalytics: true,
    managePayoutsFinance: true,
    manageStaffRoles: true,
    viewSupportDisputes: true,
  },
  Attendant: {
    manageListings: false,
    manageBookings: true,
    manageAvailability: true,
    managePricingPromos: false,
    viewAnalytics: false,
    managePayoutsFinance: false,
    manageStaffRoles: false,
    viewSupportDisputes: false,
  },
  Finance: {
    manageListings: false,
    manageBookings: false,
    manageAvailability: false,
    managePricingPromos: false,
    viewAnalytics: true,
    managePayoutsFinance: true,
    manageStaffRoles: false,
    viewSupportDisputes: true,
  },
  Viewer: {
    manageListings: false,
    manageBookings: false,
    manageAvailability: false,
    managePricingPromos: false,
    viewAnalytics: true,
    managePayoutsFinance: false,
    manageStaffRoles: false,
    viewSupportDisputes: false,
  },
};

const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  Manager: 'Full operations access',
  Attendant: 'Bookings + check-in tasks',
  Finance: 'Payouts + reports',
  Viewer: 'Read-only analytics',
};

const PERMISSION_LABELS: Record<keyof PermissionSet, { label: string; group: string }> = {
  manageListings: { label: 'Manage Listings', group: 'Operations' },
  manageBookings: { label: 'Manage Bookings', group: 'Operations' },
  manageAvailability: { label: 'Manage Availability', group: 'Operations' },
  managePricingPromos: { label: 'Pricing & Promos', group: 'Pricing' },
  viewAnalytics: { label: 'View Analytics', group: 'Analytics' },
  managePayoutsFinance: { label: 'Payouts & Finance', group: 'Finance' },
  manageStaffRoles: { label: 'Staff & Roles', group: 'Admin' },
  viewSupportDisputes: { label: 'Support & Disputes', group: 'Support' },
};

// ============================================================================
// MOCK DATA
// ============================================================================

const createMockActivity = (label: string, daysAgo: number = 0): ActivityItem => ({
  id: generateActivityId(),
  label,
  createdAt: Date.now() - daysAgo * 24 * 60 * 60 * 1000,
});

const MOCK_STAFF_MEMBERS: StaffMember[] = [
  {
    id: 'staff_001',
    name: 'Rajesh Kumar',
    phone: '+91 98765 43210',
    email: 'rajesh.kumar@example.com',
    role: 'Manager',
    status: 'Active',
    createdAt: Date.now() - 90 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
    lastSeenAt: Date.now() - 30 * 60 * 1000,
    permissions: ROLE_PERMISSION_PRESETS.Manager,
    notes: 'Primary manager for main property',
    activity: [
      createMockActivity('Permissions updated', 2),
      createMockActivity('Role changed to Manager', 30),
      createMockActivity('Activated', 60),
      createMockActivity('Invited', 90),
    ],
  },
  {
    id: 'staff_002',
    name: 'Priya Sharma',
    phone: '+91 87654 32109',
    email: 'priya.sharma@example.com',
    role: 'Attendant',
    status: 'Active',
    createdAt: Date.now() - 60 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
    lastSeenAt: Date.now() - 2 * 60 * 60 * 1000,
    permissions: ROLE_PERMISSION_PRESETS.Attendant,
    activity: [
      createMockActivity('Activated', 55),
      createMockActivity('Invited', 60),
    ],
  },
  {
    id: 'staff_003',
    name: 'Amit Patel',
    phone: '+91 76543 21098',
    role: 'Attendant',
    status: 'Invited',
    createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
    permissions: ROLE_PERMISSION_PRESETS.Attendant,
    activity: [createMockActivity('Invited', 3)],
  },
  {
    id: 'staff_004',
    name: 'Sunita Reddy',
    email: 'sunita.reddy@example.com',
    role: 'Finance',
    status: 'Active',
    createdAt: Date.now() - 45 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
    lastSeenAt: Date.now() - 4 * 60 * 60 * 1000,
    permissions: ROLE_PERMISSION_PRESETS.Finance,
    notes: 'Handles monthly reconciliation',
    activity: [
      createMockActivity('Note added', 10),
      createMockActivity('Activated', 40),
      createMockActivity('Invited', 45),
    ],
  },
  {
    id: 'staff_005',
    name: 'Vikram Singh',
    phone: '+91 65432 10987',
    email: 'vikram.singh@example.com',
    role: 'Manager',
    status: 'Suspended',
    createdAt: Date.now() - 120 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 15 * 24 * 60 * 60 * 1000,
    permissions: ROLE_PERMISSION_PRESETS.Manager,
    notes: 'Temporarily suspended pending review',
    activity: [
      createMockActivity('Suspended', 15),
      createMockActivity('Role changed to Manager', 90),
      createMockActivity('Activated', 115),
      createMockActivity('Invited', 120),
    ],
  },
  {
    id: 'staff_006',
    name: 'Meera Joshi',
    email: 'meera.joshi@example.com',
    role: 'Viewer',
    status: 'Active',
    createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
    lastSeenAt: Date.now() - 24 * 60 * 60 * 1000,
    permissions: ROLE_PERMISSION_PRESETS.Viewer,
    activity: [
      createMockActivity('Activated', 25),
      createMockActivity('Invited', 30),
    ],
  },
  {
    id: 'staff_007',
    name: 'Arjun Nair',
    phone: '+91 54321 09876',
    role: 'Attendant',
    status: 'Active',
    createdAt: Date.now() - 20 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
    lastSeenAt: Date.now() - 45 * 60 * 1000,
    permissions: {
      ...ROLE_PERMISSION_PRESETS.Attendant,
      manageListings: true, // Custom permission
    },
    activity: [
      createMockActivity('Permissions updated', 1),
      createMockActivity('Activated', 18),
      createMockActivity('Invited', 20),
    ],
  },
  {
    id: 'staff_008',
    name: 'Kavita Menon',
    phone: '+91 43210 98765',
    email: 'kavita.menon@example.com',
    role: 'Finance',
    status: 'Invited',
    createdAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
    permissions: ROLE_PERMISSION_PRESETS.Finance,
    activity: [createMockActivity('Invited', 1)],
  },
];

const DEFAULT_UI_PREFS: StaffUIPrefs = {
  filterRole: 'All',
  filterStatus: 'All',
  sortOption: 'Newest',
  searchText: '',
};

// ============================================================================
// STORAGE HELPERS
// ============================================================================

async function loadStaffMembers(): Promise<StaffMember[]> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.STAFF_MEMBERS);
    if (stored) {
      return JSON.parse(stored);
    }
    // TODO: fetch staff from API; mock seed removed
    // await AsyncStorage.setItem(
    //   STORAGE_KEYS.STAFF_MEMBERS,
    //   JSON.stringify(MOCK_STAFF_MEMBERS)
    // );
    // return MOCK_STAFF_MEMBERS;
    return [];
  } catch (error) {
    console.error('Failed to load staff members:', error);
    // return MOCK_STAFF_MEMBERS;
    return [];
  }
}

async function saveStaffMembers(members: StaffMember[]): Promise<boolean> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEYS.STAFF_MEMBERS,
      JSON.stringify(members)
    );
    return true;
  } catch (error) {
    console.error('Failed to save staff members:', error);
    return false;
  }
}

async function loadUIPrefs(): Promise<StaffUIPrefs> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.UI_PREFS);
    if (stored) {
      return { ...DEFAULT_UI_PREFS, ...JSON.parse(stored) };
    }
    return DEFAULT_UI_PREFS;
  } catch (error) {
    return DEFAULT_UI_PREFS;
  }
}

async function saveUIPrefs(prefs: Partial<StaffUIPrefs>): Promise<void> {
  try {
    const current = await loadUIPrefs();
    const updated = { ...current, ...prefs };
    await AsyncStorage.setItem(STORAGE_KEYS.UI_PREFS, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save UI prefs:', error);
  }
}

// ============================================================================
// THEME HOOK
// ============================================================================

const useTheme = (): SemanticTheme => {
  return useMemo(() => getTheme(false), []);
};

// ============================================================================
// COMPONENTS
// ============================================================================

// ---------- Toast Component ----------
interface ToastProps {
  visible: boolean;
  message: string;
  type?: 'success' | 'error' | 'info';
  onHide: () => void;
}

const Toast = memo(function Toast({ visible, message, type = 'success', onHide }: ToastProps) {
  const theme = useTheme();
  const translateY = useRef(new RNAnimated.Value(-100)).current;

  useEffect(() => {
    if (visible) {
      RNAnimated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }).start();

      const timer = setTimeout(() => {
        RNAnimated.timing(translateY, {
          toValue: -100,
          duration: 200,
          useNativeDriver: true,
        }).start(onHide);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [visible, translateY, onHide]);

  if (!visible) return null;

  const bgColor =
    type === 'success'
      ? theme.success
      : type === 'error'
      ? theme.danger
      : theme.primary;

  return (
    <RNAnimated.View
      style={[
        styles.toast,
        { backgroundColor: bgColor, transform: [{ translateY }] },
      ]}
    >
      <Text style={styles.toastText}>{message}</Text>
    </RNAnimated.View>
  );
});

// ---------- Loading Skeleton ----------
const LoadingSkeleton = memo(function LoadingSkeleton() {
  const theme = useTheme();
  return (
    <View style={styles.skeletonContainer}>
      {[1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={[styles.skeletonCard, { backgroundColor: theme.borderLight }]}
        >
          <View
            style={[styles.skeletonAvatar, { backgroundColor: theme.border }]}
          />
          <View style={styles.skeletonContent}>
            <View
              style={[
                styles.skeletonLine,
                { backgroundColor: theme.border, width: '60%' },
              ]}
            />
            <View
              style={[
                styles.skeletonLine,
                { backgroundColor: theme.border, width: '40%', marginTop: 8 },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
});

// ---------- Empty State ----------
interface EmptyStateProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

const EmptyState = memo(function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View style={styles.emptyContainer}>
      <View
        style={[styles.emptyIcon, { backgroundColor: theme.primaryLight }]}
      >
        <Text style={[styles.emptyIconText, { color: theme.primary }]}>
          +
        </Text>
      </View>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.emptyMessage, { color: theme.textSecondary }]}>
        {message}
      </Text>
      {actionLabel && onAction && (
        <TouchableOpacity
          style={[styles.emptyAction, { backgroundColor: theme.primary }]}
          onPress={onAction}
          activeOpacity={0.8}
        >
          <Text style={styles.emptyActionText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

// ---------- KPI Card ----------
interface KpiCardProps {
  label: string;
  value: number;
  color?: string;
}

const KpiCard = memo(function KpiCard({ label, value, color }: KpiCardProps) {
  const theme = useTheme();
  return (
    <View style={[styles.kpiCard, { backgroundColor: theme.surface }]}>
      <Text
        style={[styles.kpiValue, { color: color || theme.text }]}
      >
        {value}
      </Text>
      <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>
        {label}
      </Text>
    </View>
  );
});

// ---------- Status Pill ----------
interface StatusPillProps {
  status: StaffStatus;
  size?: 'small' | 'normal';
}

const StatusPill = memo(function StatusPill({ status, size = 'normal' }: StatusPillProps) {
  const theme = useTheme();

  const getStatusColors = () => {
    switch (status) {
      case 'Active':
        return { bg: theme.successLight, text: theme.success };
      case 'Invited':
        return { bg: theme.warningLight, text: theme.warning };
      case 'Suspended':
        return { bg: theme.dangerLight, text: theme.danger };
      default:
        return { bg: theme.borderLight, text: theme.textMuted };
    }
  };

  const colors = getStatusColors();
  const isSmall = size === 'small';

  return (
    <View
      style={[
        styles.statusPill,
        { backgroundColor: colors.bg },
        isSmall && styles.statusPillSmall,
      ]}
    >
      <Text
        style={[
          styles.statusPillText,
          { color: colors.text },
          isSmall && styles.statusPillTextSmall,
        ]}
      >
        {status}
      </Text>
    </View>
  );
});

// ---------- Role Badge ----------
interface RoleBadgeProps {
  role: StaffRole;
}

const RoleBadge = memo(function RoleBadge({ role }: RoleBadgeProps) {
  const theme = useTheme();
  return (
    <View style={[styles.roleBadge, { backgroundColor: theme.primaryLight }]}>
      <Text style={[styles.roleBadgeText, { color: theme.primary }]}>
        {role}
      </Text>
    </View>
  );
});

// ---------- Search Bar ----------
interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

const SearchBar = memo(function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search...',
}: SearchBarProps) {
  const theme = useTheme();
  return (
    <View style={[styles.searchContainer, { backgroundColor: theme.surface }]}>
      <View style={[styles.searchInputContainer, { backgroundColor: theme.borderLight }]}>
        <Ionicons name="search-outline" size={20} color={theme.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search staff"
        />
        {value.length > 0 && (
          <Pressable onPress={() => onChangeText('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.textMuted} />
          </Pressable>
        )}
      </View>
    </View>
  );
});

// ---------- Filter Chip ----------
interface FilterChipProps {
  label: string;
  isSelected: boolean;
  onPress: () => void;
}

const FilterChip = memo(function FilterChip({
  label,
  isSelected,
  onPress,
}: FilterChipProps) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.filterChip,
        {
          backgroundColor: isSelected ? theme.primary : theme.surface,
          borderColor: isSelected ? theme.primary : theme.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
    >
      <Text
        style={[
          styles.filterChipText,
          { color: isSelected ? '#FFFFFF' : theme.textSecondary },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
});

// ---------- Sort Dropdown ----------
interface SortDropdownProps {
  value: SortOption;
  onChange: (value: SortOption) => void;
}

const SortDropdown = memo(function SortDropdown({
  value,
  onChange,
}: SortDropdownProps) {
  const theme = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const options: SortOption[] = ['Newest', 'Name A–Z', 'Role'];

  return (
    <>
      <TouchableOpacity
        style={[styles.sortButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
        onPress={() => setIsOpen(true)}
        activeOpacity={0.7}
        accessibilityLabel="Sort options"
      >
        <Text style={[styles.sortButtonText, { color: theme.text }]}>
          {value}
        </Text>
        <Text style={[styles.sortChevron, { color: theme.textMuted }]}>
          {'\u2304'}
        </Text>
      </TouchableOpacity>

      {isOpen ? (

        <Pressable
          style={styles.sortOverlay}
          onPress={() => setIsOpen(false)}
        >
          <View
            style={[styles.sortMenu, { backgroundColor: theme.surface }]}
          >
            <Text style={[styles.sortMenuTitle, { color: theme.text }]}>
              Sort by
            </Text>
            {options.map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.sortMenuItem,
                  option === value && { backgroundColor: theme.primaryLight },
                ]}
                onPress={() => {
                  onChange(option);
                  setIsOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.sortMenuItemText,
                    { color: option === value ? theme.primary : theme.text },
                  ]}
                >
                  {option}
                </Text>
                {option === value && (
                  <Text style={[styles.sortCheck, { color: theme.primary }]}>
                    {'\u2713'}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      
      ) : null}
    </>
  );
});

// ---------- Staff Card ----------
interface StaffCardProps {
  staff: StaffMember;
  onPress: () => void;
  onLongPress?: () => void;
}

const StaffCard = memo(function StaffCard({
  staff,
  onPress,
  onLongPress,
}: StaffCardProps) {
  const theme = useTheme();

  const getAvatarColor = (name: string) => {
    const colors = [
      '#0D7377', '#10B981', '#F59E0B', '#EF4444',
      '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
    ];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const getPermissionSummary = () => {
    const perms = staff.permissions;
    const active: string[] = [];

    if (perms.manageBookings) active.push('Bookings');
    if (perms.manageListings) active.push('Listings');
    if (perms.managePayoutsFinance) active.push('Finance');
    if (perms.viewAnalytics) active.push('Analytics');
    if (perms.manageStaffRoles) active.push('Staff');

    if (active.length === 0) return 'Limited access';
    if (active.length > 3) return `${active.slice(0, 3).join(' • ')} +${active.length - 3}`;
    return active.join(' • ');
  };

  const contactInfo = staff.email || staff.phone || '';

  return (
    <TouchableOpacity
      style={[styles.staffCard, { backgroundColor: theme.surface }]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${staff.name}, ${staff.role}, ${staff.status}`}
    >
      <View
        style={[
          styles.staffAvatar,
          { backgroundColor: getAvatarColor(staff.name) },
        ]}
      >
        <Text style={styles.staffAvatarText}>{getInitials(staff.name)}</Text>
      </View>

      <View style={styles.staffInfo}>
        <View style={styles.staffNameRow}>
          <Text
            style={[styles.staffName, { color: theme.text }]}
            numberOfLines={1}
          >
            {staff.name}
          </Text>
          <RoleBadge role={staff.role} />
        </View>

        {contactInfo ? (
          <Text
            style={[styles.staffContact, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {contactInfo}
          </Text>
        ) : null}

        <View style={styles.staffMetaRow}>
          <Text
            style={[styles.staffPermissions, { color: theme.textMuted }]}
            numberOfLines={1}
          >
            {getPermissionSummary()}
          </Text>
          {staff.lastSeenAt && (
            <Text style={[styles.staffLastSeen, { color: theme.textMuted }]}>
              {formatDate(staff.lastSeenAt)}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.staffRight}>
        <StatusPill status={staff.status} size="small" />
        <Text style={[styles.staffChevron, { color: theme.textMuted }]}>
          {'\u203A'}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

// ---------- Activity Timeline Item ----------
interface ActivityTimelineItemProps {
  item: ActivityItem;
  isLast: boolean;
}

const ActivityTimelineItem = memo(function ActivityTimelineItem({
  item,
  isLast,
}: ActivityTimelineItemProps) {
  const theme = useTheme();
  return (
    <View style={styles.activityItem}>
      <View style={styles.activityDotContainer}>
        <View
          style={[styles.activityDot, { backgroundColor: theme.primary }]}
        />
        {!isLast && (
          <View
            style={[styles.activityLine, { backgroundColor: theme.border }]}
          />
        )}
      </View>
      <View style={styles.activityContent}>
        <Text style={[styles.activityLabel, { color: theme.text }]}>
          {item.label}
        </Text>
        <Text style={[styles.activityTime, { color: theme.textMuted }]}>
          {formatTimestamp(item.createdAt)}
        </Text>
      </View>
    </View>
  );
});

// ---------- Confirm Dialog ----------
interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog = memo(function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  isDestructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const theme = useTheme();

  return visible ? (

      <View style={styles.dialogOverlay}>
        <View style={[styles.dialogBox, { backgroundColor: theme.surface }]}>
          <Text style={[styles.dialogTitle, { color: theme.text }]}>
            {title}
          </Text>
          <Text style={[styles.dialogMessage, { color: theme.textSecondary }]}>
            {message}
          </Text>
          <View style={styles.dialogActions}>
            <TouchableOpacity
              style={[
                styles.dialogButton,
                { backgroundColor: theme.borderLight },
              ]}
              onPress={onCancel}
            >
              <Text
                style={[styles.dialogButtonText, { color: theme.textSecondary }]}
              >
                {cancelLabel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.dialogButton,
                {
                  backgroundColor: isDestructive
                    ? theme.danger
                    : theme.primary,
                },
              ]}
              onPress={onConfirm}
            >
              <Text style={[styles.dialogButtonText, { color: '#FFFFFF' }]}>
                {confirmLabel}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    
    ) : null;
});

// ---------- Role Info Modal ----------
interface RoleInfoModalProps {
  visible: boolean;
  onClose: () => void;
}

const RoleInfoModal = memo(function RoleInfoModal({
  visible,
  onClose,
}: RoleInfoModalProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const roles: StaffRole[] = ['Manager', 'Attendant', 'Finance', 'Viewer'];

  return visible ? (

      <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
        <View
          style={[
            styles.modalHeader,
            { backgroundColor: theme.surface, borderBottomColor: theme.border },
          ]}
        >
          <Text style={[styles.modalTitle, { color: theme.text }]}>
            Role Descriptions
          </Text>
          <TouchableOpacity
            onPress={onClose}
            style={styles.modalClose}
            accessibilityLabel="Close"
          >
            <Text style={[styles.modalCloseText, { color: theme.textSecondary }]}>
              {'\u2715'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.modalBody}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing[4] }}
        >
          {roles.map((role) => (
            <View
              key={role}
              style={[styles.roleInfoCard, { backgroundColor: theme.surface }]}
            >
              <View style={styles.roleInfoHeader}>
                <RoleBadge role={role} />
                <Text style={[styles.roleInfoDesc, { color: theme.textSecondary }]}>
                  {ROLE_DESCRIPTIONS[role]}
                </Text>
              </View>
              <View style={styles.roleInfoPermissions}>
                {Object.entries(ROLE_PERMISSION_PRESETS[role]).map(
                  ([key, value]) => (
                    <View key={key} style={styles.roleInfoPermItem}>
                      <Text
                        style={[
                          styles.roleInfoPermText,
                          { color: value ? theme.success : theme.textMuted },
                        ]}
                      >
                        {value ? '\u2713' : '\u2717'}{' '}
                        {PERMISSION_LABELS[key as keyof PermissionSet].label}
                      </Text>
                    </View>
                  )
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    
    ) : null;
});

// ---------- Invite Staff Modal ----------
interface InviteStaffModalProps {
  visible: boolean;
  existingEmails: string[];
  existingPhones: string[];
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    phone?: string;
    email?: string;
    role: StaffRole;
  }) => void;
}

const InviteStaffModal = memo(function InviteStaffModal({
  visible,
  existingEmails,
  existingPhones,
  onClose,
  onSubmit,
}: InviteStaffModalProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('Attendant');

  const [errors, setErrors] = useState<{
    name?: string;
    contact?: string;
    phone?: string;
    email?: string;
  }>({});

  const roles: StaffRole[] = ['Manager', 'Attendant', 'Finance', 'Viewer'];

  const resetForm = useCallback(() => {
    setName('');
    setPhone('');
    setEmail('');
    setRole('Attendant');
    setErrors({});
  }, []);

  const validate = useCallback((): boolean => {
    const newErrors: typeof errors = {};

    if (!name.trim() || name.trim().length < 2) {
      newErrors.name = 'Name is required (min 2 characters)';
    }

    if (!phone.trim() && !email.trim()) {
      newErrors.contact = 'Phone or email is required';
    }

    if (phone.trim() && !validatePhone(phone)) {
      newErrors.phone = 'Invalid phone number';
    }

    if (email.trim() && !validateEmail(email)) {
      newErrors.email = 'Invalid email address';
    }

    // Check for duplicates
    if (
      email.trim() &&
      existingEmails.includes(email.toLowerCase().trim())
    ) {
      newErrors.email = 'Email already exists';
    }

    if (
      phone.trim() &&
      existingPhones.includes(phone.replace(/\s/g, ''))
    ) {
      newErrors.phone = 'Phone number already exists';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, phone, email, existingEmails, existingPhones]);

  const handleSubmit = useCallback(() => {
    if (validate()) {
      onSubmit({
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        role,
      });
      resetForm();
    }
  }, [validate, onSubmit, name, phone, email, role, resetForm]);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  return visible ? (

      <KeyboardAvoidingView
        style={[styles.modalContainer, { backgroundColor: theme.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[
            styles.modalHeader,
            { backgroundColor: theme.surface, borderBottomColor: theme.border },
          ]}
        >
          <TouchableOpacity
            onPress={handleClose}
            style={styles.modalHeaderAction}
          >
            <Text style={[styles.modalHeaderActionText, { color: theme.textSecondary }]}>
              Cancel
            </Text>
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: theme.text }]}>
            Add Staff Member
          </Text>
          <TouchableOpacity
            onPress={handleSubmit}
            style={styles.modalHeaderAction}
          >
            <Text style={[styles.modalHeaderActionText, { color: theme.primary }]}>
              Add
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.modalBody}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing[4] }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Name Field */}
          <View style={styles.formField}>
            <Text style={[styles.formLabel, { color: theme.text }]}>
              Name *
            </Text>
            <TextInput
              style={[
                styles.formInput,
                {
                  backgroundColor: theme.surface,
                  borderColor: errors.name ? theme.danger : theme.border,
                  color: theme.text,
                },
              ]}
              value={name}
              onChangeText={setName}
              placeholder="Full name"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="words"
              accessibilityLabel="Staff member name"
            />
            {errors.name && (
              <Text style={[styles.formError, { color: theme.danger }]}>
                {errors.name}
              </Text>
            )}
          </View>

          {/* Phone Field */}
          <View style={styles.formField}>
            <Text style={[styles.formLabel, { color: theme.text }]}>
              Phone
            </Text>
            <TextInput
              style={[
                styles.formInput,
                {
                  backgroundColor: theme.surface,
                  borderColor: errors.phone ? theme.danger : theme.border,
                  color: theme.text,
                },
              ]}
              value={phone}
              onChangeText={setPhone}
              placeholder="+91 98765 43210"
              placeholderTextColor={theme.textMuted}
              keyboardType="phone-pad"
              accessibilityLabel="Staff phone number"
            />
            {errors.phone && (
              <Text style={[styles.formError, { color: theme.danger }]}>
                {errors.phone}
              </Text>
            )}
          </View>

          {/* Email Field */}
          <View style={styles.formField}>
            <Text style={[styles.formLabel, { color: theme.text }]}>
              Email
            </Text>
            <TextInput
              style={[
                styles.formInput,
                {
                  backgroundColor: theme.surface,
                  borderColor: errors.email ? theme.danger : theme.border,
                  color: theme.text,
                },
              ]}
              value={email}
              onChangeText={setEmail}
              placeholder="email@example.com"
              placeholderTextColor={theme.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Staff email address"
            />
            {errors.email && (
              <Text style={[styles.formError, { color: theme.danger }]}>
                {errors.email}
              </Text>
            )}
          </View>

          {errors.contact && (
            <Text
              style={[
                styles.formError,
                { color: theme.danger, marginTop: -spacing[2], marginBottom: spacing[3] },
              ]}
            >
              {errors.contact}
            </Text>
          )}

          {/* Role Picker */}
          <View style={styles.formField}>
            <Text style={[styles.formLabel, { color: theme.text }]}>
              Role *
            </Text>
            <View style={styles.rolePickerGrid}>
              {roles.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.rolePickerItem,
                    {
                      backgroundColor:
                        role === r ? theme.primaryLight : theme.surface,
                      borderColor: role === r ? theme.primary : theme.border,
                    },
                  ]}
                  onPress={() => setRole(r)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: role === r }}
                >
                  <Text
                    style={[
                      styles.rolePickerLabel,
                      { color: role === r ? theme.primary : theme.text },
                    ]}
                  >
                    {r}
                  </Text>
                  <Text
                    style={[
                      styles.rolePickerDesc,
                      { color: theme.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {ROLE_DESCRIPTIONS[r]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    
    ) : null;
});

// ---------- Staff Details Modal ----------
interface StaffDetailsModalProps {
  visible: boolean;
  staff: StaffMember | null;
  onClose: () => void;
  onUpdateRole: (staffId: string, role: StaffRole) => void;
  onUpdatePermissions: (staffId: string, permissions: PermissionSet) => void;
  onUpdateStatus: (staffId: string, status: StaffStatus) => void;
  onAddNote: (staffId: string, note: string) => void;
}

const StaffDetailsModal = memo(function StaffDetailsModal({
  visible,
  staff,
  onClose,
  onUpdateRole,
  onUpdatePermissions,
  onUpdateStatus,
  onAddNote,
}: StaffDetailsModalProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [activeSection, setActiveSection] = useState<
    'overview' | 'permissions' | 'activity'
  >('overview');
  const [editingRole, setEditingRole] = useState(false);
  const [selectedRole, setSelectedRole] = useState<StaffRole | null>(null);
  const [permissions, setPermissions] = useState<PermissionSet | null>(null);
  const [showStatusConfirm, setShowStatusConfirm] = useState<StaffStatus | null>(null);
  const [noteText, setNoteText] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);

  useEffect(() => {
    if (staff) {
      setSelectedRole(staff.role);
      setPermissions(staff.permissions);
    }
  }, [staff]);

  const roles: StaffRole[] = ['Manager', 'Attendant', 'Finance', 'Viewer'];

  const handleRoleChange = useCallback(
    (newRole: StaffRole) => {
      if (staff) {
        setSelectedRole(newRole);
        setPermissions(ROLE_PERMISSION_PRESETS[newRole]);
        onUpdateRole(staff.id, newRole);
        setEditingRole(false);
      }
    },
    [staff, onUpdateRole]
  );

  const handlePermissionToggle = useCallback(
    (key: keyof PermissionSet) => {
      if (staff && permissions) {
        const newPermissions = { ...permissions, [key]: !permissions[key] };
        setPermissions(newPermissions);
        onUpdatePermissions(staff.id, newPermissions);
      }
    },
    [staff, permissions, onUpdatePermissions]
  );

  const handleResetPermissions = useCallback(() => {
    if (staff && selectedRole) {
      const defaultPerms = ROLE_PERMISSION_PRESETS[selectedRole];
      setPermissions(defaultPerms);
      onUpdatePermissions(staff.id, defaultPerms);
    }
  }, [staff, selectedRole, onUpdatePermissions]);

  const handleStatusChange = useCallback(
    (newStatus: StaffStatus) => {
      if (staff) {
        onUpdateStatus(staff.id, newStatus);
        setShowStatusConfirm(null);
      }
    },
    [staff, onUpdateStatus]
  );

  const handleAddNote = useCallback(() => {
    if (staff && noteText.trim()) {
      onAddNote(staff.id, noteText.trim());
      setNoteText('');
      setShowNoteInput(false);
    }
  }, [staff, noteText, onAddNote]);

  const getStatusActions = (): { label: string; status: StaffStatus }[] => {
    if (!staff) return [];

    switch (staff.status) {
      case 'Invited':
        return [{ label: 'Activate', status: 'Active' }];
      case 'Active':
        return [{ label: 'Suspend', status: 'Suspended' }];
      case 'Suspended':
        return [{ label: 'Reactivate', status: 'Active' }];
      default:
        return [];
    }
  };

  const getAvatarColor = (name: string) => {
    const colors = [
      '#0D7377', '#10B981', '#F59E0B', '#EF4444',
      '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
    ];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  if (!staff) return null;

  return visible ? (

      <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
        <View
          style={[
            styles.modalHeader,
            { backgroundColor: theme.surface, borderBottomColor: theme.border },
          ]}
        >
          <TouchableOpacity onPress={onClose} style={styles.modalHeaderAction}>
            <Ionicons name="arrow-back" size={24} color={theme.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: theme.text }]}>
            Staff Details
          </Text>
          <View style={styles.modalHeaderAction} />
        </View>

        <ScrollView
          style={styles.modalBody}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing[4] }}
        >
          {/* Profile Summary */}
          <View style={[styles.detailsProfile, { backgroundColor: theme.surface }]}>
            <View
              style={[
                styles.detailsAvatar,
                { backgroundColor: getAvatarColor(staff.name) },
              ]}
            >
              <Text style={styles.detailsAvatarText}>
                {getInitials(staff.name)}
              </Text>
            </View>
            <Text style={[styles.detailsName, { color: theme.text }]}>
              {staff.name}
            </Text>
            <View style={styles.detailsBadges}>
              <RoleBadge role={staff.role} />
              <StatusPill status={staff.status} />
            </View>
            {(staff.phone || staff.email) && (
              <View style={styles.detailsContact}>
                {staff.phone && (
                  <Text style={[styles.detailsContactText, { color: theme.textSecondary }]}>
                    {staff.phone}
                  </Text>
                )}
                {staff.email && (
                  <Text style={[styles.detailsContactText, { color: theme.textSecondary }]}>
                    {staff.email}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Quick Actions */}
          <View style={styles.detailsActions}>
            <TouchableOpacity
              style={[styles.detailsActionBtn, { backgroundColor: theme.surface }]}
              onPress={() => setEditingRole(true)}
            >
              <Text style={[styles.detailsActionIcon, { color: theme.primary }]}>
                {'\u270E'}
              </Text>
              <Text style={[styles.detailsActionLabel, { color: theme.text }]}>
                Edit Role
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.detailsActionBtn, { backgroundColor: theme.surface }]}
              onPress={() => setActiveSection('permissions')}
            >
              <Text style={[styles.detailsActionIcon, { color: theme.primary }]}>
                {'\u2699'}
              </Text>
              <Text style={[styles.detailsActionLabel, { color: theme.text }]}>
                Permissions
              </Text>
            </TouchableOpacity>

            {getStatusActions().map((action) => (
              <TouchableOpacity
                key={action.status}
                style={[styles.detailsActionBtn, { backgroundColor: theme.surface }]}
                onPress={() => {
                  if (action.status === 'Suspended') {
                    setShowStatusConfirm('Suspended');
                  } else {
                    handleStatusChange(action.status);
                  }
                }}
              >
                <Text
                  style={[
                    styles.detailsActionIcon,
                    {
                      color:
                        action.status === 'Suspended'
                          ? theme.danger
                          : theme.success,
                    },
                  ]}
                >
                  {action.status === 'Suspended' ? '\u26A0' : '\u2713'}
                </Text>
                <Text style={[styles.detailsActionLabel, { color: theme.text }]}>
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.detailsActionBtn, { backgroundColor: theme.surface }]}
              onPress={() => setShowNoteInput(true)}
            >
              <Text style={[styles.detailsActionIcon, { color: theme.primary }]}>
                {'\u270D'}
              </Text>
              <Text style={[styles.detailsActionLabel, { color: theme.text }]}>
                Add Note
              </Text>
            </TouchableOpacity>
          </View>

          {/* Section Tabs */}
          <View style={styles.sectionTabs}>
            {(['overview', 'permissions', 'activity'] as const).map((section) => (
              <TouchableOpacity
                key={section}
                style={[
                  styles.sectionTab,
                  activeSection === section && {
                    borderBottomColor: theme.primary,
                    borderBottomWidth: 2,
                  },
                ]}
                onPress={() => setActiveSection(section)}
              >
                <Text
                  style={[
                    styles.sectionTabText,
                    {
                      color:
                        activeSection === section
                          ? theme.primary
                          : theme.textMuted,
                    },
                  ]}
                >
                  {section.charAt(0).toUpperCase() + section.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Overview Section */}
          {activeSection === 'overview' && (
            <View style={styles.sectionContent}>
              {/* Notes */}
              {staff.notes && (
                <View style={[styles.detailsSection, { backgroundColor: theme.surface }]}>
                  <Text style={[styles.detailsSectionTitle, { color: theme.text }]}>
                    Notes
                  </Text>
                  <Text style={[styles.detailsNoteText, { color: theme.textSecondary }]}>
                    {staff.notes}
                  </Text>
                </View>
              )}

              {/* Info */}
              <View style={[styles.detailsSection, { backgroundColor: theme.surface }]}>
                <Text style={[styles.detailsSectionTitle, { color: theme.text }]}>
                  Information
                </Text>
                <View style={styles.detailsInfoRow}>
                  <Text style={[styles.detailsInfoLabel, { color: theme.textMuted }]}>
                    Added
                  </Text>
                  <Text style={[styles.detailsInfoValue, { color: theme.text }]}>
                    {formatTimestamp(staff.createdAt)}
                  </Text>
                </View>
                <View style={styles.detailsInfoRow}>
                  <Text style={[styles.detailsInfoLabel, { color: theme.textMuted }]}>
                    Last updated
                  </Text>
                  <Text style={[styles.detailsInfoValue, { color: theme.text }]}>
                    {formatTimestamp(staff.updatedAt)}
                  </Text>
                </View>
                {staff.lastSeenAt && (
                  <View style={styles.detailsInfoRow}>
                    <Text style={[styles.detailsInfoLabel, { color: theme.textMuted }]}>
                      Last seen
                    </Text>
                    <Text style={[styles.detailsInfoValue, { color: theme.text }]}>
                      {formatDate(staff.lastSeenAt)}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Permissions Section */}
          {activeSection === 'permissions' && permissions && (
            <View style={styles.sectionContent}>
              <TouchableOpacity
                style={[styles.resetPermsButton, { borderColor: theme.border }]}
                onPress={handleResetPermissions}
              >
                <Text style={[styles.resetPermsText, { color: theme.primary }]}>
                  Reset to {selectedRole} defaults
                </Text>
              </TouchableOpacity>

              {['Operations', 'Pricing', 'Analytics', 'Finance', 'Admin', 'Support'].map(
                (group) => {
                  const groupPerms = Object.entries(PERMISSION_LABELS).filter(
                    ([, val]) => val.group === group
                  );

                  if (groupPerms.length === 0) return null;

                  return (
                    <View
                      key={group}
                      style={[styles.permGroupCard, { backgroundColor: theme.surface }]}
                    >
                      <Text style={[styles.permGroupTitle, { color: theme.text }]}>
                        {group}
                      </Text>
                      {groupPerms.map(([key, val]) => (
                        <View key={key} style={styles.permRow}>
                          <Text style={[styles.permLabel, { color: theme.text }]}>
                            {val.label}
                          </Text>
                          <Switch
                            value={permissions[key as keyof PermissionSet]}
                            onValueChange={() =>
                              handlePermissionToggle(key as keyof PermissionSet)
                            }
                            trackColor={{
                              false: theme.border,
                              true: theme.primaryLight,
                            }}
                            thumbColor={
                              permissions[key as keyof PermissionSet]
                                ? theme.primary
                                : theme.textMuted
                            }
                            accessibilityLabel={`Toggle ${val.label}`}
                          />
                        </View>
                      ))}
                    </View>
                  );
                }
              )}
            </View>
          )}

          {/* Activity Section */}
          {activeSection === 'activity' && (
            <View style={styles.sectionContent}>
              <View style={[styles.activityCard, { backgroundColor: theme.surface }]}>
                {staff.activity.length === 0 ? (
                  <Text style={[styles.noActivityText, { color: theme.textMuted }]}>
                    No activity recorded
                  </Text>
                ) : (
                  staff.activity.map((item, index) => (
                    <ActivityTimelineItem
                      key={item.id}
                      item={item}
                      isLast={index === staff.activity.length - 1}
                    />
                  ))
                )}
              </View>
            </View>
          )}
        </ScrollView>

        {/* Role Edit Modal */}
        {editingRole ? (

          <Pressable
            style={styles.roleEditOverlay}
            onPress={() => setEditingRole(false)}
          >
            <View style={[styles.roleEditModal, { backgroundColor: theme.surface }]}>
              <Text style={[styles.roleEditTitle, { color: theme.text }]}>
                Change Role
              </Text>
              {roles.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.roleEditItem,
                    selectedRole === r && { backgroundColor: theme.primaryLight },
                  ]}
                  onPress={() => handleRoleChange(r)}
                >
                  <View>
                    <Text
                      style={[
                        styles.roleEditItemLabel,
                        { color: selectedRole === r ? theme.primary : theme.text },
                      ]}
                    >
                      {r}
                    </Text>
                    <Text style={[styles.roleEditItemDesc, { color: theme.textMuted }]}>
                      {ROLE_DESCRIPTIONS[r]}
                    </Text>
                  </View>
                  {selectedRole === r && (
                    <Text style={[styles.roleEditCheck, { color: theme.primary }]}>
                      {'\u2713'}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        
        ) : null}

        {/* Add Note Modal */}
        {showNoteInput ? (

          <KeyboardAvoidingView
            style={styles.noteOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={[styles.noteModal, { backgroundColor: theme.surface }]}>
              <Text style={[styles.noteModalTitle, { color: theme.text }]}>
                Add Note
              </Text>
              <TextInput
                style={[
                  styles.noteInput,
                  {
                    backgroundColor: theme.background,
                    borderColor: theme.border,
                    color: theme.text,
                  },
                ]}
                value={noteText}
                onChangeText={setNoteText}
                placeholder="Enter a note..."
                placeholderTextColor={theme.textMuted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              <View style={styles.noteActions}>
                <TouchableOpacity
                  style={[styles.noteBtn, { backgroundColor: theme.borderLight }]}
                  onPress={() => {
                    setNoteText('');
                    setShowNoteInput(false);
                  }}
                >
                  <Text style={[styles.noteBtnText, { color: theme.textSecondary }]}>
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.noteBtn,
                    {
                      backgroundColor: noteText.trim()
                        ? theme.primary
                        : theme.border,
                    },
                  ]}
                  onPress={handleAddNote}
                  disabled={!noteText.trim()}
                >
                  <Text style={[styles.noteBtnText, { color: '#FFFFFF' }]}>
                    Add
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        
        ) : null}

        {/* Status Confirm Dialog */}
        <ConfirmDialog
          visible={showStatusConfirm !== null}
          title="Suspend access?"
          message="This will prevent the staff member from managing operations on this device."
          confirmLabel="Suspend"
          isDestructive
          onConfirm={() => handleStatusChange('Suspended')}
          onCancel={() => setShowStatusConfirm(null)}
        />
      </View>
    
    ) : null;
});

// ============================================================================
// MAIN SCREEN
// ============================================================================

export default function StaffScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [searchText, setSearchText] = useState('');
  const [filterRole, setFilterRole] = useState<RoleFilter>('All');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('All');
  const [sortOption, setSortOption] = useState<SortOption>('Newest');
  const [saveError, setSaveError] = useState(false);

  // Modals
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showRoleInfoModal, setShowRoleInfoModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Toast
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({ visible: false, message: '', type: 'success' });

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [members, prefs] = await Promise.all([
          loadStaffMembers(),
          loadUIPrefs(),
        ]);
        setStaffMembers(members);
        setSearchText(prefs.searchText);
        setFilterRole(prefs.filterRole);
        setFilterStatus(prefs.filterStatus);
        setSortOption(prefs.sortOption);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // Persist UI prefs when they change
  useEffect(() => {
    if (!isLoading) {
      saveUIPrefs({
        searchText,
        filterRole,
        filterStatus,
        sortOption,
      });
    }
  }, [searchText, filterRole, filterStatus, sortOption, isLoading]);

  // Show toast helper
  const showToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'success') => {
      setToast({ visible: true, message, type });
    },
    []
  );

  // Persist helper with error handling
  const persistMembers = useCallback(
    async (members: StaffMember[]) => {
      const success = await saveStaffMembers(members);
      if (!success) {
        setSaveError(true);
        setTimeout(() => setSaveError(false), 5000);
      }
    },
    []
  );

  // Filtered and sorted staff
  const filteredStaff = useMemo(() => {
    let result = [...staffMembers];

    // Search filter
    if (searchText.trim()) {
      const search = searchText.toLowerCase().trim();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(search) ||
          s.phone?.toLowerCase().includes(search) ||
          s.email?.toLowerCase().includes(search)
      );
    }

    // Role filter
    if (filterRole !== 'All') {
      result = result.filter((s) => s.role === filterRole);
    }

    // Status filter
    if (filterStatus !== 'All') {
      result = result.filter((s) => s.status === filterStatus);
    }

    // Sort
    switch (sortOption) {
      case 'Newest':
        result.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case 'Name A–Z':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'Role':
        const roleOrder: Record<StaffRole, number> = {
          Manager: 0,
          Finance: 1,
          Attendant: 2,
          Viewer: 3,
        };
        result.sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);
        break;
    }

    return result;
  }, [staffMembers, searchText, filterRole, filterStatus, sortOption]);

  // Metrics
  const metrics = useMemo(() => {
    const total = staffMembers.length;
    const active = staffMembers.filter((s) => s.status === 'Active').length;
    const invited = staffMembers.filter((s) => s.status === 'Invited').length;
    const suspended = staffMembers.filter((s) => s.status === 'Suspended').length;
    const managers = staffMembers.filter((s) => s.role === 'Manager').length;
    return { total, active, invited, suspended, managers };
  }, [staffMembers]);

  // Existing contacts for duplicate check
  const existingEmails = useMemo(
    () =>
      staffMembers
        .filter((s) => s.email)
        .map((s) => s.email!.toLowerCase()),
    [staffMembers]
  );

  const existingPhones = useMemo(
    () =>
      staffMembers
        .filter((s) => s.phone)
        .map((s) => s.phone!.replace(/\s/g, '')),
    [staffMembers]
  );

  // Add staff handler
  const handleAddStaff = useCallback(
    async (data: {
      name: string;
      phone?: string;
      email?: string;
      role: StaffRole;
    }) => {
      const now = Date.now();
      const newMember: StaffMember = {
        id: generateId(),
        name: data.name,
        phone: data.phone,
        email: data.email,
        role: data.role,
        status: 'Invited',
        createdAt: now,
        updatedAt: now,
        permissions: ROLE_PERMISSION_PRESETS[data.role],
        activity: [{ id: generateActivityId(), label: 'Invited', createdAt: now }],
      };

      const updated = [newMember, ...staffMembers];
      setStaffMembers(updated);
      await persistMembers(updated);
      setShowInviteModal(false);
      showToast(`${data.name} has been invited`);
    },
    [staffMembers, persistMembers, showToast]
  );

  // Update role handler
  const handleUpdateRole = useCallback(
    async (staffId: string, newRole: StaffRole) => {
      const now = Date.now();
      const updated = staffMembers.map((s) =>
        s.id === staffId
          ? {
              ...s,
              role: newRole,
              permissions: ROLE_PERMISSION_PRESETS[newRole],
              updatedAt: now,
              activity: [
                {
                  id: generateActivityId(),
                  label: `Role changed to ${newRole}`,
                  createdAt: now,
                },
                ...s.activity,
              ],
            }
          : s
      );
      setStaffMembers(updated);
      setSelectedStaff(updated.find((s) => s.id === staffId) || null);
      await persistMembers(updated);
      showToast('Role updated');
    },
    [staffMembers, persistMembers, showToast]
  );

  // Update permissions handler
  const handleUpdatePermissions = useCallback(
    async (staffId: string, permissions: PermissionSet) => {
      const now = Date.now();
      const updated = staffMembers.map((s) =>
        s.id === staffId
          ? {
              ...s,
              permissions,
              updatedAt: now,
              activity: [
                {
                  id: generateActivityId(),
                  label: 'Permissions updated',
                  createdAt: now,
                },
                ...s.activity,
              ],
            }
          : s
      );
      setStaffMembers(updated);
      setSelectedStaff(updated.find((s) => s.id === staffId) || null);
      await persistMembers(updated);
      showToast('Permissions updated');
    },
    [staffMembers, persistMembers, showToast]
  );

  // Update status handler
  const handleUpdateStatus = useCallback(
    async (staffId: string, newStatus: StaffStatus) => {
      const now = Date.now();
      const updated = staffMembers.map((s) =>
        s.id === staffId
          ? {
              ...s,
              status: newStatus,
              updatedAt: now,
              activity: [
                {
                  id: generateActivityId(),
                  label:
                    newStatus === 'Active'
                      ? 'Activated'
                      : newStatus === 'Suspended'
                      ? 'Suspended'
                      : newStatus,
                  createdAt: now,
                },
                ...s.activity,
              ],
            }
          : s
      );
      setStaffMembers(updated);
      setSelectedStaff(updated.find((s) => s.id === staffId) || null);
      await persistMembers(updated);
      showToast(`Status changed to ${newStatus}`);
    },
    [staffMembers, persistMembers, showToast]
  );

  // Add note handler
  const handleAddNote = useCallback(
    async (staffId: string, note: string) => {
      const now = Date.now();
      const updated = staffMembers.map((s) =>
        s.id === staffId
          ? {
              ...s,
              notes: note,
              updatedAt: now,
              activity: [
                {
                  id: generateActivityId(),
                  label: 'Note added',
                  createdAt: now,
                },
                ...s.activity,
              ],
            }
          : s
      );
      setStaffMembers(updated);
      setSelectedStaff(updated.find((s) => s.id === staffId) || null);
      await persistMembers(updated);
      showToast('Note added');
    },
    [staffMembers, persistMembers, showToast]
  );

  // Staff card press handler
  const handleStaffPress = useCallback((staff: StaffMember) => {
    setSelectedStaff(staff);
    setShowDetailsModal(true);
  }, []);

  // Render staff item
  const renderStaffItem = useCallback(
    ({ item }: { item: StaffMember }) => (
      <StaffCard staff={item} onPress={() => handleStaffPress(item)} />
    ),
    [handleStaffPress]
  );

  const keyExtractor = useCallback((item: StaffMember) => item.id, []);

  const roleFilters: RoleFilter[] = ['All', 'Manager', 'Attendant', 'Finance', 'Viewer'];
  const statusFilters: StatusFilter[] = ['All', 'Active', 'Invited', 'Suspended'];

  // Show search result empty state
  const isSearching = searchText.trim().length > 0;
  const hasFilters = filterRole !== 'All' || filterStatus !== 'All';
  const showEmptyResults = filteredStaff.length === 0 && (isSearching || hasFilters);
  const showNoStaff = staffMembers.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Toast */}
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((t) => ({ ...t, visible: false }))}
      />

      {/* Save Error Banner */}
      {saveError && (
        <View style={[styles.errorBanner, { backgroundColor: theme.warningLight }]}>
          <Text style={[styles.errorBannerText, { color: theme.warning }]}>
            Couldn't save changes locally
          </Text>
        </View>
      )}

      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.surface,
            paddingTop: insets.top + spacing[2],
          },
        ]}
      >
        <View style={styles.headerTop}>
          <View style={styles.headerTitles}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>
              Staff
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.headerAddBtn, { backgroundColor: theme.primary }]}
              onPress={() => setShowInviteModal(true)}
              accessibilityLabel="Add staff member"
            >
              <Text style={styles.headerAddIcon}>+</Text>
              <Text style={styles.headerAddText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {isLoading ? (
        <LoadingSkeleton />
      ) : showNoStaff ? (
        <EmptyState
          title="No staff members"
          message="Add team members to help manage your parking operations"
          actionLabel="Add staff"
          onAction={() => setShowInviteModal(true)}
        />
      ) : (
        <FlatList
          data={filteredStaff}
          renderItem={renderStaffItem}
          keyExtractor={keyExtractor}
          style={styles.staffList}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + spacing[4] },
          ]}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={10}
          ListHeaderComponent={
            <>
              {/* Search Bar */}
              <SearchBar
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Search staff by name, phone, email"
              />

              {/* Filters */}
              <View style={styles.filtersContainer}>
                {/* Role Filters */}
                <View style={styles.filterSection}>
                  <Text style={[styles.filterLabel, { color: theme.textMuted }]}>
                    Role
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filterChipsRow}
                  >
                    {roleFilters.map((role) => (
                      <FilterChip
                        key={role}
                        label={role}
                        isSelected={filterRole === role}
                        onPress={() => setFilterRole(role)}
                      />
                    ))}
                  </ScrollView>
                </View>

                {/* Status Filters */}
                <View style={styles.filterSection}>
                  <Text style={[styles.filterLabel, { color: theme.textMuted }]}>
                    Status
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filterChipsRow}
                  >
                    {statusFilters.map((status) => (
                      <FilterChip
                        key={status}
                        label={status}
                        isSelected={filterStatus === status}
                        onPress={() => setFilterStatus(status)}
                      />
                    ))}
                  </ScrollView>
                </View>

                {/* Sort */}
                <View style={styles.sortRow}>
                  <Text style={[styles.resultsCount, { color: theme.textSecondary }]}>
                    {filteredStaff.length} staff member
                    {filteredStaff.length !== 1 ? 's' : ''}
                  </Text>
                  <SortDropdown value={sortOption} onChange={setSortOption} />
                </View>
              </View>

              {/* Metrics */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.metricsRow}
              >
                <KpiCard label="Total" value={metrics.total} />
                <KpiCard label="Active" value={metrics.active} color={theme.success} />
                <KpiCard label="Invited" value={metrics.invited} color={theme.warning} />
                <KpiCard label="Suspended" value={metrics.suspended} color={theme.danger} />
                <KpiCard label="Managers" value={metrics.managers} color={theme.primary} />
              </ScrollView>
            </>
          }
          ListEmptyComponent={
            showEmptyResults ? (
              <EmptyState
                title="No matches found"
                message="Try adjusting your search or filters"
                actionLabel="Clear search"
                onAction={() => {
                  setSearchText('');
                  setFilterRole('All');
                  setFilterStatus('All');
                }}
              />
            ) : null
          }
        />
      )}

      {/* Modals */}
      <InviteStaffModal
        visible={showInviteModal}
        existingEmails={existingEmails}
        existingPhones={existingPhones}
        onClose={() => setShowInviteModal(false)}
        onSubmit={handleAddStaff}
      />

      <RoleInfoModal
        visible={showRoleInfoModal}
        onClose={() => setShowRoleInfoModal(false)}
      />

      <StaffDetailsModal
        visible={showDetailsModal}
        staff={selectedStaff}
        onClose={() => {
          setShowDetailsModal(false);
          setSelectedStaff(null);
        }}
        onUpdateRole={handleUpdateRole}
        onUpdatePermissions={handleUpdatePermissions}
        onUpdateStatus={handleUpdateStatus}
        onAddNote={handleAddNote}
      />
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Staff list
  staffList: {
    flex: 1,
  },

  // Toast
  toast: {
    position: 'absolute',
    top: 60,
    left: spacing[4],
    right: spacing[4],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.lg,
    zIndex: 1000,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    textAlign: 'center',
  },

  // Error Banner
  errorBanner: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    marginHorizontal: spacing[4],
    marginTop: spacing[2],
    borderRadius: borderRadius.md,
  },
  errorBannerText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
    textAlign: 'center',
  },

  // Header
  header: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTitles: {
    flex: 1,
    marginTop: spacing[2],
  },
  headerTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold as any,
    marginBottom: spacing[1],
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  headerInfoBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfoIcon: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
    fontStyle: 'italic',
  },
  headerAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.lg,
    gap: spacing[1],
  },
  headerAddIcon: {
    color: '#FFFFFF',
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
  },
  headerAddText: {
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
  },

  // Skeleton
  skeletonContainer: {
    padding: spacing[4],
  },
  skeletonCard: {
    flexDirection: 'row',
    padding: spacing[4],
    borderRadius: borderRadius.xl,
    marginBottom: spacing[3],
  },
  skeletonAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  skeletonContent: {
    flex: 1,
    marginLeft: spacing[3],
    justifyContent: 'center',
  },
  skeletonLine: {
    height: 14,
    borderRadius: 7,
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[4],
  },
  emptyIconText: {
    fontSize: 40,
    fontWeight: fontWeight.medium as any,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[2],
    textAlign: 'center',
  },
  emptyMessage: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: fontSize.sm * 1.5,
    marginBottom: spacing[4],
  },
  emptyAction: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[5],
    borderRadius: borderRadius.lg,
  },
  emptyActionText: {
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
  },

  // Filters
  filtersContainer: {
    paddingHorizontal: spacing[4],
  },
  filterSection: {
    marginTop: spacing[3],
  },
  filterLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
    marginBottom: spacing[2],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterChipsRow: {
    flexDirection: 'row',
    gap: spacing[2],
    paddingRight: spacing[4],
  },
  sortRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing[4],
    marginBottom: spacing[2],
  },
  resultsCount: {
    fontSize: fontSize.sm,
  },

  // Search Bar
  searchContainer: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: Platform.OS === 'ios' ? spacing[3] : spacing[2],
    borderRadius: borderRadius.lg,
    gap: spacing[2],
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    padding: 0,
  },

  // Filter Chip
  filterChip: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.full,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
  },
  filterChipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },

  // Sort Dropdown
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing[1],
  },
  sortButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  sortChevron: {
    fontSize: fontSize.sm,
    marginTop: -2,
  },
  sortOverlay: {
    // Absolutely positioned rather than flex:1 — no longer inside a
    // <Modal>, which does not present on this build.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[4],
  },
  sortMenu: {
    width: '80%',
    maxWidth: 300,
    borderRadius: borderRadius.xl,
    padding: spacing[2],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  sortMenuTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
  },
  sortMenuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.md,
  },
  sortMenuItemText: {
    fontSize: fontSize.base,
  },
  sortCheck: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold as any,
  },

  // KPI Card
  kpiCard: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.lg,
    marginRight: spacing[2],
    minWidth: 80,
    alignItems: 'center',
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
  kpiValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold as any,
    marginBottom: spacing[1],
  },
  kpiLabel: {
    fontSize: fontSize.xs,
  },
  metricsRow: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },

  // Status Pill
  statusPill: {
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[2],
    borderRadius: borderRadius.full,
  },
  statusPillSmall: {
    paddingVertical: 2,
    paddingHorizontal: spacing[2],
  },
  statusPillText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },
  statusPillTextSmall: {
    fontSize: 10,
  },

  // Role Badge
  roleBadge: {
    paddingVertical: 2,
    paddingHorizontal: spacing[2],
    borderRadius: borderRadius.sm,
  },
  roleBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },

  // Staff Card
  staffCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[4],
    marginHorizontal: spacing[4],
    marginBottom: spacing[2],
    borderRadius: borderRadius.xl,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  staffAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffAvatarText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  staffInfo: {
    flex: 1,
    marginLeft: spacing[3],
  },
  staffNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[1],
  },
  staffName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
    flexShrink: 1,
  },
  staffContact: {
    fontSize: fontSize.sm,
    marginBottom: spacing[1],
  },
  staffMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  staffPermissions: {
    fontSize: fontSize.xs,
    flex: 1,
  },
  staffLastSeen: {
    fontSize: fontSize.xs,
    marginLeft: spacing[2],
  },
  staffRight: {
    alignItems: 'flex-end',
    gap: spacing[2],
  },
  staffChevron: {
    fontSize: 24,
    fontWeight: fontWeight.medium as any,
  },

  // List
  listContent: {
    paddingTop: 0,
  },

  // Modals
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalHeaderAction: {
    minWidth: 60,
  },
  modalHeaderActionText: {
    fontSize: fontSize.base,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
    textAlign: 'center',
  },
  modalClose: {
    padding: spacing[2],
  },
  modalCloseText: {
    fontSize: fontSize.xl,
  },
  modalBody: {
    flex: 1,
    padding: spacing[4],
  },

  // Form
  formField: {
    marginBottom: spacing[4],
  },
  formLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    marginBottom: spacing[2],
  },
  formInput: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    fontSize: fontSize.base,
  },
  formError: {
    fontSize: fontSize.xs,
    marginTop: spacing[1],
  },

  // Role Picker
  rolePickerGrid: {
    gap: spacing[2],
  },
  rolePickerItem: {
    padding: spacing[3],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  rolePickerLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
    marginBottom: 2,
  },
  rolePickerDesc: {
    fontSize: fontSize.xs,
  },

  // Role Info
  roleInfoCard: {
    padding: spacing[4],
    borderRadius: borderRadius.xl,
    marginBottom: spacing[3],
  },
  roleInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginBottom: spacing[3],
  },
  roleInfoDesc: {
    fontSize: fontSize.sm,
    flex: 1,
  },
  roleInfoPermissions: {
    gap: spacing[1],
  },
  roleInfoPermItem: {
    paddingVertical: spacing[1],
  },
  roleInfoPermText: {
    fontSize: fontSize.sm,
  },

  // Details Modal
  detailsProfile: {
    alignItems: 'center',
    padding: spacing[5],
    borderRadius: borderRadius.xl,
    marginBottom: spacing[4],
  },
  detailsAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[3],
  },
  detailsAvatarText: {
    color: '#FFFFFF',
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.semibold as any,
  },
  detailsName: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold as any,
    marginBottom: spacing[2],
  },
  detailsBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  detailsContact: {
    alignItems: 'center',
    gap: spacing[1],
  },
  detailsContactText: {
    fontSize: fontSize.sm,
  },

  // Details Actions
  detailsActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginBottom: spacing[4],
  },
  detailsActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.lg,
    gap: spacing[2],
  },
  detailsActionIcon: {
    fontSize: fontSize.base,
  },
  detailsActionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },

  // Section Tabs
  sectionTabs: {
    flexDirection: 'row',
    marginBottom: spacing[4],
  },
  sectionTab: {
    flex: 1,
    paddingVertical: spacing[3],
    alignItems: 'center',
  },
  sectionTabText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    textTransform: 'capitalize',
  },

  // Section Content
  sectionContent: {
    gap: spacing[3],
  },

  // Details Section
  detailsSection: {
    padding: spacing[4],
    borderRadius: borderRadius.xl,
  },
  detailsSectionTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[3],
  },
  detailsNoteText: {
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.5,
  },
  detailsInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing[2],
  },
  detailsInfoLabel: {
    fontSize: fontSize.sm,
  },
  detailsInfoValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },

  // Permissions
  resetPermsButton: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
  },
  resetPermsText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  permGroupCard: {
    padding: spacing[4],
    borderRadius: borderRadius.xl,
  },
  permGroupTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[3],
  },
  permRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[2],
  },
  permLabel: {
    fontSize: fontSize.sm,
    flex: 1,
  },

  // Activity
  activityCard: {
    padding: spacing[4],
    borderRadius: borderRadius.xl,
  },
  activityItem: {
    flexDirection: 'row',
  },
  activityDotContainer: {
    alignItems: 'center',
    width: 24,
  },
  activityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  activityLine: {
    width: 2,
    flex: 1,
    marginTop: spacing[1],
  },
  activityContent: {
    flex: 1,
    paddingLeft: spacing[3],
    paddingBottom: spacing[4],
  },
  activityLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    marginBottom: spacing[1],
  },
  activityTime: {
    fontSize: fontSize.xs,
  },
  noActivityText: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingVertical: spacing[4],
  },

  // Role Edit Modal
  roleEditOverlay: {
    // Absolutely positioned rather than flex:1 — no longer inside a
    // <Modal>, which does not present on this build.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[4],
  },
  roleEditModal: {
    width: '90%',
    maxWidth: 360,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
  },
  roleEditTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[4],
    textAlign: 'center',
  },
  roleEditItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing[3],
    borderRadius: borderRadius.lg,
    marginBottom: spacing[2],
  },
  roleEditItemLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium as any,
    marginBottom: 2,
  },
  roleEditItemDesc: {
    fontSize: fontSize.xs,
  },
  roleEditCheck: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold as any,
  },

  // Note Modal
  noteOverlay: {
    // Absolutely positioned rather than flex:1 — no longer inside a
    // <Modal>, which does not present on this build.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[4],
  },
  noteModal: {
    width: '90%',
    maxWidth: 360,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
  },
  noteModalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[4],
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    fontSize: fontSize.base,
    minHeight: 100,
  },
  noteActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing[2],
    marginTop: spacing[4],
  },
  noteBtn: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.md,
  },
  noteBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },

  // Dialog
  dialogOverlay: {
    // Absolutely positioned rather than flex:1 — no longer inside a
    // <Modal>, which does not present on this build.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[4],
  },
  dialogBox: {
    width: '90%',
    maxWidth: 320,
    borderRadius: borderRadius.xl,
    padding: spacing[5],
  },
  dialogTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[2],
    textAlign: 'center',
  },
  dialogMessage: {
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.5,
    textAlign: 'center',
    marginBottom: spacing[5],
  },
  dialogActions: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  dialogButton: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  dialogButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
  },
});
