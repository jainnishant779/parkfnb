// ProfileScreen - Profile Management for all owner types
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TouchableOpacity,
  Platform,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
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
import { palette, radii, fonts } from '../../theme/kit';
import { ScreenHeader, Avatar, StatusTag, PillButton, EmptyState } from '../../components/ui';
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
  { code: '+91', country: 'IN' },
  { code: '+1', country: 'US' },
  { code: '+44', country: 'UK' },
  { code: '+61', country: 'AU' },
  { code: '+971', country: 'AE' },
];

// Section header component
interface SectionHeaderProps {
  title: string;
  icon: string;
  rightAction?: {
    label: string;
    onPress: () => void;
  };
}

function SectionHeader({ title, icon, rightAction }: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderLeft}>
        <View style={styles.sectionIcon}>
          <Ionicons name={icon} size={18} color={palette.text} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {rightAction && (
        <TouchableOpacity
          onPress={rightAction.onPress}
          activeOpacity={0.75}
          style={styles.sectionActionPill}
          accessibilityLabel={rightAction.label}
        >
          <Text style={styles.sectionAction}>{rightAction.label}</Text>
        </TouchableOpacity>
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
  maxLength,
  secureTextEntry,
  multiline,
  numberOfLines,
}: FormInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const borderColor = error
    ? palette.danger
    : isFocused
      ? palette.ink
      : 'transparent';

  return (
    <View style={styles.formInputContainer}>
      <Text style={styles.formInputLabel}>{label}</Text>
      <View
        style={[
          styles.formInputWrapper,
          multiline && styles.formInputWrapperMultiline,
          { borderColor },
          !editable && styles.formInputWrapperReadOnly,
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.textSubtle}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          editable={editable}
          style={[
            styles.formInput,
            !editable && styles.formInputReadOnly,
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
      {error && <Text style={styles.formInputError}>{error}</Text>}
    </View>
  );
}

// Country code selector component
interface CountryCodeSelectorProps {
  value: string;
  onSelect: (code: string) => void;
}

function CountryCodeSelector({ value, onSelect }: CountryCodeSelectorProps) {
  const [showPicker, setShowPicker] = useState(false);
  const selectedCountry = COUNTRY_CODES.find(c => c.code === value) || COUNTRY_CODES[0];

  return (
    <>
      <Pressable
        onPress={() => setShowPicker(!showPicker)}
        style={styles.countryCodeButton}
      >
        <Text style={styles.countryName}>{selectedCountry.country}</Text>
        <Text style={styles.countryCode}>{value}</Text>
        <Ionicons name="chevron-down" size={14} color={palette.textMuted} />
      </Pressable>
      {showPicker && (
        <View style={styles.countryPicker}>
          {COUNTRY_CODES.map(country => (
            <Pressable
              key={country.code}
              onPress={() => {
                onSelect(country.code);
                setShowPicker(false);
              }}
              style={[
                styles.countryOption,
                value === country.code && styles.countryOptionSelected,
              ]}
            >
              <Text style={styles.countryName}>{country.country}</Text>
              <Text style={styles.countryOptionText}>{country.code}</Text>
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
  onPress: () => void;
}

function KycBadge({ status, onPress }: KycBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'verified':
        return { label: 'Verified', tone: 'success' };
      case 'pending':
        return { label: 'Pending Verification', tone: 'warning' };
      case 'rejected':
        return { label: 'Verification Failed', tone: 'danger' };
      default:
        return { label: 'Start KYC', tone: 'ink' };
    }
  };

  const config = getStatusConfig();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={styles.kycBadge}
      accessibilityLabel={`KYC status: ${config.label}`}
      accessibilityRole="button"
    >
      <StatusTag label={config.label} tone={config.tone} />
      <Ionicons name="chevron-forward" size={14} color={palette.textMuted} />
    </TouchableOpacity>
  );
}

// Account type selector
interface AccountTypeSelectorProps {
  value: 'checking' | 'savings';
  onChange: (type: 'checking' | 'savings') => void;
}

function AccountTypeSelector({ value, onChange }: AccountTypeSelectorProps) {
  const options: { key: 'savings' | 'checking'; label: string }[] = [
    { key: 'savings', label: 'Savings' },
    { key: 'checking', label: 'Current/Checking' },
  ];
  return (
    <View style={styles.accountTypeContainer}>
      <Text style={styles.formInputLabel}>Account Type</Text>
      <View style={styles.accountTypeRow}>
        {options.map(option => {
          const selected = value === option.key;
          return (
            <TouchableOpacity
              key={option.key}
              onPress={() => onChange(option.key)}
              activeOpacity={0.8}
              style={[styles.accountTypeOption, selected && styles.accountTypeOptionSelected]}
            >
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={selected ? palette.textInverse : palette.textMuted}
              />
              <Text style={[styles.accountTypeText, selected && styles.accountTypeTextSelected]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
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
  bottom: number;
}

function ProfileSnackbar({ visible, message, variant, onDismiss, bottom }: SnackbarProps) {
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

  const iconColor = variant === 'success' ? palette.success : variant === 'error' ? palette.danger : palette.peach;

  if (!visible) return null;

  return (
    <Animated.View style={[styles.snackbar, { bottom }, animatedStyle]}>
      <Ionicons
        name={variant === 'success' ? 'checkmark-circle' : variant === 'error' ? 'alert-circle' : 'information-circle'}
        size={20}
        color={iconColor}
      />
      <Text style={styles.snackbarText}>{message}</Text>
    </Animated.View>
  );
}

// Main Profile Screen
export default function ProfileScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
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

  const header = (
    <ScreenHeader
      title="Profile"
      onBack={() => navigation.goBack()}
      right={
        <TouchableOpacity
          onPress={handleDeleteAccount}
          activeOpacity={0.75}
          hitSlop={8}
          style={styles.deleteButton}
          accessibilityLabel="Delete account"
          accessibilityRole="button"
        >
          <Ionicons name="trash-outline" size={18} color={palette.danger} />
        </TouchableOpacity>
      }
    />
  );

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {header}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={palette.ink} />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </View>
    );
  }

  const fullName = `${profile.firstName} ${profile.lastName}`.trim();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      {header}

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
            { paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Profile Header */}
          <Animated.View
            entering={FadeInDown.delay(100).duration(400)}
            style={styles.profileCard}
          >
            <View style={styles.profileRow}>
              <TouchableOpacity
                onPress={handleEditProfileImage}
                activeOpacity={0.8}
                accessibilityLabel="Edit profile photo"
              >
                <Avatar
                  name={fullName || getInitials()}
                  uri={profile.profileImage ? resolveImageUri(profile.profileImage) : undefined}
                  size={72}
                />
                <View style={styles.editImageButton}>
                  <Ionicons name="pencil" size={12} color={palette.textInverse} />
                </View>
              </TouchableOpacity>
              <View style={styles.profileText}>
                <Text style={styles.profileName} numberOfLines={1}>
                  {fullName || 'Your name'}
                </Text>
                <Text style={styles.profileEmail} numberOfLines={1}>
                  {profile.email}
                </Text>
              </View>
            </View>

            <View style={styles.profileMetaRow}>
              <StatusTag label={OWNER_TYPE_LABELS[ownerType] || 'Owner'} tone="white" />
              <KycBadge status={profile.kycStatus} onPress={handleKycPress} />
            </View>

            {/* Member Since */}
            <Text style={styles.memberSince}>
              Member since {new Date(profile.createdAt).toLocaleDateString('en-IN', {
                month: 'long',
                year: 'numeric',
              })}
            </Text>
          </Animated.View>

          {/* Personal Information Section */}
          <Animated.View
            entering={FadeInDown.delay(200).duration(400)}
            style={styles.sectionCard}
          >
            <SectionHeader
              title="Personal information"
              icon="person-outline"
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
              />

              <View style={styles.formInputContainer}>
                <Text style={styles.formInputLabel}>Phone Number</Text>
                {/* Always read-only: this is the number signed in with via OTP,
                    and /api/owners/me/profile has no way to change it. Letting
                    it look editable saved a new number locally that the
                    server ignored and the next login silently overwrote. */}
                <View style={[styles.phoneInputWrapper, styles.formInputWrapperReadOnly]}>
                  <CountryCodeSelector
                    value={profile.countryCode}
                    onSelect={() => {}}
                  />
                  <TextInput
                    value={profile.phone}
                    editable={false}
                    placeholder="Phone number"
                    placeholderTextColor={palette.textSubtle}
                    style={[styles.phoneInput, styles.formInputReadOnly]}
                    maxLength={10}
                  />
                </View>
                <Text style={styles.formInputHint}>
                  This is the number you signed in with and can't be changed here.
                </Text>
              </View>
            </View>
          </Animated.View>

          {/* Address Section */}
          <Animated.View
            entering={FadeInDown.delay(300).duration(400)}
            style={styles.sectionCard}
          >
            <SectionHeader
              title="Address"
              icon="location-outline"
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
                maxLength={6}
              />
            </View>
          </Animated.View>

          {/* Bank Account Section */}
          <Animated.View
            entering={FadeInDown.delay(400).duration(400)}
            style={styles.sectionCard}
          >
            <SectionHeader
              title="Bank account"
              icon="card-outline"
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
              <EmptyState
                tone="blue"
                title="No bank account added"
                subtitle="Add your bank account to receive payouts"
                action="Add bank account"
                onAction={() => setIsEditingBank(true)}
              />
            ) : (
              <View style={styles.formSection}>
                <FormInput
                  label="Bank Name"
                  value={profile.bankName}
                  onChangeText={(text) => updateField('bankName', text)}
                  placeholder="Enter bank name"
                  autoCapitalize="words"
                  editable={isEditingBank}
                />

                <FormInput
                  label="Account Holder Name"
                  value={profile.accountHolderName}
                  onChangeText={(text) => updateField('accountHolderName', text)}
                  placeholder="Enter account holder name"
                  autoCapitalize="words"
                  editable={isEditingBank}
                />

                <FormInput
                  label="Account Number"
                  value={profile.accountNumber}
                  onChangeText={(text) => updateField('accountNumber', text.replace(/\D/g, ''))}
                  placeholder="Enter account number"
                  keyboardType="numeric"
                  editable={isEditingBank}
                  error={errors.accountNumber}
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
                  maxLength={11}
                />

                <AccountTypeSelector
                  value={profile.accountType}
                  onChange={(type) => updateField('accountType', type)}
                />
              </View>
            )}
          </Animated.View>

          {/* Save Button (when editing) */}
          {hasChanges && (
            <Animated.View entering={FadeIn.duration(300)} accessibilityLabel="Save changes">
              <PillButton
                label="Save Changes"
                icon="check"
                variant="ink"
                onPress={saveProfile}
                loading={isSaving}
                disabled={isSaving}
              />
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
        bottom={insets.bottom + 24}
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
    backgroundColor: palette.bg,
  },
  deleteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    ...fonts.medium,
    fontSize: 15,
    color: palette.textMuted,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },

  // Profile card
  profileCard: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    padding: 20,
    marginBottom: 14,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editImageButton: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: palette.ink,
    borderWidth: 2,
    borderColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileText: {
    flex: 1,
    marginLeft: 16,
  },
  profileName: {
    ...fonts.semibold,
    fontSize: 22,
    letterSpacing: -0.4,
    color: palette.text,
  },
  profileEmail: {
    ...fonts.medium,
    fontSize: 15,
    color: palette.textMuted,
    marginTop: 3,
  },
  profileMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
  },
  kycBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  memberSince: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
    marginTop: 14,
  },

  // Sections
  sectionCard: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    padding: 18,
    marginBottom: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.peachSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    ...fonts.semibold,
    fontSize: 17,
    color: palette.text,
  },
  sectionActionPill: {
    height: 34,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionAction: {
    ...fonts.semibold,
    fontSize: 13,
    color: palette.text,
  },
  formSection: {
    gap: 14,
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
  },
  formHalf: {
    flex: 1,
  },

  // Inputs
  formInputContainer: {},
  formInputLabel: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
    marginBottom: 8,
    marginLeft: 4,
  },
  formInputWrapper: {
    minHeight: 52,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    backgroundColor: palette.fill,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  formInputWrapperMultiline: {
    borderRadius: radii.md,
    paddingVertical: 10,
  },
  formInputWrapperReadOnly: {
    backgroundColor: palette.surfaceDim,
  },
  formInput: {
    ...fonts.medium,
    fontSize: 15,
    color: palette.text,
    paddingVertical: 12,
  },
  formInputReadOnly: {
    color: palette.textMuted,
  },
  formInputError: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.danger,
    marginTop: 6,
    marginLeft: 4,
  },
  formInputHint: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textMuted,
    marginTop: 6,
    marginLeft: 4,
  },

  // Phone
  phoneInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    borderRadius: radii.pill,
    paddingLeft: 6,
    paddingRight: 18,
  },
  countryCodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 12,
    marginRight: 10,
    borderRadius: radii.pill,
    backgroundColor: palette.surface,
  },
  countryName: {
    ...fonts.bold,
    fontSize: 12,
    color: palette.textMuted,
  },
  countryCode: {
    ...fonts.semibold,
    fontSize: 14,
    color: palette.text,
  },
  phoneInput: {
    ...fonts.medium,
    flex: 1,
    fontSize: 15,
    paddingVertical: 12,
  },
  countryPicker: {
    position: 'absolute',
    top: 56,
    left: 0,
    zIndex: 10,
    minWidth: 130,
    padding: 6,
    borderRadius: radii.lg,
    backgroundColor: palette.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  countryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
  },
  countryOptionSelected: {
    backgroundColor: palette.fill,
  },
  countryOptionText: {
    ...fonts.semibold,
    fontSize: 14,
    color: palette.text,
  },

  // Account type
  accountTypeContainer: {},
  accountTypeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  accountTypeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: palette.fill,
  },
  accountTypeOptionSelected: {
    backgroundColor: palette.ink,
  },
  accountTypeText: {
    ...fonts.semibold,
    fontSize: 14,
    color: palette.text,
  },
  accountTypeTextSelected: {
    color: palette.textInverse,
  },

  // Snackbar
  snackbar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: radii.pill,
    backgroundColor: palette.ink,
  },
  snackbarText: {
    ...fonts.medium,
    flex: 1,
    fontSize: 14,
    color: palette.textInverse,
  },
});
