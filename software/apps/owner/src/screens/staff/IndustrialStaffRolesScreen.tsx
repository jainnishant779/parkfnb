// ============================================================================
// INDUSTRIAL STAFF & ROLES SCREEN
// Premium enterprise UI for managing staff and role permissions
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Animated,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  LayoutAnimation,
  UIManager,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import { getTheme } from '../../theme/colors';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

type StaffStatus = 'active' | 'invited' | 'suspended';

type PermissionKey =
  // Bookings
  | 'VIEW_BOOKINGS' | 'APPROVE_BOOKINGS' | 'CANCEL_BOOKINGS'
  // Check-in/Access
  | 'CHECKIN' | 'CHECKOUT' | 'ISSUE_PASSES' | 'VIEW_ACCESS_LOGS'
  // Listings/Pricing
  | 'EDIT_LISTINGS' | 'EDIT_PRICING_TIERS' | 'VIEW_OCCUPANCY'
  // Compliance (view only)
  | 'VIEW_COMPLIANCE' | 'REVIEW_DOCS'
  // Finance
  | 'VIEW_PAYOUTS' | 'EXPORT_REPORTS' | 'MANAGE_BILLING'
  // Staff/Admin
  | 'MANAGE_STAFF' | 'MANAGE_ROLES';

interface PermissionGroup {
  id: string;
  label: string;
  icon: string;
  permissions: { key: PermissionKey; label: string; description: string }[];
}

interface StaffMember {
  id: string;
  fullName: string;
  phoneOrEmail: string;
  avatarInitials: string;
  roleId: string;
  status: StaffStatus;
  lastActiveAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface Role {
  id: string;
  name: string;
  description: string;
  isSystemRole: boolean;
  permissionSet: PermissionKey[];
}

interface ActivityLogItem {
  id: string;
  type: 'staff_invited' | 'staff_removed' | 'staff_suspended' | 'staff_reactivated' | 'role_changed' | 'role_created' | 'role_updated' | 'role_deleted';
  message: string;
  createdAt: string;
}

type TabKey = 'staff' | 'roles';
type StaffFilter = 'all' | 'active' | 'invited' | 'suspended';

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEYS = {
  STAFF: '@ownerapp/industrial_staff_v1',
  ROLES: '@ownerapp/industrial_roles_v1',
  ACTIVITY: '@ownerapp/industrial_staff_activity_v1',
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'bookings',
    label: 'Bookings',
    icon: 'calendar-outline',
    permissions: [
      { key: 'VIEW_BOOKINGS', label: 'View Bookings', description: 'See all booking records' },
      { key: 'APPROVE_BOOKINGS', label: 'Approve Bookings', description: 'Accept or reject booking requests' },
      { key: 'CANCEL_BOOKINGS', label: 'Cancel Bookings', description: 'Cancel existing bookings' },
    ],
  },
  {
    id: 'access',
    label: 'Check-in / Access',
    icon: 'scan-outline',
    permissions: [
      { key: 'CHECKIN', label: 'Check-in', description: 'Process vehicle check-ins' },
      { key: 'CHECKOUT', label: 'Check-out', description: 'Process vehicle check-outs' },
      { key: 'ISSUE_PASSES', label: 'Issue Passes', description: 'Create access passes' },
      { key: 'VIEW_ACCESS_LOGS', label: 'View Access Logs', description: 'See entry/exit history' },
    ],
  },
  {
    id: 'listings',
    label: 'Listings & Pricing',
    icon: 'pricetag-outline',
    permissions: [
      { key: 'EDIT_LISTINGS', label: 'Edit Listings', description: 'Modify parking spot details' },
      { key: 'EDIT_PRICING_TIERS', label: 'Edit Pricing', description: 'Change pricing tiers' },
      { key: 'VIEW_OCCUPANCY', label: 'View Occupancy', description: 'See occupancy metrics' },
    ],
  },
  {
    id: 'compliance',
    label: 'Compliance',
    icon: 'shield-checkmark-outline',
    permissions: [
      { key: 'VIEW_COMPLIANCE', label: 'View Compliance', description: 'See compliance status' },
      { key: 'REVIEW_DOCS', label: 'Review Documents', description: 'Review uploaded documents' },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: 'wallet-outline',
    permissions: [
      { key: 'VIEW_PAYOUTS', label: 'View Payouts', description: 'See payout history' },
      { key: 'EXPORT_REPORTS', label: 'Export Reports', description: 'Download financial reports' },
      { key: 'MANAGE_BILLING', label: 'Manage Billing', description: 'Handle billing settings' },
    ],
  },
  {
    id: 'admin',
    label: 'Staff & Admin',
    icon: 'people-outline',
    permissions: [
      { key: 'MANAGE_STAFF', label: 'Manage Staff', description: 'Add, edit, remove staff' },
      { key: 'MANAGE_ROLES', label: 'Manage Roles', description: 'Create and edit roles' },
    ],
  },
];

const ALL_PERMISSIONS: PermissionKey[] = PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.key));

// ============================================================================
// SEED DATA
// ============================================================================

const SEED_ROLES: Role[] = [
  {
    id: 'role_yard_manager',
    name: 'Yard Manager',
    description: 'Full access to all yard operations and settings',
    isSystemRole: true,
    permissionSet: [...ALL_PERMISSIONS],
  },
  {
    id: 'role_gate_attendant',
    name: 'Gate Attendant',
    description: 'Check-in/out vehicles and view bookings',
    isSystemRole: true,
    permissionSet: ['VIEW_BOOKINGS', 'CHECKIN', 'CHECKOUT', 'ISSUE_PASSES', 'VIEW_ACCESS_LOGS'],
  },
  {
    id: 'role_compliance_officer',
    name: 'Compliance Officer',
    description: 'Review documents and monitor compliance status',
    isSystemRole: true,
    permissionSet: ['VIEW_COMPLIANCE', 'REVIEW_DOCS', 'VIEW_BOOKINGS'],
  },
  {
    id: 'role_finance',
    name: 'Finance',
    description: 'Access to payouts and financial reports',
    isSystemRole: true,
    permissionSet: ['VIEW_PAYOUTS', 'EXPORT_REPORTS', 'MANAGE_BILLING', 'VIEW_BOOKINGS'],
  },
  {
    id: 'role_viewer',
    name: 'Viewer',
    description: 'Read-only access to basic information',
    isSystemRole: true,
    permissionSet: ['VIEW_BOOKINGS', 'VIEW_OCCUPANCY'],
  },
];

