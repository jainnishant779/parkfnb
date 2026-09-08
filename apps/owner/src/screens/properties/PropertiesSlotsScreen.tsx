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
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import { KpiCard as DashboardKpiCard } from '../../components/dashboard';

// ============================================================================
// DESIGN TOKENS
// ============================================================================

const COLORS = {
  // Primary
  primary: '#0D7377',
  primaryLight: '#E8F5F4',
  primaryDark: '#0A5C5F',

  // Neutral
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  text: '#1E293B',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',

  // Status
  success: '#10B981',
  successLight: '#ECFDF5',
  warning: '#F59E0B',
  warningLight: '#FFFBEB',
  danger: '#EF4444',
  dangerLight: '#FEF2F2',
  info: '#0D7377',
  infoLight: '#E8F5F4',

  // Slot Status
  available: '#10B981',
  availableLight: '#ECFDF5',
  occupied: '#F59E0B',
  occupiedLight: '#FFFBEB',
  blocked: '#EF4444',
  blockedLight: '#FEF2F2',
  maintenance: '#8B5CF6',
  maintenanceLight: '#F5F3FF',

  // Zone Types
  resident: '#0D7377',
  visitor: '#10B981',
  staff: '#F59E0B',
  mixed: '#8B5CF6',

  // Common
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0, 0, 0, 0.5)',
};

const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

const RADIUS = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  full: 9999,
};

const FONT = {
  xs: 11,
  sm: 13,
  base: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 28,
};

const FONT_WEIGHT = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type VehicleType = 'car' | 'bike' | 'suv' | 'van' | 'truck';
type SlotStatus = 'available' | 'occupied' | 'blocked' | 'maintenance';
type ZoneType = 'resident' | 'visitor' | 'staff' | 'mixed';
type TabType = 'slots' | 'zones' | 'rules';
type SortOption = 'label' | 'status' | 'updated';

interface SizeLimit {
  lengthM?: number;
  widthM?: number;
  heightM?: number;
}

interface Slot {
  id: string;
  label: string;
  status: SlotStatus;
  isActive: boolean;
  allowedVehicleTypes: VehicleType[];
  sizeLimit?: SizeLimit;
  notes?: string;
  pricingHint?: string;
  createdAt: number;
  updatedAt: number;
}

interface Zone {
  id: string;
  name: string;
  type: ZoneType;
  level?: string;
  createdAt: number;
  updatedAt: number;
  slots: Slot[];
}

interface PropertyRules {
  allowedVehicleTypesDefault: VehicleType[];
  sizeLimitDefault?: SizeLimit;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  bookingMode: 'manual' | 'instant';
  residentOnly: boolean;
}

interface Property {
  id: string;
  name: string;
  addressLine?: string;
  city?: string;
  createdAt: number;
  updatedAt: number;
  zones: Zone[];
  rules?: PropertyRules;
}

interface SlotFilters {
  status: SlotStatus | 'all';
  zoneId: string | 'all';
  searchQuery: string;
  sortBy: SortOption;
}

interface UIPreferences {
  lastSelectedPropertyId: string | null;
  lastSelectedTab: TabType;
  lastSlotFilters: SlotFilters;
}

