import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  LayoutAnimation,
  UIManager,
  type TextStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppAlert } from '../../components/common/AppAlert';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { setKycSubmitted, saveOwnerProfile } from '../../utils/storage';
// import { MOCK_OWNER_PROFILE } from '../../constants/mockProfile';
import { useAuth } from '../../context/AuthContext';
import { ownerService } from '../../services/ownerService';
import { ApiRequestError } from '../../services/api';
import { pickAndUploadImage, handleMediaUploadError, type PickSource } from '../../utils/mediaUpload';
import SharedDatePickerModal from '../../components/inputs/DatePickerModal';
import * as UI from '../../components/ui';
import * as Kit from '../../theme/kit';

// The UI kit is plain JS; give it loose component types and typed font tokens.
const { PillButton, StatusTag, ProgressTrack, IsoBlock } = UI as unknown as Record<
  string,
  React.ComponentType<any>
>;
const { palette, radii, shadow } = Kit;
const fonts = Kit.fonts as Record<keyof typeof Kit.fonts, TextStyle>;

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ============================================================================
// TYPES
// ============================================================================

type KycStatus = 'draft' | 'submitted' | 'verified' | 'rejected';
type DocumentType = 'national_id' | 'passport' | 'drivers_license';
type SectionId = 'personal' | 'identity' | 'address' | 'bank';

interface UploadedFile {
  uri: string;
  name: string;
  timestamp: number;
}

interface PersonalDetails {
  fullName: string;
  dateOfBirth: string; // YYYY-MM-DD
  phone: string;
  email: string;
}

interface IdentityProof {
  documentType: DocumentType;
  documentNumber: string;
  frontImage: UploadedFile | null;
  backImage: UploadedFile | null;
  selfieImage: UploadedFile | null;
}

interface AddressProof {
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  proofDocument: UploadedFile | null;
}

interface BankDetails {
  accountHolderName: string;
  accountNumber: string;
  ifscCode: string;
  bankName: string;
}

interface KycData {
  status: KycStatus;
  rejectionReason: string | null;
  personal: PersonalDetails;
  identity: IdentityProof;
  address: AddressProof;
  bank: BankDetails;
  lastSavedAt: number | null;
  submittedAt: number | null;
}

interface KycState extends KycData {
  expandedSection: SectionId | null;
  isLoading: boolean;
  isSaving: boolean;
  showUploadModal: boolean;
  uploadModalTarget: { section: SectionId; field: string } | null;
  showDatePicker: boolean;
  showCountryPicker: boolean;
  showResetConfirm: boolean;
  errors: Record<string, string>;
}

type KycAction =
  | { type: 'LOAD_DATA'; payload: Partial<KycData> }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'TOGGLE_SECTION'; payload: SectionId }
  | { type: 'UPDATE_PERSONAL'; payload: Partial<PersonalDetails> }
  | { type: 'UPDATE_IDENTITY'; payload: Partial<IdentityProof> }
  | { type: 'UPDATE_ADDRESS'; payload: Partial<AddressProof> }
  | { type: 'UPDATE_BANK'; payload: Partial<BankDetails> }
  | { type: 'SET_STATUS'; payload: KycStatus }
  | { type: 'SET_UPLOAD_FILE'; payload: { section: SectionId; field: string; file: UploadedFile | null } }
  | { type: 'SHOW_UPLOAD_MODAL'; payload: { section: SectionId; field: string } | null }
  | { type: 'SHOW_DATE_PICKER'; payload: boolean }
  | { type: 'SHOW_COUNTRY_PICKER'; payload: boolean }
  | { type: 'SHOW_RESET_CONFIRM'; payload: boolean }
  | { type: 'SET_ERRORS'; payload: Record<string, string> }
  | { type: 'CLEAR_ERROR'; payload: string }
  | { type: 'SUBMIT' }
  | { type: 'RESET' }
  | { type: 'MARK_SAVED'; payload: number };

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'owners:kycDraft';
const AUTOSAVE_DELAY = 800;

const INITIAL_PERSONAL: PersonalDetails = {
  fullName: '',
  dateOfBirth: '',
  phone: '',
  email: '',
};

const INITIAL_IDENTITY: IdentityProof = {
  documentType: 'national_id',
  documentNumber: '',
  frontImage: null,
  backImage: null,
  selfieImage: null,
};

const INITIAL_ADDRESS: AddressProof = {
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'IN',
  proofDocument: null,
};

const INITIAL_BANK: BankDetails = {
  accountHolderName: '',
  accountNumber: '',
  ifscCode: '',
  bankName: '',
};

const INITIAL_STATE: KycState = {
  status: 'draft',
  rejectionReason: null,
  personal: INITIAL_PERSONAL,
  identity: INITIAL_IDENTITY,
  address: INITIAL_ADDRESS,
  bank: INITIAL_BANK,
  lastSavedAt: null,
  submittedAt: null,
  expandedSection: 'personal',
  isLoading: false,
  isSaving: false,
  showUploadModal: false,
  uploadModalTarget: null,
  showDatePicker: false,
  showCountryPicker: false,
  showResetConfirm: false,
  errors: {},
};

const COUNTRIES = [
  { value: 'IN', label: 'India' },
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'AE', label: 'United Arab Emirates' },
  { value: 'SG', label: 'Singapore' },
  { value: 'AU', label: 'Australia' },
  { value: 'CA', label: 'Canada' },
];

const MOCK_REJECTION_REASON = {
  reason: 'Document verification failed',
  items: [
    'Identity document image is blurry',
    'Name on bank account does not match',
    'Address proof is older than 3 months',
  ],
};

// ============================================================================
// THEME
// ============================================================================

// Light-only, mapped onto the shared kit palette (ink / peach / grey canvas).
const createTheme = () => ({
  colors: {
    background: palette.bg,
    surface: palette.surface,
    surfaceElevated: palette.surface,
    text: palette.text,
    textSecondary: palette.textMuted,
    textMuted: palette.textSubtle,
    border: palette.line,
    borderLight: palette.fill,
    primary: palette.ink,
    primaryLight: palette.fill,
    success: palette.success,
    successLight: palette.successSoft,
    warning: palette.warning,
    warningLight: palette.warningSoft,
    danger: palette.danger,
    dangerLight: palette.dangerSoft,
    overlay: 'rgba(0, 0, 0, 0.45)',
  },
});

// ============================================================================
// REDUCER
// ============================================================================

