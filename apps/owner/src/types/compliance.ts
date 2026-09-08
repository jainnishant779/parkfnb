// ============================================================================
// COMPLIANCE TYPES - Industrial Owner Flow
// ============================================================================

// Vehicle types for industrial bookings
export type VehicleType = 'truck' | 'trailer' | 'van';

// Slot size tiers
export type SlotTier = 'S' | 'M' | 'L';

// Compliance item types
export type ComplianceItemType = 'driverId' | 'permit' | 'insurance' | 'briefing';

// Compliance item states
export type ComplianceItemState = 'missing' | 'uploaded' | 'verified' | 'expiring';

// Booking compliance status (derived)
export type BookingComplianceStatus = 'missing' | 'expiring' | 'pending' | 'compliant';

// Status filter options
export type StatusFilter = 'all' | 'missing' | 'expiring' | 'pending' | 'compliant';

// Template scope
export type TemplateScope = 'vehicleType' | 'slotTier';

// ============================================================================
// DATA MODELS
// ============================================================================

/**
 * Individual compliance item within a booking
 */
export interface ComplianceItem {
  id: string;
  type: ComplianceItemType;
  state: ComplianceItemState;
  docNumber?: string;
  issuedAt?: string; // ISO date string
  expiresAt?: string; // ISO date string
  notes?: string;
  verifiedAt?: string; // ISO date string
  verifiedBy?: string;
}

/**
 * Booking with compliance requirements
 */
export interface BookingCompliance {
  id: string;
  bookingRef: string;
  clientName: string;
  clientCompany?: string;
  startAt: string; // ISO date string
  endAt: string; // ISO date string
  vehicleType: VehicleType;
  slotTier: SlotTier;
  checklist: ComplianceItem[];
  internalNotes: string;
  flagged: boolean;
  flagReason?: string;
  markedCompliantAt?: string; // ISO date string
}

/**
 * Compliance template for reuse
 */
export interface ComplianceTemplate {
  id: string;
  name: string;
  scope: TemplateScope;
  scopeValue: string; // e.g., 'truck' or 'L'
  requiredTypes: ComplianceItemType[];
  expiryWarningDays: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Whitelist client entry
 */
export interface WhitelistClient {
  id: string;
  name: string;
  company?: string;
  addedAt: string;
}

/**
 * Whitelist configuration
 */
export interface WhitelistConfig {
  enabled: boolean;
  clients: WhitelistClient[];
}

/**
 * History event for audit trail
 */
export interface ComplianceHistoryEvent {
  id: string;
  createdAt: string;
  label: string;
  bookingId?: string;
  bookingRef?: string;
  eventType: 'status_change' | 'document_update' | 'verification' | 'flag' | 'whitelist' | 'template';
}

// ============================================================================
// FILTER STATE
// ============================================================================

export interface ComplianceFilters {
  status: StatusFilter;
  vehicleTypes: VehicleType[];
  slotTiers: SlotTier[];
  searchQuery: string;
}

// ============================================================================
// COMPUTED STATS
// ============================================================================

export interface ComplianceStats {
  pendingReview: number;
  missingDocs: number;
  expiringSoon: number;
  compliant: number;
  total: number;
}

// ============================================================================
// ASYNC STORAGE KEYS
// ============================================================================

export const COMPLIANCE_STORAGE_KEYS = {
  BOOKINGS: '@ownerapp/industrial_compliance_bookings_v1',
  TEMPLATES: '@ownerapp/industrial_compliance_templates_v1',
  WHITELIST: '@ownerapp/industrial_whitelist_v1',
  HISTORY: '@ownerapp/industrial_compliance_history_v1',
} as const;

// ============================================================================
// UI CONSTANTS
// ============================================================================

export const COMPLIANCE_ITEM_LABELS: Record<ComplianceItemType, string> = {
  driverId: 'Driver ID',
  permit: 'Vehicle Permit',
  insurance: 'Insurance',
  briefing: 'Safety Briefing',
};

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  truck: 'Truck',
  trailer: 'Trailer',
  van: 'Van',
};

export const SLOT_TIER_LABELS: Record<SlotTier, string> = {
  S: 'Small',
  M: 'Medium',
  L: 'Large',
};

export const STATUS_COLORS: Record<BookingComplianceStatus, { bg: string; text: string; dot: string }> = {
  missing: { bg: '#FEF2F2', text: '#DC2626', dot: '#EF4444' },
  expiring: { bg: '#FFFBEB', text: '#D97706', dot: '#F59E0B' },
  pending: { bg: '#F1F5F9', text: '#64748B', dot: '#94A3B8' },
  compliant: { bg: '#ECFDF5', text: '#059669', dot: '#10B981' },
};

export const ITEM_STATE_COLORS: Record<ComplianceItemState, { bg: string; text: string }> = {
  missing: { bg: '#FEF2F2', text: '#DC2626' },
  uploaded: { bg: '#E8F5F4', text: '#0D7377' },
  verified: { bg: '#ECFDF5', text: '#059669' },
  expiring: { bg: '#FFFBEB', text: '#D97706' },
};

export const DEFAULT_EXPIRY_WARNING_DAYS = 14;
