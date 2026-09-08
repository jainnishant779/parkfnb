import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Modal,
  Image,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { AppAlert } from '../../components/common/AppAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';

import FormTextInput from '../../components/inputs/FormTextInput';
import FormPickerInput from '../../components/inputs/FormPickerInput';
import ProgressHeader from '../../components/headers/ProgressHeader';
import PrimaryButton from '../../components/buttons/PrimaryButton';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import { strings } from '../../constants/strings';
import { pickAndUploadImage, handleMediaUploadError, type PickSource } from '../../utils/mediaUpload';
import {
  indianStates,
  languages,
  countries,
  ownerTypeLabels,
} from '../../constants/mockData';
import { useAuth } from '../../context/AuthContext';
import { ownerService } from '../../services/ownerService';
import { ApiRequestError } from '../../services/api';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ============================================================================
// TYPES
// ============================================================================

type OwnerType =
  | 'individual'
  | 'residential_community'
  | 'commercial_property'
  | 'industrial_facility'
  | 'empty_land';

interface ProfileFormData {
  ownerType: OwnerType;
  legalName: string;
  profilePhotoUri: string;
  email: string;
  phone: string;
  alternatePhone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  locationLat: number | null;
  locationLng: number | null;
  businessName: string;
  roleDesignation: string;
  registrationId: string;
  landLabel: string;
  landmark: string;
  preferredLanguage: string;
  notificationBooking: boolean;
  notificationPayout: boolean;
  notificationPromotion: boolean;
  timeFormat: '12h' | '24h';
}

interface TouchedFields {
  [key: string]: boolean;
}

interface ProfileDraft {
  formData: ProfileFormData;
  lastSavedAt: number;
}

type SavedStatus = 'saved' | 'saving' | 'lastSaved' | 'error';

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'owners.profileSetupDraft.v1';
const AUTOSAVE_DELAY = 800;

const INITIAL_FORM_DATA: ProfileFormData = {
  ownerType: 'individual',
  legalName: '',
  profilePhotoUri: '',
  email: '',
  phone: '',
  alternatePhone: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  pincode: '',
  country: 'IN',
  locationLat: null,
  locationLng: null,
  businessName: '',
  roleDesignation: '',
  registrationId: '',
  landLabel: '',
  landmark: '',
  preferredLanguage: 'en',
  notificationBooking: true,
  notificationPayout: true,
  notificationPromotion: false,
  timeFormat: '12h',
};

const PROGRESS_STEPS = [
  { id: 'profile', label: strings.profileSetup.steps.profile },
  { id: 'kyc', label: strings.profileSetup.steps.kyc },
  { id: 'payouts', label: strings.profileSetup.steps.payouts },
];

// ============================================================================
// VALIDATION
// ============================================================================

const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePhone = (phone: string): boolean => {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10;
};

const validatePincode = (pincode: string): boolean => {
  return /^\d{6}$/.test(pincode);
};

const getFieldError = (
  field: keyof ProfileFormData,
  value: string,
  formData: ProfileFormData
): string | undefined => {
  const { validation } = strings.profileSetup;

  switch (field) {
    case 'legalName':
    case 'addressLine1':
    case 'city':
      return !value.trim() ? validation.required : undefined;

    case 'email':
      if (!value.trim()) return validation.required;
      if (!validateEmail(value)) return validation.invalidEmail;
      return undefined;

    case 'phone':
      if (!value.trim()) return validation.required;
      if (!validatePhone(value)) return validation.invalidPhone;
      return undefined;

    case 'state':
    case 'country':
      return !value ? validation.required : undefined;

    case 'pincode':
      if (!value.trim()) return validation.required;
      if (!validatePincode(value)) return validation.invalidPincode;
      return undefined;

    case 'businessName':
      if (
        formData.ownerType === 'commercial_property' ||
        formData.ownerType === 'industrial_facility' ||
        formData.ownerType === 'residential_community'
      ) {
        return !value.trim() ? validation.required : undefined;
      }
      return undefined;

    case 'landLabel':
      if (formData.ownerType === 'empty_land') {
        return !value.trim() ? validation.required : undefined;
      }
      return undefined;

    default:
      return undefined;
  }
};

