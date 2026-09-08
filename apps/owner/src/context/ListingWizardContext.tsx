import React, { createContext, useCallback, useContext, useEffect, useReducer, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SpaceType, SpaceVehicleType, BookingMode } from '../types/api';

// ============================================================================
// Shape of wizard data
// ============================================================================

export interface PropertyWizardData {
  propertyName: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  locationLat: number | null;
  locationLng: number | null;
  accessInstructions: string;
  propertyImages: string[];
}

export interface AvailabilityLocal {
  is24_7: boolean;
  schedules: {
    dayOfWeek: number;      // 0..6
    availableFrom: string;  // "HH:MM"
    availableTo: string;    // "HH:MM"
    enabled: boolean;
  }[];
}

export interface SpaceWizardData {
  // Step 1: Dimensions
  spaceNumber: string;
  spaceType: SpaceType | '';
  lengthMeters: number | null;
  widthMeters: number | null;
  heightMeters: number | null;
  spaceDescription: string;

  // Step 2: Photos
  spaceImages: string[];

  // Step 3: Pricing
  pricePerHour: number | null;
  pricePerDay: number | null;
  pricePerMonth: number | null;

  // Step 4: Availability
  availability: AvailabilityLocal;

  // Step 5: Rules
  allowedVehicleTypes: SpaceVehicleType[];
  bookingMode: BookingMode;
  hasEvCharging: boolean;
  totalSpots: number;

  // Edit mode
  editSpaceId?: string;
  propertyId?: string;
}

// ============================================================================
// Initial state
// ============================================================================

const INITIAL_PROPERTY: PropertyWizardData = {
  propertyName: '',
  address: '',
  city: '',
  state: '',
  postalCode: '',
  locationLat: null,
  locationLng: null,
  accessInstructions: '',
  propertyImages: [],
};

const DEFAULT_AVAILABILITY: AvailabilityLocal = {
  is24_7: true,
  schedules: Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i,
    availableFrom: '09:00',
    availableTo: '18:00',
    enabled: false,
  })),
};

const INITIAL_SPACE: SpaceWizardData = {
  spaceNumber: '',
  spaceType: '',
  lengthMeters: null,
  widthMeters: null,
  heightMeters: null,
  spaceDescription: '',
  spaceImages: [],
  pricePerHour: null,
  pricePerDay: null,
  pricePerMonth: null,
  availability: DEFAULT_AVAILABILITY,
  allowedVehicleTypes: ['car'],
  bookingMode: 'instant',
  hasEvCharging: false,
  totalSpots: 1,
};

// ============================================================================
// Storage keys
// ============================================================================

const PROPERTY_DRAFT_KEY = 'owners:propertyWizardDraft.v1';
const SPACE_DRAFT_KEY = 'owners:spaceWizardDraft.v1';
const AUTOSAVE_DELAY = 800;

// ============================================================================
// Property Wizard Context
// ============================================================================

interface PropertyWizardValue {
  data: PropertyWizardData;
  editPropertyId?: string;
  chainToSpace: boolean;
  updateField: <K extends keyof PropertyWizardData>(key: K, value: PropertyWizardData[K]) => void;
  replaceData: (data: Partial<PropertyWizardData>) => void;
  reset: () => void;
  setEditPropertyId: (id?: string) => void;
  setChainToSpace: (flag: boolean) => void;
  getPayload: () => Partial<import('../types/api').ApiProperty>;
}

type PropertyAction =
  | { type: 'UPDATE'; key: keyof PropertyWizardData; value: any }
  | { type: 'REPLACE'; data: Partial<PropertyWizardData> }
  | { type: 'RESET' }
  | { type: 'SET_EDIT_ID'; id?: string }
  | { type: 'SET_CHAIN'; flag: boolean }
  | { type: 'HYDRATE'; data: PropertyWizardData; editId?: string };

interface PropertyState {
  data: PropertyWizardData;
  editPropertyId?: string;
  chainToSpace: boolean;
}

