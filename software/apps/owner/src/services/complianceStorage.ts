// ============================================================================
// COMPLIANCE STORAGE SERVICE - AsyncStorage utilities
// ============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  BookingCompliance,
  ComplianceTemplate,
  WhitelistConfig,
  ComplianceHistoryEvent,
  ComplianceStats,
  ComplianceItem,
  BookingComplianceStatus,
} from '../types/compliance';
import {
  COMPLIANCE_STORAGE_KEYS,
  DEFAULT_EXPIRY_WARNING_DAYS,
} from '../types/compliance';
import {
  SEED_BOOKINGS,
  SEED_TEMPLATES,
  SEED_WHITELIST,
  SEED_HISTORY,
} from '../constants/complianceMockData';

// ============================================================================
// HELPER UTILITIES
// ============================================================================

export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const formatDateTime = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export const formatDate = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const formatShortDate = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

export const formatTimeRange = (startAt: string, endAt: string): string => {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${startStr} - ${endStr}`;
};

export const daysUntil = (isoString: string): number => {
  const target = new Date(isoString);
  const now = new Date();
  const diffTime = target.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

export const isExpiringSoon = (
  expiresAt: string | undefined,
  warningDays: number = DEFAULT_EXPIRY_WARNING_DAYS
): boolean => {
  if (!expiresAt) return false;
  const days = daysUntil(expiresAt);
  return days > 0 && days <= warningDays;
};

export const isExpired = (expiresAt: string | undefined): boolean => {
  if (!expiresAt) return false;
  return daysUntil(expiresAt) <= 0;
};

// ============================================================================
// STATUS DERIVATION
// ============================================================================

export const deriveItemState = (
  item: ComplianceItem,
  warningDays: number = DEFAULT_EXPIRY_WARNING_DAYS
): ComplianceItem['state'] => {
  if (item.state === 'missing') return 'missing';
  if (item.expiresAt && isExpired(item.expiresAt)) return 'missing'; // Treat expired as missing
  if (item.expiresAt && isExpiringSoon(item.expiresAt, warningDays)) return 'expiring';
  return item.state;
};

export const deriveBookingStatus = (
  booking: BookingCompliance,
  warningDays: number = DEFAULT_EXPIRY_WARNING_DAYS
): BookingComplianceStatus => {
  const items = booking.checklist;

  if (items.length === 0) return 'missing';

  const hasMissing = items.some(
    (item) => item.state === 'missing' || (item.expiresAt && isExpired(item.expiresAt))
  );
  if (hasMissing) return 'missing';

  const hasExpiring = items.some(
    (item) => item.expiresAt && isExpiringSoon(item.expiresAt, warningDays)
  );
  if (hasExpiring) return 'expiring';

  const hasPending = items.some((item) => item.state === 'uploaded');
  if (hasPending) return 'pending';

  const allVerified = items.every((item) => item.state === 'verified');
  if (allVerified) return 'compliant';

  return 'pending';
};

export const getCompletionProgress = (
  booking: BookingCompliance
): { completed: number; total: number } => {
  const total = booking.checklist.length;
  const completed = booking.checklist.filter(
    (item) => item.state === 'verified' || item.state === 'uploaded'
  ).length;
  return { completed, total };
};

// ============================================================================
// STATS COMPUTATION
// ============================================================================

export const computeStats = (
  bookings: BookingCompliance[],
  warningDays: number = DEFAULT_EXPIRY_WARNING_DAYS
): ComplianceStats => {
  let pendingReview = 0;
  let missingDocs = 0;
  let expiringSoon = 0;
  let compliant = 0;

  bookings.forEach((booking) => {
    const status = deriveBookingStatus(booking, warningDays);
    switch (status) {
      case 'missing':
        missingDocs++;
        break;
      case 'expiring':
        expiringSoon++;
        break;
      case 'pending':
        pendingReview++;
        break;
      case 'compliant':
        compliant++;
        break;
    }
  });

  return {
    pendingReview,
    missingDocs,
    expiringSoon,
    compliant,
    total: bookings.length,
  };
};

// ============================================================================
// SAFE STORAGE WRAPPERS
// ============================================================================

interface StorageError {
  hasError: boolean;
  message?: string;
}

let lastStorageError: StorageError = { hasError: false };

export const getLastStorageError = (): StorageError => lastStorageError;
export const clearStorageError = (): void => {
  lastStorageError = { hasError: false };
};

const safeLoad = async <T>(key: string, defaultValue: T): Promise<T> => {
  try {
    const json = await AsyncStorage.getItem(key);
    if (json) {
      return JSON.parse(json) as T;
    }
    return defaultValue;
  } catch (error) {
    console.error(`Failed to load ${key}:`, error);
    lastStorageError = {
      hasError: true,
      message: `Failed to load data: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
    return defaultValue;
  }
};

