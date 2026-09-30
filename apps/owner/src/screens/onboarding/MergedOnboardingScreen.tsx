import React, { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  LayoutAnimation,
  UIManager,
  ActivityIndicator,
  BackHandler,
  PermissionsAndroid,
  Linking,
  Keyboard,
  TextInput,
  findNodeHandle,
  type TextStyle,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import FormTextInput from '../../components/inputs/FormTextInput';
import FormPickerInput from '../../components/inputs/FormPickerInput';
import { DateField } from '../../components/inputs/DateField';
import type { ProgressStep } from '../../components/headers/ProgressHeader';
import PincodeAddressBlock, {
  EMPTY_PINCODE_ADDRESS,
  type PincodeAddressValue,
} from '../../components/inputs/PincodeAddressBlock';
import LocationPickerMap, { type LatLng } from '../../components/map/LocationPickerMap';

import { useAuth } from '../../context/AuthContext';
import { ownerService } from '../../services/ownerService';
import { listingService } from '../../services/listingService';
import { reverseGeocode } from '../../services/reverseGeocodeService';
import { AppAlert } from '../../components/common/AppAlert';
import { ownerTypeLabels } from '../../constants/mockData';
import { pickAndUploadImage, handleMediaUploadError, type PickSource } from '../../utils/mediaUpload';
import * as UI from '../../components/ui';
import * as Kit from '../../theme/kit';

// The UI kit is plain JS; give it loose component types and typed font tokens.
const { PillButton, ScreenHeader, ProgressTrack, StatusTag } = UI as unknown as Record<
  string,
  React.ComponentType<any>
>;
const { palette, radii, shadow } = Kit;
const fonts = Kit.fonts as Record<keyof typeof Kit.fonts, TextStyle>;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ============================================================================
// TYPES
// ============================================================================

// 'address' is the unified section that holds the address inputs, the
// map pin, and the address-proof checkbox/upload/alt-address. State
// slices `address`, `location`, and `addressProof` remain separate
// (different shapes) — only the visible UI section is merged.
type SectionId =
  | 'ownerType'
  | 'personal'
  | 'business'
  | 'land'
  | 'address'
  | 'identity'
  | 'bank';

type DocumentType = 'national_id' | 'passport' | 'drivers_license';

interface UploadedFile {
  uri: string;
  url?: string; // populated after upload
}

interface PersonalDetails {
  legalName: string;
  dateOfBirth: string; // YYYY-MM-DD
  email: string;       // optional — empty allowed
}

interface BusinessDetails {
  businessName: string;
  roleDesignation: string;
  registrationId: string;
}

interface LandDetails {
  landLabel: string;
  landmark: string;
}

interface IdentityProof {
  documentType: DocumentType;
  documentNumber: string;
  frontImage: UploadedFile | null;
  backImage: UploadedFile | null;
  selfieImage: UploadedFile | null;
}

interface AddressProofData {
  sameAsProfile: boolean;
  altAddress: PincodeAddressValue;
  proofDocument: UploadedFile | null;
}

interface BankDetails {
  accountHolderName: string;
  accountNumber: string;
  ifscCode: string;
  bankName: string;
}

interface State {
  ownerType: string;
  personal: PersonalDetails;
  business: BusinessDetails;
  land: LandDetails;
  address: PincodeAddressValue;
  location: LatLng;
  identity: IdentityProof;
  addressProof: AddressProofData;
  bank: BankDetails;
  expanded: SectionId | null;
  errors: Record<string, string>;
}

const INITIAL: State = {
  ownerType: '',
  personal: { legalName: '', dateOfBirth: '', email: '' },
  business: { businessName: '', roleDesignation: '', registrationId: '' },
  land: { landLabel: '', landmark: '' },
  address: { ...EMPTY_PINCODE_ADDRESS },
  location: { lat: null, lng: null },
  identity: {
    documentType: 'national_id',
    documentNumber: '',
    frontImage: null,
    backImage: null,
    selfieImage: null,
  },
  addressProof: {
    sameAsProfile: true,
    altAddress: { ...EMPTY_PINCODE_ADDRESS },
    proofDocument: null,
  },
  bank: { accountHolderName: '', accountNumber: '', ifscCode: '', bankName: '' },
  expanded: 'ownerType',
  errors: {},
};

type Action =
  | { type: 'SET'; key: keyof State; value: any }
  | { type: 'PATCH'; key: keyof State; value: any }
  | { type: 'TOGGLE'; section: SectionId }
  | { type: 'EXPAND'; section: SectionId }
  | { type: 'SET_ERRORS'; errors: Record<string, string> }
  | { type: 'HYDRATE'; data: Partial<State> };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET':
      return { ...state, [action.key]: action.value };
    case 'PATCH':
      return { ...state, [action.key]: { ...(state[action.key] as object), ...action.value } };
    case 'TOGGLE':
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      return { ...state, expanded: state.expanded === action.section ? null : action.section };
    case 'EXPAND':
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      return { ...state, expanded: action.section };
    case 'SET_ERRORS':
      return { ...state, errors: action.errors };
    case 'HYDRATE':
      return { ...state, ...action.data };
    default:
      return state;
  }
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'owners:onboardingDraft.v1';
const AUTOSAVE_DELAY = 800;

const OWNER_TYPE_OPTIONS = [
  { value: 'individual', label: ownerTypeLabels.individual },
  { value: 'residential_community', label: ownerTypeLabels.residential_community },
  { value: 'commercial_property', label: ownerTypeLabels.commercial_property },
  { value: 'industrial_facility', label: ownerTypeLabels.industrial_facility },
  { value: 'empty_land', label: ownerTypeLabels.empty_land },
];

const DOCUMENT_TYPE_OPTIONS = [
  { value: 'national_id', label: 'Aadhaar / National ID' },
  { value: 'passport', label: 'Passport' },
  { value: 'drivers_license', label: "Driver's License" },
];

const NEEDS_BUSINESS_NAME = new Set([
  'commercial_property',
  'industrial_facility',
  'residential_community',
  'business',
  'property_manager',
]);

// Step pills shown in the ProgressHeader. The current step is the first
// section whose required fields aren't fully filled — gives the user a
// visible "you're here" indicator + a sense of how much is left.
const PROGRESS_STEPS: ProgressStep[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'address', label: 'Address' },
  { id: 'identity', label: 'Identity' },
  { id: 'bank', label: 'Bank' },
];

// ============================================================================
// COMPONENT
// ============================================================================