function kycReducer(state: KycState, action: KycAction): KycState {
  switch (action.type) {
    case 'LOAD_DATA':
      return {
        ...state,
        ...action.payload,
        isLoading: false,
      };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'SET_SAVING':
      return { ...state, isSaving: action.payload };

    case 'TOGGLE_SECTION':
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      return {
        ...state,
        expandedSection: state.expandedSection === action.payload ? null : action.payload,
      };

    case 'UPDATE_PERSONAL':
      return {
        ...state,
        personal: { ...state.personal, ...action.payload },
      };

    case 'UPDATE_IDENTITY':
      return {
        ...state,
        identity: { ...state.identity, ...action.payload },
      };

    case 'UPDATE_ADDRESS':
      return {
        ...state,
        address: { ...state.address, ...action.payload },
      };

    case 'UPDATE_BANK':
      return {
        ...state,
        bank: { ...state.bank, ...action.payload },
      };

    case 'SET_STATUS':
      return { ...state, status: action.payload };

    case 'SET_UPLOAD_FILE': {
      const { section, field, file } = action.payload;
      if (section === 'identity') {
        return {
          ...state,
          identity: { ...state.identity, [field]: file },
        };
      }
      if (section === 'address') {
        return {
          ...state,
          address: { ...state.address, [field]: file },
        };
      }
      return state;
    }

    case 'SHOW_UPLOAD_MODAL':
      return {
        ...state,
        showUploadModal: action.payload !== null,
        uploadModalTarget: action.payload,
      };

    case 'SHOW_DATE_PICKER':
      return { ...state, showDatePicker: action.payload };

    case 'SHOW_COUNTRY_PICKER':
      return { ...state, showCountryPicker: action.payload };

    case 'SHOW_RESET_CONFIRM':
      return { ...state, showResetConfirm: action.payload };

    case 'SET_ERRORS':
      return { ...state, errors: action.payload };

    case 'CLEAR_ERROR': {
      const newErrors = { ...state.errors };
      delete newErrors[action.payload];
      return { ...state, errors: newErrors };
    }

    case 'SUBMIT':
      return {
        ...state,
        status: 'submitted',
        submittedAt: Date.now(),
      };

    case 'RESET':
      return {
        ...INITIAL_STATE,
        isLoading: false,
        expandedSection: 'personal',
      };

    case 'MARK_SAVED':
      return { ...state, lastSavedAt: action.payload, isSaving: false };

    default:
      return state;
  }
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

const calculateAge = (dateString: string): number => {
  if (!dateString) return 0;
  const [year, month, day] = dateString.split('-').map(Number);
  const birthDate = new Date(year, month - 1, day);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

const isValidEmail = (email: string): boolean => {
  if (!email) return true; // Optional field
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const formatPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)} ${digits.slice(5, 10)}`;
};

const formatIFSC = (ifsc: string): string => {
  return ifsc.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
};

const maskAccountNumber = (accountNumber: string): string => {
  if (accountNumber.length <= 4) return accountNumber;
  const visible = accountNumber.slice(-4);
  const masked = '*'.repeat(accountNumber.length - 4);
  return masked + visible;
};

// ============================================================================
// REUSABLE COMPONENTS
// ============================================================================

// Status Pill Component
interface StatusPillProps {
  status: KycStatus;
  theme: ReturnType<typeof createTheme>;
}

const StatusPill: React.FC<StatusPillProps> = ({ status }) => {
  const config: Record<KycStatus, { label: string; tone: string }> = {
    draft: { label: 'Draft', tone: 'warning' },
    submitted: { label: 'Submitted', tone: 'ink' },
    verified: { label: 'Verified', tone: 'success' },
    rejected: { label: 'Rejected', tone: 'danger' },
  };

  const { label, tone } = config[status];

  return <StatusTag label={label} tone={tone} />;
};

// Accordion Section Component
interface AccordionSectionProps {
  id: SectionId;
  title: string;
  description: string;
  isComplete: boolean;
  hasError: boolean;
  isExpanded: boolean;
  isLocked: boolean;
  onToggle: () => void;
  theme: ReturnType<typeof createTheme>;
  children: React.ReactNode;
}

const AccordionSection: React.FC<AccordionSectionProps> = ({
  title,
  description,
  isComplete,
  hasError,
  isExpanded,
  isLocked,
  onToggle,
  children,
}) => {
  const getStatusIcon = () => {
    if (isComplete) return { name: 'checkmark', color: palette.textInverse, bg: palette.success };
    if (hasError) return { name: 'alert', color: palette.danger, bg: palette.dangerSoft };
    return { name: 'ellipse-outline', color: palette.textSubtle, bg: palette.fill };
  };

  const statusIcon = getStatusIcon();

  return (
    <View style={[styles.accordionContainer, hasError && styles.accordionError]}>
      <TouchableOpacity
        style={styles.accordionHeader}
        onPress={onToggle}
        activeOpacity={0.7}
        disabled={isLocked}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        accessibilityLabel={`${title}. ${isComplete ? 'Complete' : 'Incomplete'}`}
      >
        <View style={styles.accordionHeaderLeft}>
          <View style={[styles.accordionIcon, { backgroundColor: statusIcon.bg }]}>
            <Ionicons name={statusIcon.name as any} size={18} color={statusIcon.color} />
          </View>
          <View style={styles.accordionHeaderText}>
            <Text style={styles.accordionTitle}>{title}</Text>
            <Text style={styles.accordionDescription}>{description}</Text>
          </View>
        </View>
        <View style={[styles.chevron, isExpanded && styles.chevronOpen]}>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={isExpanded ? palette.textInverse : isLocked ? palette.textSubtle : palette.text}
          />
        </View>
      </TouchableOpacity>

      {isExpanded && <View style={styles.accordionContent}>{children}</View>}
    </View>
  );
};

// Form Field Component
interface FormFieldProps {
  label: string;
  value: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  error?: string;
  helper?: string;
  required?: boolean;
  disabled?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  secureTextEntry?: boolean;
  onPress?: () => void;
  rightIcon?: string;
  theme: ReturnType<typeof createTheme>;
  maxLength?: number;
}

const FormField: React.FC<FormFieldProps> = ({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  helper,
  required,
  disabled,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  secureTextEntry,
  onPress,
  rightIcon,
  maxLength,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const content = (
    <View
      style={[
        styles.formFieldInput,
        isFocused && styles.formFieldInputFocused,
        !!error && styles.formFieldInputError,
        disabled && styles.formFieldInputDisabled,
      ]}
    >
      <TextInput
        style={styles.formFieldTextInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.textSubtle}
        editable={!disabled && !onPress}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        maxLength={maxLength}
        accessibilityLabel={`${label}${required ? ', required' : ''}`}
      />
      {rightIcon && (
        <Ionicons name={rightIcon as any} size={20} color={palette.textMuted} />
      )}
    </View>
  );

  return (
    <View style={styles.formFieldContainer}>
      <View style={styles.formFieldLabelRow}>
        <Text style={styles.formFieldLabel}>{label}</Text>
        {required && <Text style={styles.formFieldRequired}> *</Text>}
      </View>

      {onPress ? (
        <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.8}>
          {content}
        </TouchableOpacity>
      ) : (
        content
      )}

      {(error || helper) && (
        <Text style={[styles.formFieldHelper, !!error && styles.formFieldHelperError]}>
          {error || helper}
        </Text>
      )}
    </View>
  );
};

// Upload Card Component
interface UploadCardProps {
  label: string;
  file: UploadedFile | null;
  required?: boolean;
  disabled?: boolean;
  onPress: () => void;
  theme: ReturnType<typeof createTheme>;
}

const UploadCard: React.FC<UploadCardProps> = ({
  label,
  file,
  required,
  disabled,
  onPress,
}) => {
  return (
    <TouchableOpacity
      style={[
        styles.uploadCard,
        file ? styles.uploadCardFilled : null,
        disabled ? styles.uploadCardDisabled : null,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Upload ${label}${required ? ', required' : ''}`}
    >
      {file ? (
        <>
          <View style={styles.uploadPreview}>
            <Ionicons name="document-text-outline" size={20} color={palette.textInverse} />
          </View>
          <View style={styles.uploadCardContent}>
            <Text style={styles.uploadCardLabel} numberOfLines={1}>
              {file.name}
            </Text>
            <Text style={styles.uploadCardAction}>Replace</Text>
          </View>
          <Ionicons name="checkmark-circle" size={20} color={palette.success} />
        </>
      ) : (
        <>
          <View style={styles.uploadPlaceholder}>
            <Ionicons name="add" size={22} color={palette.text} />
          </View>
          <View style={styles.uploadCardContent}>
            <Text style={styles.uploadCardLabel}>
              {label}
              {required && <Text style={styles.formFieldRequired}> *</Text>}
            </Text>
            <Text style={styles.uploadCardAction}>Add</Text>
          </View>
        </>
      )}
    </TouchableOpacity>
  );
};