function propertyReducer(state: PropertyState, action: PropertyAction): PropertyState {
  switch (action.type) {
    case 'UPDATE':
      return { ...state, data: { ...state.data, [action.key]: action.value } };
    case 'REPLACE':
      return { ...state, data: { ...state.data, ...action.data } };
    case 'RESET':
      return { data: INITIAL_PROPERTY, editPropertyId: undefined, chainToSpace: false };
    case 'SET_EDIT_ID':
      return { ...state, editPropertyId: action.id };
    case 'SET_CHAIN':
      return { ...state, chainToSpace: action.flag };
    case 'HYDRATE':
      // Chain flag is session-scoped: never restore from storage.
      return { data: action.data, editPropertyId: action.editId, chainToSpace: state.chainToSpace };
    default:
      return state;
  }
}

const PropertyWizardContext = createContext<PropertyWizardValue | undefined>(undefined);

export function PropertyWizardProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(propertyReducer, {
    data: INITIAL_PROPERTY,
    chainToSpace: false,
  });
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate draft from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(PROPERTY_DRAFT_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          dispatch({ type: 'HYDRATE', data: parsed.data, editId: parsed.editPropertyId });
        } catch {
          /* ignore corrupt draft */
        }
      }
    });
  }, []);

  // Autosave on change (exclude chainToSpace — it's session-scoped)
  useEffect(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      const { chainToSpace, ...persistable } = state;
      AsyncStorage.setItem(PROPERTY_DRAFT_KEY, JSON.stringify(persistable)).catch(() => {});
    }, AUTOSAVE_DELAY);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [state]);

  const updateField = useCallback(<K extends keyof PropertyWizardData>(
    key: K,
    value: PropertyWizardData[K],
  ) => {
    dispatch({ type: 'UPDATE', key, value });
  }, []);

  const replaceData = useCallback((data: Partial<PropertyWizardData>) => {
    dispatch({ type: 'REPLACE', data });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
    AsyncStorage.removeItem(PROPERTY_DRAFT_KEY).catch(() => {});
  }, []);

  const setEditPropertyId = useCallback((id?: string) => {
    dispatch({ type: 'SET_EDIT_ID', id });
  }, []);

  const setChainToSpace = useCallback((flag: boolean) => {
    dispatch({ type: 'SET_CHAIN', flag });
  }, []);

  const getPayload = useCallback(() => {
    const d = state.data;
    return {
      propertyName: d.propertyName.trim(),
      address: d.address.trim(),
      city: d.city.trim(),
      state: d.state.trim(),
      postalCode: d.postalCode.trim(),
      // The wizard has no country field — every property is in India — but
      // POST /properties requires one, so send it explicitly.
      country: 'IN',
      locationLat: d.locationLat ?? 0,
      locationLng: d.locationLng ?? 0,
      accessInstructions: d.accessInstructions.trim(),
      propertyImages: d.propertyImages,
    };
  }, [state.data]);

  return (
    <PropertyWizardContext.Provider
      value={{
        data: state.data,
        editPropertyId: state.editPropertyId,
        chainToSpace: state.chainToSpace,
        updateField,
        replaceData,
        reset,
        setEditPropertyId,
        setChainToSpace,
        getPayload,
      }}
    >
      {children}
    </PropertyWizardContext.Provider>
  );
}

export function usePropertyWizard(): PropertyWizardValue {
  const ctx = useContext(PropertyWizardContext);
  if (!ctx) throw new Error('usePropertyWizard must be used inside <PropertyWizardProvider>');
  return ctx;
}

// ============================================================================
// Space Wizard Context
// ============================================================================

interface SpaceWizardValue {
  data: SpaceWizardData;
  updateField: <K extends keyof SpaceWizardData>(key: K, value: SpaceWizardData[K]) => void;
  updateAvailability: (patch: Partial<AvailabilityLocal>) => void;
  updateAvailabilitySlot: (index: number, patch: Partial<AvailabilityLocal['schedules'][number]>) => void;
  replaceData: (data: Partial<SpaceWizardData>) => void;
  reset: () => void;
  getSpacePayload: () => Partial<import('../types/api').ApiSpace>;
  getAvailabilityPayload: () => Array<{ dayOfWeek: number; availableFrom: string; availableTo: string }>;
}

type SpaceAction =
  | { type: 'UPDATE'; key: keyof SpaceWizardData; value: any }
  | { type: 'UPDATE_AVAIL'; patch: Partial<AvailabilityLocal> }
  | { type: 'UPDATE_AVAIL_SLOT'; index: number; patch: Partial<AvailabilityLocal['schedules'][number]> }
  | { type: 'REPLACE'; data: Partial<SpaceWizardData> }
  | { type: 'RESET' }
  | { type: 'HYDRATE'; data: SpaceWizardData };