const SEED_STAFF: StaffMember[] = [
  {
    id: 'staff_1',
    fullName: 'Michael Chen',
    phoneOrEmail: 'michael.chen@company.com',
    avatarInitials: 'MC',
    roleId: 'role_yard_manager',
    status: 'active',
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'staff_2',
    fullName: 'Sarah Johnson',
    phoneOrEmail: '+1 555-0123',
    avatarInitials: 'SJ',
    roleId: 'role_gate_attendant',
    status: 'invited',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'staff_3',
    fullName: 'David Park',
    phoneOrEmail: 'david.park@company.com',
    avatarInitials: 'DP',
    roleId: 'role_compliance_officer',
    status: 'active',
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 15).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// ============================================================================
// UTILITIES
// ============================================================================

const generateId = (prefix: string): string => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

const formatDateTime = (isoString: string): string => {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

const formatDate = (isoString: string): string => {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// ============================================================================
// STORAGE HELPERS
// ============================================================================

async function safeLoad<T>(key: string, fallback: T): Promise<T> {
  try {
    const data = await AsyncStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
}

async function safeSave<T>(key: string, data: T): Promise<boolean> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// INTERNAL COMPONENTS
// ============================================================================

// --- Segmented Control ---
interface SegmentedControlProps {
  tabs: { key: TabKey; label: string }[];
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}

function SegmentedControl({ tabs, activeTab, onTabChange }: SegmentedControlProps) {
  const theme = getTheme(false);
  return (
    <View style={[styles.segmentedContainer, { backgroundColor: theme.borderLight }]}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onTabChange(tab.key)}
            style={[
              styles.segmentedTab,
              isActive && [styles.segmentedTabActive, { backgroundColor: theme.surface }],
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.label}
          >
            <Text style={[
              styles.segmentedTabText,
              { color: isActive ? theme.text : theme.textMuted },
              isActive && styles.segmentedTabTextActive,
            ]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// --- Search Bar ---
interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

function SearchBar({ value, onChangeText, placeholder = 'Search...' }: SearchBarProps) {
  const theme = getTheme(false);
  return (
    <View style={[styles.searchContainer, { backgroundColor: theme.borderLight }]}>
      <Ionicons name="search-outline" size={18} color={theme.textMuted} />
      <TextInput
        style={[styles.searchInput, { color: theme.text }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        accessibilityLabel={placeholder}
        returnKeyType="search"
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChangeText('')} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color={theme.textMuted} />
        </Pressable>
      )}
    </View>
  );
}

// --- Filter Chip ---
interface ChipProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
  count?: number;
}

function Chip({ label, isActive, onPress, count }: ChipProps) {
  const theme = getTheme(false);
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: isActive ? theme.primary : theme.borderLight },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
    >
      <Text style={[styles.chipText, { color: isActive ? '#FFF' : theme.text }]}>
        {label}
      </Text>
      {count !== undefined && (
        <View style={[styles.chipBadge, { backgroundColor: isActive ? 'rgba(255,255,255,0.3)' : theme.textMuted }]}>
          <Text style={styles.chipBadgeText}>{count}</Text>
        </View>
      )}
    </Pressable>
  );
}

// --- Status Pill ---
interface StatusPillProps {
  status: StaffStatus;
}

function StatusPill({ status }: StatusPillProps) {
  const config = {
    active: { bg: '#ECFDF5', text: '#059669', label: 'Active' },
    invited: { bg: '#FEF3C7', text: '#D97706', label: 'Invited' },
    suspended: { bg: '#FEE2E2', text: '#DC2626', label: 'Suspended' },
  }[status];

  return (
    <View style={[styles.statusPill, { backgroundColor: config.bg }]}>
      <Text style={[styles.statusPillText, { color: config.text }]}>{config.label}</Text>
    </View>
  );
}

// --- Avatar ---
interface AvatarProps {
  initials: string;
  size?: number;
  muted?: boolean;
}

function Avatar({ initials, size = 44, muted = false }: AvatarProps) {
  const theme = getTheme(false);
  return (
    <View style={[
      styles.avatar,
      {
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: muted ? theme.borderLight : theme.primaryLight,
      },
    ]}>
      <Text style={[
        styles.avatarText,
        {
          fontSize: size * 0.4,
          color: muted ? theme.textMuted : theme.primary,
        },
      ]}>
        {initials}
      </Text>
    </View>
  );
}

// --- Toast ---
interface ToastProps {
  message: string;
  visible: boolean;
  type?: 'success' | 'error' | 'info';
}

function Toast({ message, visible, type = 'success' }: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -20, duration: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, opacity, translateY]);

  if (!visible) return null;

  const colors = {
    success: { bg: '#059669', icon: 'checkmark-circle' },
    error: { bg: '#DC2626', icon: 'alert-circle' },
    info: { bg: '#0D7377', icon: 'information-circle' },
  }[type];

  return (
    <Animated.View style={[styles.toast, { backgroundColor: colors.bg, opacity, transform: [{ translateY }] }]}>
      <Ionicons name={colors.icon as any} size={20} color="#FFF" />
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

// --- Confirm Dialog ---
interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const theme = getTheme(false);

  return visible ? (

      <View style={styles.dialogBackdrop}>
        <View style={[styles.dialogContainer, { backgroundColor: theme.surface }]}>
          <Text style={[styles.dialogTitle, { color: theme.text }]}>{title}</Text>
          <Text style={[styles.dialogMessage, { color: theme.textSecondary }]}>{message}</Text>
          <View style={styles.dialogActions}>
            <Pressable
              style={[styles.dialogButton, { backgroundColor: theme.borderLight }]}
              onPress={onCancel}
              accessibilityRole="button"
            >
              <Text style={[styles.dialogButtonText, { color: theme.text }]}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              style={[styles.dialogButton, { backgroundColor: destructive ? theme.danger : theme.primary }]}
              onPress={onConfirm}
              accessibilityRole="button"
            >
              <Text style={[styles.dialogButtonText, { color: '#FFF' }]}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    
    ) : null;
}

// --- Bottom Sheet Modal ---
interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}

function BottomSheet({ visible, onClose, title, subtitle, children }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const theme = getTheme(false);
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, friction: 8, tension: 65, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, translateY, backdropOpacity]);

  if (!visible) return null;

  return visible ? (

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={[styles.sheetBackdrop, { opacity: backdropOpacity }]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
        </Animated.View>
        <Animated.View style={[
          styles.sheetContainer,
          { backgroundColor: theme.surface, paddingBottom: insets.bottom + spacing[4], transform: [{ translateY }] },
        ]}>
          <View style={styles.sheetHandle} />
          {(title || subtitle) && (
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                {title && <Text style={[styles.sheetTitle, { color: theme.text }]}>{title}</Text>}
                {subtitle && <Text style={[styles.sheetSubtitle, { color: theme.textSecondary }]}>{subtitle}</Text>}
              </View>
              <Pressable onPress={onClose} style={styles.sheetCloseBtn} accessibilityLabel="Close">
                <Ionicons name="close" size={24} color={theme.textMuted} />
              </Pressable>
            </View>
          )}
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" bounces={false}>
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    
    ) : null;
}

// --- Staff Card ---
interface StaffCardProps {
  staff: StaffMember;
  roleName: string;
  onPress: () => void;
  onMenuPress: () => void;
}

function StaffCard({ staff, roleName, onPress, onMenuPress }: StaffCardProps) {
  const theme = getTheme(false);
  const isMuted = staff.status === 'suspended';

  return (
    <View style={[styles.staffCard, { backgroundColor: theme.surface }, isMuted && { opacity: 0.7 }]}>
      <Pressable
        style={styles.staffCardPressable}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${staff.fullName}, ${roleName}, ${staff.status}`}
      >
        <Avatar initials={staff.avatarInitials} muted={isMuted} />
        <View style={styles.staffCardContent}>
          <View style={styles.staffCardRow}>
            <Text style={[styles.staffCardName, { color: theme.text }]} numberOfLines={1}>
              {staff.fullName}
            </Text>
            <StatusPill status={staff.status} />
          </View>
          <Text style={[styles.staffCardRole, { color: theme.primary }]} numberOfLines={1}>
            {roleName}
          </Text>
          <Text style={[styles.staffCardMeta, { color: theme.textMuted }]} numberOfLines={1}>
            {staff.phoneOrEmail}
            {staff.lastActiveAt && ` • ${formatDateTime(staff.lastActiveAt)}`}
          </Text>
          {staff.status === 'invited' && (
            <Text style={[styles.staffCardPending, { color: theme.warning }]}>Pending acceptance</Text>
          )}
          {staff.status === 'suspended' && (
            <Text style={[styles.staffCardPending, { color: theme.danger }]}>Restricted</Text>
          )}
        </View>
      </Pressable>
      <Pressable
        style={styles.staffCardMenu}
        onPress={(e) => {
          e.stopPropagation();
          onMenuPress();
        }}
        hitSlop={12}
        accessibilityLabel="More options"
      >
        <Ionicons name="ellipsis-vertical" size={20} color={theme.textMuted} />
      </Pressable>
    </View>
  );
}

// --- Role Card ---
interface RoleCardProps {
  role: Role;
  assignedCount: number;
  onPress: () => void;
}

function RoleCard({ role, assignedCount, onPress }: RoleCardProps) {
  const theme = getTheme(false);

  return (
    <View style={[styles.roleCard, { backgroundColor: theme.surface }]}>
      <Pressable
        style={styles.roleCardPressable}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${role.name} role with ${role.permissionSet.length} permissions`}
      >
        {/* Icon on left like staff avatar */}
        <View style={[styles.roleCardIcon, { backgroundColor: theme.primaryLight }]}>
          <Ionicons name="shield-checkmark" size={22} color={theme.primary} />
        </View>
        {/* Content in middle */}
        <View style={styles.roleCardContent}>
          <View style={styles.roleCardHeader}>
            <Text style={[styles.roleCardName, { color: theme.text }]} numberOfLines={1}>
              {role.name}
            </Text>
            {role.isSystemRole && (
              <View style={[styles.systemBadge, { backgroundColor: theme.infoLight }]}>
                <Text style={[styles.systemBadgeText, { color: theme.info }]}>System</Text>
              </View>
            )}
          </View>
          <Text style={[styles.roleCardDesc, { color: theme.textSecondary }]} numberOfLines={2}>
            {role.description}
          </Text>
          <Text style={[styles.roleCardStatText, { color: theme.textMuted }]}>
            {role.permissionSet.length} permissions • {assignedCount} assigned
          </Text>
        </View>
      </Pressable>
      {/* Chevron on right */}
      <Pressable
        style={styles.roleCardChevron}
        onPress={onPress}
        hitSlop={12}
      >
        <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
      </Pressable>
    </View>
  );
}

