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
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Animated,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

const createTheme = (isDark: boolean) => ({
  colors: {
    background: isDark ? '#0F172A' : '#F8FAFC',
    surface: isDark ? '#1E293B' : '#FFFFFF',
    surfaceElevated: isDark ? '#334155' : '#FFFFFF',
    text: isDark ? '#F1F5F9' : '#1E293B',
    textSecondary: isDark ? '#94A3B8' : '#64748B',
    textMuted: isDark ? '#64748B' : '#94A3B8',
    border: isDark ? '#334155' : '#E2E8F0',
    borderLight: isDark ? '#1E293B' : '#F1F5F9',
    primary: '#0D7377',
    primaryLight: isDark ? '#1E3A5F' : '#E8F5F4',
    success: '#10B981',
    successLight: isDark ? '#064E3B' : '#ECFDF5',
    warning: '#F59E0B',
    warningLight: isDark ? '#78350F' : '#FFFBEB',
    danger: '#EF4444',
    dangerLight: isDark ? '#7F1D1D' : '#FEF2F2',
    overlay: 'rgba(0, 0, 0, 0.5)',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    full: 9999,
  },
  typography: {
    title: { fontSize: 20, fontWeight: '700' as const },
    subtitle: { fontSize: 16, fontWeight: '600' as const },
    body: { fontSize: 15, fontWeight: '400' as const },
    bodyMedium: { fontSize: 15, fontWeight: '500' as const },
    caption: { fontSize: 13, fontWeight: '400' as const },
    small: { fontSize: 12, fontWeight: '400' as const },
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

const StatusPill: React.FC<StatusPillProps> = ({ status, theme }) => {
  const config = {
    draft: { label: 'Draft', bg: theme.colors.warningLight, color: theme.colors.warning },
    submitted: { label: 'Submitted', bg: theme.colors.primaryLight, color: theme.colors.primary },
    verified: { label: 'Verified', bg: theme.colors.successLight, color: theme.colors.success },
    rejected: { label: 'Rejected', bg: theme.colors.dangerLight, color: theme.colors.danger },
  };

  const { label, bg, color } = config[status];

  return (
    <View style={[styles.statusPill, { backgroundColor: bg }]}>
      <Text style={[styles.statusPillText, { color }]}>{label}</Text>
    </View>
  );
};

// Progress Bar Component
interface ProgressBarProps {
  progress: number;
  theme: ReturnType<typeof createTheme>;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ progress, theme }) => {
  const animatedWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: progress,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [progress, animatedWidth]);

  return (
    <View style={[styles.progressBarContainer, { backgroundColor: theme.colors.border }]}>
      <Animated.View
        style={[
          styles.progressBarFill,
          {
            backgroundColor: progress === 100 ? theme.colors.success : theme.colors.primary,
            width: animatedWidth.interpolate({
              inputRange: [0, 100],
              outputRange: ['0%', '100%'],
            }),
          },
        ]}
      />
    </View>
  );
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
  theme,
  children,
}) => {
  const getStatusIcon = () => {
    if (isComplete) return { name: 'checkmark-circle', color: theme.colors.success };
    if (hasError) return { name: 'alert-circle', color: theme.colors.danger };
    return { name: 'ellipse-outline', color: theme.colors.textMuted };
  };

  const statusIcon = getStatusIcon();

  return (
    <View style={[styles.accordionContainer, { backgroundColor: theme.colors.surface }]}>
      <Pressable
        style={styles.accordionHeader}
        onPress={onToggle}
        disabled={isLocked}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        accessibilityLabel={`${title}. ${isComplete ? 'Complete' : 'Incomplete'}`}
      >
        <View style={styles.accordionHeaderLeft}>
          <Ionicons name={statusIcon.name as any} size={24} color={statusIcon.color} />
          <View style={styles.accordionHeaderText}>
            <Text style={[styles.accordionTitle, { color: theme.colors.text }]}>{title}</Text>
            <Text style={[styles.accordionDescription, { color: theme.colors.textSecondary }]}>
              {description}
            </Text>
          </View>
        </View>
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={isLocked ? theme.colors.textMuted : theme.colors.textSecondary}
        />
      </Pressable>

      {isExpanded && (
        <View style={[styles.accordionContent, { borderTopColor: theme.colors.border }]}>
          {children}
        </View>
      )}
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
  theme,
  maxLength,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const getBorderColor = () => {
    if (error) return theme.colors.danger;
    if (isFocused) return theme.colors.primary;
    return theme.colors.border;
  };

  const content = (
    <View
      style={[
        styles.formFieldInput,
        {
          borderColor: getBorderColor(),
          backgroundColor: disabled ? theme.colors.borderLight : theme.colors.surface,
        },
      ]}
    >
      <TextInput
        style={[styles.formFieldTextInput, { color: theme.colors.text }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
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
        <Ionicons name={rightIcon as any} size={20} color={theme.colors.textMuted} />
      )}
    </View>
  );

  return (
    <View style={styles.formFieldContainer}>
      <View style={styles.formFieldLabelRow}>
        <Text style={[styles.formFieldLabel, { color: theme.colors.text }]}>{label}</Text>
        {required && <Text style={[styles.formFieldRequired, { color: theme.colors.danger }]}> *</Text>}
      </View>

      {onPress ? (
        <Pressable onPress={onPress} disabled={disabled}>
          {content}
        </Pressable>
      ) : (
        content
      )}

      {(error || helper) && (
        <Text
          style={[
            styles.formFieldHelper,
            { color: error ? theme.colors.danger : theme.colors.textSecondary },
          ]}
        >
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
  theme,
}) => {
  return (
    <Pressable
      style={[
        styles.uploadCard,
        {
          borderColor: file ? theme.colors.success : theme.colors.border,
          backgroundColor: file ? theme.colors.successLight : theme.colors.surface,
          opacity: disabled ? 0.6 : 1,
        },
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Upload ${label}${required ? ', required' : ''}`}
    >
      {file ? (
        <>
          <View style={[styles.uploadPreview, { backgroundColor: theme.colors.primary }]}>
            <Ionicons name="document" size={24} color="#FFFFFF" />
          </View>
          <View style={styles.uploadCardContent}>
            <Text style={[styles.uploadCardLabel, { color: theme.colors.text }]} numberOfLines={1}>
              {file.name}
            </Text>
            <Text style={[styles.uploadCardAction, { color: theme.colors.primary }]}>
              Replace
            </Text>
          </View>
          <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
        </>
      ) : (
        <>
          <View style={[styles.uploadPlaceholder, { borderColor: theme.colors.border }]}>
            <Ionicons name="add" size={24} color={theme.colors.textMuted} />
          </View>
          <View style={styles.uploadCardContent}>
            <Text style={[styles.uploadCardLabel, { color: theme.colors.text }]}>
              {label}
              {required && <Text style={{ color: theme.colors.danger }}> *</Text>}
            </Text>
            <Text style={[styles.uploadCardAction, { color: theme.colors.primary }]}>
              Add
            </Text>
          </View>
        </>
      )}
    </Pressable>
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
  theme,
  children,
}) => {
  return visible ? (

      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable
          style={[styles.bottomSheet, { backgroundColor: theme.colors.surface }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.bottomSheetHandle} />
          <Text style={[styles.bottomSheetTitle, { color: theme.colors.text }]}>{title}</Text>
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

const Banner: React.FC<BannerProps> = ({ type, title, message, items, theme }) => {
  const config = {
    info: { bg: theme.colors.primaryLight, color: theme.colors.primary, icon: 'information-circle' },
    success: { bg: theme.colors.successLight, color: theme.colors.success, icon: 'checkmark-circle' },
    warning: { bg: theme.colors.warningLight, color: theme.colors.warning, icon: 'warning' },
    error: { bg: theme.colors.dangerLight, color: theme.colors.danger, icon: 'alert-circle' },
  };

  const { bg, color, icon } = config[type];

  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <Ionicons name={icon as any} size={24} color={color} />
      <View style={styles.bannerContent}>
        <Text style={[styles.bannerTitle, { color }]}>{title}</Text>
        {message && <Text style={[styles.bannerMessage, { color: theme.colors.textSecondary }]}>{message}</Text>}
        {items && items.length > 0 && (
          <View style={styles.bannerItems}>
            {items.map((item, index) => (
              <View key={index} style={styles.bannerItem}>
                <Text style={[styles.bannerBullet, { color }]}>•</Text>
                <Text style={[styles.bannerItemText, { color: theme.colors.textSecondary }]}>{item}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

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
  theme,
}) => {
  return (
    <View style={[styles.segmentedControl, { backgroundColor: theme.colors.borderLight }]}>
      {options.map((option) => {
        const isSelected = option.value === selectedValue;
        return (
          <Pressable
            key={option.value}
            style={[
              styles.segment,
              isSelected && [styles.segmentSelected, { backgroundColor: theme.colors.surface }],
            ]}
            onPress={() => onSelect(option.value)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
          >
            <Text
              style={[
                styles.segmentText,
                { color: isSelected ? theme.colors.text : theme.colors.textSecondary },
                isSelected && styles.segmentTextSelected,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
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

const CollapsibleTips: React.FC<CollapsibleTipsProps> = ({ tips, theme }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <View style={[styles.tipsContainer, { backgroundColor: theme.colors.borderLight }]}>
      <Pressable
        style={styles.tipsHeader}
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setIsExpanded(!isExpanded);
        }}
        accessibilityRole="button"
      >
        <View style={styles.tipsHeaderLeft}>
          <Ionicons name="bulb-outline" size={18} color={theme.colors.warning} />
          <Text style={[styles.tipsTitle, { color: theme.colors.text }]}>Tips for good photos</Text>
        </View>
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={theme.colors.textSecondary}
        />
      </Pressable>

      {isExpanded && (
        <View style={styles.tipsContent}>
          {tips.map((tip, index) => (
            <View key={index} style={styles.tipItem}>
              <Ionicons name="checkmark" size={14} color={theme.colors.success} />
              <Text style={[styles.tipText, { color: theme.colors.textSecondary }]}>{tip}</Text>
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
  const theme = useMemo(() => createTheme(false), []); // Always use light mode

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
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
          <Pressable
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>KYC & Verification</Text>
          <StatusPill status={state.status} theme={theme} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Trust Message */}
          <Text style={[styles.trustMessage, { color: theme.colors.textSecondary }]}>
            Complete verification to publish your parking listings.
          </Text>

          {/* Status Banners */}
          {state.status === 'submitted' && (
            <Banner
              type="info"
              title="Submitted for Review"
              message="Your documents are being verified. This usually takes 1-2 business days."
              theme={theme}
            />
          )}

          {state.status === 'verified' && (
            <Banner
              type="success"
              title="Verification Complete"
              message="Your KYC is verified. You can now publish parking listings."
              theme={theme}
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
          <View style={[styles.progressSection, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.progressHeader}>
              <Text style={[styles.progressTitle, { color: theme.colors.text }]}>
                Verification Progress
              </Text>
              <Text style={[styles.progressPercent, { color: theme.colors.primary }]}>
                {Math.round(overallProgress)}%
              </Text>
            </View>
            <ProgressBar progress={overallProgress} theme={theme} />

            {overallProgress < 100 && !isLocked && (
              <Pressable
                style={styles.jumpLink}
                onPress={() => {
                  const incomplete = Object.entries(sectionComplete).find(([_, complete]) => !complete);
                  if (incomplete) {
                    dispatch({ type: 'TOGGLE_SECTION', payload: incomplete[0] as SectionId });
                  }
                }}
              >
                <Text style={[styles.jumpLinkText, { color: theme.colors.primary }]}>
                  Jump to next incomplete section →
                </Text>
              </Pressable>
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
              <Text style={[styles.fieldGroupLabel, { color: theme.colors.text }]}>Document Type</Text>
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
              <Text style={[styles.fieldGroupLabel, { color: theme.colors.text }]}>Upload Documents</Text>
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
              <Text style={[styles.fieldGroupLabel, { color: theme.colors.text }]}>Address Proof Document</Text>
              <UploadCard
                label="Utility Bill / Rental Agreement"
                file={state.address.proofDocument}
                required
                disabled={isLocked}
                onPress={() => dispatch({ type: 'SHOW_UPLOAD_MODAL', payload: { section: 'address', field: 'proofDocument' } })}
                theme={theme}
              />
              <Text style={[styles.uploadHint, { color: theme.colors.textMuted }]}>
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
              <Pressable
                style={styles.sameAsNameRow}
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
                  { borderColor: theme.colors.primary },
                ]}>
                  {state.bank.accountHolderName === state.personal.fullName && (
                    <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                  )}
                </View>
                <Text style={[styles.sameAsNameText, { color: theme.colors.textSecondary }]}>
                  Use full name — <Text style={{ color: theme.colors.text }}>{state.personal.fullName}</Text>
                </Text>
              </Pressable>
            ) : null}

            <View style={styles.formFieldContainer}>
              <View style={styles.formFieldLabelRow}>
                <Text style={[styles.formFieldLabel, { color: theme.colors.text }]}>Account Number</Text>
                <Text style={[styles.formFieldRequired, { color: theme.colors.danger }]}> *</Text>
              </View>
              <View
                style={[
                  styles.formFieldInput,
                  {
                    borderColor: accountNumberFocused ? theme.colors.primary : theme.colors.border,
                    backgroundColor: isLocked ? theme.colors.borderLight : theme.colors.surface,
                  },
                ]}
              >
                <TextInput
                  style={[styles.formFieldTextInput, { color: theme.colors.text }]}
                  value={accountNumberFocused ? state.bank.accountNumber : maskAccountNumber(state.bank.accountNumber)}
                  onChangeText={(text) => dispatch({ type: 'UPDATE_BANK', payload: { accountNumber: text.replace(/\D/g, '') } })}
                  placeholder="Enter account number"
                  placeholderTextColor={theme.colors.textMuted}
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
        <View style={[styles.stickyFooter, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border }]}>
          <Pressable
            style={[
              styles.primaryButton,
              {
                backgroundColor: canSubmit ? theme.colors.primary : theme.colors.border,
              },
            ]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel={state.status === 'submitted' ? 'Submitted' : 'Submit for Verification'}
          >
            <Text
              style={[
                styles.primaryButtonText,
                { color: canSubmit ? '#FFFFFF' : theme.colors.textMuted },
              ]}
            >
              {state.status === 'submitted'
                ? 'Submitted'
                : state.status === 'verified'
                ? 'Verified'
                : 'Submit for Verification'}
            </Text>
          </Pressable>

          <View style={styles.secondaryButtons}>
            <Pressable
              style={[styles.secondaryButton, { borderColor: theme.colors.border }]}
              onPress={handleSaveDraft}
              disabled={isLocked}
              accessibilityRole="button"
              accessibilityLabel="Save Draft"
            >
              <Ionicons name="save-outline" size={18} color={isLocked ? theme.colors.textMuted : theme.colors.text} />
              <Text style={[styles.secondaryButtonText, { color: isLocked ? theme.colors.textMuted : theme.colors.text }]}>
                Save Draft
              </Text>
            </Pressable>

            <Pressable
              style={[styles.secondaryButton, { borderColor: theme.colors.border }]}
              onPress={() => dispatch({ type: 'SHOW_RESET_CONFIRM', payload: true })}
              disabled={isLocked}
              accessibilityRole="button"
              accessibilityLabel="Reset"
            >
              <Ionicons name="refresh-outline" size={18} color={isLocked ? theme.colors.textMuted : theme.colors.danger} />
              <Text style={[styles.secondaryButtonText, { color: isLocked ? theme.colors.textMuted : theme.colors.danger }]}>
                Reset
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.reviewNote, { color: theme.colors.textMuted }]}>
            Verification typically takes 1-2 business days
          </Text>

          {state.isSaving && (
            <Text style={[styles.savingIndicator, { color: theme.colors.textMuted }]}>
              Saving...
            </Text>
          )}
        </View>

        {/* Upload Modal */}
        <BottomSheetModal
          visible={state.showUploadModal}
          onClose={() => dispatch({ type: 'SHOW_UPLOAD_MODAL', payload: null })}
          title="Upload Document"
          theme={theme}
        >
          <Pressable
            style={[styles.modalOption, { borderBottomColor: theme.colors.border }]}
            onPress={() => handlePickAndUpload('camera')}
            disabled={uploadBusy}
          >
            <Ionicons name="camera-outline" size={24} color={theme.colors.text} />
            <Text style={[styles.modalOptionText, { color: theme.colors.text }]}>
              {uploadBusy ? 'Uploading…' : 'Take Photo'}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.modalOption, { borderBottomColor: theme.colors.border }]}
            onPress={() => handlePickAndUpload('gallery')}
            disabled={uploadBusy}
          >
            <Ionicons name="images-outline" size={24} color={theme.colors.text} />
            <Text style={[styles.modalOptionText, { color: theme.colors.text }]}>
              {uploadBusy ? 'Uploading…' : 'Choose from Gallery'}
            </Text>
          </Pressable>

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
                  <Pressable
                    style={[styles.modalOption, { borderBottomColor: theme.colors.border }]}
                    onPress={() => handleUpload(null)}
                  >
                    <Ionicons name="trash-outline" size={24} color={theme.colors.danger} />
                    <Text style={[styles.modalOptionText, { color: theme.colors.danger }]}>Remove</Text>
                  </Pressable>
                );
              }
              return null;
            })()
          )}

          <Pressable
            style={styles.modalOption}
            onPress={() => dispatch({ type: 'SHOW_UPLOAD_MODAL', payload: null })}
          >
            <Ionicons name="close-outline" size={24} color={theme.colors.textSecondary} />
            <Text style={[styles.modalOptionText, { color: theme.colors.textSecondary }]}>Cancel</Text>
          </Pressable>
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
            {COUNTRIES.map((country) => (
              <Pressable
                key={country.value}
                style={[
                  styles.countryOption,
                  { borderBottomColor: theme.colors.border },
                  state.address.country === country.value && { backgroundColor: theme.colors.primaryLight },
                ]}
                onPress={() => {
                  dispatch({ type: 'UPDATE_ADDRESS', payload: { country: country.value } });
                  dispatch({ type: 'SHOW_COUNTRY_PICKER', payload: false });
                }}
              >
                <Text
                  style={[
                    styles.countryOptionText,
                    { color: state.address.country === country.value ? theme.colors.primary : theme.colors.text },
                  ]}
                >
                  {country.label}
                </Text>
                {state.address.country === country.value && (
                  <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
                )}
              </Pressable>
            ))}
          </ScrollView>
        </BottomSheetModal>

        {/* Reset Confirmation Modal */}
        {state.showResetConfirm ? (

          <View style={styles.confirmModalOverlay}>
            <View style={[styles.confirmModal, { backgroundColor: theme.colors.surface }]}>
              <Ionicons name="warning" size={48} color={theme.colors.danger} />
              <Text style={[styles.confirmModalTitle, { color: theme.colors.text }]}>Reset KYC Data?</Text>
              <Text style={[styles.confirmModalMessage, { color: theme.colors.textSecondary }]}>
                This will clear all your entered information and uploaded documents. This action cannot be undone.
              </Text>
              <View style={styles.confirmModalButtons}>
                <Pressable
                  style={[styles.confirmModalButton, { backgroundColor: theme.colors.border }]}
                  onPress={() => dispatch({ type: 'SHOW_RESET_CONFIRM', payload: false })}
                >
                  <Text style={[styles.confirmModalButtonText, { color: theme.colors.text }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.confirmModalButton, { backgroundColor: theme.colors.danger }]}
                  onPress={handleReset}
                >
                  <Text style={[styles.confirmModalButtonText, { color: '#FFFFFF' }]}>Reset</Text>
                </Pressable>
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
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginRight: 40,
  },

  // Status Pill
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Scroll View
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 180,
  },

  // Trust Message
  trustMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },

  // Progress Section
  progressSection: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
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
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  progressPercent: {
    fontSize: 16,
    fontWeight: '700',
  },
  progressBarContainer: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  jumpLink: {
    marginTop: 12,
  },
  jumpLinkText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Accordion
  accordionContainer: {
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
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
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  accordionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  accordionHeaderText: {
    marginLeft: 12,
    flex: 1,
  },
  accordionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  accordionDescription: {
    fontSize: 13,
    marginTop: 2,
  },
  accordionContent: {
    padding: 16,
    paddingTop: 8,
    borderTopWidth: 1,
  },

  // Same-as-name checkbox row
  sameAsNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -8,
    marginBottom: 16,
    gap: 8,
  },
  sameAsNameCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sameAsNameCheckboxChecked: {
    backgroundColor: '#0D7377',
    borderColor: '#0D7377',
  },
  sameAsNameText: {
    fontSize: 13,
    flex: 1,
  },

  // Form Field
  formFieldContainer: {
    marginBottom: 16,
  },
  formFieldLabelRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  formFieldLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  formFieldRequired: {
    fontSize: 14,
  },
  formFieldInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  formFieldTextInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  formFieldHelper: {
    fontSize: 12,
    marginTop: 4,
    paddingHorizontal: 2,
  },

  // Field Group
  fieldGroup: {
    marginBottom: 16,
  },
  fieldGroupLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },

  // Segmented Control
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentSelected: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '500',
  },
  segmentTextSelected: {
    fontWeight: '600',
  },

  // Upload Section
  uploadSection: {
    marginTop: 8,
  },
  uploadGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  uploadCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    minHeight: 72,
  },
  uploadPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadPreview: {
    width: 48,
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadCardContent: {
    flex: 1,
    marginLeft: 12,
  },
  uploadCardLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  uploadCardAction: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  uploadHint: {
    fontSize: 12,
    marginTop: 4,
  },

  // Tips
  tipsContainer: {
    borderRadius: 12,
    marginTop: 12,
    overflow: 'hidden',
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  tipsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tipsTitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  tipsContent: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 6,
  },
  tipText: {
    fontSize: 12,
    flex: 1,
  },

  // Row Fields
  rowFields: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },

  // Banner
  banner: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    gap: 12,
  },
  bannerContent: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  bannerMessage: {
    fontSize: 13,
    marginTop: 4,
  },
  bannerItems: {
    marginTop: 8,
  },
  bannerItem: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  bannerBullet: {
    fontSize: 13,
  },
  bannerItemText: {
    fontSize: 13,
    flex: 1,
  },

  // Footer
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    borderTopWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  primaryButton: {
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  reviewNote: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
  },
  savingIndicator: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingHorizontal: 20,
  },
  bottomSheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#D1D5DB',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalOptionText: {
    fontSize: 16,
  },

  // Date Picker
  datePickerModal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  datePickerTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  datePickerAction: {
    fontSize: 16,
    fontWeight: '500',
  },
  datePickerContent: {
    flexDirection: 'row',
    height: 200,
    paddingHorizontal: 20,
  },
  datePickerColumn: {
    flex: 1,
  },
  datePickerItem: {
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginVertical: 2,
  },
  datePickerItemText: {
    fontSize: 16,
  },

  // Country Picker
  countryList: {
    maxHeight: 300,
  },
  countryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  countryOptionText: {
    fontSize: 16,
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  confirmModal: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  confirmModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  confirmModalMessage: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  confirmModalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    width: '100%',
  },
  confirmModalButton: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmModalButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