function spaceReducer(state: SpaceWizardData, action: SpaceAction): SpaceWizardData {
  switch (action.type) {
    case 'UPDATE':
      return { ...state, [action.key]: action.value };
    case 'UPDATE_AVAIL':
      return { ...state, availability: { ...state.availability, ...action.patch } };
    case 'UPDATE_AVAIL_SLOT': {
      const schedules = state.availability.schedules.map((s, i) =>
        i === action.index ? { ...s, ...action.patch } : s,
      );
      return { ...state, availability: { ...state.availability, schedules } };
    }
    case 'REPLACE':
      return { ...state, ...action.data };
    case 'RESET':
      return INITIAL_SPACE;
    case 'HYDRATE':
      return action.data;
    default:
      return state;
  }
}

const SpaceWizardContext = createContext<SpaceWizardValue | undefined>(undefined);

export function SpaceWizardProvider({ children }: { children: React.ReactNode }) {
  const [data, dispatch] = useReducer(spaceReducer, INITIAL_SPACE);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(SPACE_DRAFT_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          dispatch({ type: 'HYDRATE', data: parsed });
        } catch {
          /* ignore */
        }
      }
    });
  }, []);

  useEffect(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      AsyncStorage.setItem(SPACE_DRAFT_KEY, JSON.stringify(data)).catch(() => {});
    }, AUTOSAVE_DELAY);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [data]);

  const updateField = useCallback(<K extends keyof SpaceWizardData>(
    key: K,
    value: SpaceWizardData[K],
  ) => {
    dispatch({ type: 'UPDATE', key, value });
  }, []);

  const updateAvailability = useCallback((patch: Partial<AvailabilityLocal>) => {
    dispatch({ type: 'UPDATE_AVAIL', patch });
  }, []);

  const updateAvailabilitySlot = useCallback(
    (index: number, patch: Partial<AvailabilityLocal['schedules'][number]>) => {
      dispatch({ type: 'UPDATE_AVAIL_SLOT', index, patch });
    },
    [],
  );

  const replaceData = useCallback((patch: Partial<SpaceWizardData>) => {
    dispatch({ type: 'REPLACE', data: patch });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
    AsyncStorage.removeItem(SPACE_DRAFT_KEY).catch(() => {});
  }, []);

  const getSpacePayload = useCallback(() => {
    return {
      spaceNumber: data.spaceNumber.trim(),
      spaceType: data.spaceType || undefined,
      lengthMeters: data.lengthMeters ?? 0,
      widthMeters: data.widthMeters ?? 0,
      heightMeters: data.heightMeters ?? undefined,
      spaceDescription: data.spaceDescription.trim() || undefined,
      spaceImages: data.spaceImages,
      pricePerHour: data.pricePerHour ?? 0,
      pricePerDay: data.pricePerDay ?? undefined,
      pricePerMonth: data.pricePerMonth ?? undefined,
      allowedVehicleTypes: data.allowedVehicleTypes,
      bookingMode: data.bookingMode,
      hasEvCharging: data.hasEvCharging,
      totalSpots: data.totalSpots ?? 1,
    } as any;
  }, [data]);

  const getAvailabilityPayload = useCallback(() => {
    if (data.availability.is24_7) return [];
    return data.availability.schedules
      .filter((s) => s.enabled)
      .map((s) => ({
        dayOfWeek: s.dayOfWeek,
        availableFrom: s.availableFrom,
        availableTo: s.availableTo,
      }));
  }, [data]);

  return (
    <SpaceWizardContext.Provider
      value={{
        data,
        updateField,
        updateAvailability,
        updateAvailabilitySlot,
        replaceData,
        reset,
        getSpacePayload,
        getAvailabilityPayload,
      }}
    >
      {children}
    </SpaceWizardContext.Provider>
  );
}

export function useSpaceWizard(): SpaceWizardValue {
  const ctx = useContext(SpaceWizardContext);
  if (!ctx) throw new Error('useSpaceWizard must be used inside <SpaceWizardProvider>');
  return ctx;
}
