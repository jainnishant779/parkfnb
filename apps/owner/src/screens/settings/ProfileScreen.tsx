// ProfileScreen - Profile Management for all owner types
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppAlert } from '../../components/common/AppAlert';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import AppHeader from '../../components/headers/AppHeader';
import MediaPickerSheet from '../../components/common/MediaPickerSheet';
import { pickAndUploadImage, handleMediaUploadError, type PickSource } from '../../utils/mediaUpload';
import FormPickerInput from '../../components/inputs/FormPickerInput';
import { indianStates } from '../../constants/mockData';
import { useAuth } from '../../context/AuthContext';
import { resolveImageUri } from '../../utils/imageUri';
import { ownerService } from '../../services/ownerService';

// Storage keys
const PROFILE_DATA_KEY = 'owners:profile_data';

// Owner type labels
const OWNER_TYPE_LABELS: Record<string, string> = {
  individual: 'Individual Owner',
  residential_community: 'Residential Community',
  commercial_property: 'Commercial Property',
  industrial_facility: 'Industrial Facility',
  empty_land: 'Empty Land Owner',
};

// Profile data interface
interface ProfileData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  countryCode: string;
  profileImage: string | null;
  kycStatus: 'pending' | 'verified' | 'rejected' | 'not_started';
  bankName: string;
  accountNumber: string;
  accountType: 'checking' | 'savings';
  ifscCode: string;
  accountHolderName: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  createdAt: string;
  updatedAt: string;
}