const safeSave = async <T>(key: string, data: T): Promise<boolean> => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
    lastStorageError = { hasError: false };
    return true;
  } catch (error) {
    console.error(`Failed to save ${key}:`, error);
    lastStorageError = {
      hasError: true,
      message: "Couldn't save locally. Changes may not persist.",
    };
    return false;
  }
};

// ============================================================================
// BOOKINGS CRUD
// ============================================================================

export const loadBookings = async (): Promise<BookingCompliance[]> => {
  const bookings = await safeLoad<BookingCompliance[]>(
    COMPLIANCE_STORAGE_KEYS.BOOKINGS,
    []
  );

  // Seed if empty
  if (bookings.length === 0) {
    await safeSave(COMPLIANCE_STORAGE_KEYS.BOOKINGS, SEED_BOOKINGS);
    return SEED_BOOKINGS;
  }

  return bookings;
};

export const saveBookings = async (bookings: BookingCompliance[]): Promise<boolean> => {
  return safeSave(COMPLIANCE_STORAGE_KEYS.BOOKINGS, bookings);
};

export const updateBooking = async (
  bookingId: string,
  updates: Partial<BookingCompliance>
): Promise<BookingCompliance | null> => {
  const bookings = await loadBookings();
  const index = bookings.findIndex((b) => b.id === bookingId);

  if (index === -1) return null;

  bookings[index] = { ...bookings[index], ...updates };
  await saveBookings(bookings);

  return bookings[index];
};

export const updateComplianceItem = async (
  bookingId: string,
  itemId: string,
  updates: Partial<ComplianceItem>
): Promise<boolean> => {
  const bookings = await loadBookings();
  const bookingIndex = bookings.findIndex((b) => b.id === bookingId);

  if (bookingIndex === -1) return false;

  const itemIndex = bookings[bookingIndex].checklist.findIndex((i) => i.id === itemId);

  if (itemIndex === -1) return false;

  bookings[bookingIndex].checklist[itemIndex] = {
    ...bookings[bookingIndex].checklist[itemIndex],
    ...updates,
  };

  return saveBookings(bookings);
};

// ============================================================================
// TEMPLATES CRUD
// ============================================================================

export const loadTemplates = async (): Promise<ComplianceTemplate[]> => {
  const templates = await safeLoad<ComplianceTemplate[]>(
    COMPLIANCE_STORAGE_KEYS.TEMPLATES,
    []
  );

  // Seed if empty
  if (templates.length === 0) {
    await safeSave(COMPLIANCE_STORAGE_KEYS.TEMPLATES, SEED_TEMPLATES);
    return SEED_TEMPLATES;
  }

  return templates;
};

export const saveTemplates = async (templates: ComplianceTemplate[]): Promise<boolean> => {
  return safeSave(COMPLIANCE_STORAGE_KEYS.TEMPLATES, templates);
};