export default function MergedOnboardingScreen() {
  const navigation = useNavigation<any>();
  const { user, owner, signOut, updateUser, updateOwner, updateOnboardingStep } = useAuth();
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = React.useState(false);
  // ProgressHeader's autosave indicator: 'saving' while the autosave
  // timer is in flight, 'saved' once the AsyncStorage write resolves.
  const [savedStatus, setSavedStatus] = React.useState<'saved' | 'saving'>('saved');
  // Used by step-pill taps to scroll the matching section into view.
  // Each section's <View> reports its Y offset via onLayout; we cache
  // the latest offset per section in a ref (no re-render).
  const scrollViewRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Partial<Record<SectionId, number>>>({});
  // The `slice` here names a state-data slice (e.g., 'identity',
  // 'addressProof') — not a UI SectionId. They differ now that the
  // address-proof upload lives inside the merged 'address' UI section.
  const [uploadModal, setUploadModal] = React.useState<{ slice: 'identity' | 'addressProof'; field: string } | null>(null);
  // Tracks keyboard height so we can extend the ScrollView's bottom
  // padding while the keyboard is open. Without this, the last input
  // can't scroll above the keyboard because the content already ends
  // there — there's no room left to scroll up. Appended at the end
  // of the hook block so future hot-reloads don't shift earlier hook
  // indices and trigger React's "hook order changed" guard.
  const [keyboardHeight, setKeyboardHeight] = React.useState(0);

  const effectiveOwnerType = state.ownerType || owner?.ownerType || '';
  const showBusiness = NEEDS_BUSINESS_NAME.has(effectiveOwnerType);
  const showLand = effectiveOwnerType === 'empty_land';
  // Only prompt for owner type when the backend has no concrete value yet
  // (or has the OTP-default of 'individual', which we treat as "not chosen").
  const showOwnerTypeSection = !owner?.ownerType || owner.ownerType === 'individual';

  // ---- Hydrate from auth context + draft ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (cancelled) return;
      const seed: Partial<State> = {
        ownerType: owner?.ownerType || 'individual',
        personal: {
          legalName: user?.legalName || '',
          dateOfBirth: user?.dateOfBirth || '',
          email: user?.email || '',
        },
        business: {
          businessName: owner?.businessName || '',
          roleDesignation: owner?.roleDesignation || '',
          registrationId: owner?.registrationId || '',
        },
        land: { landLabel: owner?.landLabel || '', landmark: user?.landmark || '' },
        address: {
          pincode: user?.pincode || '',
          state: user?.state || '',
          city: user?.city || '',
          addressLine1: user?.addressLine1 || '',
          addressLine2: user?.addressLine2 || '',
          country: user?.country || 'IN',
        },
        location: { lat: user?.locationLat ?? null, lng: user?.locationLng ?? null },
      };
      if (raw) {
        try {
          const draft = JSON.parse(raw) as Partial<State>;
          // Deep-merge per slice so a stale draft missing newer fields
          // (e.g., personal.email or address.country added after the
          // draft was saved) falls back to the seed defaults instead
          // of leaving those fields undefined — which would crash the
          // first render that calls `.trim()` on them.
          const merged: Partial<State> = {
            ...seed,
            ...draft,
            personal: { ...(seed.personal as any), ...((draft.personal as any) || {}) },
            business: { ...(seed.business as any), ...((draft.business as any) || {}) },
            land: { ...(seed.land as any), ...((draft.land as any) || {}) },
            address: { ...(seed.address as any), ...((draft.address as any) || {}) },
            location: { ...(seed.location as any), ...((draft.location as any) || {}) },
            identity: { ...INITIAL.identity, ...((draft.identity as any) || {}) },
            addressProof: {
              ...INITIAL.addressProof,
              ...((draft.addressProof as any) || {}),
              altAddress: {
                ...INITIAL.addressProof.altAddress,
                ...(((draft.addressProof as any)?.altAddress) || {}),
              },
            },
            bank: { ...INITIAL.bank, ...((draft.bank as any) || {}) },
          };
          dispatch({ type: 'HYDRATE', data: merged });
          return;
        } catch {
          /* fall through to seed-only */
        }
      }
      dispatch({ type: 'HYDRATE', data: seed });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Autosave ----
  // Persist only the form data — UI state (expanded section, errors) is
  // intentionally excluded so reopening doesn't flash stale validation
  // errors or jump the user to a section they had already finished.
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstSave = useRef(true);
  useEffect(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    // Skip the "saving" flicker on the very first render (state hydration)
    // — there's nothing the user did to trigger it.
    if (isFirstSave.current) {
      isFirstSave.current = false;
      return;
    }
    setSavedStatus('saving');
    autosaveTimer.current = setTimeout(async () => {
      try {
        const { expanded: _e, errors: _r, ...persistable } = state;
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
      } catch {
        /* storage write failed — silent */
      } finally {
        setSavedStatus('saved');
      }
    }, AUTOSAVE_DELAY);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [state]);

  // ---- Keyboard-aware scroll ----
  // Two pieces working together:
  //   1. Track the keyboard height (`keyboardHeight`) and add it to the
  //      ScrollView's bottom padding. Without this the last few inputs
  //      can't scroll above the keyboard — the content simply doesn't
  //      extend that far.
  //   2. When the keyboard opens, scroll the focused input into view
  //      via UIManager.measureLayout against the ScrollView's handle
  //      (the modern non-warning API).
  // Both are best-effort and silently bail on any platform surprise.
  useEffect(() => {
    const subs: Array<{ remove: () => void }> = [];
    const scrollFocusedIntoView = () => {
      try {
        // Prefer `currentlyFocusedInput` (modern RN, no deprecation
        // warning). Fall back to `currentlyFocusedField` for older RN.
        const State: any = (TextInput as any).State;
        const focused =
          State?.currentlyFocusedInput?.() ?? State?.currentlyFocusedField?.();
        if (focused == null || !scrollViewRef.current) return;
        const focusedHandle =
          typeof focused === 'number' ? focused : findNodeHandle(focused);
        if (focusedHandle == null) return;
        const scrollHandle = findNodeHandle(scrollViewRef.current);
        if (scrollHandle == null) return;
        UIManager.measureLayout(
          focusedHandle,
          scrollHandle,
          () => {},
          (_x: number, y: number) => {
            scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 120), animated: true });
          },
        );
      } catch {
        /* ignore */
      }
    };
    const onShow = (e: any) => {
      const h = e?.endCoordinates?.height ?? 0;
      setKeyboardHeight(h);
      // Wait one frame so the new bottom padding has applied before
      // we measure + scroll — otherwise the scrollTo can be capped at
      // the old maxScrollY and the last input still ends up clipped.
      requestAnimationFrame(() => requestAnimationFrame(scrollFocusedIntoView));
    };
    const onHide = () => setKeyboardHeight(0);
    try {
      subs.push(Keyboard.addListener('keyboardDidShow', onShow));
      subs.push(Keyboard.addListener('keyboardDidHide', onHide));
    } catch {
      /* registration failed — keyboard-aware scroll is best-effort */
    }
    return () => {
      subs.forEach((s) => {
        try { s.remove(); } catch { /* ignore */ }
      });
    };
  }, []);

  // ---- Quit handling ----
  const confirmQuit = useCallback(() => {
    AppAlert.alert(
      'Quit setup?',
      "You'll be signed out. Sign in again any time to resume — your draft is saved.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => {
            signOut();
          },
        },
      ],
    );
  }, [signOut]);

  // Hardware back: collapse expanded section first; otherwise prompt to quit.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (state.expanded) {
          dispatch({ type: 'TOGGLE', section: state.expanded });
          return true;
        }
        confirmQuit();
        return true;
      });
      return () => sub.remove();
    }, [state.expanded, confirmQuit]),
  );

  // ---- Address prefill from current location ----
  // When the Address & location section opens for the first time, offer
  // to prefill it from the device's GPS. Tap "Use my location" → OS
  // permission prompt → coords → reverse-geocode (Nominatim, no API key)
  // → fill empty pincode/state/city/country and drop the map
  // pin. We only fill *empty* fields, so this never clobbers something
  // the user already typed (e.g., from a saved draft). One-shot per
  // mount; subsequent opens of the section don't re-prompt.
  const hasOfferedPrefill = useRef(false);
  const [prefillingLocation, setPrefillingLocation] = React.useState(false);
  // Inline banner shown when the user first opens the Address section
  // with an empty address. Replaces the previous native AppAlert.alert
  // because native alerts feel jarring mid-onboarding.
  const [showPrefillBanner, setShowPrefillBanner] = React.useState(false);

  const requestLocationPermission = async (): Promise<'granted' | 'denied' | 'never_ask_again'> => {
    if (Platform.OS === 'ios') return 'granted';
    try {
      const status = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location permission',
          message: "Allow location access so we can fill in your address automatically.",
          buttonPositive: 'Allow',
          buttonNegative: 'Cancel',
        },
      );
      if (status === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
      if (status === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'never_ask_again';
      return 'denied';
    } catch {
      return 'denied';
    }
  };

  const runAddressPrefill = useCallback(async () => {
    // Show the spinner immediately on tap. The OS permission prompt can
    // take a beat to appear (especially on Android cold-start) and the
    // user otherwise sees no feedback that the tap registered.
    setPrefillingLocation(true);
    const perm = await requestLocationPermission();
    if (perm === 'never_ask_again') {
      setPrefillingLocation(false);
      AppAlert.alert(
        'Location access needed',
        'Enable location for this app in Settings, or fill the address manually.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => { Linking.openSettings().catch(() => {}); } },
        ],
      );
      return;
    }
    if (perm !== 'granted') {
      // User chose not to share location; manual entry continues to work.
      setPrefillingLocation(false);
      return;
    }
    Geolocation.getCurrentPosition(
      async (pos: { coords: { latitude: number; longitude: number } }) => {
        const { latitude, longitude } = pos.coords;
        // Drop the map pin straight away so the user sees feedback even
        // if reverse-geocoding is slow or fails.
        dispatch({ type: 'SET', key: 'location', value: { lat: latitude, lng: longitude } });
        const result = await reverseGeocode(latitude, longitude);
        setPrefillingLocation(false);
        if (!result) {
          AppAlert.alert(
            'Pin set',
            "We couldn't fetch the postal address — please fill it in manually.",
          );
          return;
        }
        // Only fill empty fields; never overwrite something the user typed.
        // We read the latest state via a functional dispatch pattern by
        // computing the merged value from `state.address` at call time.
        const merged: PincodeAddressValue = {
          pincode: state.address.pincode || result.pincode,
          state: state.address.state || result.state,
          city: state.address.city || result.city,
          addressLine1: state.address.addressLine1 || result.addressLine1,
          addressLine2: state.address.addressLine2,
          country: state.address.country || result.country || 'IN',
        };
        dispatch({ type: 'SET', key: 'address', value: merged });
      },
      (err: { code?: number; message?: string }) => {
        setPrefillingLocation(false);
        if (err.code === 1) {
          AppAlert.alert(
            'Location access needed',
            'Enable location for this app in Settings, or fill the address manually.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => { Linking.openSettings().catch(() => {}); } },
            ],
          );
        } else if (err.code === 2) {
          AppAlert.alert(
            'Location services unavailable',
            'Turn on location services in your device settings, or fill the address manually.',
          );
        } else {
          AppAlert.alert("Couldn't get location", err.message || 'Please fill the address manually.');
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  }, [state.address]);

  // Watch for the Address section opening — show the inline prefill
  // banner once per mount, only if the address looks empty (so we don't
  // surprise a returning user whose draft already has values).
  useEffect(() => {
    if (state.expanded !== 'address') return;
    if (hasOfferedPrefill.current) return;
    hasOfferedPrefill.current = true;
    const isEmpty =
      !state.address.addressLine1.trim() &&
      !state.address.pincode.trim() &&
      !state.address.city.trim();
    if (isEmpty) setShowPrefillBanner(true);
  }, [state.expanded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hide the prefill banner once the prefill flow finishes (success or
  // failure) so it doesn't linger above an already-filled address.
  useEffect(() => {
    if (!prefillingLocation && showPrefillBanner) {
      const filled =
        !!state.address.pincode.trim() ||
        !!state.address.city.trim() ||
        !!state.address.addressLine1.trim();
      if (filled) setShowPrefillBanner(false);
    }
  }, [prefillingLocation, showPrefillBanner, state.address.pincode, state.address.city, state.address.addressLine1]);

  // ---- File upload ----
  // Aspect-ratio per upload target: ID front/back use the CR80 standard
  // (PAN/Aadhaar/DL); selfie is square; address proof is free-aspect since
  // utility bills and statements come in many shapes.
  const handleUpload = async (source: PickSource) => {
    if (!uploadModal) return;
    const { slice, field } = uploadModal;
    let aspect: 'idCard' | 'square' | 'free' = 'free';
    if (slice === 'identity') {
      aspect = field === 'selfieImage' ? 'square' : 'idCard';
    }
    try {
      const res = await pickAndUploadImage({ source, aspect });
      const file: UploadedFile = { uri: res.url, url: res.url };
      dispatch({ type: 'PATCH', key: slice, value: { [field]: file } });
      setUploadModal(null);
    } catch (err) {
      handleMediaUploadError(err);
    }
  };

  // ---- Validation ----
  // Maps each error key produced by validate() to the section that owns it,
  // so on submit failure we can auto-expand and visually flag the right one.
  const ERROR_SECTION_MAP: Record<string, SectionId> = {
    ownerType: 'ownerType',
    legalName: 'personal',
    dateOfBirth: 'personal',
    phone: 'personal',
    email: 'personal',
    businessName: 'business',
    landLabel: 'land',
    // All address/location/proof errors land in the unified 'address' section.
    addressLine1: 'address',
    pincode: 'address',
    state: 'address',
    city: 'address',
    location: 'address',
    proofDocument: 'address',
    altAddressLine1: 'address',
    altPincode: 'address',
    documentNumber: 'identity',
    frontImage: 'identity',
    backImage: 'identity',
    accountHolderName: 'bank',
    accountNumber: 'bank',
    ifscCode: 'bank',
  };

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (showOwnerTypeSection && !state.ownerType) errs.ownerType = 'Select your owner type';
    if (!state.personal.legalName.trim()) errs.legalName = 'Legal name is required';
    if (!state.personal.dateOfBirth.trim()) errs.dateOfBirth = 'Date of birth is required';
    // Email is optional but, if provided, must look like an email.
    const emailVal = state.personal.email.trim();
    if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      errs.email = 'Enter a valid email or leave blank';
    }
    // Phone is read-only here (verified at sign-in), but we still guard
    // against the edge case where the auth context has no phone — backend
    // KYC requires it, so blocking up-front gives a clearer error.
    if (!user?.phone) {
      errs.phone = 'Your account has no verified phone — please sign out and sign in again.';
    }
    if (showBusiness && !state.business.businessName.trim()) errs.businessName = 'Business name is required';
    if (showLand && !state.land.landLabel.trim()) errs.landLabel = 'Land label is required';
    if (!state.address.addressLine1.trim()) errs.addressLine1 = 'Address line 1 is required';
    if (!/^\d{6}$/.test(state.address.pincode)) errs.pincode = 'Enter a valid 6-digit pincode';
    if (!state.address.state) errs.state = 'State is required';
    if (!state.address.city.trim()) errs.city = 'City is required';
    if (state.location.lat == null || state.location.lng == null) errs.location = 'Drop the pin on the map';
    if (!state.identity.documentNumber.trim()) errs.documentNumber = 'Document number is required';
    if (!state.identity.frontImage) errs.frontImage = 'Front image required';
    if (state.identity.documentType !== 'passport' && !state.identity.backImage) {
      errs.backImage = 'Back image required';
    }
    if (!state.addressProof.proofDocument) errs.proofDocument = 'Address proof document required';
    if (!state.addressProof.sameAsProfile) {
      if (!state.addressProof.altAddress.addressLine1.trim()) errs.altAddressLine1 = 'Address line 1 is required';
      if (!/^\d{6}$/.test(state.addressProof.altAddress.pincode)) errs.altPincode = 'Valid pincode required';
    }
    if (!state.bank.accountHolderName.trim()) errs.accountHolderName = 'Account holder name required';
    if (!state.bank.accountNumber.trim()) errs.accountNumber = 'Account number required';
    if (!state.bank.ifscCode.trim()) errs.ifscCode = 'IFSC code required';
    return errs;
  };

  // Set of sections that contain at least one error — used to flag headers.
  const sectionsWithErrors = useMemo(() => {
    const set = new Set<SectionId>();
    for (const key of Object.keys(state.errors)) {
      const section = ERROR_SECTION_MAP[key];
      if (section) set.add(section);
    }
    return set;
  }, [state.errors]);

  // ---- Submit ----
  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      dispatch({ type: 'SET_ERRORS', errors: errs });
      // Auto-expand the first section whose error appears in validation
      // order, so the user sees the failing fields without scrolling.
      const firstErrKey = Object.keys(errs)[0];
      const firstSection = ERROR_SECTION_MAP[firstErrKey];
      if (firstSection) dispatch({ type: 'EXPAND', section: firstSection });
      const firstMsg = errs[firstErrKey];
      AppAlert.alert(
        'Almost there',
        firstMsg
          ? `${firstMsg}\n\nWe've opened the section that needs your attention.`
          : "A few fields still need your attention.",
      );
      return;
    }

    setSubmitting(true);
    try {
      // 1) Update profile (User + Owner records)
      const profilePayload: Record<string, any> = {
        legalName: state.personal.legalName.trim(),
        dateOfBirth: state.personal.dateOfBirth,
        addressLine1: state.address.addressLine1.trim(),
        // Email is optional. Only include when the user actually typed
        // something — sending an empty string would clobber any existing
        // backend value.
        ...(state.personal.email.trim() ? { email: state.personal.email.trim() } : {}),
        addressLine2: state.address.addressLine2.trim(),
        city: state.address.city.trim(),
        state: state.address.state,
        pincode: state.address.pincode,
        country: state.address.country || 'IN',
        locationLat: state.location.lat,
        locationLng: state.location.lng,
        ownerType: showOwnerTypeSection ? state.ownerType : owner?.ownerType,
      };
      if (showBusiness) {
        profilePayload.businessName = state.business.businessName.trim();
        profilePayload.roleDesignation = state.business.roleDesignation.trim();
        profilePayload.registrationId = state.business.registrationId.trim();
      }
      if (showLand) {
        profilePayload.landLabel = state.land.landLabel.trim();
        profilePayload.landmark = state.land.landmark.trim();
      }
      const profileRes = await ownerService.updateProfile(profilePayload);
      if (profileRes.user) updateUser(profileRes.user);
      if (profileRes.owner) updateOwner(profileRes.owner);

      // 2) Submit KYC. When sameAsProfile, the backend copies the address
      //    from User; we still send the proof document URL.
      const kycPayload: Record<string, any> = {
        kycPersonal: {
          fullName: state.personal.legalName.trim(),
          dateOfBirth: state.personal.dateOfBirth,
          phone: user?.phone || '',
          // Prefer the freshly-typed email; fall back to the auth-context
          // value (which may be empty for OTP-only signups).
          email: state.personal.email.trim() || user?.email || '',
        },
        kycIdentity: {
          documentType: state.identity.documentType,
          documentNumber: state.identity.documentNumber.trim(),
          frontImageUrl: state.identity.frontImage?.url,
          backImageUrl: state.identity.backImage?.url,
          selfieImageUrl: state.identity.selfieImage?.url,
        },
        kycBank: {
          accountHolderName: state.bank.accountHolderName.trim(),
          accountNumber: state.bank.accountNumber.trim(),
          ifscCode: state.bank.ifscCode.trim().toUpperCase(),
          bankName: state.bank.bankName.trim(),
        },
        kycAddressSameAsProfile: state.addressProof.sameAsProfile,
        kycAddress: state.addressProof.sameAsProfile
          ? { proofDocumentUrl: state.addressProof.proofDocument?.url }
          : {
              addressLine1: state.addressProof.altAddress.addressLine1.trim(),
              addressLine2: state.addressProof.altAddress.addressLine2.trim(),
              city: state.addressProof.altAddress.city.trim(),
              state: state.addressProof.altAddress.state,
              postalCode: state.addressProof.altAddress.pincode,
              country: state.addressProof.altAddress.country || 'IN',
              proofDocumentUrl: state.addressProof.proofDocument?.url,
            },
      };
      const kycRes = await ownerService.submitKyc(kycPayload);
      if (kycRes.owner) updateOwner(kycRes.owner);
      // Capture the new kyc_status from the backend so we can pass it into
      // updateOnboardingStep below — otherwise the dashboard's
      // `kycStatus` slice stays at its old 'not_started' value and shows
      // "KYC pending" / "Bank details incomplete" even though the data
      // is fully saved server-side.
      const newKycStatus = kycRes.owner?.kycStatus;

      // 3) Auto-create a draft property listing seeded from the address.
      //    Best-effort — failure here doesn't block onboarding completion.
      try {
        const draftName = (state.personal.legalName.trim() + ' Parking').slice(0, 60);
        await listingService.createProperty({
          propertyName: draftName,
          address: [state.address.addressLine1, state.address.addressLine2]
            .filter((s) => s && s.trim())
            .join(', '),
          city: state.address.city,
          state: state.address.state,
          postalCode: state.address.pincode,
          // POST /api/properties requires country. Leaving it out made this
          // 400 every time — and because the failure is swallowed below as
          // "best effort", onboarding finished with no starter property and
          // no sign anything had gone wrong.
          country: 'IN',
          locationLat: state.location.lat ?? 0,
          locationLng: state.location.lng ?? 0,
          // status: 'draft' is accepted by the backend createProperty handler.
          status: 'draft',
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[onboarding] draft property auto-create failed:', err);
      }

      // 4) Advance onboarding state AND propagate the new kyc_status
      //    into the auth slice so MainTabs/Dashboard immediately reflect
      //    "verified" instead of the stale "not_started"/"draft" value.
      //    Backend currently auto-approves so newKycStatus is usually
      //    'verified'; if missing we still pass 'submitted' as a sane
      //    fallback so "KYC pending" doesn't linger.
      updateOnboardingStep('kyc_submitted', newKycStatus || 'submitted');
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (err: any) {
      AppAlert.alert('Submission failed', err?.message || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Section render helper ----
  const renderSection = (id: SectionId, title: string, subtitle: string, body: React.ReactNode) => {
    const isExpanded = state.expanded === id;
    const hasError = sectionsWithErrors.has(id);
    return (
      <View
        style={[styles.section, hasError ? styles.sectionError : null]}
        onLayout={(e) => {
          // Cache the section's Y position inside the ScrollView for
          // step-pill scroll-into-view.
          sectionOffsets.current[id] = e.nativeEvent.layout.y;
        }}
      >
        <TouchableOpacity
          style={styles.sectionHeader}
          activeOpacity={0.7}
          onPress={() => dispatch({ type: 'TOGGLE', section: id })}
        >
          <View style={{ flex: 1 }}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>{title}</Text>
              {hasError ? (
                <StatusTag label="Needs attention" tone="danger" style={styles.sectionErrorBadge} />
              ) : null}
            </View>
            <Text style={styles.sectionSubtitle}>{subtitle}</Text>
          </View>
          <View style={[styles.chevron, isExpanded && styles.chevronOpen]}>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={isExpanded ? palette.textInverse : palette.text}
            />
          </View>
        </TouchableOpacity>
        {isExpanded ? <View style={styles.sectionBody}>{body}</View> : null}
      </View>
    );
  };

  // ---- Step progress ----
  // Each step has an independent 3-state status:
  //   complete = all required fields filled
  //   partial  = some fields filled but not all
  //   pending  = nothing filled
  // The user can fill them in any order; the header pills reflect each
  // step's own state (no "earlier step blocks later step" coupling).
  type Required = boolean[];
  const requiredByStep: Record<'profile' | 'address' | 'identity' | 'bank', Required> = {
    profile: [
      !!state.personal.legalName.trim(),
      !!state.personal.dateOfBirth.trim(),
      ...(showOwnerTypeSection ? [!!state.ownerType] : []),
      ...(showBusiness ? [!!state.business.businessName.trim()] : []),
      ...(showLand ? [!!state.land.landLabel.trim()] : []),
    ],
    address: [
      !!state.address.addressLine1.trim(),
      !!state.address.pincode.trim(),
      !!state.address.state,
      !!state.address.city.trim(),
      state.location.lat != null && state.location.lng != null,
      !!state.addressProof.proofDocument,
    ],
    identity: [
      !!state.identity.documentNumber.trim(),
      !!state.identity.frontImage,
      ...(state.identity.documentType === 'passport' ? [] : [!!state.identity.backImage]),
    ],
    bank: [
      !!state.bank.accountHolderName.trim(),
      !!state.bank.accountNumber.trim(),
      !!state.bank.ifscCode.trim(),
    ],
  };
  function classify(flags: Required): 'complete' | 'partial' | 'pending' {
    const filled = flags.filter(Boolean).length;
    if (filled === 0) return 'pending';
    if (filled === flags.length) return 'complete';
    return 'partial';
  }
  const stepOrder = ['profile', 'address', 'identity', 'bank'] as const;
  const stepStatuses = stepOrder.map((k) => classify(requiredByStep[k]));

  // No "active" pill emphasis — each step shows only its own
  // independent status (complete / partial / pending). currentStepIndex
  // The slim ProgressTrack under the header fills up to the first step
  // that is not complete yet.
  const firstIncomplete = stepStatuses.findIndex((st) => st !== 'complete');
  const trackCurrent = firstIncomplete === -1 ? PROGRESS_STEPS.length : firstIncomplete;

  // Tapping a step pill expands the matching accordion section. Several
  // section IDs map to the first step (ownerType / personal / business /
  // land are sub-sections of the "Profile" pill); we pick a sensible
  // default per pill.
  const stepIndexToSection: Record<number, SectionId> = {
    0: showOwnerTypeSection && !state.ownerType ? 'ownerType' : 'personal',
    1: 'address',
    2: 'identity',
    3: 'bank',
  };
  // Scroll a section's header to the top of the visible area. Used for
  // both step-pill taps and section-header expansions — when a section
  // near the bottom of the screen expands, its body would otherwise sit
  // below the fold (auto-fill banner included).
  const scrollSectionIntoView = useCallback((section: SectionId) => {
    const run = () => {
      const y = sectionOffsets.current[section];
      if (typeof y === 'number') {
        scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
      }
    };
    // Two rAFs ≈ one paint cycle after the EXPAND/TOGGLE dispatch, so
    // the section's onLayout has reported the new position. The
    // setTimeout is a belt-and-suspenders fallback for slower devices
    // where the LayoutAnimation outlasts the rAF wait.
    requestAnimationFrame(() => requestAnimationFrame(run));
    setTimeout(run, 280);
  }, []);

  // Watch for any section becoming the expanded one (via header tap,
  // step-pill tap, or programmatic dispatch) and scroll it into view.
  useEffect(() => {
    if (state.expanded) scrollSectionIntoView(state.expanded);
  }, [state.expanded, scrollSectionIntoView]);

  const handleStepPress = (idx: number) => {
    const section = stepIndexToSection[idx];
    if (!section) return;
    dispatch({ type: 'EXPAND', section });
    // The effect above will also scroll, but only if `expanded` actually
    // *changes*. If the user taps the step pill for the already-expanded
    // section, the effect doesn't fire — so trigger an explicit scroll
    // here to keep the behavior consistent.
    scrollSectionIntoView(section);
  };

  // ---- Render ----
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader
        title="Complete your profile"
        onBack={confirmQuit}
        right={
          <Text style={styles.savedText}>{savedStatus === 'saving' ? 'Saving' : 'Saved'}</Text>
        }
      />

      {/* Slim step progress: dotted track + tappable step labels */}
      <View style={styles.progressWrap}>
        <ProgressTrack steps={PROGRESS_STEPS.length} current={trackCurrent} trackColor={palette.line} />
        <View style={styles.stepLabels}>
          {PROGRESS_STEPS.map((step, idx) => {
            const st = stepStatuses[idx];
            return (
              <TouchableOpacity
                key={step.id}
                onPress={() => handleStepPress(idx)}
                activeOpacity={0.6}
                hitSlop={8}
                style={styles.stepLabelBtn}
                accessibilityRole="button"
                accessibilityLabel={`${step.label}, ${st}`}
              >
                {st === 'complete' ? (
                  <Ionicons name="checkmark-circle" size={13} color={palette.success} style={styles.stepCheck} />
                ) : null}
                <Text
                  style={[
                    styles.stepLabel,
                    st === 'partial' && styles.stepLabelPartial,
                    st === 'complete' && styles.stepLabelDone,
                  ]}
                >
                  {step.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[
            styles.scroll,
            // Add the keyboard's height to the bottom padding while it's
            // open so the last input has room to scroll above it.
            { paddingBottom: 40 + keyboardHeight },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.lede}>
            A few quick details to get you ready to list your first parking spot.
          </Text>

          {/* OWNER TYPE */}
          {showOwnerTypeSection
            ? renderSection(
                'ownerType',
                'Owner type',
                'How will you use the platform?',
                <FormPickerInput
                  label="I'm signing up as"
                  required
                  value={state.ownerType}
                  options={OWNER_TYPE_OPTIONS}
                  onSelect={(v) => dispatch({ type: 'SET', key: 'ownerType', value: v })}
                  error={state.errors.ownerType}
                  placeholder="Select owner type"
                />,
              )
            : null}

          {/* PERSONAL */}
          {renderSection(
            'personal',
            'Personal details',
            'Your name, DOB, and contact',
            <View>
              <FormTextInput
                label="Legal name (as on ID)"
                required
                value={state.personal.legalName}
                onChangeText={(v) => dispatch({ type: 'PATCH', key: 'personal', value: { legalName: v } })}
                placeholder="Anita Sharma"
                helperText="Your full name as on your ID."
                error={state.errors.legalName}
                containerStyle={styles.field}
              />
              <DateField
                label="Date of birth"
                required
                value={state.personal.dateOfBirth}
                onChange={(v) => dispatch({ type: 'PATCH', key: 'personal', value: { dateOfBirth: v } })}
                error={state.errors.dateOfBirth}
                containerStyle={styles.field}
                hideToday
                maxDate={new Date()}
                modalTitle="Select your date of birth"
              />
              <View style={styles.readonlyRow}>
                <Text style={styles.readonlyLabel}>Phone</Text>
                <Text style={styles.readonlyValue}>{user?.phone || '—'}</Text>
                <Text style={styles.readonlyHint}>Verified at sign-in</Text>
              </View>
              <FormTextInput
                label="Email (optional)"
                value={state.personal.email}
                onChangeText={(v) => dispatch({ type: 'PATCH', key: 'personal', value: { email: v } })}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                helperText="For booking confirmations and receipts. You can add this later in Profile."
                error={state.errors.email}
                containerStyle={styles.field}
              />
            </View>,
          )}

          {/* BUSINESS (conditional) */}
          {showBusiness
            ? renderSection(
                'business',
                'Business details',
                'Required for your owner type',
                <View>
                  <FormTextInput
                    label="Business / property name"
                    required
                    value={state.business.businessName}
                    onChangeText={(v) =>
                      dispatch({ type: 'PATCH', key: 'business', value: { businessName: v } })
                    }
                    placeholder="Sunrise Apartments"
                    error={state.errors.businessName}
                    containerStyle={styles.field}
                  />
                  <FormTextInput
                    label="Your role"
                    value={state.business.roleDesignation}
                    onChangeText={(v) =>
                      dispatch({ type: 'PATCH', key: 'business', value: { roleDesignation: v } })
                    }
                    placeholder="Society Secretary, Owner, Manager…"
                    containerStyle={styles.field}
                  />
                  <FormTextInput
                    label="Registration ID (optional)"
                    value={state.business.registrationId}
                    onChangeText={(v) =>
                      dispatch({ type: 'PATCH', key: 'business', value: { registrationId: v } })
                    }
                    placeholder="GST / RERA / Society reg."
                    containerStyle={styles.field}
                  />
                </View>,
              )
            : null}

          {/* LAND (conditional) */}
          {showLand
            ? renderSection(
                'land',
                'Land details',
                'Required for empty land',
                <View>
                  <FormTextInput
                    label="Land label"
                    required
                    value={state.land.landLabel}
                    onChangeText={(v) =>
                      dispatch({ type: 'PATCH', key: 'land', value: { landLabel: v } })
                    }
                    placeholder="Plot 14, Sector 9"
                    error={state.errors.landLabel}
                    containerStyle={styles.field}
                  />
                  <FormTextInput
                    label="Landmark (optional)"
                    value={state.land.landmark}
                    onChangeText={(v) =>
                      dispatch({ type: 'PATCH', key: 'land', value: { landmark: v } })
                    }
                    placeholder="Near city school"
                    containerStyle={styles.field}
                  />
                </View>,
              )
            : null}

          {/* ADDRESS — unified: address fields + map pin + address proof */}
          {renderSection(
            'address',
            'Address & location',
            'Where are you based, where to pin on the map, and your address proof',
            <View>
              {/* Inline prefill banner — replaces the older native AppAlert.alert.
                  Shown once per mount when the address starts empty; hidden after
                  the user picks an option or once any address field gets filled. */}
              {showPrefillBanner ? (
                <View style={styles.prefillBanner}>
                  <View style={styles.prefillBannerIcon}>
                    <Ionicons name="locate" size={20} color={palette.text} />
                  </View>
                  <View style={styles.prefillBannerText}>
                    <Text style={styles.prefillBannerTitle}>Auto-fill your address?</Text>
                    <Text style={styles.prefillBannerBody}>
                      We can detect your pincode, city and state from your current location, or you can type them yourself.
                    </Text>
                    <View style={styles.prefillBannerActions}>
                      <PillButton
                        label="Auto-fill address"
                        variant="ink"
                        size="sm"
                        onPress={() => {
                          setShowPrefillBanner(false);
                          runAddressPrefill();
                        }}
                        disabled={prefillingLocation}
                        loading={prefillingLocation}
                      />
                      <TouchableOpacity
                        onPress={() => setShowPrefillBanner(false)}
                        activeOpacity={0.6}
                        style={styles.prefillBannerSecondary}
                      >
                        <Text style={styles.prefillBannerSecondaryText}>I'll type it</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ) : (
                // Compact secondary trigger so the user can re-run the prefill
                // any time (e.g., after dismissing the banner or for a redo).
                <TouchableOpacity
                  style={[styles.useLocationBtn, prefillingLocation && styles.dimmed]}
                  onPress={runAddressPrefill}
                  activeOpacity={0.7}
                  disabled={prefillingLocation}
                >
                  {prefillingLocation ? (
                    <ActivityIndicator size="small" color={palette.ink} />
                  ) : (
                    <Ionicons name="locate" size={16} color={palette.ink} />
                  )}
                  <Text style={styles.useLocationBtnText}>
                    {prefillingLocation ? 'Auto-filling…' : 'Auto-fill address from location'}
                  </Text>
                </TouchableOpacity>
              )}

              <PincodeAddressBlock
                value={state.address}
                onChange={(v) => dispatch({ type: 'SET', key: 'address', value: v })}
                required
                errors={{
                  pincode: state.errors.pincode,
                  state: state.errors.state,
                  city: state.errors.city,
                  addressLine1: state.errors.addressLine1,
                }}
              />

              <Text style={styles.subsectionTitle}>Pin your location</Text>
              <Text style={styles.subsectionHint}>Tap the map or drag the pin to mark the spot drivers will navigate to.</Text>
              <LocationPickerMap
                value={state.location}
                onChange={(v) => dispatch({ type: 'SET', key: 'location', value: v })}
                seedRegion={
                  state.location.lat != null && state.location.lng != null
                    ? { lat: state.location.lat, lng: state.location.lng }
                    : undefined
                }
                hideCurrentLocationButton
              />
              {state.errors.location ? (
                <Text style={styles.errorText}>{state.errors.location}</Text>
              ) : null}

              <Text style={styles.subsectionTitle}>Address proof</Text>
              <Text style={styles.subsectionHint}>Utility bill, bank statement, or any government-issued document showing your address.</Text>
              <TouchableOpacity
                style={styles.checkboxRow}
                activeOpacity={0.7}
                onPress={() =>
                  dispatch({
                    type: 'PATCH',
                    key: 'addressProof',
                    value: { sameAsProfile: !state.addressProof.sameAsProfile },
                  })
                }
              >
                <View style={[styles.checkbox, state.addressProof.sameAsProfile && styles.checkboxOn]}>
                  {state.addressProof.sameAsProfile ? (
                    <Ionicons name="checkmark" size={14} color={palette.textInverse} />
                  ) : null}
                </View>
                <Text style={styles.checkboxLabel}>Address proof matches the address above</Text>
              </TouchableOpacity>
              {!state.addressProof.sameAsProfile ? (
                <PincodeAddressBlock
                  value={state.addressProof.altAddress}
                  onChange={(v) =>
                    dispatch({ type: 'PATCH', key: 'addressProof', value: { altAddress: v } })
                  }
                  errors={{
                    pincode: state.errors.altPincode,
                    addressLine1: state.errors.altAddressLine1,
                  }}
                  required
                />
              ) : null}
              <UploadCard
                label="Proof document"
                required
                file={state.addressProof.proofDocument}
                error={state.errors.proofDocument}
                onPress={() => setUploadModal({ slice: 'addressProof', field: 'proofDocument' })}
              />
            </View>,
          )}

          {/* IDENTITY */}
          {renderSection(
            'identity',
            'Identity proof',
            'Government-issued photo ID',
            <View>
              <FormPickerInput
                label="Document type"
                required
                value={state.identity.documentType}
                options={DOCUMENT_TYPE_OPTIONS}
                onSelect={(v) =>
                  dispatch({ type: 'PATCH', key: 'identity', value: { documentType: v as DocumentType } })
                }
                containerStyle={styles.field}
              />
              <FormTextInput
                label="Document number"
                required
                value={state.identity.documentNumber}
                onChangeText={(v) =>
                  dispatch({ type: 'PATCH', key: 'identity', value: { documentNumber: v } })
                }
                placeholder="XXXX-XXXX-XXXX"
                error={state.errors.documentNumber}
                containerStyle={styles.field}
              />
              <Text style={styles.subsectionTitle}>Document images</Text>
              <Text style={styles.subsectionHint}>
                Clear, well-lit photos of the front and back of your document.
              </Text>
              <UploadCardRow>
                <UploadCard
                  label="Front"
                  required
                  file={state.identity.frontImage}
                  error={state.errors.frontImage}
                  onPress={() => setUploadModal({ slice: 'identity', field: 'frontImage' })}
                />
                {state.identity.documentType !== 'passport' ? (
                  <UploadCard
                    label="Back"
                    required
                    file={state.identity.backImage}
                    error={state.errors.backImage}
                    onPress={() => setUploadModal({ slice: 'identity', field: 'backImage' })}
                  />
                ) : null}
              </UploadCardRow>
              <Text style={styles.subsectionTitle}>Selfie</Text>
              <Text style={styles.subsectionHint}>
                Helps us match your face with your document. Optional.
              </Text>
              <UploadCard
                label="Selfie"
                file={state.identity.selfieImage}
                onPress={() => setUploadModal({ slice: 'identity', field: 'selfieImage' })}
              />
            </View>,
          )}

          {/* BANK */}
          {renderSection(
            'bank',
            'Bank details',
            'For payouts',
            <View>
              <FormTextInput
                label="Account holder name"
                required
                value={state.bank.accountHolderName}
                onChangeText={(v) =>
                  dispatch({ type: 'PATCH', key: 'bank', value: { accountHolderName: v } })
                }
                error={state.errors.accountHolderName}
                containerStyle={styles.field}
              />
              {/* Reuse-earlier-input shortcuts. Tapping fills the field
                  with the chosen name; the field stays editable and the
                  pill shows a check when the values match. */}
              {state.personal.legalName.trim() ? (
                <ReuseRow
                  label="Use legal name"
                  value={state.personal.legalName.trim()}
                  active={state.bank.accountHolderName.trim() === state.personal.legalName.trim()}
                  onPress={() =>
                    dispatch({ type: 'PATCH', key: 'bank', value: { accountHolderName: state.personal.legalName.trim() } })
                  }
                />
              ) : null}
              {showBusiness && state.business.businessName.trim() ? (
                <ReuseRow
                  label="Use business name"
                  value={state.business.businessName.trim()}
                  active={state.bank.accountHolderName.trim() === state.business.businessName.trim()}
                  onPress={() =>
                    dispatch({ type: 'PATCH', key: 'bank', value: { accountHolderName: state.business.businessName.trim() } })
                  }
                />
              ) : null}
              <FormTextInput
                label="Account number"
                required
                value={state.bank.accountNumber}
                onChangeText={(v) =>
                  dispatch({ type: 'PATCH', key: 'bank', value: { accountNumber: v } })
                }
                keyboardType="number-pad"
                error={state.errors.accountNumber}
                containerStyle={styles.field}
              />
              <FormTextInput
                label="IFSC code"
                required
                value={state.bank.ifscCode}
                onChangeText={(v) =>
                  dispatch({ type: 'PATCH', key: 'bank', value: { ifscCode: v.toUpperCase() } })
                }
                placeholder="HDFC0001234"
                autoCapitalize="characters"
                error={state.errors.ifscCode}
                containerStyle={styles.field}
              />
              <FormTextInput
                label="Bank name"
                value={state.bank.bankName}
                onChangeText={(v) => dispatch({ type: 'PATCH', key: 'bank', value: { bankName: v } })}
                placeholder="HDFC Bank"
                containerStyle={styles.field}
              />
            </View>,
          )}

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky submit */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <PillButton
          label="Submit for verification"
          iconRight="arrow-right"
          variant="ink"
          onPress={handleSubmit}
          loading={submitting}
        />
      </View>

      {/* Upload source picker */}
      {!!uploadModal ? (

        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setUploadModal(null)}>
          <TouchableOpacity activeOpacity={1} style={[styles.modalCard, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.grabber} />
            <Text style={styles.modalTitle}>Add document</Text>
            <TouchableOpacity style={[styles.modalRow, styles.modalRowDivider]} activeOpacity={0.6} onPress={() => handleUpload('camera')}>
              <View style={styles.modalRowIcon}>
                <Ionicons name="camera-outline" size={19} color={palette.text} />
              </View>
              <Text style={styles.modalRowText}>Take a photo</Text>
              <Ionicons name="chevron-forward" size={18} color={palette.textSubtle} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalRow} activeOpacity={0.6} onPress={() => handleUpload('gallery')}>
              <View style={styles.modalRowIcon}>
                <Ionicons name="images-outline" size={19} color={palette.text} />
              </View>
              <Text style={styles.modalRowText}>Choose from gallery</Text>
              <Ionicons name="chevron-forward" size={18} color={palette.textSubtle} />
            </TouchableOpacity>
            <PillButton
              label="Cancel"
              variant="grey"
              size="md"
              onPress={() => setUploadModal(null)}
              style={styles.modalCancel}
            />
          </TouchableOpacity>
        </TouchableOpacity>

      ) : null}
    </SafeAreaView>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

// Grey rounded upload tile. Empty: white icon circle with a plus. Filled:
// ink icon circle with a document glyph and a green check. Two tiles can
// sit side-by-side via the `<UploadCardRow>` wrapper.
function UploadCard({
  label,
  file,
  error,
  required,
  onPress,
}: {
  label: string;
  file: UploadedFile | null;
  error?: string;
  required?: boolean;
  onPress: () => void;
}) {
  const isFilled = !!file;
  return (
    <View style={styles.uploadCardWrap}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={[
          styles.uploadCard,
          isFilled ? styles.uploadCardFilled : null,
          error ? styles.uploadCardError : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Upload ${label}${required ? ', required' : ''}`}
      >
        {isFilled ? (
          <View style={styles.uploadPreview}>
            <Ionicons name="document-text-outline" size={20} color={palette.textInverse} />
          </View>
        ) : (
          <View style={styles.uploadPlaceholder}>
            <Ionicons name="add" size={22} color={palette.text} />
          </View>
        )}
        <View style={styles.uploadCardContent}>
          <Text style={styles.uploadCardLabel} numberOfLines={1}>
            {label}
            {required ? <Text style={styles.uploadCardRequired}> *</Text> : null}
          </Text>
          <Text style={styles.uploadCardAction}>{isFilled ? 'Replace' : 'Add'}</Text>
        </View>
        {isFilled ? (
          <Ionicons name="checkmark-circle" size={18} color={palette.success} />
        ) : null}
      </TouchableOpacity>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

// Pair two UploadCards in a single row (e.g., Front + Back of an ID).
// Falls back to single-column when only one child is provided.
function UploadCardRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.uploadCardRow}>{children}</View>;
}

// Inline "reuse this earlier value" toggle. Renders a checkbox + label + the
// candidate value (e.g., "Use legal name: Anita Sharma"). Tapping fills the
// associated field; the field stays editable and the box shows a checkmark
// while the value matches. Used wherever the same data has already been
// entered in another section.
function ReuseRow({
  label,
  value,
  active,
  onPress,
}: {
  label: string;
  value: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.reuseRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.reuseCheckbox, active && styles.reuseCheckboxActive]}>
        {active ? <Ionicons name="checkmark" size={12} color={palette.textInverse} /> : null}
      </View>
      <Text style={styles.reuseRowText} numberOfLines={1}>
        {label}: <Text style={styles.reuseRowValue}>{value}</Text>
      </Text>
    </TouchableOpacity>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  savedText: { ...fonts.semibold, fontSize: 12, color: palette.textMuted },

  progressWrap: { paddingHorizontal: 24, paddingTop: 2, paddingBottom: 12 },
  stepLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  stepLabelBtn: { flexDirection: 'row', alignItems: 'center' },
  stepCheck: { marginRight: 3 },
  stepLabel: { ...fonts.semibold, fontSize: 12, color: palette.textMuted },
  stepLabelPartial: { color: palette.text },
  stepLabelDone: { color: palette.text },

  scroll: { paddingHorizontal: 16, paddingTop: 4 },
  lede: {
    ...fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: palette.textMuted,
    marginHorizontal: 6,
    marginBottom: 14,
  },

  section: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: palette.surface,
  },
  sectionError: { borderColor: palette.danger },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  sectionTitle: { ...fonts.semibold, fontSize: 17, letterSpacing: -0.2, color: palette.text },
  sectionSubtitle: { ...fonts.medium, fontSize: 12.5, lineHeight: 17, color: palette.textMuted, marginTop: 3 },
  sectionErrorBadge: { marginLeft: 8 },
  chevron: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  chevronOpen: { backgroundColor: palette.ink },
  sectionBody: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.line,
  },
  field: { marginTop: 12 },
  errorText: { ...fonts.medium, color: palette.danger, fontSize: 12, marginTop: 6, marginLeft: 4 },
  subsectionTitle: {
    ...fonts.semibold,
    fontSize: 15,
    color: palette.text,
    marginTop: 22,
    marginBottom: 4,
  },
  subsectionHint: { ...fonts.medium, fontSize: 12.5, lineHeight: 17, color: palette.textMuted, marginBottom: 8 },

  useLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    height: 40,
    paddingHorizontal: 16,
    backgroundColor: palette.fill,
    borderRadius: radii.pill,
    marginTop: 12,
    marginBottom: 4,
  },
  dimmed: { opacity: 0.6 },
  useLocationBtnText: { ...fonts.semibold, color: palette.text, fontSize: 13, marginLeft: 8 },
  prefillBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    backgroundColor: palette.blueSoft,
    borderRadius: radii.lg,
    marginTop: 12,
    marginBottom: 12,
  },
  prefillBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  prefillBannerText: { flex: 1 },
  prefillBannerTitle: { ...fonts.semibold, fontSize: 15, color: palette.text, marginBottom: 4 },
  prefillBannerBody: { ...fonts.medium, fontSize: 13, color: palette.inkSoft, lineHeight: 18 },
  prefillBannerActions: { flexDirection: 'row', marginTop: 12, alignItems: 'center' },
  prefillBannerSecondary: { paddingHorizontal: 12, paddingVertical: 9, marginLeft: 4 },
  prefillBannerSecondaryText: { ...fonts.semibold, color: palette.text, fontSize: 13 },

  readonlyRow: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: palette.fill,
    borderRadius: radii.lg,
  },
  readonlyLabel: { ...fonts.medium, fontSize: 12, color: palette.textMuted },
  readonlyValue: { ...fonts.semibold, fontSize: 16, color: palette.text, marginTop: 2 },
  readonlyHint: { ...fonts.semibold, fontSize: 11.5, color: palette.success, marginTop: 2 },

  // Upload tile (grey rounded tile + icon circle + label), shared by
  // identity images and the address-proof document.
  uploadCardWrap: { flex: 1, marginTop: 12 },
  uploadCardRow: { flexDirection: 'row', gap: 10 },
  uploadCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: palette.fill,
    backgroundColor: palette.fill,
    minHeight: 72,
  },
  uploadCardFilled: { backgroundColor: palette.successSoft, borderColor: palette.successSoft },
  uploadCardError: { borderColor: palette.danger },
  uploadPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadPreview: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.ink,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadCardContent: { flex: 1, marginLeft: 12 },
  uploadCardLabel: { ...fonts.semibold, fontSize: 14, color: palette.text },
  uploadCardRequired: { color: palette.danger },
  uploadCardAction: { ...fonts.medium, fontSize: 12, color: palette.textMuted, marginTop: 2 },

  // "Reuse earlier input" inline toggle row.
  reuseRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, marginTop: 4 },
  reuseCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: palette.textSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  reuseCheckboxActive: { backgroundColor: palette.ink, borderColor: palette.ink },
  reuseRowText: { ...fonts.medium, flex: 1, fontSize: 13, color: palette.textMuted },
  reuseRowValue: { ...fonts.semibold, color: palette.text },

  checkboxRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: palette.textSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: palette.ink, borderColor: palette.ink },
  checkboxLabel: { ...fonts.medium, flex: 1, fontSize: 14, color: palette.text, marginLeft: 12 },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: palette.bg,
  },

  modalBackdrop: {
    // Absolutely positioned rather than flex:1 — no longer inside a
    // <Modal>, which does not present on this build.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingHorizontal: 24,
    paddingTop: 12,
    ...shadow.lifted,
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.line,
    marginBottom: 18,
  },
  modalTitle: { ...fonts.semibold, fontSize: 20, letterSpacing: -0.3, color: palette.text, marginBottom: 8 },
  modalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  modalRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  modalRowIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  modalRowText: { ...fonts.semibold, flex: 1, fontSize: 15.5, color: palette.text },
  modalCancel: { marginTop: 14 },
});