interface ToastState {
  visible: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ConfirmModalState {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmType: 'danger' | 'primary';
  onConfirm: () => void;
}

// ============================================================================
// STORAGE KEYS & DEFAULTS
// ============================================================================

const STORAGE_KEYS = {
  PROPERTIES: '@ownerapp/properties_v1',
  UI_PREFS: '@ownerapp/properties_ui_prefs_v1',
};

const DEFAULT_FILTERS: SlotFilters = {
  status: 'all',
  zoneId: 'all',
  searchQuery: '',
  sortBy: 'label',
};

const DEFAULT_UI_PREFS: UIPreferences = {
  lastSelectedPropertyId: null,
  lastSelectedTab: 'slots',
  lastSlotFilters: DEFAULT_FILTERS,
};

const DEFAULT_RULES: PropertyRules = {
  allowedVehicleTypesDefault: ['car', 'bike', 'suv'],
  sizeLimitDefault: { lengthM: 5.5, widthM: 2.5, heightM: 2.2 },
  minDurationMinutes: 30,
  maxDurationMinutes: 1440,
  bookingMode: 'instant',
  residentOnly: false,
};

const ALL_VEHICLE_TYPES: VehicleType[] = ['car', 'bike', 'suv', 'van', 'truck'];

// ============================================================================
// MOCK SEED DATA
// ============================================================================

const generateId = () => `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const createSlot = (
  label: string,
  status: SlotStatus = 'available',
  vehicleTypes: VehicleType[] = ['car', 'bike', 'suv']
): Slot => ({
  id: generateId(),
  label,
  status,
  isActive: status !== 'maintenance',
  allowedVehicleTypes: vehicleTypes,
  sizeLimit: undefined,
  notes: '',
  pricingHint: '',
  createdAt: Date.now() - Math.random() * 86400000 * 30,
  updatedAt: Date.now() - Math.random() * 86400000 * 7,
});

const createZone = (
  name: string,
  type: ZoneType,
  level: string,
  slotPrefix: string,
  slotCount: number
): Zone => {
  const statuses: SlotStatus[] = ['available', 'available', 'available', 'occupied', 'blocked', 'maintenance'];
  const slots: Slot[] = [];

  for (let i = 1; i <= slotCount; i++) {
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    slots.push(createSlot(`${slotPrefix}-${i.toString().padStart(2, '0')}`, status));
  }

  return {
    id: generateId(),
    name,
    type,
    level,
    createdAt: Date.now() - Math.random() * 86400000 * 60,
    updatedAt: Date.now() - Math.random() * 86400000 * 14,
    slots,
  };
};

const SEED_PROPERTIES: Property[] = [
  {
    id: 'prop_1',
    name: 'Sunrise Residency',
    addressLine: '123 MG Road, Sector 15',
    city: 'Gurugram',
    createdAt: Date.now() - 86400000 * 90,
    updatedAt: Date.now() - 86400000 * 2,
    zones: [
      createZone('Basement Level 1', 'resident', 'B1', 'B1', 4),
      createZone('Basement Level 2', 'resident', 'B2', 'B2', 3),
      createZone('Visitor Parking', 'visitor', 'G', 'V', 2),
    ],
    rules: { ...DEFAULT_RULES },
  },
  {
    id: 'prop_2',
    name: 'Green Valley Apartments',
    addressLine: '456 Palm Avenue',
    city: 'Noida',
    createdAt: Date.now() - 86400000 * 60,
    updatedAt: Date.now() - 86400000 * 5,
    zones: [
      createZone('Tower A - Underground', 'mixed', 'UG', 'A', 4),
      createZone('Staff Parking', 'staff', 'G', 'S', 2),
    ],
    rules: { ...DEFAULT_RULES, residentOnly: true },
  },
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const getSlotStatusColor = (status: SlotStatus) => {
  switch (status) {
    case 'available': return COLORS.available;
    case 'occupied': return COLORS.occupied;
    case 'blocked': return COLORS.blocked;
    case 'maintenance': return COLORS.maintenance;
  }
};

const getSlotStatusBg = (status: SlotStatus) => {
  switch (status) {
    case 'available': return COLORS.availableLight;
    case 'occupied': return COLORS.occupiedLight;
    case 'blocked': return COLORS.blockedLight;
    case 'maintenance': return COLORS.maintenanceLight;
  }
};

const getZoneTypeColor = (type: ZoneType) => {
  switch (type) {
    case 'resident': return COLORS.resident;
    case 'visitor': return COLORS.visitor;
    case 'staff': return COLORS.staff;
    case 'mixed': return COLORS.mixed;
  }
};

const getVehicleIcon = (type: VehicleType) => {
  switch (type) {
    case 'car': return 'car-outline';
    case 'bike': return 'bicycle-outline';
    case 'suv': return 'car-sport-outline';
    case 'van': return 'bus-outline';
    case 'truck': return 'bus-outline';
  }
};

const formatSlotStatus = (status: SlotStatus) => {
  return status.charAt(0).toUpperCase() + status.slice(1);
};

const formatZoneType = (type: ZoneType) => {
  return type.charAt(0).toUpperCase() + type.slice(1);
};

// ============================================================================
// INLINE COMPONENTS
// ============================================================================

// Toast Component
const Toast = memo(({ visible, message, type, onHide, bottomOffset = 100 }: {
  visible: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
  onHide: () => void;
  bottomOffset?: number;
}) => {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(2500),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => onHide());
    }
  }, [visible]);

  if (!visible) return null;

  const bgColor = type === 'success' ? COLORS.success : type === 'error' ? COLORS.danger : COLORS.info;

  return (
    <Animated.View style={[styles.toast, { opacity, backgroundColor: bgColor, bottom: bottomOffset }]}>
      <Icon
        name={type === 'success' ? 'checkmark-circle' : type === 'error' ? 'alert-circle' : 'information-circle'}
        size={20}
        color={COLORS.white}
      />
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
});

// Error Banner
const ErrorBanner = memo(({ message, onDismiss }: { message: string; onDismiss: () => void }) => (
  <View style={styles.errorBanner}>
    <Icon name="warning-outline" size={18} color={COLORS.danger} />
    <Text style={styles.errorBannerText}>{message}</Text>
    <Pressable onPress={onDismiss} hitSlop={8}>
      <Icon name="close" size={18} color={COLORS.textSecondary} />
    </Pressable>
  </View>
));

// Card Component
const Card = memo(({ children, style, onPress }: {
  children: React.ReactNode;
  style?: any;
  onPress?: () => void;
}) => {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          style,
          pressed && styles.cardPressed,
        ]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
});

// Chip Component
const Chip = memo(({
  label,
  selected,
  onPress,
  color,
  size = 'medium',
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
  size?: 'small' | 'medium';
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.chip,
      size === 'small' && styles.chipSmall,
      selected && {
        backgroundColor: color || COLORS.primary,
        borderColor: color || COLORS.primary,
      },
      pressed && styles.chipPressed,
    ]}
    accessibilityRole="button"
    accessibilityState={{ selected }}
  >
    <Text style={[
      styles.chipText,
      size === 'small' && styles.chipTextSmall,
      selected && styles.chipTextSelected,
    ]}>
      {label}
    </Text>
  </Pressable>
));

// Status Pill
const StatusPill = memo(({ status }: { status: SlotStatus }) => (
  <View style={[styles.statusPill, { backgroundColor: getSlotStatusBg(status) }]}>
    <View style={[styles.statusDot, { backgroundColor: getSlotStatusColor(status) }]} />
    <Text style={[styles.statusPillText, { color: getSlotStatusColor(status) }]}>
      {formatSlotStatus(status)}
    </Text>
  </View>
));

// Zone Type Badge
const ZoneTypeBadge = memo(({ type }: { type: ZoneType }) => (
  <View style={[styles.zoneBadge, { backgroundColor: getZoneTypeColor(type) + '20' }]}>
    <Text style={[styles.zoneBadgeText, { color: getZoneTypeColor(type) }]}>
      {formatZoneType(type)}
    </Text>
  </View>
));

// Segmented Control
const SegmentedControl = memo(({
  options,
  selected,
  onChange
}: {
  options: { key: string; label: string }[];
  selected: string;
  onChange: (key: string) => void;
}) => {
  const selectedIndex = options.findIndex(o => o.key === selected);
  const [containerWidth, setContainerWidth] = useState(Dimensions.get('window').width - SPACING.lg * 2);
  const slideAnim = useRef(new Animated.Value(selectedIndex)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: selectedIndex,
      useNativeDriver: true,
      tension: 300,
      friction: 30,
    }).start();
  }, [selectedIndex]);

  const segmentWidth = (containerWidth - SPACING.xs * 2) / options.length;

  return (
    <View
      style={styles.segmentedControl}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[
          styles.segmentIndicator,
          {
            width: segmentWidth,
            transform: [{ translateX: Animated.multiply(slideAnim, segmentWidth) }],
          },
        ]}
      />
      {options.map((option) => (
        <Pressable
          key={option.key}
          onPress={() => onChange(option.key)}
          style={styles.segmentButton}
          accessibilityRole="tab"
          accessibilityState={{ selected: selected === option.key }}
          accessibilityLabel={option.label}
        >
          <Text style={[
            styles.segmentText,
            selected === option.key && styles.segmentTextSelected,
          ]}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
});

// FAB Component
const FAB = memo(({ label, onPress, icon = 'add' }: {
  label: string;
  onPress: () => void;
  icon?: string;
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.fab,
      pressed && styles.fabPressed,
    ]}
    accessibilityRole="button"
    accessibilityLabel={label}
  >
    <Icon name={icon} size={24} color={COLORS.white} />
    <Text style={styles.fabText}>{label}</Text>
  </Pressable>
));

// Modal Sheet
const ModalSheet = memo(({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) => {
  const insets = useSafeAreaInsets();

  return visible ? (

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + SPACING.lg }]}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <Icon name="close" size={24} color={COLORS.textSecondary} />
            </Pressable>
          </View>
          <ScrollView
            style={styles.modalContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    
    ) : null;
});

// Confirm Modal
const ConfirmModal = memo(({
  visible,
  title,
  message,
  confirmLabel,
  confirmType,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmType: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}) =>
  visible ? (

    <View style={styles.confirmOverlay}>
      <View style={styles.confirmBox}>
        <Text style={styles.confirmTitle}>{title}</Text>
        <Text style={styles.confirmMessage}>{message}</Text>
        <View style={styles.confirmActions}>
          <Pressable
            onPress={onCancel}
            style={[styles.confirmButton, styles.confirmButtonCancel]}
          >
            <Text style={styles.confirmButtonCancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            style={[
              styles.confirmButton,
              { backgroundColor: confirmType === 'danger' ? COLORS.danger : COLORS.primary }
            ]}
          >
            <Text style={styles.confirmButtonText}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  
  ) : null);

// Form Input
const FormInput = memo(({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric';
  error?: string;
}) => (
  <View style={styles.formGroup}>
    <Text style={styles.formLabel}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={COLORS.textMuted}
      style={[
        styles.formInput,
        multiline && styles.formInputMultiline,
        error && styles.formInputError,
      ]}
      multiline={multiline}
      keyboardType={keyboardType}
    />
    {error && <Text style={styles.formError}>{error}</Text>}
  </View>
));

// Form Toggle
const FormToggle = memo(({
  label,
  value,
  onValueChange,
  description,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  description?: string;
}) => (
  <View style={styles.formToggleRow}>
    <View style={styles.formToggleLabels}>
      <Text style={styles.formLabel}>{label}</Text>
      {description && <Text style={styles.formDescription}>{description}</Text>}
    </View>
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
      thumbColor={value ? COLORS.primary : COLORS.textMuted}
      accessibilityLabel={label}
    />
  </View>
));

// Empty State
const EmptyState = memo(({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: string;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) => (
  <View style={styles.emptyState}>
    <View style={styles.emptyIconContainer}>
      <Icon name={icon} size={48} color={COLORS.textMuted} />
    </View>
    <Text style={styles.emptyTitle}>{title}</Text>
    <Text style={styles.emptyMessage}>{message}</Text>
    {actionLabel && onAction && (
      <Pressable onPress={onAction} style={styles.emptyAction}>
        <Icon name="add-circle-outline" size={20} color={COLORS.primary} />
        <Text style={styles.emptyActionText}>{actionLabel}</Text>
      </Pressable>
    )}
  </View>
));

// ============================================================================
// SLOT CARD COMPONENT
// ============================================================================

const SlotCard = memo(({
  slot,
  zoneName,
  onToggleActive,
  onEdit,
  onBlock,
  onMaintenance,
}: {
  slot: Slot;
  zoneName: string;
  onToggleActive: () => void;
  onEdit: () => void;
  onBlock: () => void;
  onMaintenance: () => void;
}) => {
  const [showActions, setShowActions] = useState(false);

  return (
    <Card style={styles.slotCard}>
      <View style={styles.slotCardMain}>
        <View style={styles.slotCardLeft}>
          <Text style={styles.slotLabel}>{slot.label}</Text>
          <Text style={styles.slotZone}>{zoneName}</Text>
        </View>
        <View style={styles.slotCardRight}>
          <StatusPill status={slot.status} />
          <Switch
            value={slot.isActive}
            onValueChange={onToggleActive}
            trackColor={{ false: COLORS.border, true: COLORS.successLight }}
            thumbColor={slot.isActive ? COLORS.success : COLORS.textMuted}
            accessibilityLabel={`${slot.label} active toggle`}
            style={styles.slotToggle}
          />
        </View>
      </View>

      <View style={styles.slotCardSecondary}>
        <View style={styles.slotVehicleTypes}>
          {slot.allowedVehicleTypes.slice(0, 4).map((type) => (
            <Icon
              key={type}
              name={getVehicleIcon(type)}
              size={16}
              color={COLORS.textSecondary}
              style={styles.vehicleIcon}
            />
          ))}
          {slot.allowedVehicleTypes.length > 4 && (
            <Text style={styles.moreVehicles}>+{slot.allowedVehicleTypes.length - 4}</Text>
          )}
        </View>

        {slot.sizeLimit && (
          <Text style={styles.slotSizeInfo}>
            {slot.sizeLimit.lengthM}×{slot.sizeLimit.widthM}m
          </Text>
        )}

        {slot.notes && (
          <Text style={styles.slotNotes} numberOfLines={1}>{slot.notes}</Text>
        )}

        <Pressable
          onPress={() => setShowActions(!showActions)}
          style={styles.slotActionsBtn}
          hitSlop={8}
        >
          <Icon name="ellipsis-vertical" size={18} color={COLORS.textSecondary} />
        </Pressable>
      </View>

      {showActions && (
        <View style={styles.slotActions}>
          <Pressable onPress={() => { setShowActions(false); onEdit(); }} style={styles.slotActionItem}>
            <Icon name="create-outline" size={18} color={COLORS.primary} />
            <Text style={styles.slotActionText}>Edit</Text>
          </Pressable>
          <Pressable onPress={() => { setShowActions(false); onBlock(); }} style={styles.slotActionItem}>
            <Icon name={slot.status === 'blocked' ? 'lock-open-outline' : 'lock-closed-outline'} size={18} color={COLORS.danger} />
            <Text style={[styles.slotActionText, { color: COLORS.danger }]}>
              {slot.status === 'blocked' ? 'Unblock' : 'Block'}
            </Text>
          </Pressable>
          <Pressable onPress={() => { setShowActions(false); onMaintenance(); }} style={styles.slotActionItem}>
            <Icon name="construct-outline" size={18} color={COLORS.maintenance} />
            <Text style={[styles.slotActionText, { color: COLORS.maintenance }]}>Maintenance</Text>
          </Pressable>
        </View>
      )}
    </Card>
  );
});

// ============================================================================
// ZONE CARD COMPONENT
// ============================================================================

const ZoneCard = memo(({
  zone,
  onEdit,
  onManageSlots,
  onMoveUp,
  onMoveDown,
  isReordering,
  canMoveUp,
  canMoveDown,
}: {
  zone: Zone;
  onEdit: () => void;
  onManageSlots: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isReordering?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}) => {
  const slotCounts = useMemo(() => ({
    total: zone.slots.length,
    available: zone.slots.filter(s => s.status === 'available').length,
    occupied: zone.slots.filter(s => s.status === 'occupied').length,
    blocked: zone.slots.filter(s => s.status === 'blocked' || s.status === 'maintenance').length,
  }), [zone.slots]);

  return (
    <Card style={styles.zoneCard}>
      <View style={styles.zoneCardHeader}>
        <View style={styles.zoneCardTitleRow}>
          <Text style={styles.zoneName}>{zone.name}</Text>
          <ZoneTypeBadge type={zone.type} />
        </View>
        {zone.level && <Text style={styles.zoneLevel}>Level: {zone.level}</Text>}
      </View>

      <View style={styles.zoneSlotCounts}>
        <View style={styles.zoneCountItem}>
          <Text style={styles.zoneCountValue}>{slotCounts.total}</Text>
          <Text style={styles.zoneCountLabel}>Total</Text>
        </View>
        <View style={styles.zoneCountItem}>
          <Text style={[styles.zoneCountValue, { color: COLORS.success }]}>{slotCounts.available}</Text>
          <Text style={styles.zoneCountLabel}>Available</Text>
        </View>
        <View style={styles.zoneCountItem}>
          <Text style={[styles.zoneCountValue, { color: COLORS.warning }]}>{slotCounts.occupied}</Text>
          <Text style={styles.zoneCountLabel}>Occupied</Text>
        </View>
        <View style={styles.zoneCountItem}>
          <Text style={[styles.zoneCountValue, { color: COLORS.danger }]}>{slotCounts.blocked}</Text>
          <Text style={styles.zoneCountLabel}>Blocked</Text>
        </View>
      </View>

      <View style={styles.zoneCardActions}>
        {isReordering ? (
          <View style={styles.reorderControls}>
            <Pressable
              onPress={onMoveUp}
              disabled={!canMoveUp}
              style={[styles.reorderBtn, !canMoveUp && styles.reorderBtnDisabled]}
            >
              <Icon name="chevron-up" size={24} color={canMoveUp ? COLORS.primary : COLORS.textMuted} />
            </Pressable>
            <Pressable
              onPress={onMoveDown}
              disabled={!canMoveDown}
              style={[styles.reorderBtn, !canMoveDown && styles.reorderBtnDisabled]}
            >
              <Icon name="chevron-down" size={24} color={canMoveDown ? COLORS.primary : COLORS.textMuted} />
            </Pressable>
          </View>
        ) : (
          <>
            <Pressable onPress={onManageSlots} style={styles.zoneActionBtn}>
              <Icon name="grid-outline" size={18} color={COLORS.primary} />
              <Text style={styles.zoneActionText}>Manage Slots</Text>
            </Pressable>
            <Pressable onPress={onEdit} style={styles.zoneEditBtn}>
              <Icon name="create-outline" size={18} color={COLORS.textSecondary} />
            </Pressable>
          </>
        )}
      </View>
    </Card>
  );
});

// ============================================================================
// MAIN SCREEN COMPONENT
// ============================================================================

export default function PropertiesSlotsScreen() {
  const insets = useSafeAreaInsets();

  // Core State
  const [properties, setProperties] = useState<Property[]>(SEED_PROPERTIES);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(SEED_PROPERTIES[0]?.id || null);
  const [selectedTab, setSelectedTab] = useState<TabType>('slots');
  const [filters, setFilters] = useState<SlotFilters>(DEFAULT_FILTERS);
  const [showZoneDropdown, setShowZoneDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal States
  const [showPropertySelector, setShowPropertySelector] = useState(false);
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [editingSlot, setEditingSlot] = useState<(Slot & { zoneId: string }) | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    visible: false,
    title: '',
    message: '',
    confirmLabel: '',
    confirmType: 'primary',
    onConfirm: () => {},
  });

  // UI States
  const [isReorderingZones, setIsReorderingZones] = useState(false);
  const [toast, setToast] = useState<ToastState>({ visible: false, message: '', type: 'success' });

  // Derived State
  const selectedProperty = useMemo(() =>
    properties.find(p => p.id === selectedPropertyId) || null,
    [properties, selectedPropertyId]
  );

  const allSlots = useMemo(() => {
    if (!selectedProperty) return [];
    return selectedProperty.zones.flatMap(zone =>
      zone.slots.map(slot => ({ ...slot, zoneName: zone.name, zoneId: zone.id }))
    );
  }, [selectedProperty]);

  const kpiCounts = useMemo(() => ({
    total: allSlots.length,
    available: allSlots.filter(s => s.status === 'available').length,
    occupied: allSlots.filter(s => s.status === 'occupied').length,
    blocked: allSlots.filter(s => s.status === 'blocked' || s.status === 'maintenance').length,
  }), [allSlots]);

  const filteredSlots = useMemo(() => {
    let result = [...allSlots];

    // Status filter
    if (filters.status !== 'all') {
      result = result.filter(s => s.status === filters.status);
    }

    // Zone filter
    if (filters.zoneId !== 'all') {
      result = result.filter(s => s.zoneId === filters.zoneId);
    }

    // Search
    if (filters.searchQuery.trim()) {
      const query = filters.searchQuery.toLowerCase();
      result = result.filter(s =>
        s.label.toLowerCase().includes(query) ||
        s.zoneName.toLowerCase().includes(query)
      );
    }

    // Sort
    switch (filters.sortBy) {
      case 'label':
        result.sort((a, b) => a.label.localeCompare(b.label));
        break;
      case 'status':
        const statusOrder = ['available', 'occupied', 'blocked', 'maintenance'];
        result.sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));
        break;
      case 'updated':
        result.sort((a, b) => b.updatedAt - a.updatedAt);
        break;
    }

    return result;
  }, [allSlots, filters]);

  // ============================================================================
  // PERSISTENCE FUNCTIONS
  // ============================================================================

  const saveProperties = useCallback(async (props: Property[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.PROPERTIES, JSON.stringify(props));
    } catch (e) {
      setError("Couldn't save locally.");
    }
  }, []);

  const saveUIPrefs = useCallback(async (prefs: Partial<UIPreferences>) => {
    try {
      const current = await AsyncStorage.getItem(STORAGE_KEYS.UI_PREFS);
      const parsed = current ? JSON.parse(current) : DEFAULT_UI_PREFS;
      const updated = { ...parsed, ...prefs };
      await AsyncStorage.setItem(STORAGE_KEYS.UI_PREFS, JSON.stringify(updated));
    } catch (e) {
      console.log('Failed to save UI prefs');
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      // Load properties
      const propsData = await AsyncStorage.getItem(STORAGE_KEYS.PROPERTIES);
      let props: Property[] = propsData ? JSON.parse(propsData) : [];

      // Seed if empty
      if (props.length === 0) {
        props = SEED_PROPERTIES;
        await AsyncStorage.setItem(STORAGE_KEYS.PROPERTIES, JSON.stringify(props));
      }

      setProperties(props);

      // Load UI prefs
      const prefsData = await AsyncStorage.getItem(STORAGE_KEYS.UI_PREFS);
      const prefs: UIPreferences = prefsData ? JSON.parse(prefsData) : DEFAULT_UI_PREFS;

      // Set selected property
      const validPropertyId = props.find(p => p.id === prefs.lastSelectedPropertyId)?.id || props[0]?.id || null;
      setSelectedPropertyId(validPropertyId);
      setSelectedTab(prefs.lastSelectedTab);
      setFilters(prefs.lastSlotFilters || DEFAULT_FILTERS);

    } catch (e) {
      setError('Failed to load data');
      setProperties(SEED_PROPERTIES);
      setSelectedPropertyId(SEED_PROPERTIES[0]?.id || null);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  // Save preferences when they change
  useEffect(() => {
    if (selectedPropertyId) {
      saveUIPrefs({
        lastSelectedPropertyId: selectedPropertyId,
        lastSelectedTab: selectedTab,
        lastSlotFilters: filters,
      });
    }
  }, [selectedPropertyId, selectedTab, filters]);

  // ============================================================================
  // CRUD OPERATIONS
  // ============================================================================

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ visible: true, message, type });
  }, []);

  const updateProperty = useCallback((propertyId: string, updates: Partial<Property>) => {
    setProperties(prev => {
      const updated = prev.map(p =>
        p.id === propertyId
          ? { ...p, ...updates, updatedAt: Date.now() }
          : p
      );
      saveProperties(updated);
      return updated;
    });
  }, [saveProperties]);

  const addProperty = useCallback((property: Omit<Property, 'id' | 'createdAt' | 'updatedAt' | 'zones' | 'rules'>) => {
    const newProperty: Property = {
      ...property,
      id: generateId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      zones: [],
      rules: { ...DEFAULT_RULES },
    };
    setProperties(prev => {
      const updated = [...prev, newProperty];
      saveProperties(updated);
      return updated;
    });
    setSelectedPropertyId(newProperty.id);
    showToast('Property added');
  }, [saveProperties, showToast]);

  const deleteProperty = useCallback((propertyId: string) => {
    setProperties(prev => {
      const updated = prev.filter(p => p.id !== propertyId);
      saveProperties(updated);
      if (selectedPropertyId === propertyId) {
        setSelectedPropertyId(updated[0]?.id || null);
      }
      return updated;
    });
    showToast('Property deleted');
  }, [saveProperties, selectedPropertyId, showToast]);

  const addZone = useCallback((zone: Omit<Zone, 'id' | 'createdAt' | 'updatedAt' | 'slots'>) => {
    if (!selectedPropertyId) return;

    const newZone: Zone = {
      ...zone,
      id: generateId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      slots: [],
    };

    updateProperty(selectedPropertyId, {
      zones: [...(selectedProperty?.zones || []), newZone],
    });
    showToast('Zone added');
  }, [selectedPropertyId, selectedProperty, updateProperty, showToast]);

  const updateZone = useCallback((zoneId: string, updates: Partial<Zone>) => {
    if (!selectedPropertyId || !selectedProperty) return;

    const updatedZones = selectedProperty.zones.map(z =>
      z.id === zoneId ? { ...z, ...updates, updatedAt: Date.now() } : z
    );

    updateProperty(selectedPropertyId, { zones: updatedZones });
    showToast('Zone updated');
  }, [selectedPropertyId, selectedProperty, updateProperty, showToast]);

  const deleteZone = useCallback((zoneId: string) => {
    if (!selectedPropertyId || !selectedProperty) return;

    const updatedZones = selectedProperty.zones.filter(z => z.id !== zoneId);
    updateProperty(selectedPropertyId, { zones: updatedZones });
    showToast('Zone deleted');
  }, [selectedPropertyId, selectedProperty, updateProperty, showToast]);

  const moveZone = useCallback((zoneId: string, direction: 'up' | 'down') => {
    if (!selectedPropertyId || !selectedProperty) return;

    const zones = [...selectedProperty.zones];
    const index = zones.findIndex(z => z.id === zoneId);

    if (direction === 'up' && index > 0) {
      [zones[index], zones[index - 1]] = [zones[index - 1], zones[index]];
    } else if (direction === 'down' && index < zones.length - 1) {
      [zones[index], zones[index + 1]] = [zones[index + 1], zones[index]];
    }

    updateProperty(selectedPropertyId, { zones });
  }, [selectedPropertyId, selectedProperty, updateProperty]);

  const addSlot = useCallback((zoneId: string, slot: Omit<Slot, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!selectedPropertyId || !selectedProperty) return;

    const newSlot: Slot = {
      ...slot,
      id: generateId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updatedZones = selectedProperty.zones.map(z =>
      z.id === zoneId
        ? { ...z, slots: [...z.slots, newSlot], updatedAt: Date.now() }
        : z
    );

    updateProperty(selectedPropertyId, { zones: updatedZones });
    showToast('Slot added');
  }, [selectedPropertyId, selectedProperty, updateProperty, showToast]);

  const updateSlot = useCallback((zoneId: string, slotId: string, updates: Partial<Slot>) => {
    if (!selectedPropertyId || !selectedProperty) return;

    const updatedZones = selectedProperty.zones.map(zone => {
      if (zone.id !== zoneId) return zone;

      const updatedSlots = zone.slots.map(slot =>
        slot.id === slotId ? { ...slot, ...updates, updatedAt: Date.now() } : slot
      );

      return { ...zone, slots: updatedSlots, updatedAt: Date.now() };
    });

    updateProperty(selectedPropertyId, { zones: updatedZones });
  }, [selectedPropertyId, selectedProperty, updateProperty]);

  const deleteSlot = useCallback((zoneId: string, slotId: string) => {
    if (!selectedPropertyId || !selectedProperty) return;

    const updatedZones = selectedProperty.zones.map(zone => {
      if (zone.id !== zoneId) return zone;
      return { ...zone, slots: zone.slots.filter(s => s.id !== slotId), updatedAt: Date.now() };
    });

    updateProperty(selectedPropertyId, { zones: updatedZones });
    showToast('Slot deleted');
  }, [selectedPropertyId, selectedProperty, updateProperty, showToast]);

  const toggleSlotActive = useCallback((zoneId: string, slotId: string, isActive: boolean) => {
    updateSlot(zoneId, slotId, { isActive });
    showToast(isActive ? 'Slot activated' : 'Slot deactivated');
  }, [updateSlot, showToast]);

  const changeSlotStatus = useCallback((zoneId: string, slotId: string, status: SlotStatus) => {
    updateSlot(zoneId, slotId, { status, isActive: status !== 'maintenance' });
    showToast(`Slot marked as ${status}`);
  }, [updateSlot, showToast]);

  const updatePropertyRules = useCallback((rules: Partial<PropertyRules>) => {
    if (!selectedPropertyId || !selectedProperty) return;

    updateProperty(selectedPropertyId, {
      rules: { ...(selectedProperty.rules || DEFAULT_RULES), ...rules },
    });
    showToast('Rules updated');
  }, [selectedPropertyId, selectedProperty, updateProperty, showToast]);

  // ============================================================================
  // FORM STATES
  // ============================================================================

  const [propertyForm, setPropertyForm] = useState({ name: '', addressLine: '', city: '' });
  const [zoneForm, setZoneForm] = useState<{ name: string; type: ZoneType; level: string }>({
    name: '', type: 'resident', level: ''
  });
  const [slotForm, setSlotForm] = useState<{
    label: string;
    zoneId: string;
    status: SlotStatus;
    isActive: boolean;
    allowedVehicleTypes: VehicleType[];
    usePropertyDefaults: boolean;
    sizeLimit: SizeLimit;
    notes: string;
  }>({
    label: '',
    zoneId: '',
    status: 'available',
    isActive: true,
    allowedVehicleTypes: ['car', 'bike', 'suv'],
    usePropertyDefaults: true,
    sizeLimit: {},
    notes: '',
  });

  const openPropertyModal = useCallback((property?: Property) => {
    if (property) {
      setEditingProperty(property);
      setPropertyForm({
        name: property.name,
        addressLine: property.addressLine || '',
        city: property.city || '',
      });
    } else {
      setEditingProperty(null);
      setPropertyForm({ name: '', addressLine: '', city: '' });
    }
    setShowPropertyModal(true);
  }, []);

  const openZoneModal = useCallback((zone?: Zone) => {
    if (zone) {
      setEditingZone(zone);
      setZoneForm({
        name: zone.name,
        type: zone.type,
        level: zone.level || '',
      });
    } else {
      setEditingZone(null);
      setZoneForm({ name: '', type: 'resident', level: '' });
    }
    setShowZoneModal(true);
  }, []);

  const openSlotModal = useCallback((slot?: Slot & { zoneId: string }) => {
    if (slot) {
      setEditingSlot(slot);
      setSlotForm({
        label: slot.label,
        zoneId: slot.zoneId,
        status: slot.status,
        isActive: slot.isActive,
        allowedVehicleTypes: slot.allowedVehicleTypes,
        usePropertyDefaults: !slot.sizeLimit,
        sizeLimit: slot.sizeLimit || {},
        notes: slot.notes || '',
      });
    } else {
      setEditingSlot(null);
      setSlotForm({
        label: '',
        zoneId: selectedProperty?.zones[0]?.id || '',
        status: 'available',
        isActive: true,
        allowedVehicleTypes: selectedProperty?.rules?.allowedVehicleTypesDefault || ['car', 'bike', 'suv'],
        usePropertyDefaults: true,
        sizeLimit: {},
        notes: '',
      });
    }
    setShowSlotModal(true);
  }, [selectedProperty]);

  const handleSaveProperty = useCallback(() => {
    if (propertyForm.name.trim().length < 3) {
      showToast('Property name must be at least 3 characters', 'error');
      return;
    }

    if (editingProperty) {
      updateProperty(editingProperty.id, {
        name: propertyForm.name.trim(),
        addressLine: propertyForm.addressLine.trim() || undefined,
        city: propertyForm.city.trim() || undefined,
      });
      showToast('Property updated');
    } else {
      addProperty({
        name: propertyForm.name.trim(),
        addressLine: propertyForm.addressLine.trim() || undefined,
        city: propertyForm.city.trim() || undefined,
      });
    }

    setShowPropertyModal(false);
  }, [propertyForm, editingProperty, addProperty, updateProperty, showToast]);

  const handleSaveZone = useCallback(() => {
    if (!zoneForm.name.trim()) {
      showToast('Zone name is required', 'error');
      return;
    }

    if (editingZone) {
      updateZone(editingZone.id, {
        name: zoneForm.name.trim(),
        type: zoneForm.type,
        level: zoneForm.level.trim() || undefined,
      });
    } else {
      addZone({
        name: zoneForm.name.trim(),
        type: zoneForm.type,
        level: zoneForm.level.trim() || undefined,
      });
    }

    setShowZoneModal(false);
  }, [zoneForm, editingZone, addZone, updateZone, showToast]);

  const handleSaveSlot = useCallback(() => {
    if (!slotForm.label.trim()) {
      showToast('Slot label is required', 'error');
      return;
    }

    if (!slotForm.zoneId) {
      showToast('Please select a zone', 'error');
      return;
    }

    // Check for duplicate label
    const existingSlot = allSlots.find(
      s => s.label.toLowerCase() === slotForm.label.toLowerCase() &&
           (!editingSlot || s.id !== editingSlot.id)
    );

    if (existingSlot) {
      showToast('A slot with this label already exists', 'error');
      return;
    }

    const slotData = {
      label: slotForm.label.trim(),
      status: slotForm.status,
      isActive: slotForm.isActive,
      allowedVehicleTypes: slotForm.allowedVehicleTypes,
      sizeLimit: slotForm.usePropertyDefaults ? undefined : slotForm.sizeLimit,
      notes: slotForm.notes.trim() || undefined,
      pricingHint: undefined,
    };

    if (editingSlot) {
      // If zone changed, we need to move the slot
      if (editingSlot.zoneId !== slotForm.zoneId) {
        // Delete from old zone
        deleteSlot(editingSlot.zoneId, editingSlot.id);
        // Add to new zone
        addSlot(slotForm.zoneId, slotData);
      } else {
        updateSlot(slotForm.zoneId, editingSlot.id, slotData);
        showToast('Slot updated');
      }
    } else {
      addSlot(slotForm.zoneId, slotData);
    }

    setShowSlotModal(false);
  }, [slotForm, editingSlot, allSlots, addSlot, updateSlot, deleteSlot, showToast]);

  // ============================================================================
  // RENDER FUNCTIONS
  // ============================================================================

  const renderHeader = () => (
    <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
      <View style={styles.headerTop}>
        <View>
          <Text style={styles.headerTitle}>Properties & Slots</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.addPropertyButton}
            accessibilityLabel="Add property"
            onPress={() => setShowPropertyModal(true)}
          >
            <Icon name="add" size={20} color={COLORS.white} />
          </Pressable>
        </View>
      </View>

      <Pressable
        onPress={() => setShowPropertySelector(true)}
        style={styles.propertySelector}
        accessibilityLabel="Select property"
        accessibilityRole="button"
      >
        <Icon name="business-outline" size={20} color={COLORS.primary} />
        <Text style={styles.propertySelectorText} numberOfLines={1}>
          {selectedProperty?.name || 'Select Property'}
        </Text>
        <Icon name="chevron-down" size={18} color={COLORS.textSecondary} />
      </Pressable>
    </View>
  );

  const renderKpis = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.kpiRow}
      contentContainerStyle={styles.kpiRowContent}
    >
      <DashboardKpiCard
        icon="stats-chart"
        value={kpiCounts.total.toString()}
        label="Total Slots"
        color="primary"
        onPress={() => setFilters(prev => ({ ...prev, status: 'all' }))}
      />
      <DashboardKpiCard
        icon="car"
        value={kpiCounts.available.toString()}
        label="Available"
        color="success"
        onPress={() => setFilters(prev => ({ ...prev, status: 'available' }))}
      />
      <DashboardKpiCard
        icon="calendar"
        value={kpiCounts.occupied.toString()}
        label="Occupied"
        color="warning"
        onPress={() => setFilters(prev => ({ ...prev, status: 'occupied' }))}
      />
      <DashboardKpiCard
        icon="trending-up"
        value={kpiCounts.blocked.toString()}
        label="Blocked"
        color="danger"
        onPress={() => setFilters(prev => ({ ...prev, status: 'blocked' }))}
      />
    </ScrollView>
  );

  const renderTabs = () => (
    <SegmentedControl
      options={[
        { key: 'slots', label: 'Slots' },
        { key: 'zones', label: 'Zones' },
        { key: 'rules', label: 'Rules' },
      ]}
      selected={selectedTab}
      onChange={(key) => setSelectedTab(key as TabType)}
    />
  );

  const renderSlotsTab = () => {
    if (!selectedProperty) {
      return (
        <EmptyState
          icon="home-outline"
          title="No Property Selected"
          message="Please select or add a property to manage slots."
          actionLabel="Add Property"
          onAction={() => openPropertyModal()}
        />
      );
    }

    return (
      <View style={styles.tabContent}>
        {/* Search & Filters */}
        <View style={styles.searchRow}>
          <View style={styles.searchInput}>
            <Icon name="search-outline" size={20} color={COLORS.textMuted} />
            <TextInput
              value={filters.searchQuery}
              onChangeText={(text) => setFilters(prev => ({ ...prev, searchQuery: text }))}
              placeholder="Search slot label..."
              placeholderTextColor={COLORS.textMuted}
              style={styles.searchInputText}
            />
            {filters.searchQuery.length > 0 && (
              <Pressable onPress={() => setFilters(prev => ({ ...prev, searchQuery: '' }))}>
                <Icon name="close-circle" size={18} color={COLORS.textMuted} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Filter Row: Zone Dropdown + Sort */}
        <View style={styles.filterRow}>
          {/* Zone Dropdown */}
          <Pressable
            style={styles.zoneDropdownButton}
            onPress={() => setShowZoneDropdown(!showZoneDropdown)}
          >
            <Text style={styles.zoneDropdownText}>
              {filters.zoneId === 'all'
                ? 'All Zones'
                : selectedProperty.zones.find(z => z.id === filters.zoneId)?.name || 'Select Zone'}
            </Text>
            <Icon
              name={showZoneDropdown ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={COLORS.textSecondary}
            />
          </Pressable>

          {/* Sort Options */}
          <View style={styles.sortRow}>
            <Text style={styles.sortLabel}>Sort:</Text>
            {(['label', 'status', 'updated'] as SortOption[]).map(option => (
              <Pressable
                key={option}
                onPress={() => setFilters(prev => ({ ...prev, sortBy: option }))}
                style={[styles.sortOption, filters.sortBy === option && styles.sortOptionActive]}
              >
                <Text style={[
                  styles.sortOptionText,
                  filters.sortBy === option && styles.sortOptionTextActive
                ]}>
                  {option === 'updated' ? 'Recent' : option.charAt(0).toUpperCase() + option.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Zone Dropdown Menu */}
        {showZoneDropdown && (
          <View style={styles.zoneDropdownMenu}>
            <Pressable
              style={[
                styles.zoneDropdownItem,
                filters.zoneId === 'all' && styles.zoneDropdownItemSelected,
              ]}
              onPress={() => {
                setFilters(prev => ({ ...prev, zoneId: 'all' }));
                setShowZoneDropdown(false);
              }}
            >
              <Text style={[
                styles.zoneDropdownItemText,
                filters.zoneId === 'all' && styles.zoneDropdownItemTextSelected,
              ]}>
                All Zones
              </Text>
              {filters.zoneId === 'all' && (
                <Icon name="checkmark" size={18} color={COLORS.primary} />
              )}
            </Pressable>
            {selectedProperty.zones.map(zone => (
              <Pressable
                key={zone.id}
                style={[
                  styles.zoneDropdownItem,
                  filters.zoneId === zone.id && styles.zoneDropdownItemSelected,
                ]}
                onPress={() => {
                  setFilters(prev => ({ ...prev, zoneId: zone.id }));
                  setShowZoneDropdown(false);
                }}
              >
                <Text style={[
                  styles.zoneDropdownItemText,
                  filters.zoneId === zone.id && styles.zoneDropdownItemTextSelected,
                ]}>
                  {zone.name}
                </Text>
                {filters.zoneId === zone.id && (
                  <Icon name="checkmark" size={18} color={COLORS.primary} />
                )}
              </Pressable>
            ))}
          </View>
        )}

        {/* Slots List */}
        {filteredSlots.length === 0 ? (
          filters.searchQuery || filters.status !== 'all' || filters.zoneId !== 'all' ? (
            <EmptyState
              icon="search-outline"
              title="No Matches"
              message="Try adjusting your filters or search query."
              actionLabel="Clear Filters"
              onAction={() => setFilters(DEFAULT_FILTERS)}
            />
          ) : (
            <EmptyState
              icon="cube-outline"
              title="No Slots Yet"
              message="Add your first parking slot to get started."
              actionLabel="Add Slot"
              onAction={() => openSlotModal()}
            />
          )
        ) : (
          <View style={styles.slotsList}>
            {filteredSlots.map((item) => (
              <SlotCard
                key={item.id}
                slot={item}
                zoneName={item.zoneName}
                onToggleActive={() => toggleSlotActive(item.zoneId, item.id, !item.isActive)}
                onEdit={() => openSlotModal({ ...item, zoneId: item.zoneId })}
                onBlock={() => {
                  const newStatus = item.status === 'blocked' ? 'available' : 'blocked';
                  setConfirmModal({
                    visible: true,
                    title: newStatus === 'blocked' ? 'Block Slot?' : 'Unblock Slot?',
                    message: newStatus === 'blocked'
                      ? `This will mark ${item.label} as blocked and prevent new bookings.`
                      : `This will make ${item.label} available for bookings again.`,
                    confirmLabel: newStatus === 'blocked' ? 'Block' : 'Unblock',
                    confirmType: newStatus === 'blocked' ? 'danger' : 'primary',
                    onConfirm: () => {
                      changeSlotStatus(item.zoneId, item.id, newStatus);
                      setConfirmModal(prev => ({ ...prev, visible: false }));
                    },
                  });
                }}
                onMaintenance={() => {
                  const newStatus = item.status === 'maintenance' ? 'available' : 'maintenance';
                  changeSlotStatus(item.zoneId, item.id, newStatus);
                }}
              />
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderZonesTab = () => {
    if (!selectedProperty) {
      return (
        <EmptyState
          icon="home-outline"
          title="No Property Selected"
          message="Please select or add a property to manage zones."
          actionLabel="Add Property"
          onAction={() => openPropertyModal()}
        />
      );
    }

    return (
      <View style={styles.tabContent}>
        <View style={styles.zonesHeader}>
          <Text style={styles.zonesCount}>{selectedProperty.zones.length} Zones</Text>
          <Pressable
            onPress={() => setIsReorderingZones(!isReorderingZones)}
            style={styles.reorderToggle}
          >
            <Icon
              name={isReorderingZones ? 'checkmark' : 'reorder-four-outline'}
              size={20}
              color={isReorderingZones ? COLORS.success : COLORS.textSecondary}
            />
            <Text style={[
              styles.reorderToggleText,
              isReorderingZones && { color: COLORS.success }
            ]}>
              {isReorderingZones ? 'Done' : 'Reorder'}
            </Text>
          </Pressable>
        </View>

        {selectedProperty.zones.length === 0 ? (
          <EmptyState
            icon="layers-outline"
            title="No Zones Yet"
            message="Create zones to organize your parking slots."
            actionLabel="Add Zone"
            onAction={() => openZoneModal()}
          />
        ) : (
          <View>
            {selectedProperty.zones.map((zone, index) => (
              <ZoneCard
                key={zone.id}
                zone={zone}
                onEdit={() => openZoneModal(zone)}
                onManageSlots={() => {
                  setFilters(prev => ({ ...prev, zoneId: zone.id }));
                  setSelectedTab('slots');
                }}
                isReordering={isReorderingZones}
                canMoveUp={index > 0}
                canMoveDown={index < selectedProperty.zones.length - 1}
                onMoveUp={() => moveZone(zone.id, 'up')}
                onMoveDown={() => moveZone(zone.id, 'down')}
              />
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderRulesTab = () => {
    if (!selectedProperty) {
      return (
        <EmptyState
          icon="home-outline"
          title="No Property Selected"
          message="Please select or add a property to manage rules."
          actionLabel="Add Property"
          onAction={() => openPropertyModal()}
        />
      );
    }

    const rules = selectedProperty.rules || DEFAULT_RULES;

    return (
      <View style={styles.tabContent}>
        {/* Vehicle Types */}
        <Card style={styles.rulesCard}>
          <Text style={styles.rulesCardTitle}>Allowed Vehicle Types</Text>
          <Text style={styles.rulesCardDescription}>
            Default vehicle types allowed in all slots
          </Text>
          <View style={styles.vehicleTypeGrid}>
            {ALL_VEHICLE_TYPES.map(type => (
              <Pressable
                key={type}
                onPress={() => {
                  const current = rules.allowedVehicleTypesDefault || [];
                  const updated = current.includes(type)
                    ? current.filter(t => t !== type)
                    : [...current, type];
                  updatePropertyRules({ allowedVehicleTypesDefault: updated });
                }}
                style={[
                  styles.vehicleTypeItem,
                  rules.allowedVehicleTypesDefault?.includes(type) && styles.vehicleTypeItemActive,
                ]}
              >
                <Icon
                  name={getVehicleIcon(type)}
                  size={24}
                  color={rules.allowedVehicleTypesDefault?.includes(type) ? COLORS.primary : COLORS.textMuted}
                />
                <Text style={[
                  styles.vehicleTypeLabel,
                  rules.allowedVehicleTypesDefault?.includes(type) && styles.vehicleTypeLabelActive,
                ]}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {/* Size Limits */}
        <Card style={styles.rulesCard}>
          <Text style={styles.rulesCardTitle}>Default Size Limits</Text>
          <Text style={styles.rulesCardDescription}>
            Maximum vehicle dimensions (in meters)
          </Text>
          <View style={styles.sizeLimitGrid}>
            <View style={styles.sizeLimitItem}>
              <Text style={styles.sizeLimitLabel}>Length</Text>
              <TextInput
                value={rules.sizeLimitDefault?.lengthM?.toString() || ''}
                onChangeText={(text) => {
                  const value = parseFloat(text) || undefined;
                  updatePropertyRules({
                    sizeLimitDefault: { ...rules.sizeLimitDefault, lengthM: value },
                  });
                }}
                keyboardType="numeric"
                style={styles.sizeLimitInput}
                placeholder="0.0"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>
            <View style={styles.sizeLimitItem}>
              <Text style={styles.sizeLimitLabel}>Width</Text>
              <TextInput
                value={rules.sizeLimitDefault?.widthM?.toString() || ''}
                onChangeText={(text) => {
                  const value = parseFloat(text) || undefined;
                  updatePropertyRules({
                    sizeLimitDefault: { ...rules.sizeLimitDefault, widthM: value },
                  });
                }}
                keyboardType="numeric"
                style={styles.sizeLimitInput}
                placeholder="0.0"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>
            <View style={styles.sizeLimitItem}>
              <Text style={styles.sizeLimitLabel}>Height</Text>
              <TextInput
                value={rules.sizeLimitDefault?.heightM?.toString() || ''}
                onChangeText={(text) => {
                  const value = parseFloat(text) || undefined;
                  updatePropertyRules({
                    sizeLimitDefault: { ...rules.sizeLimitDefault, heightM: value },
                  });
                }}
                keyboardType="numeric"
                style={styles.sizeLimitInput}
                placeholder="0.0"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>
          </View>
        </Card>

        {/* Booking Constraints */}
        <Card style={styles.rulesCard}>
          <Text style={styles.rulesCardTitle}>Booking Constraints</Text>
          <View style={styles.durationRow}>
            <View style={styles.durationItem}>
              <Text style={styles.sizeLimitLabel}>Min Duration (mins)</Text>
              <TextInput
                value={rules.minDurationMinutes?.toString() || ''}
                onChangeText={(text) => {
                  const value = parseInt(text) || undefined;
                  updatePropertyRules({ minDurationMinutes: value });
                }}
                keyboardType="numeric"
                style={styles.sizeLimitInput}
                placeholder="30"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>
            <View style={styles.durationItem}>
              <Text style={styles.sizeLimitLabel}>Max Duration (mins)</Text>
              <TextInput
                value={rules.maxDurationMinutes?.toString() || ''}
                onChangeText={(text) => {
                  const value = parseInt(text) || undefined;
                  updatePropertyRules({ maxDurationMinutes: value });
                }}
                keyboardType="numeric"
                style={styles.sizeLimitInput}
                placeholder="1440"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>
          </View>

          <View style={styles.bookingModeRow}>
            <Text style={styles.bookingModeLabel}>Booking Mode</Text>
            <View style={styles.bookingModeOptions}>
              <Pressable
                onPress={() => updatePropertyRules({ bookingMode: 'instant' })}
                style={[
                  styles.bookingModeOption,
                  rules.bookingMode === 'instant' && styles.bookingModeOptionActive,
                ]}
              >
                <Icon
                  name="flash-outline"
                  size={18}
                  color={rules.bookingMode === 'instant' ? COLORS.primary : COLORS.textMuted}
                />
                <Text style={[
                  styles.bookingModeText,
                  rules.bookingMode === 'instant' && styles.bookingModeTextActive,
                ]}>
                  Instant
                </Text>
              </Pressable>
              <Pressable
                onPress={() => updatePropertyRules({ bookingMode: 'manual' })}
                style={[
                  styles.bookingModeOption,
                  rules.bookingMode === 'manual' && styles.bookingModeOptionActive,
                ]}
              >
                <Icon
                  name="hand-left-outline"
                  size={18}
                  color={rules.bookingMode === 'manual' ? COLORS.primary : COLORS.textMuted}
                />
                <Text style={[
                  styles.bookingModeText,
                  rules.bookingMode === 'manual' && styles.bookingModeTextActive,
                ]}>
                  Manual
                </Text>
              </Pressable>
            </View>
          </View>
        </Card>

        {/* Resident Only */}
        <Card style={styles.rulesCard}>
          <FormToggle
            label="Resident-Only Access"
            value={rules.residentOnly}
            onValueChange={(value) => updatePropertyRules({ residentOnly: value })}
            description="Restrict bookings to verified residents only"
          />
        </Card>

      </View>
    );
  };

  const renderPropertySelectorModal = () => (
    <ModalSheet
      visible={showPropertySelector}
      onClose={() => setShowPropertySelector(false)}
      title="Select Property"
    >
      {properties.map(property => {
        const totalSlots = property.zones.reduce((sum, z) => sum + z.slots.length, 0);
        return (
          <Pressable
            key={property.id}
            onPress={() => {
              setSelectedPropertyId(property.id);
              setShowPropertySelector(false);
            }}
            style={[
              styles.propertySelectorItem,
              property.id === selectedPropertyId && styles.propertySelectorItemActive,
            ]}
          >
            <View style={styles.propertySelectorIcon}>
              <Icon name="business" size={24} color={COLORS.primary} />
            </View>
            <View style={styles.propertySelectorInfo}>
              <Text style={styles.propertySelectorName}>{property.name}</Text>
              <Text style={styles.propertySelectorMeta}>
                {property.zones.length} zones • {totalSlots} slots
              </Text>
            </View>
            {property.id === selectedPropertyId && (
              <Icon name="checkmark-circle" size={24} color={COLORS.primary} />
            )}
          </Pressable>
        );
      })}

      <Pressable
        onPress={() => {
          setShowPropertySelector(false);
          openPropertyModal();
        }}
        style={styles.addPropertyBtn}
      >
        <Icon name="add-circle-outline" size={24} color={COLORS.primary} />
        <Text style={styles.addPropertyBtnText}>Add New Property</Text>
      </Pressable>
    </ModalSheet>
  );

  const renderPropertyModal = () => (
    <ModalSheet
      visible={showPropertyModal}
      onClose={() => setShowPropertyModal(false)}
      title={editingProperty ? 'Edit Property' : 'Add Property'}
    >
      <FormInput
        label="Property Name *"
        value={propertyForm.name}
        onChangeText={(text) => setPropertyForm(prev => ({ ...prev, name: text }))}
        placeholder="e.g., Sunrise Residency"
      />
      <FormInput
        label="Address"
        value={propertyForm.addressLine}
        onChangeText={(text) => setPropertyForm(prev => ({ ...prev, addressLine: text }))}
        placeholder="Street address"
      />
      <FormInput
        label="City"
        value={propertyForm.city}
        onChangeText={(text) => setPropertyForm(prev => ({ ...prev, city: text }))}
        placeholder="City name"
      />

      <View style={styles.modalActions}>
        {editingProperty && (
          <Pressable
            onPress={() => {
              setConfirmModal({
                visible: true,
                title: 'Delete Property?',
                message: 'This will permanently delete this property and all its zones and slots.',
                confirmLabel: 'Delete',
                confirmType: 'danger',
                onConfirm: () => {
                  deleteProperty(editingProperty.id);
                  setShowPropertyModal(false);
                  setConfirmModal(prev => ({ ...prev, visible: false }));
                },
              });
            }}
            style={styles.deleteBtn}
          >
            <Icon name="trash-outline" size={20} color={COLORS.danger} />
            <Text style={styles.deleteBtnText}>Delete</Text>
          </Pressable>
        )}
        <Pressable
          onPress={handleSaveProperty}
          style={styles.saveBtn}
          accessibilityLabel="Save property"
        >
          <Text style={styles.saveBtnText}>
            {editingProperty ? 'Update' : 'Add Property'}
          </Text>
        </Pressable>
      </View>
    </ModalSheet>
  );

  const renderZoneModal = () => (
    <ModalSheet
      visible={showZoneModal}
      onClose={() => setShowZoneModal(false)}
      title={editingZone ? 'Edit Zone' : 'Add Zone'}
    >
      <FormInput
        label="Zone Name *"
        value={zoneForm.name}
        onChangeText={(text) => setZoneForm(prev => ({ ...prev, name: text }))}
        placeholder="e.g., Basement Level 1"
      />

      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>Zone Type</Text>
        <View style={styles.zoneTypeGrid}>
          {(['resident', 'visitor', 'staff', 'mixed'] as ZoneType[]).map(type => (
            <Pressable
              key={type}
              onPress={() => setZoneForm(prev => ({ ...prev, type }))}
              style={[
                styles.zoneTypeOption,
                zoneForm.type === type && {
                  backgroundColor: getZoneTypeColor(type) + '20',
                  borderColor: getZoneTypeColor(type),
                },
              ]}
            >
              <Text style={[
                styles.zoneTypeOptionText,
                zoneForm.type === type && { color: getZoneTypeColor(type) },
              ]}>
                {formatZoneType(type)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FormInput
        label="Level/Label"
        value={zoneForm.level}
        onChangeText={(text) => setZoneForm(prev => ({ ...prev, level: text }))}
        placeholder="e.g., B1, G, L2"
      />

      <View style={styles.modalActions}>
        {editingZone && (
          <Pressable
            onPress={() => {
              setConfirmModal({
                visible: true,
                title: 'Delete Zone?',
                message: 'This will delete this zone and all its slots.',
                confirmLabel: 'Delete',
                confirmType: 'danger',
                onConfirm: () => {
                  deleteZone(editingZone.id);
                  setShowZoneModal(false);
                  setConfirmModal(prev => ({ ...prev, visible: false }));
                },
              });
            }}
            style={styles.deleteBtn}
          >
            <Icon name="trash-outline" size={20} color={COLORS.danger} />
            <Text style={styles.deleteBtnText}>Delete</Text>
          </Pressable>
        )}
        <Pressable
          onPress={handleSaveZone}
          style={styles.saveBtn}
          accessibilityLabel="Save zone"
        >
          <Text style={styles.saveBtnText}>
            {editingZone ? 'Update' : 'Add Zone'}
          </Text>
        </Pressable>
      </View>
    </ModalSheet>
  );

  const renderSlotModal = () => (
    <ModalSheet
      visible={showSlotModal}
      onClose={() => setShowSlotModal(false)}
      title={editingSlot ? 'Edit Slot' : 'Add Slot'}
    >
      <FormInput
        label="Slot Label *"
        value={slotForm.label}
        onChangeText={(text) => setSlotForm(prev => ({ ...prev, label: text }))}
        placeholder="e.g., A-101"
      />

      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>Zone *</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.zoneSelector}>
          {selectedProperty?.zones.map(zone => (
            <Pressable
              key={zone.id}
              onPress={() => setSlotForm(prev => ({ ...prev, zoneId: zone.id }))}
              style={[
                styles.zoneSelectorItem,
                slotForm.zoneId === zone.id && styles.zoneSelectorItemActive,
              ]}
            >
              <Text style={[
                styles.zoneSelectorText,
                slotForm.zoneId === zone.id && styles.zoneSelectorTextActive,
              ]}>
                {zone.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>Status</Text>
        <View style={styles.statusSelector}>
          {(['available', 'occupied', 'blocked', 'maintenance'] as SlotStatus[]).map(status => (
            <Pressable
              key={status}
              onPress={() => setSlotForm(prev => ({ ...prev, status }))}
              style={[
                styles.statusOption,
                slotForm.status === status && {
                  backgroundColor: getSlotStatusBg(status),
                  borderColor: getSlotStatusColor(status),
                },
              ]}
            >
              <View style={[styles.statusDot, { backgroundColor: getSlotStatusColor(status) }]} />
              <Text style={[
                styles.statusOptionText,
                slotForm.status === status && { color: getSlotStatusColor(status) },
              ]}>
                {formatSlotStatus(status)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FormToggle
        label="Active"
        value={slotForm.isActive}
        onValueChange={(value) => setSlotForm(prev => ({ ...prev, isActive: value }))}
        description="Slot is visible and available for booking"
      />

      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>Allowed Vehicle Types</Text>
        <View style={styles.vehicleTypeGrid}>
          {ALL_VEHICLE_TYPES.map(type => (
            <Pressable
              key={type}
              onPress={() => {
                setSlotForm(prev => {
                  const current = prev.allowedVehicleTypes;
                  const updated = current.includes(type)
                    ? current.filter(t => t !== type)
                    : [...current, type];
                  return { ...prev, allowedVehicleTypes: updated };
                });
              }}
              style={[
                styles.vehicleTypeItem,
                slotForm.allowedVehicleTypes.includes(type) && styles.vehicleTypeItemActive,
              ]}
            >
              <Icon
                name={getVehicleIcon(type)}
                size={20}
                color={slotForm.allowedVehicleTypes.includes(type) ? COLORS.primary : COLORS.textMuted}
              />
              <Text style={[
                styles.vehicleTypeLabel,
                slotForm.allowedVehicleTypes.includes(type) && styles.vehicleTypeLabelActive,
              ]}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FormToggle
        label="Use Property Defaults"
        value={slotForm.usePropertyDefaults}
        onValueChange={(value) => setSlotForm(prev => ({ ...prev, usePropertyDefaults: value }))}
        description="Apply property-level size limits"
      />

      {!slotForm.usePropertyDefaults && (
        <View style={styles.sizeLimitGrid}>
          <View style={styles.sizeLimitItem}>
            <Text style={styles.sizeLimitLabel}>Length (m)</Text>
            <TextInput
              value={slotForm.sizeLimit.lengthM?.toString() || ''}
              onChangeText={(text) => {
                const value = parseFloat(text) || undefined;
                setSlotForm(prev => ({
                  ...prev,
                  sizeLimit: { ...prev.sizeLimit, lengthM: value },
                }));
              }}
              keyboardType="numeric"
              style={styles.sizeLimitInput}
              placeholder="0.0"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>
          <View style={styles.sizeLimitItem}>
            <Text style={styles.sizeLimitLabel}>Width (m)</Text>
            <TextInput
              value={slotForm.sizeLimit.widthM?.toString() || ''}
              onChangeText={(text) => {
                const value = parseFloat(text) || undefined;
                setSlotForm(prev => ({
                  ...prev,
                  sizeLimit: { ...prev.sizeLimit, widthM: value },
                }));
              }}
              keyboardType="numeric"
              style={styles.sizeLimitInput}
              placeholder="0.0"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>
          <View style={styles.sizeLimitItem}>
            <Text style={styles.sizeLimitLabel}>Height (m)</Text>
            <TextInput
              value={slotForm.sizeLimit.heightM?.toString() || ''}
              onChangeText={(text) => {
                const value = parseFloat(text) || undefined;
                setSlotForm(prev => ({
                  ...prev,
                  sizeLimit: { ...prev.sizeLimit, heightM: value },
                }));
              }}
              keyboardType="numeric"
              style={styles.sizeLimitInput}
              placeholder="0.0"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>
        </View>
      )}

      <FormInput
        label="Notes"
        value={slotForm.notes}
        onChangeText={(text) => setSlotForm(prev => ({ ...prev, notes: text }))}
        placeholder="Any additional notes..."
        multiline
      />

      <View style={styles.modalActions}>
        {editingSlot && (
          <Pressable
            onPress={() => {
              setConfirmModal({
                visible: true,
                title: 'Delete Slot?',
                message: 'This will permanently delete this slot.',
                confirmLabel: 'Delete',
                confirmType: 'danger',
                onConfirm: () => {
                  deleteSlot(editingSlot.zoneId, editingSlot.id);
                  setShowSlotModal(false);
                  setConfirmModal(prev => ({ ...prev, visible: false }));
                },
              });
            }}
            style={styles.deleteBtn}
          >
            <Icon name="trash-outline" size={20} color={COLORS.danger} />
            <Text style={styles.deleteBtnText}>Delete</Text>
          </Pressable>
        )}
        <Pressable
          onPress={handleSaveSlot}
          style={styles.saveBtn}
          accessibilityLabel="Save slot"
        >
          <Text style={styles.saveBtnText}>
            {editingSlot ? 'Update' : 'Add Slot'}
          </Text>
        </Pressable>
      </View>
    </ModalSheet>
  );

  const getFabConfig = () => {
    switch (selectedTab) {
      case 'slots':
        return { label: 'Add Slot', icon: 'add', onPress: () => openSlotModal() };
      case 'zones':
        return { label: 'Add Zone', icon: 'add', onPress: () => openZoneModal() };
      default:
        return null;
    }
  };

  const fabConfig = getFabConfig();

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollableContent}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 0 }}
        nestedScrollEnabled
      >
        {renderHeader()}

        {error && (
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        )}

        {renderKpis()}

        <View style={styles.tabsContainer}>
          {renderTabs()}
        </View>

        <View style={styles.mainContentScrollable}>
          {selectedTab === 'slots' && renderSlotsTab()}
          {selectedTab === 'zones' && renderZonesTab()}
          {selectedTab === 'rules' && renderRulesTab()}
        </View>
      </ScrollView>

      {fabConfig && (
        <View style={[styles.fabContainer, { bottom: insets.bottom + SPACING.lg }]}>
          <FAB
            label={fabConfig.label}
            icon={fabConfig.icon}
            onPress={fabConfig.onPress}
          />
        </View>
      )}

      {/* Modals */}
      {renderPropertySelectorModal()}
      {renderPropertyModal()}
      {renderZoneModal()}
      {renderSlotModal()}

      <ConfirmModal
        visible={confirmModal.visible}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel={confirmModal.confirmLabel}
        confirmType={confirmModal.confirmType}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, visible: false }))}
      />

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast(prev => ({ ...prev, visible: false }))}
        bottomOffset={insets.bottom + 80}
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
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Header
  header: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  headerTitle: {
    fontSize: FONT.xxl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: FONT.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  headerAction: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addPropertyButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  propertySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    gap: SPACING.sm,
    alignSelf: 'flex-start',
  },
  propertySelectorText: {
    fontSize: FONT.base,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.primary,
    maxWidth: 200,
  },

  // KPIs
  kpiRow: {
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
  },
  kpiRowContent: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  // Tabs
  tabsContainer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: COLORS.borderLight,
    borderRadius: RADIUS.lg,
    padding: SPACING.xs,
    position: 'relative',
  },
  segmentIndicator: {
    position: 'absolute',
    left: SPACING.xs,
    bottom: 0,
    height: 2,
    backgroundColor: COLORS.primary,
    borderRadius: 1,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    zIndex: 1,
  },
  segmentText: {
    fontSize: FONT.base,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.textSecondary,
  },
  segmentTextSelected: {
    color: COLORS.text,
  },

  // Tab Content
  scrollableContent: {
    flex: 1,
  },
  mainContent: {
    flex: 1,
  },
  mainContentScrollable: {
    paddingHorizontal: SPACING.xs,
  },
  tabContent: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
  },

  // Search & Filters
  searchRow: {
    marginBottom: SPACING.sm,
  },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    height: 44,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  searchInputText: {
    flex: 1,
    fontSize: FONT.base,
    color: COLORS.text,
  },
  // Filter Row
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: SPACING.lg,
    marginBottom: SPACING.md,
    gap: SPACING.lg,
  },
  zoneDropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  zoneDropdownText: {
    fontSize: FONT.sm,
    color: COLORS.text,
    fontWeight: FONT_WEIGHT.medium,
  },
  zoneDropdownMenu: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  zoneDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  zoneDropdownItemSelected: {
    backgroundColor: COLORS.primaryLight,
  },
  zoneDropdownItemText: {
    fontSize: FONT.base,
    color: COLORS.text,
  },
  zoneDropdownItemTextSelected: {
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.medium,
  },

  // Chips (for other uses)
  chip: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSmall: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    minWidth: 60,
  },
  chipPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  chipText: {
    fontSize: FONT.sm,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHT.medium,
    textAlign: 'center',
  },
  chipTextSmall: {
    fontSize: FONT.xs,
  },
  chipTextSelected: {
    color: COLORS.white,
    fontWeight: FONT_WEIGHT.semibold,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sortLabel: {
    fontSize: FONT.xs,
    color: COLORS.textSecondary,
    marginRight: SPACING.xs,
  },
  sortOption: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    marginLeft: SPACING.xs,
    borderRadius: RADIUS.sm,
  },
  sortOptionActive: {
    backgroundColor: COLORS.primaryLight,
  },
  sortOptionText: {
    fontSize: FONT.sm,
    color: COLORS.textSecondary,
  },
  sortOptionTextActive: {
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.medium,
  },

  // Cards
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
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
  cardPressed: {
    opacity: 0.95,
    transform: [{ scale: 0.99 }],
  },

  // Slot Card
  slotCard: {
    padding: SPACING.md,
  },
  slotCardMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  slotCardLeft: {
    flex: 1,
  },
  slotLabel: {
    fontSize: FONT.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.text,
  },
  slotZone: {
    fontSize: FONT.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  slotCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  slotToggle: {
    transform: [{ scale: 0.85 }],
  },
  slotCardSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  slotVehicleTypes: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  vehicleIcon: {
    marginRight: SPACING.xs,
  },
  moreVehicles: {
    fontSize: FONT.xs,
    color: COLORS.textMuted,
  },
  slotSizeInfo: {
    fontSize: FONT.xs,
    color: COLORS.textSecondary,
    marginLeft: SPACING.md,
  },
  slotNotes: {
    fontSize: FONT.xs,
    color: COLORS.textMuted,
    marginLeft: SPACING.md,
    flex: 1,
  },
  slotActionsBtn: {
    padding: SPACING.xs,
    marginLeft: SPACING.sm,
  },
  slotActions: {
    flexDirection: 'row',
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    gap: SPACING.lg,
  },
  slotActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  slotActionText: {
    fontSize: FONT.sm,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.medium,
  },
  slotsList: {
    paddingBottom: 0,
  },

  // Status Pill
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    gap: SPACING.xs,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: FONT.xs,
    fontWeight: FONT_WEIGHT.medium,
  },

  // Zone Badge
  zoneBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
  },
  zoneBadgeText: {
    fontSize: FONT.xs,
    fontWeight: FONT_WEIGHT.medium,
  },

  // Zone Card
  zoneCard: {
    padding: SPACING.lg,
  },
  zoneCardHeader: {
    marginBottom: SPACING.md,
  },
  zoneCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  zoneName: {
    fontSize: FONT.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.text,
  },
  zoneLevel: {
    fontSize: FONT.sm,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  zoneSlotCounts: {
    flexDirection: 'row',
    backgroundColor: COLORS.borderLight,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  zoneCountItem: {
    flex: 1,
    alignItems: 'center',
  },
  zoneCountValue: {
    fontSize: FONT.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.text,
  },
  zoneCountLabel: {
    fontSize: FONT.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  zoneCardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  zoneActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  zoneActionText: {
    fontSize: FONT.sm,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.medium,
  },
  zoneEditBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zonesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  zonesCount: {
    fontSize: FONT.base,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHT.medium,
  },
  reorderToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  reorderToggleText: {
    fontSize: FONT.sm,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHT.medium,
  },
  reorderControls: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  reorderBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.borderLight,
    borderRadius: RADIUS.md,
  },
  reorderBtnDisabled: {
    opacity: 0.4,
  },

  // Rules Tab
  rulesCard: {
    marginBottom: SPACING.md,
  },
  rulesCardTitle: {
    fontSize: FONT.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  rulesCardDescription: {
    fontSize: FONT.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  vehicleTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  vehicleTypeItem: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.borderLight,
    borderRadius: RADIUS.md,
    minWidth: 70,
  },
  vehicleTypeItemActive: {
    backgroundColor: COLORS.primaryLight,
  },
  vehicleTypeLabel: {
    fontSize: FONT.xs,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
  },
  vehicleTypeLabelActive: {
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.medium,
  },
  sizeLimitGrid: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  sizeLimitItem: {
    flex: 1,
  },
  sizeLimitLabel: {
    fontSize: FONT.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  sizeLimitInput: {
    backgroundColor: COLORS.borderLight,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT.base,
    color: COLORS.text,
    textAlign: 'center',
  },
  durationRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  durationItem: {
    flex: 1,
  },
  bookingModeRow: {
    marginTop: SPACING.sm,
  },
  bookingModeLabel: {
    fontSize: FONT.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  bookingModeOptions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  bookingModeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.borderLight,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bookingModeOptionActive: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primary,
  },
  bookingModeText: {
    fontSize: FONT.sm,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHT.medium,
  },
  bookingModeTextActive: {
    color: COLORS.primary,
  },

  // FAB
  fabContainer: {
    position: 'absolute',
    right: SPACING.lg,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.full,
    gap: SPACING.sm,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  fabPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
  fabText: {
    fontSize: FONT.base,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
  },

  // Empty State
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.xxxl,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  emptyTitle: {
    fontSize: FONT.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  emptyMessage: {
    fontSize: FONT.base,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  emptyAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  emptyActionText: {
    fontSize: FONT.base,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.medium,
  },

  // Modals
  modalOverlay: {
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
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.overlay,
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: '90%',
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: SPACING.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  modalTitle: {
    fontSize: FONT.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.text,
  },
  modalContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.md,
    marginTop: SPACING.xl,
    marginBottom: SPACING.lg,
  },

  // Property Selector Modal
  propertySelectorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  propertySelectorItemActive: {
    backgroundColor: COLORS.primaryLight,
    marginHorizontal: -SPACING.lg,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
  },
  propertySelectorIcon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  propertySelectorInfo: {
    flex: 1,
  },
  propertySelectorName: {
    fontSize: FONT.base,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.text,
  },
  propertySelectorMeta: {
    fontSize: FONT.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  addPropertyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
    gap: SPACING.sm,
  },
  addPropertyBtnText: {
    fontSize: FONT.base,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.medium,
  },

  // Forms
  formGroup: {
    marginBottom: SPACING.lg,
  },
  formLabel: {
    fontSize: FONT.sm,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  formInput: {
    backgroundColor: COLORS.borderLight,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: FONT.base,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  formInputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  formInputError: {
    borderColor: COLORS.danger,
  },
  formError: {
    fontSize: FONT.xs,
    color: COLORS.danger,
    marginTop: SPACING.xs,
  },
  formDescription: {
    fontSize: FONT.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  formToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  formToggleLabels: {
    flex: 1,
    marginRight: SPACING.md,
  },

  // Zone Type Picker
  zoneTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  zoneTypeOption: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.borderLight,
  },
  zoneTypeOptionText: {
    fontSize: FONT.sm,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHT.medium,
  },

  // Zone Selector
  zoneSelector: {
    flexDirection: 'row',
    marginBottom: SPACING.sm,
  },
  zoneSelectorItem: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.borderLight,
    marginRight: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  zoneSelectorItemActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  zoneSelectorText: {
    fontSize: FONT.sm,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHT.medium,
  },
  zoneSelectorTextActive: {
    color: COLORS.white,
  },

  // Status Selector
  statusSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.borderLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.xs,
  },
  statusOptionText: {
    fontSize: FONT.sm,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHT.medium,
  },

  // Buttons
  saveBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    minWidth: 100,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: FONT.base,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  deleteBtnText: {
    fontSize: FONT.base,
    color: COLORS.danger,
    fontWeight: FONT_WEIGHT.medium,
  },

  // Confirm Modal
  confirmOverlay: {
    // Absolutely positioned rather than flex:1 — no longer inside a
    // <Modal>, which does not present on this build.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 24,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  confirmBox: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 320,
  },
  confirmTitle: {
    fontSize: FONT.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  confirmMessage: {
    fontSize: FONT.base,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
    lineHeight: 22,
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.md,
  },
  confirmButton: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    minWidth: 80,
    alignItems: 'center',
  },
  confirmButtonCancel: {
    backgroundColor: COLORS.borderLight,
  },
  confirmButtonCancelText: {
    fontSize: FONT.base,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHT.medium,
  },
  confirmButtonText: {
    fontSize: FONT.base,
    color: COLORS.white,
    fontWeight: FONT_WEIGHT.semibold,
  },

  // Toast
  toast: {
    position: 'absolute',
    left: SPACING.lg,
    right: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
  },
  toastText: {
    fontSize: FONT.base,
    color: COLORS.white,
    fontWeight: FONT_WEIGHT.medium,
    flex: 1,
  },

  // Error Banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.dangerLight,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  errorBannerText: {
    flex: 1,
    fontSize: FONT.sm,
    color: COLORS.danger,
  },
});