// Default profile data
const DEFAULT_PROFILE: ProfileData = {
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@example.com',
  phone: '9876543210',
  countryCode: '+91',
  profileImage: null,
  kycStatus: 'pending',
  bankName: '',
  accountNumber: '',
  accountType: 'savings',
  ifscCode: '',
  accountHolderName: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// Country codes for phone input
const COUNTRY_CODES = [
  { code: '+91', country: 'IN', flag: '🇮🇳' },
  { code: '+1', country: 'US', flag: '🇺🇸' },
  { code: '+44', country: 'UK', flag: '🇬🇧' },
  { code: '+61', country: 'AU', flag: '🇦🇺' },
  { code: '+971', country: 'AE', flag: '🇦🇪' },
];

// Section header component
interface SectionHeaderProps {
  title: string;
  icon: string;
  theme: ReturnType<typeof getTheme>;
  rightAction?: {
    label: string;
    onPress: () => void;
  };
}

function SectionHeader({ title, icon, theme, rightAction }: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderLeft}>
        <View style={[styles.sectionIcon, { backgroundColor: theme.primaryLight }]}>
          <Ionicons name={icon} size={18} color={theme.primary} />
        </View>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      </View>
      {rightAction && (
        <Pressable onPress={rightAction.onPress} accessibilityLabel={rightAction.label}>
          <Text style={[styles.sectionAction, { color: theme.primary }]}>
            {rightAction.label}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// Form input component
interface FormInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  editable?: boolean;
  error?: string;
  theme: ReturnType<typeof getTheme>;
  maxLength?: number;
  secureTextEntry?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
}

function FormInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  editable = true,
  error,
  theme,
  maxLength,
  secureTextEntry,
  multiline,
  numberOfLines,
}: FormInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const borderColor = error
    ? theme.danger
    : isFocused
      ? theme.primary
      : theme.border;

  return (
    <View style={styles.formInputContainer}>
      <Text style={[styles.formInputLabel, { color: theme.textSecondary }]}>
        {label}
      </Text>
      <View
        style={[
          styles.formInputWrapper,
          {
            borderColor,
            backgroundColor: editable ? theme.surface : theme.borderLight,
          },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          editable={editable}
          style={[
            styles.formInput,
            { color: editable ? theme.text : theme.textMuted },
            multiline && { height: (numberOfLines || 3) * 24, textAlignVertical: 'top' },
          ]}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          maxLength={maxLength}
          secureTextEntry={secureTextEntry}
          multiline={multiline}
          numberOfLines={numberOfLines}
        />
      </View>
      {error && (
        <Text style={[styles.formInputError, { color: theme.danger }]}>{error}</Text>
      )}
    </View>
  );
}

// Country code selector component
interface CountryCodeSelectorProps {
  value: string;
  onSelect: (code: string) => void;
  theme: ReturnType<typeof getTheme>;
}

function CountryCodeSelector({ value, onSelect, theme }: CountryCodeSelectorProps) {
  const [showPicker, setShowPicker] = useState(false);
  const selectedCountry = COUNTRY_CODES.find(c => c.code === value) || COUNTRY_CODES[0];

  return (
    <>
      <Pressable
        onPress={() => setShowPicker(!showPicker)}
        style={[styles.countryCodeButton, { borderRightColor: theme.border }]}
      >
        <Text style={styles.countryFlag}>{selectedCountry.flag}</Text>
        <Text style={[styles.countryCode, { color: theme.text }]}>{value}</Text>
        <Ionicons name="chevron-down" size={14} color={theme.textMuted} />
      </Pressable>
      {showPicker && (
        <View style={[styles.countryPicker, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {COUNTRY_CODES.map(country => (
            <Pressable
              key={country.code}
              onPress={() => {
                onSelect(country.code);
                setShowPicker(false);
              }}
              style={[
                styles.countryOption,
                value === country.code && { backgroundColor: theme.primaryLight },
              ]}
            >
              <Text style={styles.countryFlag}>{country.flag}</Text>
              <Text style={[styles.countryOptionText, { color: theme.text }]}>
                {country.code}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </>
  );
}

// KYC Status badge component
interface KycBadgeProps {
  status: ProfileData['kycStatus'];
  theme: ReturnType<typeof getTheme>;
  onPress: () => void;
}

function KycBadge({ status, theme, onPress }: KycBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'verified':
        return {
          label: 'Verified',
          icon: 'checkmark-circle',
          bgColor: theme.successLight,
          textColor: theme.success,
        };
      case 'pending':
        return {
          label: 'Pending Verification',
          icon: 'time',
          bgColor: theme.warningLight,
          textColor: theme.warning,
        };
      case 'rejected':
        return {
          label: 'Verification Failed',
          icon: 'close-circle',
          bgColor: theme.dangerLight,
          textColor: theme.danger,
        };
      default:
        return {
          label: 'Start KYC',
          icon: 'shield-outline',
          bgColor: theme.borderLight,
          textColor: theme.textMuted,
        };
    }
  };

  const config = getStatusConfig();

  return (
    <Pressable
      onPress={onPress}
      style={[styles.kycBadge, { backgroundColor: config.bgColor }]}
      accessibilityLabel={`KYC status: ${config.label}`}
      accessibilityRole="button"
    >
      <Ionicons name={config.icon} size={16} color={config.textColor} />
      <Text style={[styles.kycBadgeText, { color: config.textColor }]}>
        {config.label}
      </Text>
      <Ionicons name="chevron-forward" size={14} color={config.textColor} />
    </Pressable>
  );
}

// Account type selector
interface AccountTypeSelectorProps {
  value: 'checking' | 'savings';
  onChange: (type: 'checking' | 'savings') => void;
  theme: ReturnType<typeof getTheme>;
}

function AccountTypeSelector({ value, onChange, theme }: AccountTypeSelectorProps) {
  return (
    <View style={styles.accountTypeContainer}>
      <Text style={[styles.formInputLabel, { color: theme.textSecondary }]}>
        Account Type
      </Text>
      <View style={styles.accountTypeRow}>
        <Pressable
          onPress={() => onChange('savings')}
          style={[
            styles.accountTypeOption,
            {
              backgroundColor: value === 'savings' ? theme.primaryLight : theme.surface,
              borderColor: value === 'savings' ? theme.primary : theme.border,
            },
          ]}
        >
          <Ionicons
            name={value === 'savings' ? 'radio-button-on' : 'radio-button-off'}
            size={20}
            color={value === 'savings' ? theme.primary : theme.textMuted}
          />
          <Text
            style={[
              styles.accountTypeText,
              { color: value === 'savings' ? theme.primary : theme.text },
            ]}
          >
            Savings
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onChange('checking')}
          style={[
            styles.accountTypeOption,
            {
              backgroundColor: value === 'checking' ? theme.primaryLight : theme.surface,
              borderColor: value === 'checking' ? theme.primary : theme.border,
            },
          ]}
        >
          <Ionicons
            name={value === 'checking' ? 'radio-button-on' : 'radio-button-off'}
            size={20}
            color={value === 'checking' ? theme.primary : theme.textMuted}
          />
          <Text
            style={[
              styles.accountTypeText,
              { color: value === 'checking' ? theme.primary : theme.text },
            ]}
          >
            Current/Checking
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// Snackbar component
interface SnackbarProps {
  visible: boolean;
  message: string;
  variant: 'success' | 'error' | 'info';
  onDismiss: () => void;
  theme: ReturnType<typeof getTheme>;
}

function ProfileSnackbar({ visible, message, variant, onDismiss, theme }: SnackbarProps) {
  const translateY = useSharedValue(100);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 15 });
      const timer = setTimeout(onDismiss, 3000);
      return () => clearTimeout(timer);
    } else {
      translateY.value = withTiming(100, { duration: 200 });
    }
  }, [visible, translateY, onDismiss]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const bgColor = variant === 'success' ? theme.success : variant === 'error' ? theme.danger : theme.primary;

  if (!visible) return null;

  return (
    <Animated.View style={[styles.snackbar, { backgroundColor: bgColor }, animatedStyle]}>
      <Ionicons
        name={variant === 'success' ? 'checkmark-circle' : variant === 'error' ? 'alert-circle' : 'information-circle'}
        size={20}
        color="#FFFFFF"
      />
      <Text style={styles.snackbarText}>{message}</Text>
    </Animated.View>
  );
}

// Main Profile Screen
export default function ProfileScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const theme = useMemo(() => getTheme(false), []);
  const scrollViewRef = useRef<ScrollView>(null);

  // Owner type is now sourced from the AuthContext owner record (which the
  // backend returns on /me) — the legacy AsyncStorage 'ownerType' key is no
  // longer written to for new accounts.
  const { owner, user, updateUser, updateOwner } = useAuth();
  const ownerType = owner?.ownerType || 'individual';

  // The profile is stored per account. It used to be one global key seeded with
  // a hardcoded "John Doe / john.doe@example.com" default, so every owner saw
  // (and edited) a stranger's details, and a second account on the same phone
  // inherited the first one's.
  const profileStorageKey = `${PROFILE_DATA_KEY}:${user?.id ?? 'anonymous'}`;
  const accountProfile = useMemo<ProfileData>(() => {
    const legalParts = (user?.legalName || '').trim().split(/\s+/).filter(Boolean);
    return {
      ...DEFAULT_PROFILE,
      firstName: user?.firstName || legalParts[0] || '',
      lastName: user?.lastName || legalParts.slice(1).join(' '),
      email: user?.email || '',
      phone: user?.phone || '',
    };
  }, [user?.firstName, user?.lastName, user?.legalName, user?.email, user?.phone]);

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [profile, setProfile] = useState<ProfileData>(DEFAULT_PROFILE);
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [isEditingBank, setIsEditingBank] = useState(false);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileData, string>>>({});
  const [snackbar, setSnackbar] = useState<{
    visible: boolean;
    message: string;
    variant: 'success' | 'error' | 'info';
  }>({ visible: false, message: '', variant: 'info' });

  // Load profile data
  const loadProfile = useCallback(async () => {
    try {
      const profileJson = await AsyncStorage.getItem(profileStorageKey);

      if (profileJson) {
        setProfile(JSON.parse(profileJson));
      } else {
        // First load for this account: start from the signed-in user's details.
        setProfile(accountProfile);
        await AsyncStorage.setItem(profileStorageKey, JSON.stringify(accountProfile));
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
      showSnackbar('Failed to load profile', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [profileStorageKey, accountProfile]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Show snackbar
  const showSnackbar = useCallback((message: string, variant: 'success' | 'error' | 'info') => {
    setSnackbar({ visible: true, message, variant });
  }, []);

  const hideSnackbar = useCallback(() => {
    setSnackbar(prev => ({ ...prev, visible: false }));
  }, []);

  // Validate email
  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Update profile field
  const updateField = useCallback((field: keyof ProfileData, value: string | boolean) => {
    setProfile(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
    // Clear error for this field
    setErrors(prev => ({ ...prev, [field]: undefined }));
  }, []);

  // Save profile
  const saveProfile = useCallback(async () => {
    // Validate fields
    const newErrors: Partial<Record<keyof ProfileData, string>> = {};

    if (!profile.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }
    if (!profile.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }
    if (!validateEmail(profile.email)) {
      newErrors.email = 'Please enter a valid email';
    }
    // Phone is read-only now (see the field above), so it is never re-validated here.

    // Bank validation only if editing bank section
    if (isEditingBank) {
      if (profile.bankName && !profile.accountNumber) {
        newErrors.accountNumber = 'Account number is required';
      }
      if (profile.accountNumber && profile.accountNumber.length < 9) {
        newErrors.accountNumber = 'Account number must be at least 9 digits';
      }
      if (profile.bankName && !profile.ifscCode) {
        newErrors.ifscCode = 'IFSC code is required';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showSnackbar('Please fix the errors', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const updatedProfile = {
        ...profile,
        updatedAt: new Date().toISOString(),
      };

      // This used to only write to AsyncStorage — "Profile saved successfully"
      // showed even though nothing reached the server, so the edit vanished
      // the moment the app was reinstalled or opened on another device.
      // Phone is not sent: it is the OTP sign-in identity and the endpoint
      // does not accept changing it (see the disabled field below).
      const response = await ownerService.updateProfile({
        first_name: profile.firstName,
        last_name: profile.lastName,
        email: profile.email,
        address_line1: profile.address,
        city: profile.city,
        state: profile.state,
        pincode: profile.pincode,
      });
      updateUser(response.user);
      if (response.owner) updateOwner(response.owner);

      await AsyncStorage.setItem(profileStorageKey, JSON.stringify(updatedProfile));
      setProfile(updatedProfile);
      setHasChanges(false);
      setIsEditingPersonal(false);
      setIsEditingBank(false);
      setIsEditingAddress(false);
      showSnackbar('Profile saved successfully', 'success');
    } catch (err) {
      console.error('Failed to save profile:', err);
      showSnackbar('Failed to save profile — check your connection and try again', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [profile, isEditingBank, showSnackbar, profileStorageKey, updateUser, updateOwner]);

  // Handle profile image edit
  const [showPhotoSheet, setShowPhotoSheet] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const handleEditProfileImage = useCallback(() => {
    setShowPhotoSheet(true);
  }, []);

  const handlePickProfilePhoto = useCallback(
    async (source: PickSource) => {
      setShowPhotoSheet(false);
      setUploadingPhoto(true);
      try {
        // Profile picture is rendered as a circular avatar — 1:1 crop.
        const result = await pickAndUploadImage({ source, aspect: 'square' });
        updateField('profileImage', result.url);
      } catch (err) {
        handleMediaUploadError(err);
      } finally {
        setUploadingPhoto(false);
      }
    },
    [updateField]
  );

  // Navigate to KYC
  const handleKycPress = useCallback(() => {
    (navigation as any).navigate('Kyc');
  }, [navigation]);

  // Handle delete account
  const handleDeleteAccount = useCallback(() => {
    AppAlert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => showSnackbar('Account deletion not available in demo', 'info'),
        },
      ]
    );
  }, [showSnackbar]);

  // Get initials for avatar
  const getInitials = () => {
    const first = profile.firstName?.[0] || '';
    const last = profile.lastName?.[0] || '';
    return `${first}${last}`.toUpperCase();
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <AppHeader
          variant="standard"
          title="Profile"
          leftAction={{
            icon: 'back',
            label: 'Back',
            onPress: () => navigation.goBack(),
            showBackground: true,
          }}
          showDivider={false}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textMuted }]}>
            Loading profile...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <AppHeader
        variant="standard"
        title="Profile"
        subtitle="Manage your account"
        leftAction={{
          icon: 'back',
          label: 'Back',
          onPress: () => navigation.goBack(),
          showBackground: true,
        }}
        rightActions={[
          ...(hasChanges
            ? [
                {
                  icon: 'refresh' as const,
                  label: 'Save changes',
                  onPress: saveProfile,
                },
              ]
            : []),
          {
            icon: 'trash' as const,
            label: 'Delete account',
            onPress: handleDeleteAccount,
            variant: 'danger' as const,
            size: 'small' as const,
          },
        ]}
        showDivider={false}
      />

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + spacing[6] },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Profile Header Card */}
          <Animated.View
            entering={FadeInDown.delay(100).duration(400)}
            style={[styles.profileCard, { backgroundColor: theme.surface }]}
          >
            {/* Profile Image */}
            <View style={styles.profileImageContainer}>
              <Pressable onPress={handleEditProfileImage} style={styles.profileImageWrapper}>
                {profile.profileImage ? (
                  <Image
                    source={{ uri: resolveImageUri(profile.profileImage) }}
                    style={styles.profileImage}
                  />
                ) : (
                  <View style={[styles.profileImagePlaceholder, { backgroundColor: theme.primary }]}>
                    <Text style={styles.profileInitials}>{getInitials()}</Text>
                  </View>
                )}
                <View style={[styles.editImageButton, { backgroundColor: theme.primary }]}>
                  <Ionicons name="pencil" size={14} color="#FFFFFF" />
                </View>
              </Pressable>
            </View>

            {/* Name and Email */}
            <Text style={[styles.profileName, { color: theme.text }]}>
              {profile.firstName} {profile.lastName}
            </Text>
            <Text style={[styles.profileEmail, { color: theme.textSecondary }]}>
              {profile.email}
            </Text>

            {/* Owner Type Badge */}
            <View style={[styles.ownerTypeBadge, { backgroundColor: theme.primaryLight }]}>
              <Ionicons name="business-outline" size={14} color={theme.primary} />
              <Text style={[styles.ownerTypeText, { color: theme.primary }]}>
                {OWNER_TYPE_LABELS[ownerType] || 'Owner'}
              </Text>
            </View>

            {/* KYC Status */}
            <KycBadge status={profile.kycStatus} theme={theme} onPress={handleKycPress} />

            {/* Member Since */}
            <Text style={[styles.memberSince, { color: theme.textMuted }]}>
              Member since {new Date(profile.createdAt).toLocaleDateString('en-IN', {
                month: 'long',
                year: 'numeric',
              })}
            </Text>
          </Animated.View>

          {/* Personal Information Section */}
          <Animated.View
            entering={FadeInDown.delay(200).duration(400)}
            style={[styles.sectionCard, { backgroundColor: theme.surface }]}
          >
            <SectionHeader
              title="Personal Information"
              icon="person-outline"
              theme={theme}
              rightAction={{
                label: isEditingPersonal ? 'Done' : 'Edit',
                onPress: () => {
                  if (isEditingPersonal && hasChanges) {
                    saveProfile();
                  } else {
                    setIsEditingPersonal(!isEditingPersonal);
                  }
                },
              }}
            />

            <View style={styles.formSection}>
              <View style={styles.formRow}>
                <View style={styles.formHalf}>
                  <FormInput
                    label="First Name"
                    value={profile.firstName}
                    onChangeText={(text) => updateField('firstName', text)}
                    placeholder="Enter first name"
                    autoCapitalize="words"
                    editable={isEditingPersonal}
                    error={errors.firstName}
                    theme={theme}
                  />
                </View>
                <View style={styles.formHalf}>
                  <FormInput
                    label="Last Name"
                    value={profile.lastName}
                    onChangeText={(text) => updateField('lastName', text)}
                    placeholder="Enter last name"
                    autoCapitalize="words"
                    editable={isEditingPersonal}
                    error={errors.lastName}
                    theme={theme}
                  />
                </View>
              </View>

              <FormInput
                label="Email Address"
                value={profile.email}
                onChangeText={(text) => updateField('email', text)}
                placeholder="Enter email address"
                keyboardType="email-address"
                autoCapitalize="none"
                editable={isEditingPersonal}
                error={errors.email}
                theme={theme}
              />

              <View style={styles.formInputContainer}>
                <Text style={[styles.formInputLabel, { color: theme.textSecondary }]}>
                  Phone Number
                </Text>
                {/* Always read-only: this is the number signed in with via OTP,
                    and /api/owners/me/profile has no way to change it. Letting
                    it look editable saved a new number locally that the
                    server ignored and the next login silently overwrote. */}
                <View
                  style={[
                    styles.phoneInputWrapper,
                    { borderColor: theme.border, backgroundColor: theme.borderLight },
                  ]}
                >
                  <CountryCodeSelector
                    value={profile.countryCode}
                    onSelect={() => {}}
                    theme={theme}
                  />
                  <TextInput
                    value={profile.phone}
                    editable={false}
                    placeholder="Phone number"
                    placeholderTextColor={theme.textMuted}
                    style={[styles.phoneInput, { color: theme.textMuted }]}
                    maxLength={10}
                  />
                </View>
                <Text style={[styles.formInputHint, { color: theme.textMuted }]}>
                  This is the number you signed in with and can't be changed here.
                </Text>
              </View>
            </View>
          </Animated.View>

          {/* Address Section */}
          <Animated.View
            entering={FadeInDown.delay(300).duration(400)}
            style={[styles.sectionCard, { backgroundColor: theme.surface }]}
          >
            <SectionHeader
              title="Address"
              icon="location-outline"
              theme={theme}
              rightAction={{
                label: isEditingAddress ? 'Done' : 'Edit',
                onPress: () => {
                  if (isEditingAddress && hasChanges) {
                    saveProfile();
                  } else {
                    setIsEditingAddress(!isEditingAddress);
                  }
                },
              }}
            />

            <View style={styles.formSection}>
              <FormInput
                label="Street Address"
                value={profile.address}
                onChangeText={(text) => updateField('address', text)}
                placeholder="Enter street address"
                editable={isEditingAddress}
                theme={theme}
                multiline
                numberOfLines={2}
              />

              <View style={styles.formRow}>
                <View style={styles.formHalf}>
                  <FormInput
                    label="City"
                    value={profile.city}
                    onChangeText={(text) => updateField('city', text)}
                    placeholder="Enter city"
                    autoCapitalize="words"
                    editable={isEditingAddress}
                    theme={theme}
                  />
                </View>
                <View style={styles.formHalf}>
                  <FormPickerInput
                    label="State"
                    value={profile.state}
                    options={indianStates}
                    onSelect={(v) => updateField('state', v)}
                    placeholder="Select state"
                    disabled={!isEditingAddress}
                  />
                </View>
              </View>

              <FormInput
                label="PIN Code"
                value={profile.pincode}
                onChangeText={(text) => updateField('pincode', text.replace(/\D/g, ''))}
                placeholder="Enter PIN code"
                keyboardType="numeric"
                editable={isEditingAddress}
                theme={theme}
                maxLength={6}
              />
            </View>
          </Animated.View>

          {/* Bank Account Section */}
          <Animated.View
            entering={FadeInDown.delay(400).duration(400)}
            style={[styles.sectionCard, { backgroundColor: theme.surface }]}
          >
            <SectionHeader
              title="Bank Account"
              icon="card-outline"
              theme={theme}
              rightAction={{
                label: isEditingBank ? 'Done' : 'Edit',
                onPress: () => {
                  if (isEditingBank && hasChanges) {
                    saveProfile();
                  } else {
                    setIsEditingBank(!isEditingBank);
                  }
                },
              }}
            />

            {!profile.bankName && !isEditingBank ? (
              <View style={styles.emptyBankSection}>
                <View style={[styles.emptyBankIcon, { backgroundColor: theme.borderLight }]}>
                  <Ionicons name="wallet-outline" size={32} color={theme.textMuted} />
                </View>
                <Text style={[styles.emptyBankTitle, { color: theme.text }]}>
                  No Bank Account Added
                </Text>
                <Text style={[styles.emptyBankSubtitle, { color: theme.textSecondary }]}>
                  Add your bank account to receive payouts
                </Text>
                <Pressable
                  onPress={() => setIsEditingBank(true)}
                  style={[styles.addBankButton, { backgroundColor: theme.primary }]}
                >
                  <Ionicons name="add" size={20} color="#FFFFFF" />
                  <Text style={styles.addBankButtonText}>Add Bank Account</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.formSection}>
                <FormInput
                  label="Bank Name"
                  value={profile.bankName}
                  onChangeText={(text) => updateField('bankName', text)}
                  placeholder="Enter bank name"
                  autoCapitalize="words"
                  editable={isEditingBank}
                  theme={theme}
                />

                <FormInput
                  label="Account Holder Name"
                  value={profile.accountHolderName}
                  onChangeText={(text) => updateField('accountHolderName', text)}
                  placeholder="Enter account holder name"
                  autoCapitalize="words"
                  editable={isEditingBank}
                  theme={theme}
                />

                <FormInput
                  label="Account Number"
                  value={profile.accountNumber}
                  onChangeText={(text) => updateField('accountNumber', text.replace(/\D/g, ''))}
                  placeholder="Enter account number"
                  keyboardType="numeric"
                  editable={isEditingBank}
                  error={errors.accountNumber}
                  theme={theme}
                  secureTextEntry={!isEditingBank}
                />

                <FormInput
                  label="IFSC Code"
                  value={profile.ifscCode}
                  onChangeText={(text) => updateField('ifscCode', text.toUpperCase())}
                  placeholder="Enter IFSC code"
                  autoCapitalize="characters"
                  editable={isEditingBank}
                  error={errors.ifscCode}
                  theme={theme}
                  maxLength={11}
                />

                <AccountTypeSelector
                  value={profile.accountType}
                  onChange={(type) => updateField('accountType', type)}
                  theme={theme}
                />
              </View>
            )}
          </Animated.View>

          {/* Save Button (when editing) */}
          {hasChanges && (
            <Animated.View entering={FadeIn.duration(300)}>
              <Pressable
                onPress={saveProfile}
                disabled={isSaving}
                style={[
                  styles.saveButton,
                  { backgroundColor: theme.primary },
                  isSaving && { opacity: 0.7 },
                ]}
                accessibilityLabel="Save changes"
                accessibilityRole="button"
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                  </>
                )}
              </Pressable>
            </Animated.View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Snackbar */}
      <ProfileSnackbar
        visible={snackbar.visible}
        message={snackbar.message}
        variant={snackbar.variant}
        onDismiss={hideSnackbar}
        theme={theme}
      />

      <MediaPickerSheet
        visible={showPhotoSheet}
        title="Profile photo"
        onClose={() => setShowPhotoSheet(false)}
        onPick={handlePickProfilePhoto}
        showRemove={!!profile.profileImage}
        onRemove={() => {
          updateField('profileImage', '');
          setShowPhotoSheet(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
  },
  loadingText: {
    fontSize: fontSize.base,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
  },
  // Profile Card
  profileCard: {
    borderRadius: borderRadius.xl,
    padding: spacing[5],
    alignItems: 'center',
    marginBottom: spacing[4],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  profileImageContainer: {
    marginBottom: spacing[4],
  },
  profileImageWrapper: {
    position: 'relative',
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  profileImagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitials: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  editImageButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  profileName: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold as any,
    marginBottom: spacing[1],
  },
  profileEmail: {
    fontSize: fontSize.sm,
    marginBottom: spacing[3],
  },
  ownerTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.full,
    marginBottom: spacing[3],
  },
  ownerTypeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },
  kycBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.lg,
    marginBottom: spacing[3],
  },
  kycBadgeText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  memberSince: {
    fontSize: fontSize.xs,
  },
  // Section Card
  sectionCard: {
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginBottom: spacing[4],
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[4],
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  sectionAction: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  formSection: {
    gap: spacing[3],
  },
  formRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  formHalf: {
    flex: 1,
  },
  // Form Input
  formInputContainer: {
    gap: spacing[1],
  },
  formInputLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    marginBottom: spacing[1],
  },
  formInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  formInput: {
    flex: 1,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    fontSize: fontSize.base,
  },
  formInputError: {
    fontSize: fontSize.xs,
    marginTop: spacing[1],
  },
  formInputHint: {
    fontSize: fontSize.xs,
    marginTop: spacing[1],
  },
  // Phone Input
  phoneInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    overflow: 'visible',
  },
  phoneInput: {
    flex: 1,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    fontSize: fontSize.base,
  },
  // Country Code
  countryCodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    borderRightWidth: 1,
  },
  countryFlag: {
    fontSize: 18,
  },
  countryCode: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium as any,
  },
  countryPicker: {
    position: 'absolute',
    top: '100%',
    left: 0,
    zIndex: 1000,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    marginTop: spacing[1],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  countryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
  },
  countryOptionText: {
    fontSize: fontSize.base,
  },
  // Account Type
  accountTypeContainer: {
    gap: spacing[1],
  },
  accountTypeRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  accountTypeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    borderWidth: 1,
    borderRadius: borderRadius.lg,
  },
  accountTypeText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  // Empty Bank
  emptyBankSection: {
    alignItems: 'center',
    paddingVertical: spacing[4],
  },
  emptyBankIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[3],
  },
  emptyBankTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[1],
  },
  emptyBankSubtitle: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing[4],
  },
  addBankButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.lg,
  },
  addBankButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
  },
  // Save Button
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[4],
    borderRadius: borderRadius.lg,
    marginBottom: spacing[4],
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  // Danger Zone
  dangerZone: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    marginTop: spacing[2],
  },
  dangerZoneTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[3],
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    borderWidth: 1,
    borderRadius: borderRadius.lg,
  },
  dangerButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  // Snackbar
  snackbar: {
    position: 'absolute',
    bottom: 24,
    left: spacing[4],
    right: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.lg,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  snackbarText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
});