// --- Permission Group Toggle ---
interface PermissionGroupToggleProps {
  group: PermissionGroup;
  selectedPermissions: PermissionKey[];
  onToggle: (key: PermissionKey) => void;
  onSelectAll: () => void;
  expanded: boolean;
  onExpandToggle: () => void;
}

function PermissionGroupToggle({
  group,
  selectedPermissions,
  onToggle,
  onSelectAll,
  expanded,
  onExpandToggle,
}: PermissionGroupToggleProps) {
  const theme = getTheme(false);
  const selectedInGroup = group.permissions.filter(p => selectedPermissions.includes(p.key)).length;
  const allSelected = selectedInGroup === group.permissions.length;

  return (
    <View style={[styles.permGroup, { backgroundColor: theme.background }]}>
      <Pressable style={styles.permGroupHeader} onPress={onExpandToggle} accessibilityRole="button">
        <View style={styles.permGroupHeaderLeft}>
          <Ionicons name={group.icon as any} size={18} color={theme.primary} />
          <Text style={[styles.permGroupLabel, { color: theme.text }]}>{group.label}</Text>
          <View style={[styles.permGroupCount, { backgroundColor: theme.primaryLight }]}>
            <Text style={[styles.permGroupCountText, { color: theme.primary }]}>
              {selectedInGroup}/{group.permissions.length}
            </Text>
          </View>
        </View>
        <View style={styles.permGroupHeaderRight}>
          <Pressable onPress={onSelectAll} hitSlop={8} accessibilityLabel={allSelected ? 'Deselect all' : 'Select all'}>
            <Text style={[styles.permGroupSelectAll, { color: theme.primary }]}>
              {allSelected ? 'Clear' : 'All'}
            </Text>
          </Pressable>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={theme.textMuted} />
        </View>
      </Pressable>
      {expanded && (
        <View style={styles.permGroupItems}>
          {group.permissions.map((perm) => {
            const isSelected = selectedPermissions.includes(perm.key);
            return (
              <Pressable
                key={perm.key}
                style={[styles.permItem, { backgroundColor: isSelected ? theme.primaryLight : theme.surface }]}
                onPress={() => onToggle(perm.key)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
              >
                <View style={styles.permItemContent}>
                  <Text style={[styles.permItemLabel, { color: theme.text }]}>{perm.label}</Text>
                  <Text style={[styles.permItemDesc, { color: theme.textMuted }]} numberOfLines={1}>
                    {perm.description}
                  </Text>
                </View>
                <View style={[
                  styles.permItemCheck,
                  { backgroundColor: isSelected ? theme.primary : theme.borderLight, borderColor: isSelected ? theme.primary : theme.border },
                ]}>
                  {isSelected && <Ionicons name="checkmark" size={14} color="#FFF" />}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

// --- Empty State ---
interface EmptyStateProps {
  icon: string;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}

function EmptyState({ icon, title, subtitle, actionLabel, onAction }: EmptyStateProps) {
  const theme = getTheme(false);
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyStateIcon, { backgroundColor: theme.borderLight }]}>
        <Ionicons name={icon as any} size={40} color={theme.textMuted} />
      </View>
      <Text style={[styles.emptyStateTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.emptyStateSubtitle, { color: theme.textMuted }]}>{subtitle}</Text>
      {actionLabel && onAction && (
        <Pressable style={[styles.emptyStateBtn, { backgroundColor: theme.primary }]} onPress={onAction}>
          <Ionicons name="add" size={18} color="#FFF" />
          <Text style={styles.emptyStateBtnText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

// --- Compliance Info Card ---
function ComplianceInfoCard() {
  const theme = getTheme(false);
  return (
    <View style={[styles.complianceCard, { backgroundColor: theme.infoLight, borderColor: theme.info }]}>
      <View style={styles.complianceCardHeader}>
        <Ionicons name="shield-checkmark-outline" size={20} color={theme.info} />
        <Text style={[styles.complianceCardTitle, { color: theme.info }]}>Compliance Settings</Text>
      </View>
      <Text style={[styles.complianceCardText, { color: theme.textSecondary }]}>
        Compliance rules and document requirements are managed in the Compliance section.
      </Text>
      <Pressable
        style={[styles.complianceCardBtn, { backgroundColor: theme.info }]}
        accessibilityLabel="Go to Compliance"
        onPress={() => {
          // UI-only: would navigate to ComplianceHome
        }}
      >
        <Text style={styles.complianceCardBtnText}>Go to Compliance</Text>
        <Ionicons name="arrow-forward" size={16} color="#FFF" />
      </Pressable>
    </View>
  );
}

// ============================================================================
// MAIN SCREEN COMPONENT
// ============================================================================

export default function IndustrialStaffRolesScreen() {
  const theme = getTheme(false);
  const insets = useSafeAreaInsets();

  // --- State ---
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('staff');
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityLogItem[]>([]);
  const [saveError, setSaveError] = useState(false);

  // Staff tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [staffFilter, setStaffFilter] = useState<StaffFilter>('all');
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [staffMenuTarget, setStaffMenuTarget] = useState<StaffMember | null>(null);
  const [showStaffDetails, setShowStaffDetails] = useState(false);
  const [showChangeRole, setShowChangeRole] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Roles tab state
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [showRoleEditor, setShowRoleEditor] = useState(false);
  const [isCreatingRole, setIsCreatingRole] = useState(false);

  // Role editor state
  const [editRoleName, setEditRoleName] = useState('');
  const [editRoleDesc, setEditRoleDesc] = useState('');
  const [editRolePerms, setEditRolePerms] = useState<PermissionKey[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  // Invite modal state
  const [inviteName, setInviteName] = useState('');
  const [inviteContact, setInviteContact] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('role_gate_attendant');

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    destructive: boolean;
    onConfirm: () => void;
  } | null>(null);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Reassignment state (for role deletion)
  const [reassignmentTarget, setReassignmentTarget] = useState<{ roleId: string; newRoleId: string } | null>(null);

  // --- Load Data ---
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      const [loadedStaff, loadedRoles, loadedActivity] = await Promise.all([
        safeLoad<StaffMember[]>(STORAGE_KEYS.STAFF, []),
        safeLoad<Role[]>(STORAGE_KEYS.ROLES, []),
        safeLoad<ActivityLogItem[]>(STORAGE_KEYS.ACTIVITY, []),
      ]);

      if (loadedRoles.length === 0) {
        await safeSave(STORAGE_KEYS.ROLES, SEED_ROLES);
        setRoles(SEED_ROLES);
      } else {
        setRoles(loadedRoles);
      }

      if (loadedStaff.length === 0) {
        await safeSave(STORAGE_KEYS.STAFF, SEED_STAFF);
        setStaff(SEED_STAFF);
      } else {
        setStaff(loadedStaff);
      }

      setActivityLog(loadedActivity);
      setIsLoading(false);
    }
    loadData();
  }, []);

  // --- Persistence Helpers ---
  const persistStaff = useCallback(async (newStaff: StaffMember[]) => {
    setStaff(newStaff);
    const success = await safeSave(STORAGE_KEYS.STAFF, newStaff);
    if (!success) setSaveError(true);
  }, []);

  const persistRoles = useCallback(async (newRoles: Role[]) => {
    setRoles(newRoles);
    const success = await safeSave(STORAGE_KEYS.ROLES, newRoles);
    if (!success) setSaveError(true);
  }, []);

  const addActivity = useCallback(async (type: ActivityLogItem['type'], message: string) => {
    const newItem: ActivityLogItem = {
      id: generateId('activity'),
      type,
      message,
      createdAt: new Date().toISOString(),
    };
    const newLog = [newItem, ...activityLog].slice(0, 100);
    setActivityLog(newLog);
    await safeSave(STORAGE_KEYS.ACTIVITY, newLog);
  }, [activityLog]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // --- Computed Values ---
  const staffCounts = useMemo(() => ({
    total: staff.length,
    active: staff.filter(s => s.status === 'active').length,
    invited: staff.filter(s => s.status === 'invited').length,
    suspended: staff.filter(s => s.status === 'suspended').length,
  }), [staff]);

  const filteredStaff = useMemo(() => {
    let result = staff;
    if (staffFilter !== 'all') {
      result = result.filter(s => s.status === staffFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s => {
        const role = roles.find(r => r.id === s.roleId);
        return (
          s.fullName.toLowerCase().includes(q) ||
          s.phoneOrEmail.toLowerCase().includes(q) ||
          (role?.name.toLowerCase().includes(q) ?? false)
        );
      });
    }
    return result;
  }, [staff, staffFilter, searchQuery, roles]);

  const getRoleName = useCallback((roleId: string) => {
    return roles.find(r => r.id === roleId)?.name ?? 'Unknown Role';
  }, [roles]);

  const getStaffCountForRole = useCallback((roleId: string) => {
    return staff.filter(s => s.roleId === roleId).length;
  }, [staff]);

  // --- Staff Actions ---
  const handleInviteStaff = useCallback(() => {
    if (!inviteName.trim() || !inviteContact.trim()) {
      showToast('Please fill in all fields', 'error');
      return;
    }
    const newStaff: StaffMember = {
      id: generateId('staff'),
      fullName: inviteName.trim(),
      phoneOrEmail: inviteContact.trim(),
      avatarInitials: getInitials(inviteName.trim()),
      roleId: inviteRoleId,
      status: 'invited',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    persistStaff([...staff, newStaff]);
    addActivity('staff_invited', `Invited ${newStaff.fullName} as ${getRoleName(inviteRoleId)}`);
    setShowInviteModal(false);
    setInviteName('');
    setInviteContact('');
    setInviteRoleId('role_gate_attendant');
    showToast('Invite sent');
  }, [inviteName, inviteContact, inviteRoleId, staff, persistStaff, addActivity, getRoleName, showToast]);

  const handleResendInvite = useCallback((staffMember: StaffMember) => {
    const updated = staff.map(s =>
      s.id === staffMember.id ? { ...s, updatedAt: new Date().toISOString() } : s
    );
    persistStaff(updated);
    showToast('Invite resent');
    setStaffMenuTarget(null);
  }, [staff, persistStaff, showToast]);

  const handleSuspendStaff = useCallback((staffMember: StaffMember) => {
    setConfirmDialog({
      visible: true,
      title: 'Suspend Staff Member',
      message: `Are you sure you want to suspend ${staffMember.fullName}? They will lose access until reactivated.`,
      confirmLabel: 'Suspend',
      destructive: true,
      onConfirm: () => {
        const updated = staff.map(s =>
          s.id === staffMember.id ? { ...s, status: 'suspended' as StaffStatus, updatedAt: new Date().toISOString() } : s
        );
        persistStaff(updated);
        addActivity('staff_suspended', `Suspended ${staffMember.fullName}`);
        showToast('Staff suspended');
        setConfirmDialog(null);
        setStaffMenuTarget(null);
        setShowStaffDetails(false);
      },
    });
  }, [staff, persistStaff, addActivity, showToast]);

  const handleReactivateStaff = useCallback((staffMember: StaffMember) => {
    const updated = staff.map(s =>
      s.id === staffMember.id ? { ...s, status: 'active' as StaffStatus, updatedAt: new Date().toISOString() } : s
    );
    persistStaff(updated);
    addActivity('staff_reactivated', `Reactivated ${staffMember.fullName}`);
    showToast('Staff reactivated');
    setStaffMenuTarget(null);
    setShowStaffDetails(false);
  }, [staff, persistStaff, addActivity, showToast]);

  const handleRemoveStaff = useCallback((staffMember: StaffMember) => {
    setConfirmDialog({
      visible: true,
      title: 'Remove Staff Member',
      message: `Are you sure you want to remove ${staffMember.fullName}? This action cannot be undone.`,
      confirmLabel: 'Remove',
      destructive: true,
      onConfirm: () => {
        const updated = staff.filter(s => s.id !== staffMember.id);
        persistStaff(updated);
        addActivity('staff_removed', `Removed ${staffMember.fullName}`);
        showToast('Staff removed');
        setConfirmDialog(null);
        setStaffMenuTarget(null);
        setShowStaffDetails(false);
        setSelectedStaff(null);
      },
    });
  }, [staff, persistStaff, addActivity, showToast]);

  const handleChangeRole = useCallback((staffMember: StaffMember, newRoleId: string) => {
    const updated = staff.map(s =>
      s.id === staffMember.id ? { ...s, roleId: newRoleId, updatedAt: new Date().toISOString() } : s
    );
    persistStaff(updated);
    addActivity('role_changed', `Changed ${staffMember.fullName}'s role to ${getRoleName(newRoleId)}`);
    showToast('Role updated');
    setShowChangeRole(false);
    setStaffMenuTarget(null);
  }, [staff, persistStaff, addActivity, getRoleName, showToast]);

  // --- Role Actions ---
  const openRoleEditor = useCallback((role: Role | null, duplicate = false) => {
    if (role) {
      setEditRoleName(duplicate ? `${role.name} (Copy)` : role.name);
      setEditRoleDesc(role.description);
      setEditRolePerms([...role.permissionSet]);
      setIsCreatingRole(duplicate);
      setSelectedRole(duplicate ? null : role);
    } else {
      setEditRoleName('');
      setEditRoleDesc('');
      setEditRolePerms([]);
      setIsCreatingRole(true);
      setSelectedRole(null);
    }
    setExpandedGroups(PERMISSION_GROUPS.map(g => g.id));
    setShowRoleEditor(true);
  }, []);

  const handleSaveRole = useCallback(() => {
    if (editRoleName.trim().length < 3) {
      showToast('Role name must be at least 3 characters', 'error');
      return;
    }
    if (editRolePerms.length === 0) {
      showToast('Select at least one permission', 'error');
      return;
    }
    const nameExists = roles.some(r =>
      r.name.toLowerCase() === editRoleName.trim().toLowerCase() && r.id !== selectedRole?.id
    );
    if (nameExists) {
      showToast('Role name already exists', 'error');
      return;
    }

    if (isCreatingRole) {
      const newRole: Role = {
        id: generateId('role'),
        name: editRoleName.trim(),
        description: editRoleDesc.trim(),
        isSystemRole: false,
        permissionSet: editRolePerms,
      };
      persistRoles([...roles, newRole]);
      addActivity('role_created', `Created role "${newRole.name}"`);
      showToast('Role created');
    } else if (selectedRole) {
      const updated = roles.map(r =>
        r.id === selectedRole.id
          ? { ...r, name: editRoleName.trim(), description: editRoleDesc.trim(), permissionSet: editRolePerms }
          : r
      );
      persistRoles(updated);
      addActivity('role_updated', `Updated role "${editRoleName.trim()}"`);
      showToast('Role saved');
    }
    setShowRoleEditor(false);
  }, [editRoleName, editRoleDesc, editRolePerms, isCreatingRole, selectedRole, roles, persistRoles, addActivity, showToast]);

  const handleDeleteRole = useCallback((role: Role) => {
    if (role.isSystemRole) {
      showToast('System roles cannot be deleted', 'error');
      return;
    }
    const assignedCount = getStaffCountForRole(role.id);
    if (assignedCount > 0) {
      setReassignmentTarget({ roleId: role.id, newRoleId: '' });
      return;
    }
    setConfirmDialog({
      visible: true,
      title: 'Delete Role',
      message: `Are you sure you want to delete "${role.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => {
        const updated = roles.filter(r => r.id !== role.id);
        persistRoles(updated);
        addActivity('role_deleted', `Deleted role "${role.name}"`);
        showToast('Role deleted');
        setConfirmDialog(null);
        setShowRoleEditor(false);
        setSelectedRole(null);
      },
    });
  }, [roles, persistRoles, addActivity, showToast, getStaffCountForRole]);

  const handleReassignAndDelete = useCallback(() => {
    if (!reassignmentTarget || !reassignmentTarget.newRoleId) {
      showToast('Please select a role to reassign staff', 'error');
      return;
    }
    const role = roles.find(r => r.id === reassignmentTarget.roleId);
    if (!role) return;

    const updatedStaff = staff.map(s =>
      s.roleId === reassignmentTarget.roleId
        ? { ...s, roleId: reassignmentTarget.newRoleId, updatedAt: new Date().toISOString() }
        : s
    );
    const updatedRoles = roles.filter(r => r.id !== reassignmentTarget.roleId);

    persistStaff(updatedStaff);
    persistRoles(updatedRoles);
    addActivity('role_deleted', `Deleted role "${role.name}" and reassigned staff`);
    showToast('Role deleted and staff reassigned');
    setReassignmentTarget(null);
    setShowRoleEditor(false);
    setSelectedRole(null);
  }, [reassignmentTarget, staff, roles, persistStaff, persistRoles, addActivity, showToast]);

  const togglePermission = useCallback((key: PermissionKey) => {
    setEditRolePerms(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }, []);

  const toggleGroupExpanded = useCallback((groupId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedGroups(prev =>
      prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
    );
  }, []);

  const selectAllInGroup = useCallback((group: PermissionGroup) => {
    const groupKeys = group.permissions.map(p => p.key);
    const allSelected = groupKeys.every(k => editRolePerms.includes(k));
    if (allSelected) {
      setEditRolePerms(prev => prev.filter(k => !groupKeys.includes(k)));
    } else {
      setEditRolePerms(prev => [...new Set([...prev, ...groupKeys])]);
    }
  }, [editRolePerms]);

  // --- Render ---
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      {/* Save Error Banner */}
      {saveError && (
        <View style={[styles.errorBanner, { backgroundColor: theme.warningLight }]}>
          <Ionicons name="warning-outline" size={16} color={theme.warning} />
          <Text style={[styles.errorBannerText, { color: theme.warning }]}>
            Couldn't save locally. Changes may not persist.
          </Text>
          <Pressable onPress={() => setSaveError(false)} hitSlop={8}>
            <Ionicons name="close" size={18} color={theme.warning} />
          </Pressable>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Staff & Roles</Text>
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
            Control who can manage yard operations.
          </Text>
        </View>
        <Pressable
          style={[styles.inviteBtn, { backgroundColor: theme.primary }]}
          onPress={() => setShowInviteModal(true)}
          accessibilityLabel="Invite staff"
        >
          <Ionicons name="person-add-outline" size={18} color="#FFF" />
          <Text style={styles.inviteBtnText}>Invite</Text>
        </Pressable>
      </View>

      {/* Segmented Control */}
      <View style={styles.tabsContainer}>
        <SegmentedControl
          tabs={[{ key: 'staff', label: 'Staff' }, { key: 'roles', label: 'Roles' }]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </View>

      {/* Tab Content */}
      {activeTab === 'staff' ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Summary Row */}
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { backgroundColor: theme.surface }]}>
              <Text style={[styles.summaryValue, { color: theme.text }]}>{staffCounts.total}</Text>
              <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Total</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: theme.successLight }]}>
              <Text style={[styles.summaryValue, { color: theme.success }]}>{staffCounts.active}</Text>
              <Text style={[styles.summaryLabel, { color: theme.success }]}>Active</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: theme.warningLight }]}>
              <Text style={[styles.summaryValue, { color: theme.warning }]}>{staffCounts.invited}</Text>
              <Text style={[styles.summaryLabel, { color: theme.warning }]}>Invited</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: theme.dangerLight }]}>
              <Text style={[styles.summaryValue, { color: theme.danger }]}>{staffCounts.suspended}</Text>
              <Text style={[styles.summaryLabel, { color: theme.danger }]} numberOfLines={1}>Blocked</Text>
            </View>
          </View>

          {/* Search */}
          <SearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search staff..."
          />

          {/* Filter Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
            <Chip label="All" isActive={staffFilter === 'all'} onPress={() => setStaffFilter('all')} count={staffCounts.total} />
            <Chip label="Active" isActive={staffFilter === 'active'} onPress={() => setStaffFilter('active')} count={staffCounts.active} />
            <Chip label="Invited" isActive={staffFilter === 'invited'} onPress={() => setStaffFilter('invited')} count={staffCounts.invited} />
            <Chip label="Suspended" isActive={staffFilter === 'suspended'} onPress={() => setStaffFilter('suspended')} count={staffCounts.suspended} />
          </ScrollView>

          {/* Staff List */}
          {filteredStaff.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title="No staff found"
              subtitle={searchQuery ? 'Try a different search term' : 'Invite team members to get started'}
              actionLabel={searchQuery ? undefined : 'Invite Staff'}
              onAction={searchQuery ? undefined : () => setShowInviteModal(true)}
            />
          ) : (
            filteredStaff.map((s) => (
              <StaffCard
                key={s.id}
                staff={s}
                roleName={getRoleName(s.roleId)}
                onPress={() => {
                  setSelectedStaff(s);
                  setShowStaffDetails(true);
                }}
                onMenuPress={() => setStaffMenuTarget(s)}
              />
            ))
          )}
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Create Role Button */}
          <Pressable
            style={[styles.createRoleBtn, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}
            onPress={() => openRoleEditor(null)}
            accessibilityLabel="Create new role"
          >
            <Ionicons name="add-circle-outline" size={20} color={theme.primary} />
            <Text style={[styles.createRoleBtnText, { color: theme.primary }]}>Create New Role</Text>
          </Pressable>

          {/* Roles List */}
          {roles.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              assignedCount={getStaffCountForRole(role.id)}
              onPress={() => openRoleEditor(role)}
            />
          ))}

          {/* Compliance Info Card */}
          <ComplianceInfoCard />
        </ScrollView>
      )}

      {/* Staff Action Menu */}
      <BottomSheet
        visible={!!staffMenuTarget}
        onClose={() => setStaffMenuTarget(null)}
        title={staffMenuTarget?.fullName}
        subtitle={staffMenuTarget ? getRoleName(staffMenuTarget.roleId) : ''}
      >
        {staffMenuTarget && (
          <View style={styles.menuSheet}>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setSelectedStaff(staffMenuTarget);
                setStaffMenuTarget(null);
                setShowStaffDetails(true);
              }}
            >
              <Ionicons name="person-outline" size={20} color={theme.text} />
              <Text style={[styles.menuItemText, { color: theme.text }]}>View Details</Text>
            </Pressable>
            {staffMenuTarget.status !== 'suspended' && (
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  setSelectedStaff(staffMenuTarget);
                  setStaffMenuTarget(null);
                  setShowChangeRole(true);
                }}
              >
                <Ionicons name="swap-horizontal-outline" size={20} color={theme.text} />
                <Text style={[styles.menuItemText, { color: theme.text }]}>Change Role</Text>
              </Pressable>
            )}
            {staffMenuTarget.status === 'invited' && (
              <Pressable style={styles.menuItem} onPress={() => handleResendInvite(staffMenuTarget)}>
                <Ionicons name="mail-outline" size={20} color={theme.text} />
                <Text style={[styles.menuItemText, { color: theme.text }]}>Resend Invite</Text>
              </Pressable>
            )}
            {staffMenuTarget.status === 'active' && (
              <Pressable style={styles.menuItem} onPress={() => handleSuspendStaff(staffMenuTarget)}>
                <Ionicons name="pause-circle-outline" size={20} color={theme.warning} />
                <Text style={[styles.menuItemText, { color: theme.warning }]}>Suspend</Text>
              </Pressable>
            )}
            {staffMenuTarget.status === 'suspended' && (
              <Pressable style={styles.menuItem} onPress={() => handleReactivateStaff(staffMenuTarget)}>
                <Ionicons name="play-circle-outline" size={20} color={theme.success} />
                <Text style={[styles.menuItemText, { color: theme.success }]}>Reactivate</Text>
              </Pressable>
            )}
            <Pressable style={styles.menuItem} onPress={() => handleRemoveStaff(staffMenuTarget)}>
              <Ionicons name="trash-outline" size={20} color={theme.danger} />
              <Text style={[styles.menuItemText, { color: theme.danger }]}>Remove</Text>
            </Pressable>
          </View>
        )}
      </BottomSheet>

      {/* Staff Details Sheet */}
      <BottomSheet
        visible={showStaffDetails && !!selectedStaff}
        onClose={() => {
          setShowStaffDetails(false);
          setSelectedStaff(null);
        }}
        title="Staff Details"
      >
        {selectedStaff && (
          <View style={styles.detailsSheet}>
            <View style={styles.detailsHeader}>
              <Avatar initials={selectedStaff.avatarInitials} size={64} muted={selectedStaff.status === 'suspended'} />
              <View style={styles.detailsHeaderInfo}>
                <Text style={[styles.detailsName, { color: theme.text }]}>{selectedStaff.fullName}</Text>
                <StatusPill status={selectedStaff.status} />
              </View>
            </View>
            <View style={styles.detailsRow}>
              <Text style={[styles.detailsLabel, { color: theme.textMuted }]}>Contact</Text>
              <Text style={[styles.detailsValue, { color: theme.text }]}>{selectedStaff.phoneOrEmail}</Text>
            </View>
            <View style={styles.detailsRow}>
              <Text style={[styles.detailsLabel, { color: theme.textMuted }]}>Role</Text>
              <Pressable
                style={styles.detailsRoleRow}
                onPress={() => {
                  if (selectedStaff.status !== 'suspended') {
                    setShowStaffDetails(false);
                    setShowChangeRole(true);
                  }
                }}
              >
                <Text style={[styles.detailsValue, { color: theme.primary }]}>{getRoleName(selectedStaff.roleId)}</Text>
                {selectedStaff.status !== 'suspended' && (
                  <Ionicons name="chevron-forward" size={16} color={theme.primary} />
                )}
              </Pressable>
            </View>
            <View style={styles.detailsRow}>
              <Text style={[styles.detailsLabel, { color: theme.textMuted }]}>Added</Text>
              <Text style={[styles.detailsValue, { color: theme.text }]}>{formatDate(selectedStaff.createdAt)}</Text>
            </View>
            {selectedStaff.lastActiveAt && (
              <View style={styles.detailsRow}>
                <Text style={[styles.detailsLabel, { color: theme.textMuted }]}>Last Active</Text>
                <Text style={[styles.detailsValue, { color: theme.text }]}>{formatDateTime(selectedStaff.lastActiveAt)}</Text>
              </View>
            )}
            <View style={styles.detailsActions}>
              {selectedStaff.status === 'suspended' ? (
                <Pressable
                  style={[styles.detailsActionBtn, { backgroundColor: theme.successLight }]}
                  onPress={() => handleReactivateStaff(selectedStaff)}
                >
                  <Ionicons name="play-circle-outline" size={18} color={theme.success} />
                  <Text style={[styles.detailsActionBtnText, { color: theme.success }]}>Reactivate</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.detailsActionBtn, { backgroundColor: theme.warningLight }]}
                  onPress={() => handleSuspendStaff(selectedStaff)}
                >
                  <Ionicons name="pause-circle-outline" size={18} color={theme.warning} />
                  <Text style={[styles.detailsActionBtnText, { color: theme.warning }]}>Suspend</Text>
                </Pressable>
              )}
              <Pressable
                style={[styles.detailsActionBtn, { backgroundColor: theme.dangerLight }]}
                onPress={() => handleRemoveStaff(selectedStaff)}
              >
                <Ionicons name="trash-outline" size={18} color={theme.danger} />
                <Text style={[styles.detailsActionBtnText, { color: theme.danger }]}>Remove</Text>
              </Pressable>
            </View>
          </View>
        )}
      </BottomSheet>

      {/* Change Role Sheet */}
      <BottomSheet
        visible={showChangeRole && !!selectedStaff}
        onClose={() => {
          setShowChangeRole(false);
          setSelectedStaff(null);
        }}
        title="Change Role"
        subtitle={selectedStaff?.fullName}
      >
        <View style={styles.rolePickerSheet}>
          {roles.map((role) => {
            const isSelected = selectedStaff?.roleId === role.id;
            return (
              <Pressable
                key={role.id}
                style={[
                  styles.rolePickerItem,
                  { backgroundColor: isSelected ? theme.primaryLight : theme.surface, borderColor: isSelected ? theme.primary : theme.border },
                ]}
                onPress={() => {
                  if (selectedStaff && role.id !== selectedStaff.roleId) {
                    handleChangeRole(selectedStaff, role.id);
                  }
                }}
              >
                <View style={styles.rolePickerItemContent}>
                  <Text style={[styles.rolePickerItemName, { color: theme.text }]}>{role.name}</Text>
                  <Text style={[styles.rolePickerItemDesc, { color: theme.textMuted }]} numberOfLines={1}>
                    {role.description}
                  </Text>
                </View>
                <View style={[
                  styles.rolePickerRadio,
                  { borderColor: isSelected ? theme.primary : theme.border, backgroundColor: isSelected ? theme.primary : 'transparent' },
                ]}>
                  {isSelected && <View style={styles.rolePickerRadioInner} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>

      {/* Invite Staff Modal */}
      <BottomSheet
        visible={showInviteModal}
        onClose={() => {
          setShowInviteModal(false);
          setInviteName('');
          setInviteContact('');
          setInviteRoleId('role_gate_attendant');
        }}
        title="Invite Staff"
        subtitle="Add a new team member"
      >
        <View style={styles.inviteSheet}>
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.text }]}>Full Name *</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: theme.borderLight, color: theme.text }]}
              value={inviteName}
              onChangeText={setInviteName}
              placeholder="Enter full name"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="words"
              accessibilityLabel="Full name"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.text }]}>Phone or Email *</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: theme.borderLight, color: theme.text }]}
              value={inviteContact}
              onChangeText={setInviteContact}
              placeholder="Enter phone or email"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              accessibilityLabel="Phone or email"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.text }]}>Role</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {roles.map((role) => (
                <Pressable
                  key={role.id}
                  style={[
                    styles.roleChip,
                    { backgroundColor: inviteRoleId === role.id ? theme.primary : theme.borderLight },
                  ]}
                  onPress={() => setInviteRoleId(role.id)}
                >
                  <Text style={[styles.roleChipText, { color: inviteRoleId === role.id ? '#FFF' : theme.text }]}>
                    {role.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <Pressable
            style={[
              styles.inviteSubmitBtn,
              { backgroundColor: inviteName.trim() && inviteContact.trim() ? theme.primary : theme.borderLight },
            ]}
            onPress={handleInviteStaff}
            disabled={!inviteName.trim() || !inviteContact.trim()}
            accessibilityLabel="Send invite"
          >
            <Ionicons name="paper-plane-outline" size={18} color={inviteName.trim() && inviteContact.trim() ? '#FFF' : theme.textMuted} />
            <Text style={[
              styles.inviteSubmitBtnText,
              { color: inviteName.trim() && inviteContact.trim() ? '#FFF' : theme.textMuted },
            ]}>
              Send Invite
            </Text>
          </Pressable>
        </View>
      </BottomSheet>

      {/* Role Editor Sheet */}
      <BottomSheet
        visible={showRoleEditor}
        onClose={() => {
          setShowRoleEditor(false);
          setSelectedRole(null);
        }}
        title={isCreatingRole ? 'Create Role' : 'Edit Role'}
        subtitle={selectedRole?.isSystemRole ? 'System role (limited editing)' : undefined}
      >
        <View style={styles.roleEditorSheet}>
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.text }]}>Role Name *</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: theme.borderLight, color: theme.text }]}
              value={editRoleName}
              onChangeText={setEditRoleName}
              placeholder="Enter role name"
              placeholderTextColor={theme.textMuted}
              editable={!selectedRole?.isSystemRole}
              accessibilityLabel="Role name"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.text }]}>Description</Text>
            <TextInput
              style={[styles.textInput, styles.textAreaInput, { backgroundColor: theme.borderLight, color: theme.text }]}
              value={editRoleDesc}
              onChangeText={setEditRoleDesc}
              placeholder="Describe this role"
              placeholderTextColor={theme.textMuted}
              multiline
              numberOfLines={2}
              editable={!selectedRole?.isSystemRole}
              accessibilityLabel="Role description"
            />
          </View>

          {selectedRole && (
            <View style={[styles.assignedInfo, { backgroundColor: theme.infoLight }]}>
              <Ionicons name="people-outline" size={16} color={theme.info} />
              <Text style={[styles.assignedInfoText, { color: theme.info }]}>
                Assigned to {getStaffCountForRole(selectedRole.id)} staff member(s)
              </Text>
            </View>
          )}

          <Text style={[styles.permissionsTitle, { color: theme.text }]}>Permissions</Text>
          <Pressable
            style={styles.clearAllBtn}
            onPress={() => setEditRolePerms([])}
            disabled={selectedRole?.isSystemRole}
          >
            <Text style={[styles.clearAllBtnText, { color: selectedRole?.isSystemRole ? theme.textMuted : theme.danger }]}>
              Clear All
            </Text>
          </Pressable>

          {PERMISSION_GROUPS.map((group) => (
            <PermissionGroupToggle
              key={group.id}
              group={group}
              selectedPermissions={editRolePerms}
              onToggle={selectedRole?.isSystemRole ? () => {} : togglePermission}
              onSelectAll={() => !selectedRole?.isSystemRole && selectAllInGroup(group)}
              expanded={expandedGroups.includes(group.id)}
              onExpandToggle={() => toggleGroupExpanded(group.id)}
            />
          ))}

          <View style={styles.roleEditorActions}>
            {!isCreatingRole && selectedRole && (
              <Pressable
                style={[styles.duplicateBtn, { backgroundColor: theme.borderLight }]}
                onPress={() => {
                  setShowRoleEditor(false);
                  setTimeout(() => openRoleEditor(selectedRole, true), 300);
                }}
              >
                <Ionicons name="copy-outline" size={18} color={theme.text} />
                <Text style={[styles.duplicateBtnText, { color: theme.text }]}>Duplicate</Text>
              </Pressable>
            )}
            <Pressable
              style={[
                styles.saveRoleBtn,
                { backgroundColor: editRoleName.trim().length >= 3 && editRolePerms.length > 0 ? theme.primary : theme.borderLight },
              ]}
              onPress={handleSaveRole}
              disabled={editRoleName.trim().length < 3 || editRolePerms.length === 0 || selectedRole?.isSystemRole}
            >
              <Ionicons
                name="checkmark"
                size={18}
                color={editRoleName.trim().length >= 3 && editRolePerms.length > 0 && !selectedRole?.isSystemRole ? '#FFF' : theme.textMuted}
              />
              <Text style={[
                styles.saveRoleBtnText,
                { color: editRoleName.trim().length >= 3 && editRolePerms.length > 0 && !selectedRole?.isSystemRole ? '#FFF' : theme.textMuted },
              ]}>
                {isCreatingRole ? 'Create' : 'Save'}
              </Text>
            </Pressable>
          </View>

          {!isCreatingRole && selectedRole && !selectedRole.isSystemRole && (
            <View style={[styles.dangerZone, { borderColor: theme.danger }]}>
              <Text style={[styles.dangerZoneTitle, { color: theme.danger }]}>Danger Zone</Text>
              <Pressable
                style={[styles.deleteRoleBtn, { backgroundColor: theme.dangerLight }]}
                onPress={() => handleDeleteRole(selectedRole)}
              >
                <Ionicons name="trash-outline" size={18} color={theme.danger} />
                <Text style={[styles.deleteRoleBtnText, { color: theme.danger }]}>Delete Role</Text>
              </Pressable>
            </View>
          )}
        </View>
      </BottomSheet>

      {/* Reassignment Modal */}
      <BottomSheet
        visible={!!reassignmentTarget}
        onClose={() => setReassignmentTarget(null)}
        title="Reassign Staff"
        subtitle="Select a new role before deleting"
      >
        {reassignmentTarget && (
          <View style={styles.reassignSheet}>
            <Text style={[styles.reassignInfo, { color: theme.textSecondary }]}>
              {getStaffCountForRole(reassignmentTarget.roleId)} staff member(s) are assigned to this role.
              Please select another role to move them to.
            </Text>
            {roles
              .filter(r => r.id !== reassignmentTarget.roleId)
              .map((role) => {
                const isSelected = reassignmentTarget.newRoleId === role.id;
                return (
                  <Pressable
                    key={role.id}
                    style={[
                      styles.rolePickerItem,
                      { backgroundColor: isSelected ? theme.primaryLight : theme.surface, borderColor: isSelected ? theme.primary : theme.border },
                    ]}
                    onPress={() => setReassignmentTarget({ ...reassignmentTarget, newRoleId: role.id })}
                  >
                    <View style={styles.rolePickerItemContent}>
                      <Text style={[styles.rolePickerItemName, { color: theme.text }]}>{role.name}</Text>
                      <Text style={[styles.rolePickerItemDesc, { color: theme.textMuted }]} numberOfLines={1}>
                        {role.description}
                      </Text>
                    </View>
                    <View style={[
                      styles.rolePickerRadio,
                      { borderColor: isSelected ? theme.primary : theme.border, backgroundColor: isSelected ? theme.primary : 'transparent' },
                    ]}>
                      {isSelected && <View style={styles.rolePickerRadioInner} />}
                    </View>
                  </Pressable>
                );
              })}
            <Pressable
              style={[
                styles.reassignConfirmBtn,
                { backgroundColor: reassignmentTarget.newRoleId ? theme.danger : theme.borderLight },
              ]}
              onPress={handleReassignAndDelete}
              disabled={!reassignmentTarget.newRoleId}
            >
              <Text style={[styles.reassignConfirmBtnText, { color: reassignmentTarget.newRoleId ? '#FFF' : theme.textMuted }]}>
                Reassign & Delete Role
              </Text>
            </Pressable>
          </View>
        )}
      </BottomSheet>

      {/* Confirm Dialog */}
      {confirmDialog && (
        <ConfirmDialog
          visible={confirmDialog.visible}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          destructive={confirmDialog.destructive}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {/* Toast */}
      <Toast message={toast?.message ?? ''} visible={!!toast} type={toast?.type} />
    </SafeAreaView>
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    gap: spacing[2],
  },
  errorBannerText: {
    flex: 1,
    fontSize: fontSize.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[3],
  },
  headerLeft: {
    flex: 1,
    marginRight: spacing[3],
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: fontWeight.bold as any,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
  },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2] + 2,
    borderRadius: borderRadius.lg,
    gap: spacing[1],
    minHeight: 44,
  },
  inviteBtnText: {
    color: '#FFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
  },
  tabsContainer: {
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[3],
  },
  segmentedContainer: {
    flexDirection: 'row',
    borderRadius: borderRadius.lg,
    padding: 4,
  },
  segmentedTab: {
    flex: 1,
    paddingVertical: spacing[2] + 2,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  segmentedTabActive: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  segmentedTabText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  segmentedTabTextActive: {
    fontWeight: fontWeight.semibold as any,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[8],
  },
  summaryRow: {
    flexDirection: 'row',
    marginBottom: spacing[4],
    marginHorizontal: -spacing[1],
  },
  summaryCard: {
    flex: 1,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[2],
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing[1],
    minWidth: 70,
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
  summaryValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold as any,
    textAlign: 'center',
  },
  summaryLabel: {
    fontSize: fontSize.xs,
    marginTop: 2,
    textAlign: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    gap: spacing[2],
    marginBottom: spacing[3],
    minHeight: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    paddingVertical: 0,
  },
  filterRow: {
    marginBottom: spacing[4],
    marginHorizontal: -spacing[5],
    paddingHorizontal: spacing[5],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    marginRight: spacing[2],
    gap: spacing[1],
    minHeight: 36,
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  chipBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  chipBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: fontWeight.bold as any,
  },
  staffCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[4],
    borderRadius: borderRadius.lg,
    marginBottom: spacing[3],
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
  staffCardPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  staffCardContent: {
    flex: 1,
    flexShrink: 1,
    marginLeft: spacing[3],
    marginRight: spacing[2],
  },
  staffCardRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    marginBottom: 4,
  },
  staffCardName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
    flex: 1,
    flexShrink: 1,
    marginRight: spacing[2],
  },
  staffCardRole: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    marginBottom: 2,
  },
  staffCardMeta: {
    fontSize: fontSize.xs,
  },
  staffCardPending: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
    marginTop: 4,
  },
  staffCardMenu: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  statusPill: {
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    flexShrink: 0,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: fontWeight.semibold as any,
  },
  avatar: {
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontWeight: fontWeight.semibold as any,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[4],
    borderRadius: borderRadius.lg,
    marginBottom: spacing[3],
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
  roleCardPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  roleCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  roleCardContent: {
    flex: 1,
    marginLeft: spacing[3],
    marginRight: spacing[2],
  },
  roleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: 2,
  },
  roleCardName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
    flexShrink: 1,
  },
  systemBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    flexShrink: 0,
  },
  systemBadgeText: {
    fontSize: 11,
    fontWeight: fontWeight.semibold as any,
  },
  roleCardDesc: {
    fontSize: fontSize.sm,
    marginBottom: 2,
    lineHeight: 18,
  },
  roleCardStatText: {
    fontSize: fontSize.xs,
  },
  roleCardChevron: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  createRoleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[4],
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    marginBottom: spacing[4],
    gap: spacing[2],
    minHeight: 56,
  },
  createRoleBtnText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing[10],
  },
  emptyStateIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  emptyStateTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[2],
  },
  emptyStateSubtitle: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing[4],
  },
  emptyStateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    gap: spacing[2],
    minHeight: 48,
  },
  emptyStateBtnText: {
    color: '#FFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  complianceCard: {
    padding: spacing[4],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginTop: spacing[4],
  },
  complianceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[2],
  },
  complianceCardTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  complianceCardText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginBottom: spacing[3],
  },
  complianceCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[2] + 2,
    borderRadius: borderRadius.md,
    gap: spacing[2],
    minHeight: 44,
  },
  complianceCardBtnText: {
    color: '#FFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
  },
  // Toast
  toast: {
    position: 'absolute',
    top: 60,
    left: spacing[5],
    right: spacing[5],
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    gap: spacing[2],
    zIndex: 9999,
  },
  toastText: {
    color: '#FFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    flex: 1,
  },
  // Confirm Dialog
  dialogBackdrop: {
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
    padding: spacing[5],
  },
  dialogContainer: {
    width: '100%',
    maxWidth: 340,
    borderRadius: borderRadius.xl,
    padding: spacing[5],
  },
  dialogTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[2],
  },
  dialogMessage: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginBottom: spacing[5],
  },
  dialogActions: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  dialogButton: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: borderRadius.md,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  dialogButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  // Bottom Sheet
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: SCREEN_HEIGHT * 0.85,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: {
        elevation: 24,
      },
    }),
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#D1D5DB',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing[3],
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    paddingBottom: spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  sheetTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
  },
  sheetSubtitle: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  sheetCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Menu Sheet
  menuSheet: {
    padding: spacing[2],
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    gap: spacing[3],
    minHeight: 48,
  },
  menuItemText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium as any,
  },
  // Details Sheet
  detailsSheet: {
    padding: spacing[4],
  },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[5],
    gap: spacing[4],
  },
  detailsHeaderInfo: {
    flex: 1,
    gap: spacing[2],
  },
  detailsName: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold as any,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  detailsLabel: {
    fontSize: fontSize.sm,
  },
  detailsValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  detailsRoleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailsActions: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[5],
  },
  detailsActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    borderRadius: borderRadius.md,
    gap: spacing[2],
    minHeight: 48,
  },
  detailsActionBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
  },
  // Role Picker Sheet
  rolePickerSheet: {
    padding: spacing[4],
    gap: spacing[3],
  },
  rolePickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[4],
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    gap: spacing[3],
  },
  rolePickerItemContent: {
    flex: 1,
  },
  rolePickerItemName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
    marginBottom: 2,
  },
  rolePickerItemDesc: {
    fontSize: fontSize.sm,
  },
  rolePickerRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rolePickerRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFF',
  },
  // Invite Sheet
  inviteSheet: {
    padding: spacing[4],
  },
  inputGroup: {
    marginBottom: spacing[4],
  },
  inputLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    marginBottom: spacing[2],
  },
  textInput: {
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    fontSize: fontSize.base,
    minHeight: 48,
  },
  textAreaInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  roleChip: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    marginRight: spacing[2],
    minHeight: 40,
    justifyContent: 'center',
  },
  roleChipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  inviteSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    gap: spacing[2],
    marginTop: spacing[2],
    minHeight: 52,
  },
  inviteSubmitBtnText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  // Role Editor Sheet
  roleEditorSheet: {
    padding: spacing[4],
  },
  assignedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    borderRadius: borderRadius.md,
    gap: spacing[2],
    marginBottom: spacing[4],
  },
  assignedInfoText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  permissionsTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[2],
  },
  clearAllBtn: {
    alignSelf: 'flex-end',
    marginBottom: spacing[3],
  },
  clearAllBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  permGroup: {
    borderRadius: borderRadius.lg,
    marginBottom: spacing[3],
    overflow: 'hidden',
  },
  permGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing[3],
    minHeight: 48,
  },
  permGroupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  permGroupLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
  },
  permGroupCount: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  permGroupCountText: {
    fontSize: 11,
    fontWeight: fontWeight.semibold as any,
  },
  permGroupHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  permGroupSelectAll: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  permGroupItems: {
    paddingHorizontal: spacing[3],
    paddingBottom: spacing[3],
    gap: spacing[2],
  },
  permItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    borderRadius: borderRadius.md,
    gap: spacing[3],
    minHeight: 52,
  },
  permItemContent: {
    flex: 1,
  },
  permItemLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    marginBottom: 2,
  },
  permItemDesc: {
    fontSize: fontSize.xs,
  },
  permItemCheck: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleEditorActions: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[4],
  },
  duplicateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    gap: spacing[2],
    minHeight: 52,
  },
  duplicateBtnText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  saveRoleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    gap: spacing[2],
    minHeight: 52,
  },
  saveRoleBtnText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  dangerZone: {
    marginTop: spacing[6],
    padding: spacing[4],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  dangerZoneTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[3],
  },
  deleteRoleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    borderRadius: borderRadius.md,
    gap: spacing[2],
    minHeight: 48,
  },
  deleteRoleBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
  },
  // Reassign Sheet
  reassignSheet: {
    padding: spacing[4],
    gap: spacing[3],
  },
  reassignInfo: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginBottom: spacing[2],
  },
  reassignConfirmBtn: {
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    marginTop: spacing[3],
    minHeight: 52,
    justifyContent: 'center',
  },
  reassignConfirmBtnText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
});
