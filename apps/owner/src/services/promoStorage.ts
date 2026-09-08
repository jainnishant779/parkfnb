// Promo Storage Service - Local persistence for promotions
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  Promo,
  PromosUIState,
  PromoSortOption,
  PromosStorageSchema,
  PromoStatus,
  PromoTabCounts,
} from '../types/promo';
import { seedPromos, defaultPromosUIState, defaultPromoSortPref } from '../constants/seedPromos';

// Storage keys
export const PROMO_STORAGE_KEYS = {
  PROMOS: 'owner_promos_v1',
  UI_STATE: 'owner_promos_ui_state',
  SORT_PREF: 'promo_sort_pref',
  SEEDED: 'owner_promos_seeded',
} as const;

// Current schema version
const CURRENT_SCHEMA_VERSION = 1;

// Safe JSON parsing utility
function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// Generate UUID
export function generatePromoId(): string {
  return `promo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Generate promo code
export function generatePromoCode(): string {
  const prefixes = ['SAVE', 'PARK', 'DEAL', 'GET', 'WIN'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const number = Math.floor(Math.random() * 50) + 5;
  const suffix = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}${number}${suffix}`;
}

// Derive promo status from dates and flags
export function derivePromoStatus(promo: Promo): PromoStatus {
  if (promo.isDraft) return 'DRAFT';
  if (!promo.enabled) return 'DISABLED';

  const now = new Date();
  const startAt = new Date(promo.startAt);
  const endAt = new Date(promo.endAt);

  if (now > endAt) return 'EXPIRED';
  if (now < startAt) return 'SCHEDULED';
  return 'ACTIVE';
}

// Check if promos have been seeded
export async function isPromosSeeded(): Promise<boolean> {
  try {
    const seeded = await AsyncStorage.getItem(PROMO_STORAGE_KEYS.SEEDED);
    return seeded === 'true';
  } catch {
    return false;
  }
}

// Seed promos data if not already seeded
export async function seedPromosData(): Promise<void> {
  try {
    const alreadySeeded = await isPromosSeeded();
    if (alreadySeeded) return;

    const storageSchema: PromosStorageSchema = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      promos: seedPromos,
      lastUpdated: new Date().toISOString(),
    };

    await AsyncStorage.multiSet([
      [PROMO_STORAGE_KEYS.PROMOS, JSON.stringify(storageSchema)],
      [PROMO_STORAGE_KEYS.UI_STATE, JSON.stringify(defaultPromosUIState)],
      [PROMO_STORAGE_KEYS.SORT_PREF, defaultPromoSortPref],
      [PROMO_STORAGE_KEYS.SEEDED, 'true'],
    ]);
  } catch (error) {
    console.error('Failed to seed promos data:', error);
  }
}

// Migrate schema if needed
function migrateSchema(schema: PromosStorageSchema): PromosStorageSchema {
  let currentSchema = { ...schema };

  // Add migration logic here as versions increase
  // Example:
  // if (currentSchema.schemaVersion < 2) {
  //   currentSchema.promos = currentSchema.promos.map(p => ({
  //     ...p,
  //     newField: defaultValue
  //   }));
  //   currentSchema.schemaVersion = 2;
  // }

  return currentSchema;
}

// Get all promos
export async function getPromos(): Promise<Promo[]> {
  try {
    await seedPromosData();
    const stored = await AsyncStorage.getItem(PROMO_STORAGE_KEYS.PROMOS);

    if (!stored) return seedPromos;

    const schema: PromosStorageSchema = JSON.parse(stored);

    // Migrate if needed
    if (schema.schemaVersion < CURRENT_SCHEMA_VERSION) {
      const migrated = migrateSchema(schema);
      await savePromosSchema(migrated);
      return migrated.promos;
    }

    return schema.promos;
  } catch {
    return seedPromos;
  }
}

// Save promos schema
async function savePromosSchema(schema: PromosStorageSchema): Promise<void> {
  try {
    await AsyncStorage.setItem(PROMO_STORAGE_KEYS.PROMOS, JSON.stringify(schema));
  } catch (error) {
    console.error('Failed to save promos schema:', error);
  }
}

// Save all promos
export async function savePromos(promos: Promo[]): Promise<void> {
  try {
    const schema: PromosStorageSchema = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      promos,
      lastUpdated: new Date().toISOString(),
    };
    await savePromosSchema(schema);
  } catch (error) {
    console.error('Failed to save promos:', error);
  }
}

