import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
  KeyboardAvoidingView,
  ImageBackground,
  StatusBar,
  Dimensions,
  type TextStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import * as UI from '../../components/ui';
import * as Kit from '../../theme/kit';

// The UI kit is plain JS; give it loose component types and typed font tokens.
const { PillButton } = UI as unknown as Record<string, React.ComponentType<any>>;
const { palette, radii, shadow } = Kit;
const fonts = Kit.fonts as Record<keyof typeof Kit.fonts, TextStyle>;

// ============================================================================
// TYPES
// ============================================================================

type OwnerType = 'individual' | 'residential' | 'commercial' | 'industrial' | 'empty_land';
type AuthTab = 'signIn' | 'signUp';
type AuthMethod = 'email' | 'phone';

interface OwnerTypeOption {
  id: OwnerType;
  title: string;
  description: string;
  icon: string;
}

interface FormErrors {
  fullName?: string;
  email?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
  terms?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEYS = {
  ownerType: 'ownerType',
  authMode: 'ownerAuthMode',
  authTab: 'ownerAuthTab',
};

const ownerTypes: OwnerTypeOption[] = [
  {
    id: 'individual',
    title: 'Individual Owner',
    description: 'Rent out your personal driveway or private spot.',
    icon: 'home-outline',
  },
  {
    id: 'residential',
    title: 'Residential Community',
    description: 'Manage guest/resident parking for a society or apartment.',
    icon: 'people-outline',
  },
  {
    id: 'commercial',
    title: 'Commercial Property',
    description: 'Operate paid parking for malls, offices, venues.',
    icon: 'business-outline',
  },
  {
    id: 'industrial',
    title: 'Industrial Facility',
    description: 'Control secure parking for factories and logistics yards.',
    icon: 'construct-outline',
  },
  {
    id: 'empty_land',
    title: 'Empty Land Owner',
    description: 'List open plots converted into parking areas.',
    icon: 'leaf-outline',
  },
];

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const validateEmail = (email: string): boolean => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

const validatePhone = (phone: string): boolean => {
  const regex = /^\d{10}$/;
  return regex.test(phone.replace(/\s/g, ''));
};

const validatePassword = (password: string): { valid: boolean; message?: string } => {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters' };
  }
  if (!/\d/.test(password)) {
    return { valid: false, message: 'Password should contain at least 1 number' };
  }
  return { valid: true };
};

// ============================================================================
// REUSABLE COMPONENTS
// ============================================================================

/** Inline Banner for non-blocking messages */
interface InlineBannerProps {
  message: string;
  type: 'error' | 'warning' | 'success';
  onDismiss?: () => void;
}

function InlineBanner({ message, type, onDismiss }: InlineBannerProps) {
  const bgColor = type === 'error' ? palette.dangerSoft : type === 'warning' ? palette.warningSoft : palette.successSoft;
  const textColor = type === 'error' ? palette.danger : type === 'warning' ? palette.warning : palette.success;

  return (
    <View style={[styles.inlineBanner, { backgroundColor: bgColor }]}>
      <Text style={[styles.inlineBannerText, { color: textColor }]}>{message}</Text>
      {onDismiss && (
        <TouchableOpacity onPress={onDismiss} style={styles.inlineBannerDismiss} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Dismiss">
          <Ionicons name="close" size={16} color={textColor} />
        </TouchableOpacity>
      )}
    </View>
  );
}

/** Primary Button */
interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

function PrimaryButton({ title, onPress, disabled = false, loading = false }: PrimaryButtonProps) {
  return (
    <PillButton
      label={title}
      variant="ink"
      onPress={onPress}
      disabled={disabled}
      loading={loading}
    />
  );
}

/** Text Field with label and error */
interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  onBlur?: () => void;
  showPasswordToggle?: boolean;
  leftElement?: React.ReactNode;
}