// ============================================================================
// COMPONENT
// ============================================================================

interface ProfileSetupScreenProps {
  initialOwnerType?: OwnerType;
  onSaveExit?: () => void;
}

export default function ProfileSetupScreen({
  initialOwnerType = 'individual',
  onSaveExit,
}: ProfileSetupScreenProps) {
  const navigation = useNavigation();
  const { user, updateOnboardingStep, updateUser, updateOwner } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [formData, setFormData] = useState<ProfileFormData>({
    ...INITIAL_FORM_DATA,
    ownerType: initialOwnerType,
  });
  const [touched, setTouched] = useState<TouchedFields>({});
  const [savedStatus, setSavedStatus] = useState<SavedStatus>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const handlePickPhoto = useCallback(async (source: PickSource) => {
    setShowPhotoModal(false);
    setUploadingPhoto(true);
    try {
      const result = await pickAndUploadImage({ source, aspect: 'square' });
      updateField('profilePhotoUri', result.url);
    } catch (err) {
      handleMediaUploadError(err);
    } finally {
      setUploadingPhoto(false);
    }
  }, []);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [serverError, setServerError] = useState('');

  const errors = useCallback(() => {
    const errs: { [key: string]: string } = {};
    const fieldsToValidate: (keyof ProfileFormData)[] = [
      'legalName',
      'email',
      'phone',
      'addressLine1',
      'city',
      'state',
      'pincode',
      'country',
      'businessName',
      'landLabel',
    ];

    fieldsToValidate.forEach((field) => {
      const error = getFieldError(field, formData[field] as string, formData);
      if (error && touched[field]) {
        errs[field] = error;
      }
    });

    return errs;
  }, [formData, touched]);

  useEffect(() => {
    loadDraft();
  }, []);

  // Pre-fill from auth context (email/phone from OTP registration)
  useEffect(() => {
    if (user) {
      setFormData((prev) => ({
        ...prev,
        email: prev.email || user.email || '',
        phone: prev.phone || user.phone || '',
        legalName: prev.legalName || user.legalName || [user.firstName, user.lastName].filter(Boolean).join(' ') || '',
      }));
    }
  }, [user]);

  useEffect(() => {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
    }

    autosaveTimer.current = setTimeout(() => {
      saveDraft();
    }, AUTOSAVE_DELAY);

    return () => {
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
      }
    };
  }, [formData]);

  const loadDraft = async () => {
    try {
      const draftJson = await AsyncStorage.getItem(STORAGE_KEY);
      if (draftJson) {
        const draft: ProfileDraft = JSON.parse(draftJson);
        setFormData(draft.formData);
        setLastSavedAt(draft.lastSavedAt);
        setSavedStatus('lastSaved');
      }
      setStorageError(false);
    } catch (error) {
      console.error('Failed to load draft:', error);
      setStorageError(true);
    }
  };

  const saveDraft = async () => {
    setSavedStatus('saving');
    try {
      const draft: ProfileDraft = {
        formData,
        lastSavedAt: Date.now(),
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      setLastSavedAt(draft.lastSavedAt);
      setSavedStatus('saved');
      setStorageError(false);
    } catch (error) {
      console.error('Failed to save draft:', error);
      setSavedStatus('error');
      setStorageError(true);
    }
  };

  const clearDraft = async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      setFormData({ ...INITIAL_FORM_DATA, ownerType: initialOwnerType });
      setTouched({});
      setLastSavedAt(null);
      setSavedStatus('saved');
      setShowMenuModal(false);
      AppAlert.alert('Draft Cleared', 'Your form has been reset.');
    } catch (error) {
      console.error('Failed to clear draft:', error);
      AppAlert.alert('Error', 'Could not reset form. Please try again.');
    }
  };

  const updateField = <K extends keyof ProfileFormData>(
    field: K,
    value: ProfileFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleBlur = (field: string) => {
    if (!touched[field]) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setTouched((prev) => ({ ...prev, [field]: true }));
    }
  };

  const formatPhoneDisplay = (phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length <= 5) return digits;
    if (digits.length <= 10) {
      return `${digits.slice(0, 5)} ${digits.slice(5)}`;
    }
    return `${digits.slice(0, 5)} ${digits.slice(5, 10)}`;
  };

  const handlePhoneChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 10);
    updateField('phone', digits);
  };

  const handleAltPhoneChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 10);
    updateField('alternatePhone', digits);
  };

  const handlePincodeChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 6);
    updateField('pincode', digits);
  };

  const handleSaveExit = async () => {
    // First save draft locally for safety
    await saveDraft();

    setIsSaving(true);
    setServerError('');

    try {
      // Send profile to backend
      const response = await ownerService.updateProfile(formData);

      // Update AuthContext with new data
      if (response.user) updateUser(response.user);
      if (response.owner) updateOwner(response.owner);
      updateOnboardingStep('profile_setup');

      // Clear local draft since server has the data now
      await AsyncStorage.removeItem(STORAGE_KEY);

      // Navigate to KYC
      if (onSaveExit) {
        onSaveExit();
      } else {
        (navigation as any).navigate('KycVerification');
      }
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.code === 'REQ_VALIDATION' && err.details) {
          // Map server validation errors to form fields
          const fieldErrors: { [key: string]: boolean } = {};
          const errorDetails = Array.isArray(err.details) ? err.details : [];
          errorDetails.forEach((detail: any) => {
            if (detail.field) {
              // Convert snake_case field name to camelCase
              const camelField = detail.field.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
              fieldErrors[camelField] = true;
            }
          });
          setTouched((prev) => ({ ...prev, ...fieldErrors }));
          setServerError('Please fix the validation errors above.');
        } else if (err.code === 'REQ_DUPLICATE') {
          const field = err.details?.field || '';
          setServerError(`${field === 'email' ? 'Email' : 'Phone number'} is already in use.`);
        } else {
          setServerError(err.message || 'Failed to save profile. Please try again.');
        }
      } else {
        setServerError('Unable to connect. Your data is saved locally.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const getLastSavedText = (): string => {
    if (!lastSavedAt) return '';
    const diff = Date.now() - lastSavedAt;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Last saved just now';
    if (minutes === 1) return 'Last saved 1 min ago';
    if (minutes < 60) return `Last saved ${minutes} min ago`;
    return 'Last saved over an hour ago';
  };

  const showBusinessSection =
    formData.ownerType === 'commercial_property' ||
    formData.ownerType === 'industrial_facility' ||
    formData.ownerType === 'residential_community';

  const showEmptyLandSection = formData.ownerType === 'empty_land';

  const currentErrors = errors();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ProgressHeader
          title={strings.profileSetup.title}
          subtitle={strings.profileSetup.subtitle}
          steps={PROGRESS_STEPS}
          currentStepIndex={0}
          savedStatus={savedStatus}
          lastSavedText={getLastSavedText()}
          onBackPress={() => navigation.goBack()}
          onMenuPress={() => setShowMenuModal(true)}
          showBack={true}
        />

        {storageError && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={16} color={colors.error[500]} />
            <Text style={styles.errorBannerText}>
              {strings.profileSetup.status.notSaved}
            </Text>
          </View>
        )}

        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Section: Identity */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {strings.profileSetup.sections.identity}
            </Text>

            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>
                {strings.profileSetup.fields.ownerType}
              </Text>
              <View style={styles.ownerTypePill}>
                <Text style={styles.ownerTypePillText}>
                  {ownerTypeLabels[formData.ownerType]}
                </Text>
              </View>
            </View>

            <FormTextInput
              label={strings.profileSetup.fields.legalName}
              value={formData.legalName}
              onChangeText={(text) => updateField('legalName', text)}
              placeholder="Full name as per ID"
              required
              error={currentErrors.legalName}
              helperText={strings.profileSetup.fields.legalNameHelper}
              onBlur={() => handleBlur('legalName')}
              autoCapitalize="words"
            />

            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>
                {strings.profileSetup.fields.profilePhoto}
              </Text>
              <View style={styles.photoRow}>
                <View style={styles.avatarContainer}>
                  {formData.profilePhotoUri ? (
                    <Image
                      source={{ uri: formData.profilePhotoUri }}
                      style={styles.avatarImage}
                    />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Ionicons
                        name="person"
                        size={32}
                        color={colors.gray[400]}
                      />
                    </View>
                  )}
                </View>
                <Pressable
                  style={styles.uploadButton}
                  onPress={() => setShowPhotoModal(true)}
                  accessibilityLabel="Upload profile photo"
                  accessibilityRole="button"
                >
                  <Ionicons
                    name="camera-outline"
                    size={18}
                    color={colors.primary[600]}
                  />
                  <Text style={styles.uploadButtonText}>
                    {strings.profileSetup.buttons.uploadPhoto}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Section: Contact */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {strings.profileSetup.sections.contact}
            </Text>

            <FormTextInput
              label={strings.profileSetup.fields.email}
              value={formData.email}
              onChangeText={(text) => updateField('email', text)}
              placeholder="you@example.com"
              required
              error={currentErrors.email}
              helperText={strings.profileSetup.fields.emailHelper}
              onBlur={() => handleBlur('email')}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <FormTextInput
              label={strings.profileSetup.fields.phone}
              value={formatPhoneDisplay(formData.phone)}
              onChangeText={handlePhoneChange}
              placeholder="98765 43210"
              required
              error={currentErrors.phone}
              helperText={strings.profileSetup.fields.phoneHelper}
              onBlur={() => handleBlur('phone')}
              keyboardType="phone-pad"
              maxLength={11}
            />

            <FormTextInput
              label={strings.profileSetup.fields.alternatePhone}
              value={formatPhoneDisplay(formData.alternatePhone)}
              onChangeText={handleAltPhoneChange}
              placeholder="98765 43210"
              onBlur={() => handleBlur('alternatePhone')}
              keyboardType="phone-pad"
              maxLength={11}
            />
          </View>

          {/* Section: Address */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {strings.profileSetup.sections.address}
            </Text>

            <FormTextInput
              label={strings.profileSetup.fields.addressLine1}
              value={formData.addressLine1}
              onChangeText={(text) => updateField('addressLine1', text)}
              placeholder="Street address, building name"
              required
              error={currentErrors.addressLine1}
              onBlur={() => handleBlur('addressLine1')}
              autoCapitalize="words"
            />

            <FormTextInput
              label={strings.profileSetup.fields.addressLine2}
              value={formData.addressLine2}
              onChangeText={(text) => updateField('addressLine2', text)}
              placeholder="Apartment, suite, floor (optional)"
              onBlur={() => handleBlur('addressLine2')}
              autoCapitalize="words"
            />

            <View style={styles.row}>
              <View style={styles.halfField}>
                <FormTextInput
                  label={strings.profileSetup.fields.city}
                  value={formData.city}
                  onChangeText={(text) => updateField('city', text)}
                  placeholder="City"
                  required
                  error={currentErrors.city}
                  onBlur={() => handleBlur('city')}
                  autoCapitalize="words"
                />
              </View>
              <View style={styles.halfField}>
                <FormPickerInput
                  label={strings.profileSetup.fields.state}
                  value={formData.state}
                  options={indianStates}
                  onSelect={(value) => updateField('state', value)}
                  placeholder="Select state"
                  required
                  error={currentErrors.state}
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.halfField}>
                <FormTextInput
                  label={strings.profileSetup.fields.pincode}
                  value={formData.pincode}
                  onChangeText={handlePincodeChange}
                  placeholder="560001"
                  required
                  error={currentErrors.pincode}
                  helperText={strings.profileSetup.fields.pincodeHelper}
                  onBlur={() => handleBlur('pincode')}
                  keyboardType="number-pad"
                  maxLength={6}
                />
              </View>
              <View style={styles.halfField}>
                <FormPickerInput
                  label={strings.profileSetup.fields.country}
                  value={formData.country}
                  options={countries}
                  onSelect={(value) => updateField('country', value)}
                  required
                  error={currentErrors.country}
                />
              </View>
            </View>

            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>
                {strings.profileSetup.fields.locationPin}
              </Text>
              <Pressable
                style={styles.locationCard}
                onPress={() => setShowLocationModal(true)}
                accessibilityLabel="Set location pin"
                accessibilityRole="button"
              >
                <View style={styles.locationPlaceholder}>
                  <Ionicons
                    name="location-outline"
                    size={32}
                    color={colors.gray[400]}
                  />
                  {formData.locationLat && formData.locationLng ? (
                    <Text style={styles.locationText}>
                      {formData.locationLat.toFixed(4)},{' '}
                      {formData.locationLng.toFixed(4)}
                    </Text>
                  ) : (
                    <Text style={styles.locationPlaceholderText}>
                      Map preview will appear here
                    </Text>
                  )}
                </View>
                <View style={styles.setPinButton}>
                  <Ionicons
                    name="navigate"
                    size={16}
                    color={colors.primary[600]}
                  />
                  <Text style={styles.setPinButtonText}>
                    {strings.profileSetup.fields.setPin}
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>

          {/* Section: Business/Community (Conditional) */}
          {showBusinessSection && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {strings.profileSetup.sections.business}
              </Text>

              <FormTextInput
                label={strings.profileSetup.fields.businessName}
                value={formData.businessName}
                onChangeText={(text) => updateField('businessName', text)}
                placeholder="Your business or community name"
                required
                error={currentErrors.businessName}
                onBlur={() => handleBlur('businessName')}
                autoCapitalize="words"
              />

              <FormTextInput
                label={strings.profileSetup.fields.roleDesignation}
                value={formData.roleDesignation}
                onChangeText={(text) => updateField('roleDesignation', text)}
                placeholder="e.g., Manager, Secretary"
                onBlur={() => handleBlur('roleDesignation')}
                autoCapitalize="words"
              />

              <FormTextInput
                label={strings.profileSetup.fields.registrationId}
                value={formData.registrationId}
                onChangeText={(text) => updateField('registrationId', text)}
                placeholder="GST / Tax ID (optional)"
                onBlur={() => handleBlur('registrationId')}
                autoCapitalize="characters"
              />
            </View>
          )}

          {/* Section: Empty Land (Conditional) */}
          {showEmptyLandSection && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Land Details</Text>

              <FormTextInput
                label={strings.profileSetup.fields.landLabel}
                value={formData.landLabel}
                onChangeText={(text) => updateField('landLabel', text)}
                placeholder="e.g., Corner Lot near Mall"
                required
                error={currentErrors.landLabel}
                onBlur={() => handleBlur('landLabel')}
                autoCapitalize="words"
              />

              <FormTextInput
                label={strings.profileSetup.fields.landmark}
                value={formData.landmark}
                onChangeText={(text) => updateField('landmark', text)}
                placeholder="Nearby landmark (optional)"
                onBlur={() => handleBlur('landmark')}
                autoCapitalize="words"
              />
            </View>
          )}

          {/* Section: Preferences */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {strings.profileSetup.sections.preferences}
            </Text>

            <FormPickerInput
              label={strings.profileSetup.fields.preferredLanguage}
              value={formData.preferredLanguage}
              options={languages}
              onSelect={(value) => updateField('preferredLanguage', value)}
            />

            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>
                {strings.profileSetup.fields.notifications}
              </Text>
              <View style={styles.chipsContainer}>
                <Pressable
                  style={[
                    styles.chip,
                    formData.notificationBooking && styles.chipSelected,
                  ]}
                  onPress={() =>
                    updateField('notificationBooking', !formData.notificationBooking)
                  }
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: formData.notificationBooking }}
                  accessibilityLabel={strings.profileSetup.notifications.bookingUpdates}
                >
                  <Text
                    style={[
                      styles.chipText,
                      formData.notificationBooking && styles.chipTextSelected,
                    ]}
                  >
                    {strings.profileSetup.notifications.bookingUpdates}
                  </Text>
                  {formData.notificationBooking && (
                    <Ionicons
                      name="checkmark"
                      size={14}
                      color={colors.primary[600]}
                    />
                  )}
                </Pressable>

                <Pressable
                  style={[
                    styles.chip,
                    formData.notificationPayout && styles.chipSelected,
                  ]}
                  onPress={() =>
                    updateField('notificationPayout', !formData.notificationPayout)
                  }
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: formData.notificationPayout }}
                  accessibilityLabel={strings.profileSetup.notifications.payoutUpdates}
                >
                  <Text
                    style={[
                      styles.chipText,
                      formData.notificationPayout && styles.chipTextSelected,
                    ]}
                  >
                    {strings.profileSetup.notifications.payoutUpdates}
                  </Text>
                  {formData.notificationPayout && (
                    <Ionicons
                      name="checkmark"
                      size={14}
                      color={colors.primary[600]}
                    />
                  )}
                </Pressable>

                <Pressable
                  style={[
                    styles.chip,
                    formData.notificationPromotion && styles.chipSelected,
                  ]}
                  onPress={() =>
                    updateField(
                      'notificationPromotion',
                      !formData.notificationPromotion
                    )
                  }
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: formData.notificationPromotion }}
                  accessibilityLabel={strings.profileSetup.notifications.promotions}
                >
                  <Text
                    style={[
                      styles.chipText,
                      formData.notificationPromotion && styles.chipTextSelected,
                    ]}
                  >
                    {strings.profileSetup.notifications.promotions}
                  </Text>
                  {formData.notificationPromotion && (
                    <Ionicons
                      name="checkmark"
                      size={14}
                      color={colors.primary[600]}
                    />
                  )}
                </Pressable>
              </View>
            </View>

            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>
                {strings.profileSetup.fields.timeFormat}
              </Text>
              <View style={styles.segmentedControl}>
                <Pressable
                  style={[
                    styles.segment,
                    formData.timeFormat === '12h' && styles.segmentSelected,
                  ]}
                  onPress={() => updateField('timeFormat', '12h')}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: formData.timeFormat === '12h' }}
                  accessibilityLabel="12-hour format"
                >
                  <Text
                    style={[
                      styles.segmentText,
                      formData.timeFormat === '12h' && styles.segmentTextSelected,
                    ]}
                  >
                    12h
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.segment,
                    formData.timeFormat === '24h' && styles.segmentSelected,
                  ]}
                  onPress={() => updateField('timeFormat', '24h')}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: formData.timeFormat === '24h' }}
                  accessibilityLabel="24-hour format"
                >
                  <Text
                    style={[
                      styles.segmentText,
                      formData.timeFormat === '24h' && styles.segmentTextSelected,
                    ]}
                  >
                    24h
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Server error */}
        {serverError ? (
          <View style={styles.serverErrorContainer}>
            <Text style={styles.serverErrorText}>{serverError}</Text>
          </View>
        ) : null}

        {/* Sticky Bottom Save & Continue Button */}
        <Pressable
          style={[styles.saveExitButton, isSaving && styles.saveExitButtonDisabled]}
          onPress={handleSaveExit}
          disabled={isSaving}
          accessibilityLabel="Save and continue"
          accessibilityRole="button"
        >
          <Text style={styles.saveExitButtonText}>
            {isSaving ? 'Saving...' : strings.profileSetup.buttons.saveExit}
          </Text>
        </Pressable>

        {/* Photo Upload Modal */}
        {showPhotoModal ? (

          <Pressable
            style={styles.modalOverlay}
            onPress={() => setShowPhotoModal(false)}
          >
            <View style={styles.bottomSheet}>
              <View style={styles.bottomSheetHandle} />
              <Text style={styles.bottomSheetTitle}>Profile Photo</Text>

              <Pressable
                style={styles.bottomSheetOption}
                onPress={() => handlePickPhoto('camera')}
                disabled={uploadingPhoto}
              >
                <Ionicons name="camera" size={24} color={colors.gray[700]} />
                <Text style={styles.bottomSheetOptionText}>
                  {uploadingPhoto ? 'Uploading…' : strings.profileSetup.buttons.takePhoto}
                </Text>
              </Pressable>

              <Pressable
                style={styles.bottomSheetOption}
                onPress={() => handlePickPhoto('gallery')}
                disabled={uploadingPhoto}
              >
                <Ionicons name="images" size={24} color={colors.gray[700]} />
                <Text style={styles.bottomSheetOptionText}>
                  {uploadingPhoto ? 'Uploading…' : strings.profileSetup.buttons.chooseLibrary}
                </Text>
              </Pressable>

              {formData.profilePhotoUri && (
                <Pressable
                  style={styles.bottomSheetOption}
                  onPress={() => {
                    updateField('profilePhotoUri', '');
                    setShowPhotoModal(false);
                  }}
                >
                  <Ionicons name="trash" size={24} color={colors.error[500]} />
                  <Text
                    style={[
                      styles.bottomSheetOptionText,
                      { color: colors.error[500] },
                    ]}
                  >
                    {strings.profileSetup.buttons.removePhoto}
                  </Text>
                </Pressable>
              )}
            </View>
          </Pressable>
        
        ) : null}

        {/* Location Pin Modal */}
        {showLocationModal ? (

          <View style={styles.modalOverlay}>
            <View style={styles.locationModalContent}>
              <View style={styles.locationModalHeader}>
                <Text style={styles.locationModalTitle}>Set Location Pin</Text>
                <Pressable
                  onPress={() => setShowLocationModal(false)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={24} color={colors.gray[700]} />
                </Pressable>
              </View>

              <View style={styles.mapPlaceholder}>
                <Ionicons name="map" size={64} color={colors.gray[300]} />
                <Text style={styles.mapPlaceholderText}>
                  Map would appear here
                </Text>
                <Text style={styles.mapPlaceholderSubtext}>
                  Drag the pin to set your location
                </Text>
              </View>

              <PrimaryButton
                title={strings.common.confirm}
                onPress={() => {
                  updateField('locationLat', 12.9716 + Math.random() * 0.01);
                  updateField('locationLng', 77.5946 + Math.random() * 0.01);
                  setShowLocationModal(false);
                }}
              />
            </View>
          </View>
        
        ) : null}

        {/* Menu Modal */}
        {showMenuModal ? (

          <Pressable
            style={styles.modalOverlay}
            onPress={() => setShowMenuModal(false)}
          >
            <View style={styles.menuModalContent}>
              <Pressable
                style={styles.menuOption}
                onPress={() => {
                  AppAlert.alert(
                    'Reset Draft',
                    'Are you sure you want to clear all entered data?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Reset',
                        style: 'destructive',
                        onPress: clearDraft,
                      },
                    ]
                  );
                }}
              >
                <Ionicons name="refresh" size={20} color={colors.error[500]} />
                <Text style={[styles.menuOptionText, { color: colors.error[500] }]}>
                  Reset draft
                </Text>
              </Pressable>
            </View>
          </Pressable>
        
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
    backgroundColor: colors.gray[50],
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[4],
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error[50],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[2],
  },
  errorBannerText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.error[600],
  },
  errorSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error[50],
    marginHorizontal: spacing[4],
    marginTop: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    gap: spacing[2],
  },
  errorSummaryText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.error[600],
    fontWeight: fontWeight.medium as any,
  },
  section: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginBottom: spacing[4],
    ...Platform.select({
      ios: {
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
    color: colors.gray[800],
    marginBottom: spacing[4],
  },
  fieldContainer: {
    marginBottom: spacing[3],
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: colors.gray[700],
    marginBottom: spacing[1],
  },
  ownerTypePill: {
    backgroundColor: colors.primary[50],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
  },
  ownerTypePillText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: colors.primary[700],
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
  },
  avatarContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderWidth: 1,
    borderColor: colors.primary[200],
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary[50],
  },
  uploadButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: colors.primary[600],
  },
  row: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  halfField: {
    flex: 1,
  },
  locationCard: {
    backgroundColor: colors.gray[50],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderStyle: 'dashed',
    padding: spacing[4],
  },
  locationPlaceholder: {
    alignItems: 'center',
    paddingVertical: spacing[4],
  },
  locationText: {
    fontSize: fontSize.sm,
    color: colors.gray[700],
    marginTop: spacing[2],
  },
  locationPlaceholderText: {
    fontSize: fontSize.sm,
    color: colors.gray[400],
    marginTop: spacing[2],
  },
  setPinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[2],
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
    marginTop: spacing[3],
  },
  setPinButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: colors.primary[600],
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.gray[300],
    backgroundColor: colors.white,
  },
  chipSelected: {
    borderColor: colors.primary[500],
    backgroundColor: colors.primary[50],
  },
  chipText: {
    fontSize: fontSize.sm,
    color: colors.gray[600],
  },
  chipTextSelected: {
    color: colors.primary[700],
    fontWeight: fontWeight.medium as any,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: colors.gray[100],
    borderRadius: borderRadius.lg,
    padding: spacing[1],
  },
  segment: {
    flex: 1,
    paddingVertical: spacing[2],
    alignItems: 'center',
    borderRadius: borderRadius.md,
  },
  segmentSelected: {
    backgroundColor: colors.white,
    ...Platform.select({
      ios: {
        shadowColor: colors.black,
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
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: colors.gray[500],
  },
  segmentTextSelected: {
    color: colors.gray[900],
  },
  bottomSpacer: {
    height: 70,
  },
  serverErrorContainer: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    backgroundColor: '#FEF2F2',
  },
  serverErrorText: {
    color: '#EF4444',
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  saveExitButtonDisabled: {
    opacity: 0.6,
  },
  saveExitButton: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? spacing[6] : spacing[4],
    left: spacing[4],
    right: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary[600],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
  },
  saveExitButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
    color: colors.white,
  },
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
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    paddingHorizontal: spacing[5],
    paddingBottom: Platform.OS === 'ios' ? spacing[8] : spacing[5],
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.gray[300],
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing[3],
    marginBottom: spacing[4],
  },
  bottomSheetTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
    color: colors.gray[900],
    marginBottom: spacing[4],
    textAlign: 'center',
  },
  bottomSheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  bottomSheetOptionText: {
    fontSize: fontSize.base,
    color: colors.gray[700],
  },
  locationModalContent: {
    backgroundColor: colors.white,
    margin: spacing[4],
    borderRadius: borderRadius.xl,
    padding: spacing[5],
    maxHeight: '80%',
  },
  locationModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  locationModalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
    color: colors.gray[900],
  },
  mapPlaceholder: {
    height: 250,
    backgroundColor: colors.gray[100],
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[4],
  },
  mapPlaceholderText: {
    fontSize: fontSize.base,
    color: colors.gray[500],
    marginTop: spacing[3],
  },
  mapPlaceholderSubtext: {
    fontSize: fontSize.sm,
    color: colors.gray[400],
    marginTop: spacing[1],
  },
  menuModalContent: {
    backgroundColor: colors.white,
    margin: spacing[4],
    marginBottom: Platform.OS === 'ios' ? spacing[10] : spacing[4],
    borderRadius: borderRadius.xl,
    padding: spacing[2],
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
  },
  menuOptionText: {
    fontSize: fontSize.base,
    color: colors.gray[700],
  },
});