// Get a single promo by ID
export async function getPromoById(promoId: string): Promise<Promo | null> {
  try {
    const promos = await getPromos();
    return promos.find(p => p.id === promoId) || null;
  } catch {
    return null;
  }
}

// Check if promo code is unique
export async function isPromoCodeUnique(code: string, excludeId?: string): Promise<boolean> {
  try {
    const promos = await getPromos();
    const normalizedCode = code.toUpperCase().trim();
    return !promos.some(p => p.code === normalizedCode && p.id !== excludeId);
  } catch {
    return true;
  }
}

// Create a new promo
export async function createPromo(promo: Omit<Promo, 'id' | 'createdAt' | 'updatedAt'>): Promise<Promo> {
  const promos = await getPromos();
  const now = new Date().toISOString();

  const newPromo: Promo = {
    ...promo,
    id: generatePromoId(),
    createdAt: now,
    updatedAt: now,
  };

  await savePromos([...promos, newPromo]);
  return newPromo;
}

// Update a promo
export async function updatePromo(promoId: string, updates: Partial<Promo>): Promise<Promo | null> {
  try {
    const promos = await getPromos();
    const index = promos.findIndex(p => p.id === promoId);

    if (index === -1) return null;

    const updated: Promo = {
      ...promos[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    promos[index] = updated;
    await savePromos(promos);
    return updated;
  } catch (error) {
    console.error('Failed to update promo:', error);
    return null;
  }
}

// Toggle promo enabled status
export async function togglePromoEnabled(promoId: string): Promise<Promo | null> {
  const promo = await getPromoById(promoId);
  if (!promo) return null;

  // Don't allow enabling if expired
  const status = derivePromoStatus(promo);
  if (status === 'EXPIRED' && !promo.enabled) {
    return null;
  }

  return updatePromo(promoId, { enabled: !promo.enabled });
}

// Duplicate a promo
export async function duplicatePromo(promoId: string): Promise<Promo | null> {
  try {
    const promos = await getPromos();
    const original = promos.find(p => p.id === promoId);

    if (!original) return null;

    const now = new Date().toISOString();

    // Generate a unique code for the duplicate
    let newCode = `${original.code}_COPY`;
    let counter = 1;
    while (promos.some(p => p.code === newCode)) {
      newCode = `${original.code}_COPY${counter}`;
      counter++;
    }

    const duplicated: Promo = {
      ...original,
      id: generatePromoId(),
      name: `${original.name} (Copy)`,
      code: newCode.substring(0, 16), // Ensure max 16 chars
      enabled: false,
      isDraft: true,
      usage: {
        ...original.usage,
        usedCount: 0,
      },
      createdAt: now,
      updatedAt: now,
    };

    await savePromos([...promos, duplicated]);
    return duplicated;
  } catch (error) {
    console.error('Failed to duplicate promo:', error);
    return null;
  }
}

// Delete a promo
export async function deletePromo(promoId: string): Promise<boolean> {
  try {
    const promos = await getPromos();
    const filtered = promos.filter(p => p.id !== promoId);

    if (filtered.length === promos.length) return false;

    await savePromos(filtered);
    return true;
  } catch (error) {
    console.error('Failed to delete promo:', error);
    return false;
  }
}

// Restore a deleted promo (for undo)
export async function restorePromo(promo: Promo): Promise<boolean> {
  try {
    const promos = await getPromos();
    await savePromos([...promos, promo]);
    return true;
  } catch (error) {
    console.error('Failed to restore promo:', error);
    return false;
  }
}

// Get promos UI state
export async function getPromosUIState(): Promise<PromosUIState> {
  try {
    const stored = await AsyncStorage.getItem(PROMO_STORAGE_KEYS.UI_STATE);
    return safeJsonParse(stored, defaultPromosUIState);
  } catch {
    return defaultPromosUIState;
  }
}

// Save promos UI state
export async function savePromosUIState(state: Partial<PromosUIState>): Promise<void> {
  try {
    const current = await getPromosUIState();
    const updated = { ...current, ...state };
    await AsyncStorage.setItem(PROMO_STORAGE_KEYS.UI_STATE, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save promos UI state:', error);
  }
}

// Get sort preference
export async function getPromoSortPref(): Promise<PromoSortOption> {
  try {
    const stored = await AsyncStorage.getItem(PROMO_STORAGE_KEYS.SORT_PREF);
    if (stored && ['newest', 'ending_soon', 'highest_value', 'alphabetical'].includes(stored)) {
      return stored as PromoSortOption;
    }
    return defaultPromoSortPref;
  } catch {
    return defaultPromoSortPref;
  }
}

// Save sort preference
export async function savePromoSortPref(sortOption: PromoSortOption): Promise<void> {
  try {
    await AsyncStorage.setItem(PROMO_STORAGE_KEYS.SORT_PREF, sortOption);
  } catch (error) {
    console.error('Failed to save promo sort preference:', error);
  }
}

// Filter promos by status
export function filterPromosByStatus(promos: Promo[], status: PromoStatus | 'ALL'): Promo[] {
  if (status === 'ALL') return promos;

  return promos.filter(promo => derivePromoStatus(promo) === status);
}

// Filter promos by search text
export function filterPromosBySearch(promos: Promo[], searchText: string): Promo[] {
  if (!searchText.trim()) return promos;

  const search = searchText.toLowerCase().trim();
  return promos.filter(p =>
    p.name.toLowerCase().includes(search) ||
    p.code.toLowerCase().includes(search)
  );
}

// Sort promos
export function sortPromos(promos: Promo[], sortOption: PromoSortOption): Promo[] {
  const sorted = [...promos];

  switch (sortOption) {
    case 'newest':
      sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      break;
    case 'ending_soon':
      sorted.sort((a, b) => new Date(a.endAt).getTime() - new Date(b.endAt).getTime());
      break;
    case 'highest_value':
      sorted.sort((a, b) => {
        // Compare percent vs flat differently - percent value is more impactful
        const aValue = a.type === 'PERCENT' ? a.value * 10 : a.value;
        const bValue = b.type === 'PERCENT' ? b.value * 10 : b.value;
        return bValue - aValue;
      });
      break;
    case 'alphabetical':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    default:
      sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  return sorted;
}

// Get promo tab counts
export function getPromoTabCounts(promos: Promo[]): PromoTabCounts {
  return {
    active: promos.filter(p => derivePromoStatus(p) === 'ACTIVE').length,
    scheduled: promos.filter(p => derivePromoStatus(p) === 'SCHEDULED').length,
    expired: promos.filter(p => derivePromoStatus(p) === 'EXPIRED').length,
    draft: promos.filter(p => derivePromoStatus(p) === 'DRAFT').length,
  };
}

// Full filter and sort pipeline
export interface PromoFilterOptions {
  status: PromoStatus | 'ALL';
  searchText: string;
  sortOption: PromoSortOption;
}

export function filterAndSortPromos(promos: Promo[], options: PromoFilterOptions): Promo[] {
  let result = [...promos];

  // Filter by status
  result = filterPromosByStatus(result, options.status);

  // Filter by search
  result = filterPromosBySearch(result, options.searchText);

  // Sort
  result = sortPromos(result, options.sortOption);

  return result;
}

// Load all promos data
export interface PromosData {
  promos: Promo[];
  uiState: PromosUIState;
  tabCounts: PromoTabCounts;
  sortPref: PromoSortOption;
}

export async function loadAllPromosData(): Promise<PromosData> {
  await seedPromosData();

  const [promos, uiState, sortPref] = await Promise.all([
    getPromos(),
    getPromosUIState(),
    getPromoSortPref(),
  ]);

  return {
    promos,
    uiState,
    tabCounts: getPromoTabCounts(promos),
    sortPref,
  };
}

// Clear all promos data (for testing/reset)
export async function clearAllPromosData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      PROMO_STORAGE_KEYS.PROMOS,
      PROMO_STORAGE_KEYS.UI_STATE,
      PROMO_STORAGE_KEYS.SORT_PREF,
      PROMO_STORAGE_KEYS.SEEDED,
    ]);
  } catch (error) {
    console.error('Failed to clear promos data:', error);
  }
}

// Reset promos to seed data (for error recovery)
export async function resetPromosToSeed(): Promise<void> {
  try {
    await clearAllPromosData();
    await seedPromosData();
  } catch (error) {
    console.error('Failed to reset promos data:', error);
  }
}