export const createTemplate = async (
  template: Omit<ComplianceTemplate, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ComplianceTemplate> => {
  const templates = await loadTemplates();
  const now = new Date().toISOString();

  const newTemplate: ComplianceTemplate = {
    ...template,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };

  templates.push(newTemplate);
  await saveTemplates(templates);

  return newTemplate;
};

export const updateTemplate = async (
  templateId: string,
  updates: Partial<ComplianceTemplate>
): Promise<ComplianceTemplate | null> => {
  const templates = await loadTemplates();
  const index = templates.findIndex((t) => t.id === templateId);

  if (index === -1) return null;

  templates[index] = {
    ...templates[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await saveTemplates(templates);
  return templates[index];
};

export const deleteTemplate = async (templateId: string): Promise<boolean> => {
  const templates = await loadTemplates();
  const filtered = templates.filter((t) => t.id !== templateId);

  if (filtered.length === templates.length) return false;

  return saveTemplates(filtered);
};

// ============================================================================
// WHITELIST CRUD
// ============================================================================

export const loadWhitelist = async (): Promise<WhitelistConfig> => {
  const whitelist = await safeLoad<WhitelistConfig | null>(
    COMPLIANCE_STORAGE_KEYS.WHITELIST,
    null
  );

  // Seed if empty
  if (!whitelist) {
    await safeSave(COMPLIANCE_STORAGE_KEYS.WHITELIST, SEED_WHITELIST);
    return SEED_WHITELIST;
  }

  return whitelist;
};

export const saveWhitelist = async (whitelist: WhitelistConfig): Promise<boolean> => {
  return safeSave(COMPLIANCE_STORAGE_KEYS.WHITELIST, whitelist);
};

export const toggleWhitelist = async (enabled: boolean): Promise<boolean> => {
  const whitelist = await loadWhitelist();
  whitelist.enabled = enabled;
  return saveWhitelist(whitelist);
};

export const addWhitelistClient = async (
  name: string,
  company?: string
): Promise<WhitelistConfig> => {
  const whitelist = await loadWhitelist();

  whitelist.clients.push({
    id: generateId(),
    name,
    company,
    addedAt: new Date().toISOString(),
  });

  await saveWhitelist(whitelist);
  return whitelist;
};

export const removeWhitelistClient = async (clientId: string): Promise<WhitelistConfig> => {
  const whitelist = await loadWhitelist();
  whitelist.clients = whitelist.clients.filter((c) => c.id !== clientId);
  await saveWhitelist(whitelist);
  return whitelist;
};

// ============================================================================
// HISTORY CRUD
// ============================================================================

export const loadHistory = async (): Promise<ComplianceHistoryEvent[]> => {
  const history = await safeLoad<ComplianceHistoryEvent[]>(
    COMPLIANCE_STORAGE_KEYS.HISTORY,
    []
  );

  // Seed if empty
  if (history.length === 0) {
    await safeSave(COMPLIANCE_STORAGE_KEYS.HISTORY, SEED_HISTORY);
    return SEED_HISTORY;
  }

  return history;
};

export const saveHistory = async (history: ComplianceHistoryEvent[]): Promise<boolean> => {
  return safeSave(COMPLIANCE_STORAGE_KEYS.HISTORY, history);
};

export const addHistoryEvent = async (
  event: Omit<ComplianceHistoryEvent, 'id' | 'createdAt'>
): Promise<ComplianceHistoryEvent> => {
  const history = await loadHistory();

  const newEvent: ComplianceHistoryEvent = {
    ...event,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };

  // Add to beginning (most recent first)
  history.unshift(newEvent);

  // Keep only last 100 events
  const trimmed = history.slice(0, 100);
  await saveHistory(trimmed);

  return newEvent;
};

// ============================================================================
// COMBINED DATA LOADER
// ============================================================================

export interface ComplianceData {
  bookings: BookingCompliance[];
  templates: ComplianceTemplate[];
  whitelist: WhitelistConfig;
  history: ComplianceHistoryEvent[];
  stats: ComplianceStats;
}

export const loadAllComplianceData = async (): Promise<ComplianceData> => {
  const [bookings, templates, whitelist, history] = await Promise.all([
    loadBookings(),
    loadTemplates(),
    loadWhitelist(),
    loadHistory(),
  ]);

  const stats = computeStats(bookings);

  return {
    bookings,
    templates,
    whitelist,
    history,
    stats,
  };
};