function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  onBlur,
  showPasswordToggle = false,
  leftElement,
}: TextFieldProps) {
  const [isSecure, setIsSecure] = useState(secureTextEntry);
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={styles.textFieldContainer}>
      <Text style={styles.textFieldLabel}>{label}</Text>
      <View
        style={[
          styles.textFieldInputContainer,
          isFocused && styles.textFieldInputContainerFocused,
          !!error && styles.textFieldInputContainerError,
        ]}
      >
        {leftElement && <View style={styles.textFieldLeftElement}>{leftElement}</View>}
        <TextInput
          style={styles.textFieldInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.textSubtle}
          secureTextEntry={isSecure}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            onBlur?.();
          }}
          accessibilityLabel={label}
        />
        {showPasswordToggle && (
          <TouchableOpacity
            onPress={() => setIsSecure(!isSecure)}
            style={styles.passwordToggle}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={isSecure ? 'Show password' : 'Hide password'}
          >
            <Ionicons name={isSecure ? 'eye-outline' : 'eye-off-outline'} size={20} color={palette.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={styles.textFieldError}>{error}</Text>}
    </View>
  );
}

/** Segmented Tabs */
interface SegmentedTabsProps {
  tabs: { key: string; label: string }[];
  selectedKey: string;
  onSelect: (key: string) => void;
}