// Bottom Sheet Modal Component
interface BottomSheetModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  theme: ReturnType<typeof createTheme>;
  children: React.ReactNode;
}

const BottomSheetModal: React.FC<BottomSheetModalProps> = ({
  visible,
  onClose,
  title,
  children,
}) => {
  const insets = useSafeAreaInsets();
  return visible ? (

      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable
          style={[styles.bottomSheet, { paddingBottom: insets.bottom + 20 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.bottomSheetHandle} />
          <Text style={styles.bottomSheetTitle}>{title}</Text>
          {children}
        </Pressable>
      </Pressable>

    ) : null;
};

// Banner Component
interface BannerProps {
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
  items?: string[];
  theme: ReturnType<typeof createTheme>;
}

const Banner: React.FC<BannerProps> = ({ type, title, message, items }) => {
  const config = {
    info: { bg: palette.blueSoft, color: palette.text, icon: 'information-circle-outline' },
    success: { bg: palette.successSoft, color: palette.success, icon: 'checkmark-circle-outline' },
    warning: { bg: palette.warningSoft, color: palette.warning, icon: 'warning-outline' },
    error: { bg: palette.dangerSoft, color: palette.danger, icon: 'alert-circle-outline' },
  };

  const { bg, color, icon } = config[type];

  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <View style={styles.bannerIcon}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <View style={styles.bannerContent}>
        <Text style={[styles.bannerTitle, { color }]}>{title}</Text>
        {message && <Text style={styles.bannerMessage}>{message}</Text>}
        {items && items.length > 0 && (
          <View style={styles.bannerItems}>
            {items.map((item, index) => (
              <View key={index} style={styles.bannerItem}>
                <View style={[styles.bannerBullet, { backgroundColor: color }]} />
                <Text style={styles.bannerItemText}>{item}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

// Status hero card (submitted / verified): soft peach or blue card with
// the car illustration cropped into the bottom-right corner.
interface StatusHeroProps {
  tone: 'peach' | 'blue';
  label: string;
  title: string;
  message: string;
}

const StatusHero: React.FC<StatusHeroProps> = ({ tone, label, title, message }) => (
  <View style={[styles.hero, { backgroundColor: tone === 'peach' ? palette.peachSoft : palette.blueSoft }]}>
    <StatusTag label={label} tone="ink" />
    <Text style={styles.heroTitle}>{title}</Text>
    <Text style={styles.heroMessage}>{message}</Text>
    <View style={styles.heroArt} pointerEvents="none">
      <IsoBlock size={130} tone={tone} />
    </View>
  </View>
);

// Segmented Control Component
interface SegmentedControlProps {
  options: { value: string; label: string }[];
  selectedValue: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
  theme: ReturnType<typeof createTheme>;
}

const SegmentedControl: React.FC<SegmentedControlProps> = ({
  options,
  selectedValue,
  onSelect,
  disabled,
}) => {
  return (
    <View style={styles.segmentedControl}>
      {options.map((option) => {
        const isSelected = option.value === selectedValue;
        return (
          <TouchableOpacity
            key={option.value}
            style={[styles.segment, isSelected && styles.segmentSelected]}
            onPress={() => onSelect(option.value)}
            activeOpacity={0.8}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
          >
            <Text
              style={[styles.segmentText, isSelected && styles.segmentTextSelected]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

// Collapsible Tips Component
interface CollapsibleTipsProps {
  tips: string[];
  theme: ReturnType<typeof createTheme>;
}

const CollapsibleTips: React.FC<CollapsibleTipsProps> = ({ tips }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <View style={styles.tipsContainer}>
      <TouchableOpacity
        style={styles.tipsHeader}
        activeOpacity={0.7}
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setIsExpanded(!isExpanded);
        }}
        accessibilityRole="button"
      >
        <View style={styles.tipsHeaderLeft}>
          <Ionicons name="bulb-outline" size={18} color={palette.peachDeep} />
          <Text style={styles.tipsTitle}>Tips for good photos</Text>
        </View>
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={palette.textMuted}
        />
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.tipsContent}>
          {tips.map((tip, index) => (
            <View key={index} style={styles.tipItem}>
              <Ionicons name="checkmark" size={14} color={palette.success} />
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

// Inline DatePickerModal removed — replaced by SharedDatePickerModal from
// components/inputs/DatePickerModal. Kept here as a comment marker so the
// future re-enable of this legacy review screen knows the swap happened.

// (Inline DatePickerModal removed — use SharedDatePickerModal from
// components/inputs/DatePickerModal at the call site below.)

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function KycVerificationScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { user, kycStatus, updateOnboardingStep, updateOwner } = useAuth();
  const theme = useMemo(() => createTheme(), []); // Always use light mode
  const insets = useSafeAreaInsets();

  // Get section from route params (e.g., when navigating from bank notification)
  const initialSection = route.params?.section as SectionId | undefined;

  const [state, dispatch] = useReducer(kycReducer, {
    ...INITIAL_STATE,
    expandedSection: initialSection || 'personal',
  });
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [accountNumberFocused, setAccountNumberFocused] = useState(false);

  // Derived state
  const isLocked = state.status === 'submitted' || state.status === 'verified';

  const sectionComplete = useMemo(() => ({
    personal:
      state.personal.fullName.length >= 2 &&
      state.personal.dateOfBirth !== '' &&
      calculateAge(state.personal.dateOfBirth) >= 18 &&
      state.personal.phone.length >= 10,
    identity:
      state.identity.documentNumber.length >= 4 &&
      state.identity.frontImage !== null &&
      (state.identity.documentType === 'passport' || state.identity.backImage !== null),
    address:
      state.address.addressLine1.length >= 3 &&
      state.address.city.length >= 2 &&
      state.address.state.length >= 2 &&
      state.address.postalCode.length >= 4 &&
      state.address.proofDocument !== null,
    bank:
      state.bank.accountHolderName.length >= 2 &&
      state.bank.accountNumber.length >= 8 &&
      state.bank.ifscCode.length >= 8,
  }), [state.personal, state.identity, state.address, state.bank]);

  const overallProgress = useMemo(() => {
    const completed = Object.values(sectionComplete).filter(Boolean).length;
    return (completed / 4) * 100;
  }, [sectionComplete]);

  const canSubmit = useMemo(() => {
    return Object.values(sectionComplete).every(Boolean) && state.status !== 'submitted' && state.status !== 'verified';
  }, [sectionComplete, state.status]);

  const getMissingItems = useCallback(() => {
    const items: string[] = [];
    if (!sectionComplete.personal) items.push('Complete Personal Details');
    if (!sectionComplete.identity) items.push('Upload Identity Documents');
    if (!sectionComplete.address) items.push('Complete Address Details');
    if (!sectionComplete.bank) items.push('Add Bank Details');
    return items;
  }, [sectionComplete]);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  // Autosave on data changes
  useEffect(() => {
    if (state.isLoading || isLocked) return;

    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
    }

    autosaveTimer.current = setTimeout(() => {
      saveData();
    }, AUTOSAVE_DELAY);

    return () => {
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
      }
    };
  }, [state.personal, state.identity, state.address, state.bank, state.isLoading, isLocked]);

  const loadData = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Pre-fill phone/email from auth if the draft has them blank
        if (!parsed.personal?.phone && user?.phone) {
          parsed.personal = { ...parsed.personal, phone: user.phone };
        }
        if (!parsed.personal?.email && user?.email) {
          parsed.personal = { ...parsed.personal, email: user.email };
        }
        dispatch({ type: 'LOAD_DATA', payload: parsed });
      } else {
        // No draft — seed from auth context
        // If KYC was already submitted/verified, reflect that status so the
        // screen shows locked rather than a blank 0% form.
        const serverStatus: KycStatus =
          kycStatus === 'verified' ? 'verified'
          : kycStatus === 'submitted' ? 'submitted'
          : kycStatus === 'rejected' ? 'rejected'
          : 'draft';

        dispatch({
          type: 'LOAD_DATA',
          payload: {
            status: serverStatus,
            personal: {
              ...INITIAL_PERSONAL,
              phone: user?.phone ?? '',
              email: user?.email ?? '',
            },
          },
        });
      }
    } catch (error) {
      console.error('Failed to load KYC data:', error);
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const saveData = async () => {
    dispatch({ type: 'SET_SAVING', payload: true });
    try {
      const dataToSave: Partial<KycData> = {
        status: state.status,
        rejectionReason: state.rejectionReason,
        personal: state.personal,
        identity: state.identity,
        address: state.address,
        bank: state.bank,
        submittedAt: state.submittedAt,
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
      dispatch({ type: 'MARK_SAVED', payload: Date.now() });
    } catch (error) {
      console.error('Failed to save KYC data:', error);
      dispatch({ type: 'SET_SAVING', payload: false });
    }
  };

  const handleSaveDraft = async () => {
    // Save locally first
    await saveData();

    // Also save draft to backend (fire and forget, no validation)
    try {
      const draftPayload = buildKycPayload();
      await ownerService.saveKycDraft(draftPayload);
    } catch {
      // Backend save failed — local draft is still intact
    }
    AppAlert.alert('Saved', 'Your progress has been saved.');
  };

  /** Build the KYC payload for backend (transforms local state → backend shape) */
  const buildKycPayload = () => {
    return {
      kycPersonal: {
        fullName: state.personal.fullName,
        dateOfBirth: state.personal.dateOfBirth,
        phone: state.personal.phone,
        email: state.personal.email,
      },
      kycIdentity: {
        documentType: state.identity.documentType,
        documentNumber: state.identity.documentNumber,
        frontImageUrl: state.identity.frontImage?.uri || '',
        backImageUrl: state.identity.backImage?.uri || '',
        selfieImageUrl: state.identity.selfieImage?.uri || '',
      },
      kycAddress: {
        addressLine1: state.address.addressLine1,
        addressLine2: state.address.addressLine2,
        city: state.address.city,
        state: state.address.state,
        postalCode: state.address.postalCode,
        country: state.address.country,
        proofDocumentUrl: state.address.proofDocument?.uri || '',
      },
      kycBank: {
        accountHolderName: state.bank.accountHolderName,
        accountNumber: state.bank.accountNumber,
        ifscCode: state.bank.ifscCode,
        bankName: state.bank.bankName,
      },
    };
  };

  /** Upload a local file URI to the server, return the server URL */
  const uploadFileIfLocal = async (uri: string | undefined): Promise<string> => {
    if (!uri) return '';
    // Already a server URL — skip upload
    if (uri.startsWith('/uploads/') || uri.startsWith('http')) return uri;
    // Mock/sample URIs from "Use Sample Image" — no real file exists, pass through a placeholder
    if (uri.includes('sample-') || !uri.startsWith('file://') && !uri.startsWith('content://')) {
      return `/uploads/placeholder-${Date.now()}.jpg`;
    }
    try {
      const mimeType = uri.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
      const result = await ownerService.uploadFile(uri, mimeType);
      return result.url;
    } catch (err) {
      console.error('File upload failed:', uri, err);
      throw err;
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      const missing = getMissingItems();
      AppAlert.alert(
        'Cannot Submit',
        'Please complete the following:\n\n• ' + missing.join('\n• ')
      );
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      // Upload all files first
      const [frontUrl, backUrl, selfieUrl, addressProofUrl] = await Promise.all([
        uploadFileIfLocal(state.identity.frontImage?.uri),
        uploadFileIfLocal(state.identity.backImage?.uri),
        uploadFileIfLocal(state.identity.selfieImage?.uri),
        uploadFileIfLocal(state.address.proofDocument?.uri),
      ]);

      // Build payload with uploaded URLs
      const payload = {
        kycPersonal: {
          fullName: state.personal.fullName,
          dateOfBirth: state.personal.dateOfBirth,
          phone: state.personal.phone,
          email: state.personal.email,
        },
        kycIdentity: {
          documentType: state.identity.documentType,
          documentNumber: state.identity.documentNumber,
          frontImageUrl: frontUrl,
          backImageUrl: backUrl,
          selfieImageUrl: selfieUrl,
        },
        kycAddress: {
          addressLine1: state.address.addressLine1,
          addressLine2: state.address.addressLine2,
          city: state.address.city,
          state: state.address.state,
          postalCode: state.address.postalCode,
          country: state.address.country,
          proofDocumentUrl: addressProofUrl,
        },
        kycBank: {
          accountHolderName: state.bank.accountHolderName,
          accountNumber: state.bank.accountNumber,
          ifscCode: state.bank.ifscCode,
          bankName: state.bank.bankName,
        },
      };

      // Submit KYC to backend
      const response = await ownerService.submitKyc(payload);

      // Update local state
      dispatch({ type: 'SUBMIT' });
      await saveData();

      // Update legacy storage for header display
      await setKycSubmitted(true);
      await saveOwnerProfile({
        ownerName: state.personal.fullName /* || MOCK_OWNER_PROFILE.ownerName */,
        verificationStatus: 'pending',
        unreadNotificationsCount: 1,
      });

      // Update auth context — use whatever the backend returned (auto-approved = 'verified')
      if (response.owner) updateOwner(response.owner);
      const returnedKycStatus = response.owner?.kycStatus ?? 'submitted';
      const returnedStep = returnedKycStatus === 'verified' ? 'completed' : 'kyc_submitted';
      updateOnboardingStep(returnedStep, returnedKycStatus);

      // Keep the draft (with status='submitted') so returning to this screen
      // shows the locked submitted state instead of a blank 0% form.
      // saveData() was already called above with status='submitted'.

      // Navigate to dashboard
      AppAlert.alert(
        'Submitted',
        'Your KYC documents have been submitted for verification.',
        [
          {
            text: 'Continue to Dashboard',
            onPress: () => {
              navigation.dispatch(
                CommonActions.reset({
                  index: 0,
                  routes: [
                    {
                      name: 'MainTabs',
                      state: {
                        routes: [{ name: 'Dashboard' }],
                      },
                    },
                  ],
                })
              );
            },
          },
        ]
      );
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.code === 'UPLOAD_TOO_LARGE') {
          AppAlert.alert('File Too Large', 'One or more files exceed the 5MB limit. Please use smaller files.');
        } else if (err.code === 'UPLOAD_INVALID_TYPE') {
          AppAlert.alert('Invalid File', 'Only JPEG, PNG, and PDF files are allowed.');
        } else if (err.code === 'REQ_VALIDATION') {
          const details = Array.isArray(err.details)
            ? err.details.map((d: any) => d.message || d.field).join('\n• ')
            : err.message;
          AppAlert.alert('Validation Error', `Please fix the following:\n\n• ${details}`);
        } else {
          AppAlert.alert('Error', err.message || 'Failed to submit KYC. Please try again.');
        }
      } else {
        AppAlert.alert('Connection Error', 'Unable to connect. Your data is saved locally. Please try again when online.');
      }
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const handleReset = async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      dispatch({ type: 'RESET' });
      dispatch({ type: 'SHOW_RESET_CONFIRM', payload: false });
    } catch (error) {
      console.error('Failed to reset KYC data:', error);
    }
  };

  const handleUpload = (file: UploadedFile | null) => {
    if (state.uploadModalTarget) {
      dispatch({
        type: 'SET_UPLOAD_FILE',
        payload: {
          section: state.uploadModalTarget.section,
          field: state.uploadModalTarget.field,
          file,
        },
      });
    }
    dispatch({ type: 'SHOW_UPLOAD_MODAL', payload: null });
  };

  const [uploadBusy, setUploadBusy] = useState(false);

  const handlePickAndUpload = async (source: PickSource) => {
    if (!state.uploadModalTarget) return;
    setUploadBusy(true);
    try {
      // KYC: ID front/back use the CR80 ID-card aspect; selfie is square;
      // address proof is free-aspect (utility bills come in many shapes).
      const target = state.uploadModalTarget;
      const aspect: 'idCard' | 'square' | 'free' =
        target.section === 'identity'
          ? (target.field === 'selfieImage' ? 'square' : 'idCard')
          : 'free';
      const result = await pickAndUploadImage({ source, aspect });
      const filename = result.filename || `${result.publicId}.${result.format}`;
      handleUpload({
        uri: result.url,
        name: filename,
        timestamp: Date.now(),
      });
    } catch (err) {
      handleMediaUploadError(err);
    } finally {
      setUploadBusy(false);
    }
  };

  const formatDate = (dateString: string): string => {
    if (!dateString) return '';
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
  };

  if (state.isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const completedCount = Object.values(sectionComplete).filter(Boolean).length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={palette.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>KYC & Verification</Text>
          <StatusPill status={state.status} theme={theme} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Trust Message */}
          <Text style={styles.trustMessage}>
            Complete verification to publish your parking listings.
          </Text>

          {/* Status Banners */}
          {state.status === 'submitted' && (
            <StatusHero
              tone="blue"
              label="In review"
              title="Submitted for Review"
              message="Your documents are being verified. This usually takes 1-2 business days."
            />
          )}

          {state.status === 'verified' && (
            <StatusHero
              tone="peach"
              label="Verified"
              title="Verification Complete"
              message="Your KYC is verified. You can now publish parking listings."
            />
          )}

          {state.status === 'rejected' && (
            <Banner
              type="error"
              title={MOCK_REJECTION_REASON.reason}
              message="Please fix the issues below and resubmit."
              items={MOCK_REJECTION_REASON.items}
              theme={theme}
            />
          )}

          {/* Progress Section */}
          <View style={styles.progressSection}>
            <Text style={styles.progressTitle}>Verification progress</Text>
            <View style={styles.progressHeader}>
              <Text style={styles.progressPercent}>{Math.round(overallProgress)}%</Text>
              <Text style={styles.progressCount}>{completedCount} of 4 sections</Text>
            </View>
            <ProgressTrack
              steps={4}
              current={completedCount}
              trackColor={palette.line}
              style={styles.progressTrack}
            />

            {overallProgress < 100 && !isLocked && (
              <TouchableOpacity
                style={styles.jumpLink}
                activeOpacity={0.7}
                onPress={() => {
                  const incomplete = Object.entries(sectionComplete).find(([_, complete]) => !complete);
                  if (incomplete) {
                    dispatch({ type: 'TOGGLE_SECTION', payload: incomplete[0] as SectionId });
                  }
                }}
              >
                <Text style={styles.jumpLinkText}>Jump to next incomplete section</Text>
                <Ionicons name="arrow-forward" size={15} color={palette.text} />
              </TouchableOpacity>
            )}
          </View>

          {/* Section A: Personal Details */}
          <AccordionSection
            id="personal"
            title="Personal Details"
            description="Basic information about yourself"
            isComplete={sectionComplete.personal}
            hasError={!!state.errors.personal}
            isExpanded={state.expandedSection === 'personal'}
            isLocked={isLocked}
            onToggle={() => dispatch({ type: 'TOGGLE_SECTION', payload: 'personal' })}
            theme={theme}
          >
            <FormField
              label="Full Name"
              value={state.personal.fullName}
              onChangeText={(text) => dispatch({ type: 'UPDATE_PERSONAL', payload: { fullName: text } })}
              placeholder="As per your ID"
              required
              disabled={isLocked}
              autoCapitalize="words"
              theme={theme}
              error={state.personal.fullName.length > 0 && state.personal.fullName.length < 2 ? 'Name must be at least 2 characters' : undefined}
            />

            <FormField
              label="Date of Birth"
              value={formatDate(state.personal.dateOfBirth)}
              placeholder="Select your date of birth"
              required
              disabled={isLocked}
              onPress={() => dispatch({ type: 'SHOW_DATE_PICKER', payload: true })}
              rightIcon="calendar-outline"
              theme={theme}
              error={
                state.personal.dateOfBirth && calculateAge(state.personal.dateOfBirth) < 18
                  ? 'You must be at least 18 years old'
                  : undefined
              }
            />

            <FormField
              label="Phone Number"
              value={formatPhone(state.personal.phone)}
              onChangeText={(text) => dispatch({ type: 'UPDATE_PERSONAL', payload: { phone: text.replace(/\D/g, '').slice(0, 10) } })}
              placeholder="10-digit mobile number"
              required
              disabled={isLocked}
              keyboardType="phone-pad"
              theme={theme}
              maxLength={11}
            />

            <FormField
              label="Email"
              value={state.personal.email}
              onChangeText={(text) => dispatch({ type: 'UPDATE_PERSONAL', payload: { email: text } })}
              placeholder="your@email.com (optional)"
              disabled={isLocked}
              keyboardType="email-address"
              autoCapitalize="none"
              theme={theme}
              error={!isValidEmail(state.personal.email) ? 'Please enter a valid email' : undefined}
            />
          </AccordionSection>

          {/* Section B: Identity Proof */}
          <AccordionSection
            id="identity"
            title="Identity Proof"
            description="Government-issued ID verification"
            isComplete={sectionComplete.identity}
            hasError={!!state.errors.identity}
            isExpanded={state.expandedSection === 'identity'}
            isLocked={isLocked}
            onToggle={() => dispatch({ type: 'TOGGLE_SECTION', payload: 'identity' })}
            theme={theme}
          >
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldGroupLabel}>Document Type</Text>
              <SegmentedControl
                options={[
                  { value: 'national_id', label: 'National ID' },
                  { value: 'passport', label: 'Passport' },
                  { value: 'drivers_license', label: "Driver's License" },
                ]}
                selectedValue={state.identity.documentType}
                onSelect={(value) => dispatch({ type: 'UPDATE_IDENTITY', payload: { documentType: value as DocumentType } })}
                disabled={isLocked}
                theme={theme}
              />
            </View>

            <FormField
              label="Document Number"
              value={state.identity.documentNumber}
              onChangeText={(text) => dispatch({ type: 'UPDATE_IDENTITY', payload: { documentNumber: text.toUpperCase() } })}
              placeholder="Enter document number"
              required
              disabled={isLocked}
              autoCapitalize="characters"
              theme={theme}
            />

            <View style={styles.uploadSection}>
              <Text style={styles.fieldGroupLabel}>Upload Documents</Text>
              <View style={styles.uploadGrid}>
                <UploadCard
                  label="Front Side"
                  file={state.identity.frontImage}
                  required
                  disabled={isLocked}
                  onPress={() => dispatch({ type: 'SHOW_UPLOAD_MODAL', payload: { section: 'identity', field: 'frontImage' } })}
                  theme={theme}
                />
                <UploadCard
                  label="Back Side"
                  file={state.identity.backImage}
                  required={state.identity.documentType !== 'passport'}
                  disabled={isLocked}
                  onPress={() => dispatch({ type: 'SHOW_UPLOAD_MODAL', payload: { section: 'identity', field: 'backImage' } })}
                  theme={theme}
                />
              </View>
              <UploadCard
                label="Selfie with ID (recommended)"
                file={state.identity.selfieImage}
                disabled={isLocked}
                onPress={() => dispatch({ type: 'SHOW_UPLOAD_MODAL', payload: { section: 'identity', field: 'selfieImage' } })}
                theme={theme}
              />
            </View>

            <CollapsibleTips
              tips={[
                'Use good lighting, avoid shadows',
                'Make sure the entire document is visible',
                'Avoid blur - hold camera steady',
                'Remove any covers or sleeves',
              ]}
              theme={theme}
            />
          </AccordionSection>

          {/* Section C: Address Proof */}
          <AccordionSection
            id="address"
            title="Address Proof"
            description="Verify your residential address"
            isComplete={sectionComplete.address}
            hasError={!!state.errors.address}
            isExpanded={state.expandedSection === 'address'}
            isLocked={isLocked}
            onToggle={() => dispatch({ type: 'TOGGLE_SECTION', payload: 'address' })}
            theme={theme}
          >
            <FormField
              label="Address Line 1"
              value={state.address.addressLine1}
              onChangeText={(text) => dispatch({ type: 'UPDATE_ADDRESS', payload: { addressLine1: text } })}
              placeholder="Street address, building name"
              required
              disabled={isLocked}
              autoCapitalize="words"
              theme={theme}
            />

            <FormField
              label="Address Line 2"
              value={state.address.addressLine2}
              onChangeText={(text) => dispatch({ type: 'UPDATE_ADDRESS', payload: { addressLine2: text } })}
              placeholder="Apartment, suite, floor (optional)"
              disabled={isLocked}
              autoCapitalize="words"
              theme={theme}
            />

            <View style={styles.rowFields}>
              <View style={styles.halfField}>
                <FormField
                  label="City"
                  value={state.address.city}
                  onChangeText={(text) => dispatch({ type: 'UPDATE_ADDRESS', payload: { city: text } })}
                  placeholder="City"
                  required
                  disabled={isLocked}
                  autoCapitalize="words"
                  theme={theme}
                />
              </View>
              <View style={styles.halfField}>
                <FormField
                  label="State/Province"
                  value={state.address.state}
                  onChangeText={(text) => dispatch({ type: 'UPDATE_ADDRESS', payload: { state: text } })}
                  placeholder="State"
                  required
                  disabled={isLocked}
                  autoCapitalize="words"
                  theme={theme}
                />
              </View>
            </View>

            <View style={styles.rowFields}>
              <View style={styles.halfField}>
                <FormField
                  label="Postal Code"
                  value={state.address.postalCode}
                  onChangeText={(text) => dispatch({ type: 'UPDATE_ADDRESS', payload: { postalCode: text.replace(/\D/g, '').slice(0, 6) } })}
                  placeholder="PIN Code"
                  required
                  disabled={isLocked}
                  keyboardType="numeric"
                  theme={theme}
                  maxLength={6}
                />
              </View>
              <View style={styles.halfField}>
                <FormField
                  label="Country"
                  value={COUNTRIES.find((c) => c.value === state.address.country)?.label || ''}
                  placeholder="Select country"
                  required
                  disabled={isLocked}
                  onPress={() => dispatch({ type: 'SHOW_COUNTRY_PICKER', payload: true })}
                  rightIcon="chevron-down"
                  theme={theme}
                />
              </View>
            </View>

            <View style={styles.uploadSection}>
              <Text style={styles.fieldGroupLabel}>Address Proof Document</Text>
              <UploadCard
                label="Utility Bill / Rental Agreement"
                file={state.address.proofDocument}
                required
                disabled={isLocked}
                onPress={() => dispatch({ type: 'SHOW_UPLOAD_MODAL', payload: { section: 'address', field: 'proofDocument' } })}
                theme={theme}
              />
              <Text style={styles.uploadHint}>
                Document should be less than 3 months old
              </Text>
            </View>
          </AccordionSection>

          {/* Section D: Bank Details */}
          <AccordionSection
            id="bank"
            title="Bank Details"
            description="For receiving payouts"
            isComplete={sectionComplete.bank}
            hasError={!!state.errors.bank}
            isExpanded={state.expandedSection === 'bank'}
            isLocked={isLocked}
            onToggle={() => dispatch({ type: 'TOGGLE_SECTION', payload: 'bank' })}
            theme={theme}
          >
            <Banner
              type="info"
              title="Payout Information"
              message="All earnings from your parking spaces will be sent to this account."
              theme={theme}
            />

            <FormField
              label="Account Holder Name"
              value={state.bank.accountHolderName}
              onChangeText={(text) => dispatch({ type: 'UPDATE_BANK', payload: { accountHolderName: text } })}
              placeholder="Name as per bank records"
              required
              disabled={isLocked}
              autoCapitalize="words"
              theme={theme}
            />

            {/* Same as full name shortcut */}
            {state.personal.fullName ? (
              <TouchableOpacity
                style={styles.sameAsNameRow}
                activeOpacity={0.7}
                onPress={() => {
                  if (!isLocked) {
                    dispatch({ type: 'UPDATE_BANK', payload: { accountHolderName: state.personal.fullName } });
                  }
                }}
                disabled={isLocked}
              >
                <View style={[
                  styles.sameAsNameCheckbox,
                  state.bank.accountHolderName === state.personal.fullName && styles.sameAsNameCheckboxChecked,
                ]}>
                  {state.bank.accountHolderName === state.personal.fullName && (
                    <Ionicons name="checkmark" size={12} color={palette.textInverse} />
                  )}
                </View>
                <Text style={styles.sameAsNameText}>
                  Use full name: <Text style={styles.sameAsNameValue}>{state.personal.fullName}</Text>
                </Text>
              </TouchableOpacity>
            ) : null}

            <View style={styles.formFieldContainer}>
              <View style={styles.formFieldLabelRow}>
                <Text style={styles.formFieldLabel}>Account Number</Text>
                <Text style={styles.formFieldRequired}> *</Text>
              </View>
              <View
                style={[
                  styles.formFieldInput,
                  accountNumberFocused && styles.formFieldInputFocused,
                  isLocked && styles.formFieldInputDisabled,
                ]}
              >
                <TextInput
                  style={styles.formFieldTextInput}
                  value={accountNumberFocused ? state.bank.accountNumber : maskAccountNumber(state.bank.accountNumber)}
                  onChangeText={(text) => dispatch({ type: 'UPDATE_BANK', payload: { accountNumber: text.replace(/\D/g, '') } })}
                  placeholder="Enter account number"
                  placeholderTextColor={palette.textSubtle}
                  editable={!isLocked}
                  keyboardType="numeric"
                  onFocus={() => setAccountNumberFocused(true)}
                  onBlur={() => setAccountNumberFocused(false)}
                  accessibilityLabel="Account Number, required"
                />
              </View>
            </View>

            <FormField
              label="IFSC / Routing Number"
              value={state.bank.ifscCode}
              onChangeText={(text) => dispatch({ type: 'UPDATE_BANK', payload: { ifscCode: formatIFSC(text) } })}
              placeholder="e.g., SBIN0001234"
              required
              disabled={isLocked}
              autoCapitalize="characters"
              theme={theme}
              maxLength={11}
            />

            <FormField
              label="Bank Name"
              value={state.bank.bankName}
              onChangeText={(text) => dispatch({ type: 'UPDATE_BANK', payload: { bankName: text } })}
              placeholder="e.g., State Bank of India (optional)"
              disabled={isLocked}
              autoCapitalize="words"
              theme={theme}
            />
          </AccordionSection>
        </ScrollView>

        {/* Sticky Footer */}
        <View style={[styles.stickyFooter, { paddingBottom: insets.bottom + 12 }]}>
          <PillButton
            label={
              state.status === 'submitted'
                ? 'Submitted'
                : state.status === 'verified'
                ? 'Verified'
                : 'Submit for Verification'
            }
            variant="ink"
            onPress={handleSubmit}
            disabled={!canSubmit}
          />

          <View style={styles.secondaryButtons}>
            <PillButton
              label="Save Draft"
              icon="save"
              variant="grey"
              size="md"
              onPress={handleSaveDraft}
              disabled={isLocked}
              style={styles.secondaryButton}
            />
            <PillButton
              label="Reset"
              icon="refresh-cw"
              variant="danger"
              size="md"
              onPress={() => dispatch({ type: 'SHOW_RESET_CONFIRM', payload: true })}
              disabled={isLocked}
              style={styles.secondaryButton}
            />
          </View>

          <Text style={styles.reviewNote}>
            {state.isSaving ? 'Saving...' : 'Verification typically takes 1-2 business days'}
          </Text>
        </View>

        {/* Upload Modal */}
        <BottomSheetModal
          visible={state.showUploadModal}
          onClose={() => dispatch({ type: 'SHOW_UPLOAD_MODAL', payload: null })}
          title="Upload Document"
          theme={theme}
        >
          <TouchableOpacity
            style={[styles.modalOption, styles.modalOptionDivider]}
            activeOpacity={0.6}
            onPress={() => handlePickAndUpload('camera')}
            disabled={uploadBusy}
          >
            <View style={styles.modalOptionIcon}>
              <Ionicons name="camera-outline" size={19} color={palette.text} />
            </View>
            <Text style={styles.modalOptionText}>
              {uploadBusy ? 'Uploading…' : 'Take Photo'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modalOption, styles.modalOptionDivider]}
            activeOpacity={0.6}
            onPress={() => handlePickAndUpload('gallery')}
            disabled={uploadBusy}
          >
            <View style={styles.modalOptionIcon}>
              <Ionicons name="images-outline" size={19} color={palette.text} />
            </View>
            <Text style={styles.modalOptionText}>
              {uploadBusy ? 'Uploading…' : 'Choose from Gallery'}
            </Text>
          </TouchableOpacity>

          {state.uploadModalTarget && (
            (() => {
              const { section, field } = state.uploadModalTarget;
              const currentFile =
                section === 'identity'
                  ? state.identity[field as keyof IdentityProof]
                  : section === 'address'
                  ? state.address[field as keyof AddressProof]
                  : null;

              if (currentFile) {
                return (
                  <TouchableOpacity
                    style={[styles.modalOption, styles.modalOptionDivider]}
                    activeOpacity={0.6}
                    onPress={() => handleUpload(null)}
                  >
                    <View style={[styles.modalOptionIcon, styles.modalOptionIconDanger]}>
                      <Ionicons name="trash-outline" size={19} color={palette.danger} />
                    </View>
                    <Text style={[styles.modalOptionText, styles.modalOptionTextDanger]}>Remove</Text>
                  </TouchableOpacity>
                );
              }
              return null;
            })()
          )}

          <PillButton
            label="Cancel"
            variant="grey"
            size="md"
            onPress={() => dispatch({ type: 'SHOW_UPLOAD_MODAL', payload: null })}
            style={styles.modalCancel}
          />
        </BottomSheetModal>

        {/* Date Picker Modal — shared component, no native module */}
        <SharedDatePickerModal
          visible={state.showDatePicker}
          onClose={() => dispatch({ type: 'SHOW_DATE_PICKER', payload: false })}
          onSelect={(date) => dispatch({ type: 'UPDATE_PERSONAL', payload: { dateOfBirth: date } })}
          initialDate={state.personal.dateOfBirth || undefined}
          title="Date of Birth"
          maxDate={new Date()}
          hideToday
        />

        {/* Country Picker Modal */}
        <BottomSheetModal
          visible={state.showCountryPicker}
          onClose={() => dispatch({ type: 'SHOW_COUNTRY_PICKER', payload: false })}
          title="Select Country"
          theme={theme}
        >
          <ScrollView style={styles.countryList}>
            {COUNTRIES.map((country) => {
              const selected = state.address.country === country.value;
              return (
                <TouchableOpacity
                  key={country.value}
                  style={[styles.countryOption, selected && styles.countryOptionSelected]}
                  activeOpacity={0.7}
                  onPress={() => {
                    dispatch({ type: 'UPDATE_ADDRESS', payload: { country: country.value } });
                    dispatch({ type: 'SHOW_COUNTRY_PICKER', payload: false });
                  }}
                >
                  <Text style={[styles.countryOptionText, selected && styles.countryOptionTextSelected]}>
                    {country.label}
                  </Text>
                  {selected && (
                    <View style={styles.countryCheck}>
                      <Ionicons name="checkmark" size={14} color={palette.textInverse} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </BottomSheetModal>

        {/* Reset Confirmation Modal */}
        {state.showResetConfirm ? (

          <View style={styles.confirmModalOverlay}>
            <View style={styles.confirmModal}>
              <View style={styles.confirmModalIcon}>
                <Ionicons name="warning-outline" size={28} color={palette.danger} />
              </View>
              <Text style={styles.confirmModalTitle}>Reset KYC Data?</Text>
              <Text style={styles.confirmModalMessage}>
                This will clear all your entered information and uploaded documents. This action cannot be undone.
              </Text>
              <View style={styles.confirmModalButtons}>
                <PillButton
                  label="Cancel"
                  variant="grey"
                  size="md"
                  onPress={() => dispatch({ type: 'SHOW_RESET_CONFIRM', payload: false })}
                  style={styles.confirmModalButton}
                />
                <PillButton
                  label="Reset"
                  variant="ink"
                  size="md"
                  onPress={handleReset}
                  style={[styles.confirmModalButton, styles.confirmModalButtonDanger]}
                />
              </View>
            </View>
          </View>

        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  flex: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { ...fonts.medium, fontSize: 16, color: palette.textMuted },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 20,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    ...fonts.semibold,
    flex: 1,
    fontSize: 19,
    color: palette.text,
    marginHorizontal: 12,
  },

  // Scroll View
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 230 },

  // Trust Message
  trustMessage: {
    ...fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: palette.textMuted,
    marginHorizontal: 6,
    marginBottom: 14,
  },

  // Status hero
  hero: {
    borderRadius: radii.xl,
    padding: 20,
    paddingRight: 110,
    minHeight: 150,
    marginBottom: 12,
    overflow: 'hidden',
  },
  heroTitle: {
    ...fonts.semibold,
    fontSize: 22,
    letterSpacing: -0.4,
    lineHeight: 27,
    color: palette.text,
    marginTop: 12,
  },
  heroMessage: { ...fonts.medium, fontSize: 13, lineHeight: 18, color: palette.inkSoft, marginTop: 6 },
  heroArt: { position: 'absolute', right: -30, bottom: -26 },

  // Progress Section
  progressSection: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    padding: 20,
    marginBottom: 12,
  },
  progressTitle: { ...fonts.medium, fontSize: 13, color: palette.textMuted },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 2,
  },
  progressPercent: { ...fonts.semibold, fontSize: 38, letterSpacing: -1, color: palette.text },
  progressCount: { ...fonts.semibold, fontSize: 13, color: palette.textMuted, marginBottom: 8 },
  progressTrack: { marginTop: 12 },
  jumpLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 16,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    backgroundColor: palette.fill,
    gap: 6,
  },
  jumpLinkText: { ...fonts.semibold, fontSize: 13, color: palette.text },

  // Accordion
  accordionContainer: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: palette.surface,
  },
  accordionError: { borderColor: palette.danger },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  accordionHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  accordionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accordionHeaderText: { marginLeft: 12, flex: 1 },
  accordionTitle: { ...fonts.semibold, fontSize: 16.5, letterSpacing: -0.2, color: palette.text },
  accordionDescription: { ...fonts.medium, fontSize: 12.5, color: palette.textMuted, marginTop: 2 },
  chevron: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  chevronOpen: { backgroundColor: palette.ink },
  accordionContent: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.line,
  },

  // Same-as-name checkbox row
  sameAsNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -6,
    marginBottom: 16,
    gap: 10,
  },
  sameAsNameCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: palette.textSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sameAsNameCheckboxChecked: { backgroundColor: palette.ink, borderColor: palette.ink },
  sameAsNameText: { ...fonts.medium, fontSize: 13, color: palette.textMuted, flex: 1 },
  sameAsNameValue: { ...fonts.semibold, color: palette.text },

  // Form Field
  formFieldContainer: { marginBottom: 16 },
  formFieldLabelRow: { flexDirection: 'row', marginBottom: 8, marginLeft: 4 },
  formFieldLabel: { ...fonts.medium, fontSize: 12.5, color: palette.textMuted },
  formFieldRequired: { ...fonts.medium, fontSize: 12.5, color: palette.danger },
  formFieldInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: palette.fill,
    backgroundColor: palette.fill,
    borderRadius: radii.pill,
    paddingHorizontal: 20,
    height: 54,
  },
  formFieldInputFocused: { borderColor: palette.ink, backgroundColor: palette.surface },
  formFieldInputError: { borderColor: palette.danger },
  formFieldInputDisabled: { opacity: 0.6 },
  formFieldTextInput: {
    ...fonts.medium,
    flex: 1,
    fontSize: 15.5,
    color: palette.text,
    paddingVertical: 0,
  },
  formFieldHelper: { ...fonts.medium, fontSize: 12, color: palette.textMuted, marginTop: 6, marginLeft: 6 },
  formFieldHelperError: { color: palette.danger },

  // Field Group
  fieldGroup: { marginBottom: 16 },
  fieldGroupLabel: { ...fonts.semibold, fontSize: 14, color: palette.text, marginBottom: 8, marginLeft: 4 },

  // Segmented Control
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: palette.fill,
    borderRadius: radii.pill,
    padding: 5,
  },
  segment: {
    flex: 1,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    paddingHorizontal: 4,
  },
  segmentSelected: { backgroundColor: palette.surface, ...shadow.press },
  segmentText: { ...fonts.semibold, fontSize: 13, color: palette.textMuted },
  segmentTextSelected: { color: palette.text },

  // Upload Section
  uploadSection: { marginTop: 4 },
  uploadGrid: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  uploadCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: radii.lg,
    backgroundColor: palette.fill,
    minHeight: 70,
  },
  uploadCardFilled: { backgroundColor: palette.successSoft },
  uploadCardDisabled: { opacity: 0.6 },
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
  uploadCardLabel: { ...fonts.semibold, fontSize: 13.5, color: palette.text },
  uploadCardAction: { ...fonts.medium, fontSize: 12, color: palette.textMuted, marginTop: 2 },
  uploadHint: { ...fonts.medium, fontSize: 12, color: palette.textMuted, marginTop: 8, marginLeft: 4 },

  // Tips
  tipsContainer: {
    borderRadius: radii.lg,
    backgroundColor: palette.peachWash,
    marginTop: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  tipsHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tipsTitle: { ...fonts.semibold, fontSize: 13.5, color: palette.text },
  tipsContent: { paddingHorizontal: 14, paddingBottom: 14 },
  tipItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 6 },
  tipText: { ...fonts.medium, fontSize: 12.5, color: palette.inkSoft, flex: 1 },

  // Row Fields
  rowFields: { flexDirection: 'row', gap: 10 },
  halfField: { flex: 1 },

  // Banner
  banner: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: radii.lg,
    marginBottom: 14,
    gap: 12,
  },
  bannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerContent: { flex: 1 },
  bannerTitle: { ...fonts.semibold, fontSize: 14.5 },
  bannerMessage: { ...fonts.medium, fontSize: 13, lineHeight: 18, color: palette.inkSoft, marginTop: 3 },
  bannerItems: { marginTop: 8 },
  bannerItem: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  bannerBullet: { width: 5, height: 5, borderRadius: 3 },
  bannerItemText: { ...fonts.medium, fontSize: 13, color: palette.inkSoft, flex: 1 },

  // Footer
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 14,
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    ...shadow.lifted,
  },
  secondaryButtons: { flexDirection: 'row', gap: 10, marginTop: 10 },
  secondaryButton: { flex: 1 },
  reviewNote: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textMuted,
    textAlign: 'center',
    marginTop: 10,
  },

  // Modal
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
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingTop: 12,
    paddingHorizontal: 24,
  },
  bottomSheetHandle: {
    width: 44,
    height: 5,
    backgroundColor: palette.line,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 18,
  },
  bottomSheetTitle: {
    ...fonts.semibold,
    fontSize: 20,
    letterSpacing: -0.3,
    color: palette.text,
    marginBottom: 8,
  },
  modalOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  modalOptionDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  modalOptionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  modalOptionIconDanger: { backgroundColor: palette.dangerSoft },
  modalOptionText: { ...fonts.semibold, fontSize: 15.5, color: palette.text },
  modalOptionTextDanger: { color: palette.danger },
  modalCancel: { marginTop: 14 },

  // Country Picker
  countryList: { maxHeight: 300 },
  countryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 52,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    marginBottom: 4,
  },
  countryOptionSelected: { backgroundColor: palette.fill },
  countryOptionText: { ...fonts.medium, fontSize: 15.5, color: palette.text },
  countryOptionTextSelected: { ...fonts.semibold },
  countryCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Confirm Modal
  confirmModalOverlay: {
    // Absolutely positioned rather than flex:1 — no longer inside a
    // <Modal>, which does not present on this build.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  confirmModal: {
    width: '100%',
    maxWidth: 340,
    borderRadius: radii.xl,
    backgroundColor: palette.surface,
    padding: 24,
    alignItems: 'center',
  },
  confirmModalIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: palette.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmModalTitle: {
    ...fonts.semibold,
    fontSize: 20,
    letterSpacing: -0.3,
    color: palette.text,
    marginTop: 14,
    marginBottom: 6,
  },
  confirmModalMessage: {
    ...fonts.medium,
    fontSize: 14,
    color: palette.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  confirmModalButtons: { flexDirection: 'row', gap: 10, marginTop: 22, width: '100%' },
  confirmModalButton: { flex: 1 },
  confirmModalButtonDanger: { backgroundColor: palette.danger },
});
