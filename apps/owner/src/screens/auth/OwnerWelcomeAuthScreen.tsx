import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
  Dimensions,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
    icon: '🏠',
  },
  {
    id: 'residential',
    title: 'Residential Community',
    description: 'Manage guest/resident parking for a society or apartment.',
    icon: '🏘️',
  },
  {
    id: 'commercial',
    title: 'Commercial Property',
    description: 'Operate paid parking for malls, offices, venues.',
    icon: '🏢',
  },
  {
    id: 'industrial',
    title: 'Industrial Facility',
    description: 'Control secure parking for factories and logistics yards.',
    icon: '🏭',
  },
  {
    id: 'empty_land',
    title: 'Empty Land Owner',
    description: 'List open plots converted into parking areas.',
    icon: '🌳',
  },
];

// ============================================================================
// THEME
// ============================================================================

const theme = {
  colors: {
    background: '#F8FAFC',
    surface: '#FFFFFF',
    primary: '#0D7377',
    primaryLight: '#E8F5F4',
    primaryDark: '#0A5C5F',
    textPrimary: '#0F172A',
    textSecondary: '#64748B',
    textTertiary: '#94A3B8',
    border: '#E2E8F0',
    borderFocused: '#0D7377',
    disabled: '#CBD5E1',
    disabledText: '#94A3B8',
    danger: '#EF4444',
    dangerLight: '#FEF2F2',
    success: '#10B981',
    successLight: '#ECFDF5',
    warning: '#F59E0B',
    warningLight: '#FFFBEB',
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
    xl: 24,
    full: 9999,
  },
  typography: {
    h1: { fontSize: 28, fontWeight: '700' as const, lineHeight: 36 },
    h2: { fontSize: 20, fontWeight: '600' as const, lineHeight: 28 },
    h3: { fontSize: 16, fontWeight: '600' as const, lineHeight: 22 },
    body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
    bodySmall: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
    caption: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
    button: { fontSize: 16, fontWeight: '600' as const, lineHeight: 24 },
    link: { fontSize: 14, fontWeight: '500' as const, lineHeight: 20 },
  },
  shadow: {
    sm: Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
    md: Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
    lg: Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
};

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
  const bgColor = type === 'error' ? theme.colors.dangerLight : type === 'warning' ? theme.colors.warningLight : theme.colors.successLight;
  const textColor = type === 'error' ? theme.colors.danger : type === 'warning' ? theme.colors.warning : theme.colors.success;

  return (
    <View style={[styles.inlineBanner, { backgroundColor: bgColor }]}>
      <Text style={[styles.inlineBannerText, { color: textColor }]}>{message}</Text>
      {onDismiss && (
        <Pressable onPress={onDismiss} style={styles.inlineBannerDismiss} accessibilityRole="button" accessibilityLabel="Dismiss">
          <Text style={[styles.inlineBannerDismissText, { color: textColor }]}>✕</Text>
        </Pressable>
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
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.primaryButton,
        isDisabled && styles.primaryButtonDisabled,
        pressed && !isDisabled && styles.primaryButtonPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled }}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.surface} size="small" />
      ) : (
        <Text style={[styles.primaryButtonText, isDisabled && styles.primaryButtonTextDisabled]}>{title}</Text>
      )}
    </Pressable>
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
          error && styles.textFieldInputContainerError,
        ]}
      >
        {leftElement && <View style={styles.textFieldLeftElement}>{leftElement}</View>}
        <TextInput
          style={[styles.textFieldInput, leftElement ? styles.textFieldInputWithLeft : undefined]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textTertiary}
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
          <Pressable
            onPress={() => setIsSecure(!isSecure)}
            style={styles.passwordToggle}
            accessibilityRole="button"
            accessibilityLabel={isSecure ? 'Show password' : 'Hide password'}
          >
            <Text style={styles.passwordToggleText}>{isSecure ? '👁️' : '🙈'}</Text>
          </Pressable>
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
          <Pressable
            key={tab.key}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              onSelect(tab.key);
            }}
            style={[styles.segmentedTab, isSelected && styles.segmentedTabSelected]}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: isSelected }}
          >
            <Text style={[styles.segmentedTabText, isSelected && styles.segmentedTabTextSelected]}>{tab.label}</Text>
          </Pressable>
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
          <Pressable
            key={option.key}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              onSelect(option.key);
            }}
            style={[styles.toggleChip, isSelected && styles.toggleChipSelected]}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: isSelected }}
          >
            <Text style={[styles.toggleChipText, isSelected && styles.toggleChipTextSelected]}>{option.label}</Text>
          </Pressable>
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
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.ownerCard,
        isSelected && styles.ownerCardSelected,
        pressed && styles.ownerCardPressed,
      ]}
      accessibilityRole="radio"
      accessibilityLabel={`${item.title}. ${item.description}`}
      accessibilityState={{ selected: isSelected }}
      accessibilityHint="Double tap to select this owner type"
    >
      <View style={[styles.ownerCardIcon, isSelected && styles.ownerCardIconSelected]}>
        <Text style={styles.ownerCardIconText}>{item.icon}</Text>
      </View>
      <View style={styles.ownerCardContent}>
        <Text style={[styles.ownerCardTitle, isSelected && styles.ownerCardTitleSelected]}>{item.title}</Text>
        <Text style={styles.ownerCardDescription} numberOfLines={2}>{item.description}</Text>
      </View>
      <View style={[styles.ownerCardCheck, isSelected && styles.ownerCardCheckSelected]}>
        {isSelected && <Text style={styles.ownerCardCheckIcon}>✓</Text>}
      </View>
    </Pressable>
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
          <View style={styles.header}>
            <View style={[styles.logo, styles.skeletonLogo]} />
            <View style={styles.skeletonHeaderTitle} />
            <View style={styles.skeletonHeaderSubtitle} />
          </View>
          <View style={styles.section}>
            {[1, 2, 3].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </View>
          <ActivityIndicator size="large" color={theme.colors.primary} style={styles.loadingIndicator} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Storage Error Banner */}
          {storageError && (
            <InlineBanner
              message={storageError}
              type="warning"
              onDismiss={() => setStorageError(null)}
            />
          )}

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>O</Text>
            </View>
            <Text style={styles.headerTitle}>Welcome</Text>
            <Text style={styles.headerSubtitle}>
              Select your owner type and sign in to continue.
            </Text>
          </View>

          {/* Owner Type Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Owner Type</Text>
            <FlatList
              data={ownerTypes}
              renderItem={renderOwnerCard}
              keyExtractor={keyExtractor}
              scrollEnabled={false}
              contentContainerStyle={styles.ownerList}
            />
            {selectedOwnerType && (
              <Pressable
                onPress={handleClearSelection}
                style={styles.clearButton}
                accessibilityRole="button"
                accessibilityLabel="Clear selection"
              >
                <Text style={styles.clearButtonText}>Clear selection</Text>
              </Pressable>
            )}

            {/* Next Button */}
            {selectedOwnerType && (
              <Pressable
                onPress={handleNext}
                style={styles.nextButton}
                accessibilityRole="button"
                accessibilityLabel="Next"
              >
                <Text style={styles.nextButtonText}>Next</Text>
                <Text style={styles.nextButtonArrow}>→</Text>
              </Pressable>
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
                  ? 'Welcome back—enter your details.'
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
                    <Pressable style={styles.countryCodeButton} accessibilityRole="button" accessibilityLabel="Select country code">
                      <Text style={styles.countryCodeText}>+91 ▾</Text>
                    </Pressable>
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
                <Pressable
                  onPress={handleForgotPassword}
                  style={styles.forgotPasswordButton}
                  accessibilityRole="button"
                  accessibilityLabel="Forgot password"
                >
                  <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                </Pressable>
              )}

              {/* Terms Checkbox (Sign Up only) */}
              {authTab === 'signUp' && (
                <View style={styles.termsContainer}>
                  <Pressable
                    onPress={() => {
                      setTermsAccepted(!termsAccepted);
                      markFieldTouched('terms');
                    }}
                    style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}
                    accessibilityRole="checkbox"
                    accessibilityLabel="Accept Terms and Privacy Policy"
                    accessibilityState={{ checked: termsAccepted }}
                  >
                    {termsAccepted && <Text style={styles.checkboxCheck}>✓</Text>}
                  </Pressable>
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
    </SafeAreaView>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  // Layout
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.xxl,
    paddingBottom: theme.spacing.xxxl,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.xl,
  },

  // Inline Banner
  inlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.lg,
  },
  inlineBannerText: {
    ...theme.typography.caption,
    flex: 1,
  },
  inlineBannerDismiss: {
    padding: theme.spacing.xs,
    marginLeft: theme.spacing.sm,
  },
  inlineBannerDismissText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing.xxl,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xxl,
  },
  logoText: {
    fontSize: 32,
    fontWeight: '700',
    color: theme.colors.surface,
  },
  headerTitle: {
    ...theme.typography.h1,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  headerSubtitle: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    maxWidth: SCREEN_WIDTH * 0.85,
  },

  // Sections
  section: {
    marginBottom: theme.spacing.xxl,
  },
  sectionTitle: {
    ...theme.typography.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.lg,
  },

  // Owner Cards
  ownerList: {
    gap: theme.spacing.md,
  },
  ownerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 2,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    ...theme.shadow.md,
  },
  ownerCardSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  ownerCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  ownerCardIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.lg,
  },
  ownerCardIconSelected: {
    backgroundColor: theme.colors.surface,
  },
  ownerCardIconText: {
    fontSize: 24,
  },
  ownerCardContent: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  ownerCardTitle: {
    ...theme.typography.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  ownerCardTitleSelected: {
    color: theme.colors.primary,
  },
  ownerCardDescription: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
  },
  ownerCardCheck: {
    width: 24,
    height: 24,
    borderRadius: theme.radius.full,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerCardCheckSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },
  ownerCardCheckIcon: {
    color: theme.colors.surface,
    fontSize: 14,
    fontWeight: '700',
  },

  // Clear Button
  clearButton: {
    alignSelf: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  clearButtonText: {
    ...theme.typography.link,
    color: theme.colors.primary,
  },

  // Next Button
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xxl,
    marginTop: theme.spacing.lg,
    gap: theme.spacing.sm,
    ...theme.shadow.sm,
  },
  nextButtonText: {
    ...theme.typography.button,
    color: theme.colors.surface,
  },
  nextButtonArrow: {
    fontSize: 18,
    color: theme.colors.surface,
  },

  // Auth Card
  authCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    ...theme.shadow.md,
  },

  // Segmented Tabs
  segmentedTabs: {
    flexDirection: 'row',
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md,
    padding: theme.spacing.xs,
    marginBottom: theme.spacing.xl,
  },
  segmentedTab: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    borderRadius: theme.radius.sm,
  },
  segmentedTabSelected: {
    backgroundColor: theme.colors.surface,
    ...theme.shadow.sm,
  },
  segmentedTabText: {
    ...theme.typography.button,
    color: theme.colors.textSecondary,
  },
  segmentedTabTextSelected: {
    color: theme.colors.primary,
  },

  // Auth Subtitle
  authSubtitle: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },

  // Toggle Chips
  toggleChips: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  toggleChip: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  toggleChipSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  toggleChipText: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
  },
  toggleChipTextSelected: {
    color: theme.colors.primary,
    fontWeight: '600',
  },

  // Form
  formContainer: {
    gap: theme.spacing.lg,
  },

  // Text Field
  textFieldContainer: {
    marginBottom: theme.spacing.sm,
  },
  textFieldLabel: {
    ...theme.typography.bodySmall,
    color: theme.colors.textPrimary,
    fontWeight: '500',
    marginBottom: theme.spacing.sm,
  },
  textFieldInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: 52,
  },
  textFieldInputContainerFocused: {
    borderColor: theme.colors.borderFocused,
    borderWidth: 2,
  },
  textFieldInputContainerError: {
    borderColor: theme.colors.danger,
  },
  textFieldInput: {
    flex: 1,
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  textFieldInputWithLeft: {
    paddingLeft: theme.spacing.sm,
  },
  textFieldLeftElement: {
    paddingLeft: theme.spacing.md,
  },
  textFieldError: {
    ...theme.typography.caption,
    color: theme.colors.danger,
    marginTop: theme.spacing.xs,
  },
  passwordToggle: {
    padding: theme.spacing.md,
  },
  passwordToggleText: {
    fontSize: 18,
  },

  // Country Code
  countryCodeButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  countryCodeText: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
  },

  // Forgot Password
  forgotPasswordButton: {
    alignSelf: 'flex-end',
    paddingVertical: theme.spacing.xs,
  },
  forgotPasswordText: {
    ...theme.typography.link,
    color: theme.colors.primary,
  },

  // Terms
  termsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: theme.radius.sm,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.md,
  },
  checkboxChecked: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  checkboxCheck: {
    color: theme.colors.surface,
    fontSize: 14,
    fontWeight: '700',
  },
  termsText: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  termsLink: {
    color: theme.colors.primary,
    fontWeight: '500',
  },
  termsError: {
    ...theme.typography.caption,
    color: theme.colors.danger,
    marginTop: theme.spacing.xs,
    marginLeft: 38,
  },

  // Primary Button
  primaryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  primaryButtonDisabled: {
    backgroundColor: theme.colors.disabled,
  },
  primaryButtonPressed: {
    backgroundColor: theme.colors.primaryDark,
  },
  primaryButtonText: {
    ...theme.typography.button,
    color: theme.colors.surface,
  },
  primaryButtonTextDisabled: {
    color: theme.colors.disabledText,
  },

  // Skeleton Loading
  skeletonCard: {
    borderColor: theme.colors.border,
  },
  skeletonIcon: {
    backgroundColor: theme.colors.border,
  },
  skeletonTitle: {
    width: 140,
    height: 18,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
  },
  skeletonDescription: {
    width: '90%',
    height: 14,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.border,
  },
  skeletonLogo: {
    backgroundColor: theme.colors.border,
  },
  skeletonHeaderTitle: {
    width: 160,
    height: 28,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
  },
  skeletonHeaderSubtitle: {
    width: SCREEN_WIDTH * 0.7,
    height: 16,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.border,
  },
  loadingIndicator: {
    marginTop: theme.spacing.xxl,
  },
});