function SegmentedTabs({ tabs, selectedKey, onSelect }: SegmentedTabsProps) {
  return (
    <View style={styles.segmentedTabs}>
      {tabs.map((tab) => {
        const isSelected = tab.key === selectedKey;
        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              onSelect(tab.key);
            }}
            activeOpacity={0.8}
            style={[styles.segmentedTab, isSelected && styles.segmentedTabSelected]}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: isSelected }}
          >
            <Text style={[styles.segmentedTabText, isSelected && styles.segmentedTabTextSelected]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** Toggle Chips */
interface ToggleChipsProps {
  options: { key: string; label: string }[];
  selectedKey: string;
  onSelect: (key: string) => void;
}

function ToggleChips({ options, selectedKey, onSelect }: ToggleChipsProps) {
  return (
    <View style={styles.toggleChips}>
      {options.map((option) => {
        const isSelected = option.key === selectedKey;
        return (
          <TouchableOpacity
            key={option.key}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              onSelect(option.key);
            }}
            activeOpacity={0.8}
            style={[styles.toggleChip, isSelected && styles.toggleChipSelected]}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: isSelected }}
          >
            <Text style={[styles.toggleChipText, isSelected && styles.toggleChipTextSelected]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** Owner Type Card */
interface OwnerTypeCardProps {
  item: OwnerTypeOption;
  isSelected: boolean;
  onSelect: (id: OwnerType) => void;
}

function OwnerTypeCard({ item, isSelected, onSelect }: OwnerTypeCardProps) {
  const handlePress = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onSelect(item.id);
  }, [item.id, onSelect]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.85}
      style={[styles.ownerCard, isSelected && styles.ownerCardSelected]}
      accessibilityRole="radio"
      accessibilityLabel={`${item.title}. ${item.description}`}
      accessibilityState={{ selected: isSelected }}
      accessibilityHint="Double tap to select this owner type"
    >
      <View style={[styles.ownerCardIcon, isSelected && styles.ownerCardIconSelected]}>
        <Ionicons name={item.icon} size={22} color={isSelected ? palette.textInverse : palette.text} />
      </View>
      <View style={styles.ownerCardContent}>
        <Text style={styles.ownerCardTitle}>{item.title}</Text>
        <Text style={styles.ownerCardDescription} numberOfLines={2}>{item.description}</Text>
      </View>
      <View style={[styles.ownerCardCheck, isSelected && styles.ownerCardCheckSelected]}>
        {isSelected && <Ionicons name="checkmark" size={14} color={palette.textInverse} />}
      </View>
    </TouchableOpacity>
  );
}

/** Skeleton Card for loading state */
function SkeletonCard() {
  return (
    <View style={[styles.ownerCard, styles.skeletonCard]}>
      <View style={[styles.ownerCardIcon, styles.skeletonIcon]} />
      <View style={styles.ownerCardContent}>
        <View style={styles.skeletonTitle} />
        <View style={styles.skeletonDescription} />
      </View>
    </View>
  );
}

// ============================================================================
// MAIN SCREEN
// ============================================================================

export default function OwnerWelcomeAuthScreen() {
  const insets = useSafeAreaInsets();
  // State
  const [isLoading, setIsLoading] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  const [selectedOwnerType, setSelectedOwnerType] = useState<OwnerType | null>(null);
  const [authTab, setAuthTab] = useState<AuthTab>('signIn');
  const [authMethod, setAuthMethod] = useState<AuthMethod>('email');

  // Form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Validation state
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  const scrollViewRef = useRef<ScrollView>(null);
  const [authSectionY, setAuthSectionY] = useState(0);

  // Load persisted data on mount
  useEffect(() => {
    loadPersistedData();
  }, []);

  // Validate form when inputs change
  useEffect(() => {
    if (hasAttemptedSubmit || touchedFields.size > 0) {
      validateForm();
    }
  }, [fullName, email, phone, password, confirmPassword, termsAccepted, authTab, authMethod, hasAttemptedSubmit, touchedFields]);

  const loadPersistedData = async () => {
    try {
      const [savedOwnerType, savedAuthMode, savedAuthTab] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.ownerType),
        AsyncStorage.getItem(STORAGE_KEYS.authMode),
        AsyncStorage.getItem(STORAGE_KEYS.authTab),
      ]);

      if (savedOwnerType && ownerTypes.some((t) => t.id === savedOwnerType)) {
        setSelectedOwnerType(savedOwnerType as OwnerType);
      }
      if (savedAuthMode === 'email' || savedAuthMode === 'phone') {
        setAuthMethod(savedAuthMode);
      }
      if (savedAuthTab === 'signIn' || savedAuthTab === 'signUp') {
        setAuthTab(savedAuthTab);
      }
    } catch (error) {
      console.warn('Failed to load persisted data:', error);
      setStorageError('Could not restore your preferences. You can continue normally.');
    } finally {
      setIsLoading(false);
    }
  };

  const saveOwnerType = async (type: OwnerType) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.ownerType, type);
      setStorageError(null);
    } catch (error) {
      console.warn('Failed to save owner type:', error);
      setStorageError('Could not save preference. It will be remembered this session.');
    }
  };

  const saveAuthPreferences = async () => {
    try {
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.authMode, authMethod),
        AsyncStorage.setItem(STORAGE_KEYS.authTab, authTab),
      ]);
    } catch (error) {
      console.warn('Failed to save auth preferences:', error);
    }
  };

  const handleSelectOwnerType = useCallback((type: OwnerType) => {
    setSelectedOwnerType(type);
    saveOwnerType(type);
  }, []);

  const handleClearSelection = useCallback(async () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedOwnerType(null);
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.ownerType);
      setStorageError(null);
    } catch (error) {
      console.warn('Failed to clear owner type:', error);
    }
  }, []);

  const handleNext = useCallback(() => {
    if (selectedOwnerType && authSectionY > 0) {
      scrollViewRef.current?.scrollTo({ y: authSectionY - 20, animated: true });
    }
  }, [selectedOwnerType, authSectionY]);

  const handleAuthTabChange = (tab: string) => {
    setAuthTab(tab as AuthTab);
    setHasAttemptedSubmit(false);
    setTouchedFields(new Set());
    setFormErrors({});
    saveAuthPreferences();
  };

  const handleAuthMethodChange = (method: string) => {
    setAuthMethod(method as AuthMethod);
    setHasAttemptedSubmit(false);
    setTouchedFields(new Set());
    setFormErrors({});
    saveAuthPreferences();
  };

  const markFieldTouched = (field: string) => {
    setTouchedFields((prev) => new Set(prev).add(field));
  };

  const validateForm = (): boolean => {
    const errors: FormErrors = {};
    const shouldValidateField = (field: string) => hasAttemptedSubmit || touchedFields.has(field);

    // Validate based on auth method
    if (authMethod === 'email') {
      if (shouldValidateField('email') && !validateEmail(email)) {
        errors.email = email.length === 0 ? 'Email is required' : 'Please enter a valid email';
      }
    } else {
      if (shouldValidateField('phone') && !validatePhone(phone)) {
        errors.phone = phone.length === 0 ? 'Phone number is required' : 'Please enter a valid 10-digit phone number';
      }
    }

    // Password validation
    if (shouldValidateField('password')) {
      if (password.length === 0) {
        errors.password = 'Password is required';
      } else if (authTab === 'signUp') {
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
          errors.password = passwordValidation.message;
        }
      }
    }

    // Sign Up specific validations
    if (authTab === 'signUp') {
      if (shouldValidateField('fullName') && fullName.trim().length === 0) {
        errors.fullName = 'Full name is required';
      }
      if (shouldValidateField('confirmPassword')) {
        if (confirmPassword.length === 0) {
          errors.confirmPassword = 'Please confirm your password';
        } else if (password !== confirmPassword) {
          errors.confirmPassword = 'Passwords do not match';
        }
      }
      if (shouldValidateField('terms') && !termsAccepted) {
        errors.terms = 'You must accept the Terms & Privacy';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const isFormValid = (): boolean => {
    if (!selectedOwnerType) return false;

    // Check auth method specific fields
    if (authMethod === 'email') {
      if (!validateEmail(email)) return false;
    } else {
      if (!validatePhone(phone)) return false;
    }

    if (password.length === 0) return false;

    if (authTab === 'signUp') {
      if (fullName.trim().length === 0) return false;
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.valid) return false;
      if (password !== confirmPassword) return false;
      if (!termsAccepted) return false;
    }

    return true;
  };

  const handleForgotPassword = () => {
    console.log('NAVIGATE: ForgotPassword');
  };

  const renderOwnerCard = useCallback(
    ({ item }: { item: OwnerTypeOption }) => (
      <OwnerTypeCard
        item={item}
        isSelected={selectedOwnerType === item.id}
        onSelect={handleSelectOwnerType}
      />
    ),
    [selectedOwnerType, handleSelectOwnerType]
  );

  const keyExtractor = useCallback((item: OwnerTypeOption) => item.id, []);

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <View style={styles.skeletonHeaderTitle} />
          <View style={styles.skeletonHeaderSubtitle} />
          <View style={styles.skeletonList}>
            {[1, 2, 3].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </View>
          <ActivityIndicator size="large" color={palette.ink} style={styles.loadingIndicator} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Photo header: black scrim, wordmark, big white headline */}
          <ImageBackground
            source={require('../../assets/images/onboarding-1.jpg')}
            style={styles.hero}
            resizeMode="cover"
          >
            <View style={styles.scrim} />
            <View style={styles.shadeBottom} />
            <View style={[styles.heroTop, { paddingTop: insets.top + 12 }]}>
              <Text style={styles.brand}>
                parkfnb.<Text style={styles.brandMark}>®</Text>
              </Text>
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.headerTitle}>Welcome</Text>
              <Text style={styles.headerSubtitle}>
                Select your owner type and sign in to continue.
              </Text>
            </View>
          </ImageBackground>

          {/* Storage Error Banner */}
          {storageError && (
            <View style={styles.bannerWrap}>
              <InlineBanner
                message={storageError}
                type="warning"
                onDismiss={() => setStorageError(null)}
              />
            </View>
          )}

          {/* Owner Type Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Owner type</Text>
            <FlatList
              data={ownerTypes}
              renderItem={renderOwnerCard}
              keyExtractor={keyExtractor}
              scrollEnabled={false}
              contentContainerStyle={styles.ownerList}
            />
            {selectedOwnerType && (
              <TouchableOpacity
                onPress={handleClearSelection}
                style={styles.clearButton}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Clear selection"
              >
                <Text style={styles.clearButtonText}>Clear selection</Text>
              </TouchableOpacity>
            )}

            {/* Next Button */}
            {selectedOwnerType && (
              <PillButton
                label="Next"
                iconRight="arrow-right"
                variant="ink"
                onPress={handleNext}
                style={styles.nextButton}
              />
            )}
          </View>

          {/* Auth Panel */}
          <View
            style={styles.section}
            onLayout={(event) => {
              const { y } = event.nativeEvent.layout;
              setAuthSectionY(y);
            }}
          >
            <Text style={styles.sectionTitle}>Account</Text>
            <View style={styles.authCard}>
              <SegmentedTabs
                tabs={[
                  { key: 'signIn', label: 'Sign In' },
                  { key: 'signUp', label: 'Sign Up' },
                ]}
                selectedKey={authTab}
                onSelect={handleAuthTabChange}
              />

              <Text style={styles.authSubtitle}>
                {authTab === 'signIn'
                  ? 'Welcome back, enter your details.'
                  : 'Create your owner account to get started.'}
              </Text>

              {/* Auth Method Toggle */}
              <ToggleChips
                options={[
                  { key: 'email', label: 'Email' },
                  { key: 'phone', label: 'Phone' },
                ]}
                selectedKey={authMethod}
                onSelect={handleAuthMethodChange}
              />

              {/* Form Fields */}
              <View style={styles.formContainer}>
              {/* Full Name (Sign Up only) */}
              {authTab === 'signUp' && (
                <TextField
                  label="Full Name"
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Enter your full name"
                  error={formErrors.fullName}
                  autoCapitalize="words"
                  onBlur={() => markFieldTouched('fullName')}
                />
              )}

              {/* Email or Phone */}
              {authMethod === 'email' ? (
                <TextField
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Enter your email"
                  error={formErrors.email}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  onBlur={() => markFieldTouched('email')}
                />
              ) : (
                <TextField
                  label="Phone Number"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Enter your phone number"
                  error={formErrors.phone}
                  keyboardType="phone-pad"
                  onBlur={() => markFieldTouched('phone')}
                  leftElement={
                    <TouchableOpacity style={styles.countryCodeButton} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Select country code">
                      <Text style={styles.countryCodeText}>+91</Text>
                    </TouchableOpacity>
                  }
                />
              )}

              {/* Password */}
              <TextField
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                error={formErrors.password}
                secureTextEntry
                autoCapitalize="none"
                showPasswordToggle
                onBlur={() => markFieldTouched('password')}
              />

              {/* Confirm Password (Sign Up only) */}
              {authTab === 'signUp' && (
                <TextField
                  label="Confirm Password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm your password"
                  error={formErrors.confirmPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  showPasswordToggle
                  onBlur={() => markFieldTouched('confirmPassword')}
                />
              )}

              {/* Forgot Password (Sign In only) */}
              {authTab === 'signIn' && (
                <TouchableOpacity
                  onPress={handleForgotPassword}
                  style={styles.forgotPasswordButton}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Forgot password"
                >
                  <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                </TouchableOpacity>
              )}

              {/* Terms Checkbox (Sign Up only) */}
              {authTab === 'signUp' && (
                <View style={styles.termsContainer}>
                  <TouchableOpacity
                    onPress={() => {
                      setTermsAccepted(!termsAccepted);
                      markFieldTouched('terms');
                    }}
                    activeOpacity={0.8}
                    style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}
                    accessibilityRole="checkbox"
                    accessibilityLabel="Accept Terms and Privacy Policy"
                    accessibilityState={{ checked: termsAccepted }}
                  >
                    {termsAccepted && <Ionicons name="checkmark" size={14} color={palette.textInverse} />}
                  </TouchableOpacity>
                  <Text style={styles.termsText}>
                    I agree to the{' '}
                    <Text style={styles.termsLink}>Terms & Privacy</Text>
                  </Text>
                </View>
              )}
              {formErrors.terms && <Text style={styles.termsError}>{formErrors.terms}</Text>}
              </View>
            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const styles = StyleSheet.create({
  // Layout
  container: { flex: 1, backgroundColor: palette.bg },
  keyboardAvoid: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 24 },

  // Photo header
  hero: { height: Math.round(SCREEN_HEIGHT * 0.4), backgroundColor: '#111' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.42)' },
  shadeBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%', backgroundColor: 'rgba(0,0,0,0.25)' },
  heroTop: { paddingHorizontal: 24 },
  brand: { ...fonts.bold, fontSize: 26, letterSpacing: -0.6, color: palette.textInverse },
  brandMark: { ...fonts.medium, fontSize: 12 },
  heroCopy: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 24, paddingBottom: 32 },
  headerTitle: {
    ...fonts.medium,
    fontSize: 52,
    lineHeight: 56,
    letterSpacing: -1.6,
    color: palette.textInverse,
  },
  headerSubtitle: {
    ...fonts.medium,
    fontSize: 17,
    lineHeight: 24,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 10,
  },

  // Inline Banner
  bannerWrap: { paddingHorizontal: 20, marginTop: 20 },
  inlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radii.md,
  },
  inlineBannerText: { ...fonts.medium, fontSize: 13, lineHeight: 18, flex: 1 },
  inlineBannerDismiss: { padding: 4, marginLeft: 8 },

  // Sections
  section: { marginTop: 28, paddingHorizontal: 20 },
  sectionTitle: {
    ...fonts.medium,
    fontSize: 19,
    letterSpacing: -0.2,
    color: palette.text,
    marginBottom: 12,
  },

  // Owner Cards
  ownerList: { gap: 10 },
  ownerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: palette.surface,
    padding: 14,
    ...shadow.press,
  },
  ownerCardSelected: { borderColor: palette.ink },
  ownerCardIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  ownerCardIconSelected: { backgroundColor: palette.ink },
  ownerCardContent: { flex: 1, marginRight: 12 },
  ownerCardTitle: { ...fonts.semibold, fontSize: 16, color: palette.text, marginBottom: 2 },
  ownerCardDescription: { ...fonts.medium, fontSize: 13, lineHeight: 18, color: palette.textMuted },
  ownerCardCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: palette.textSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerCardCheckSelected: { borderColor: palette.ink, backgroundColor: palette.ink },

  // Clear Button
  clearButton: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12, marginTop: 8 },
  clearButtonText: { ...fonts.semibold, fontSize: 14, color: palette.textMuted },

  // Next Button
  nextButton: { marginTop: 12 },

  // Auth Card
  authCard: { backgroundColor: palette.surface, borderRadius: radii.xl, padding: 20 },

  // Segmented Tabs
  segmentedTabs: {
    flexDirection: 'row',
    backgroundColor: palette.fill,
    borderRadius: radii.pill,
    padding: 5,
    marginBottom: 16,
  },
  segmentedTab: {
    flex: 1,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
  },
  segmentedTabSelected: { backgroundColor: palette.surface, ...shadow.press },
  segmentedTabText: { ...fonts.semibold, fontSize: 14, color: palette.textMuted },
  segmentedTabTextSelected: { color: palette.text },

  // Auth Subtitle
  authSubtitle: {
    ...fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: palette.textMuted,
    textAlign: 'center',
    marginBottom: 14,
  },

  // Toggle Chips
  toggleChips: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 18 },
  toggleChip: {
    height: 40,
    paddingHorizontal: 20,
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: palette.fill,
  },
  toggleChipSelected: { backgroundColor: palette.ink },
  toggleChipText: { ...fonts.semibold, fontSize: 14, color: palette.text },
  toggleChipTextSelected: { color: palette.textInverse },

  // Form
  formContainer: { gap: 14 },

  // Text Field
  textFieldContainer: {},
  textFieldLabel: { ...fonts.medium, fontSize: 12, color: palette.textMuted, marginBottom: 8, marginLeft: 4 },
  textFieldInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.fill,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: palette.fill,
    height: 56,
    paddingHorizontal: 6,
  },
  textFieldInputContainerFocused: { borderColor: palette.ink, backgroundColor: palette.surface },
  textFieldInputContainerError: { borderColor: palette.danger },
  textFieldInput: {
    ...fonts.medium,
    flex: 1,
    fontSize: 16,
    color: palette.text,
    paddingHorizontal: 14,
    paddingVertical: 0,
  },
  textFieldLeftElement: {},
  textFieldError: { ...fonts.medium, fontSize: 12, color: palette.danger, marginTop: 6, marginLeft: 6 },
  passwordToggle: { padding: 10 },

  // Country Code
  countryCodeButton: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    backgroundColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countryCodeText: { ...fonts.semibold, fontSize: 15, color: palette.textInverse },

  // Forgot Password
  forgotPasswordButton: { alignSelf: 'flex-end', paddingVertical: 4 },
  forgotPasswordText: { ...fonts.semibold, fontSize: 14, color: palette.text },

  // Terms
  termsContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: palette.textSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: { backgroundColor: palette.ink, borderColor: palette.ink },
  termsText: { ...fonts.medium, fontSize: 14, color: palette.textMuted, flex: 1 },
  termsLink: { ...fonts.semibold, color: palette.text },
  termsError: { ...fonts.medium, fontSize: 12, color: palette.danger, marginTop: 4, marginLeft: 36 },

  // Skeleton Loading
  skeletonCard: { borderColor: palette.surface },
  skeletonIcon: { backgroundColor: palette.bgSoft },
  skeletonTitle: {
    width: 140,
    height: 18,
    borderRadius: radii.xs,
    backgroundColor: palette.bgSoft,
    marginBottom: 8,
  },
  skeletonDescription: { width: '90%', height: 14, borderRadius: radii.xs, backgroundColor: palette.bgSoft },
  skeletonHeaderTitle: {
    width: 180,
    height: 40,
    borderRadius: radii.sm,
    backgroundColor: palette.bgSoft,
    marginTop: 40,
    marginBottom: 10,
  },
  skeletonHeaderSubtitle: { width: '75%', height: 16, borderRadius: radii.xs, backgroundColor: palette.bgSoft },
  skeletonList: { marginTop: 28, gap: 10 },
  loadingIndicator: { marginTop: 24 },
});
