import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppAlert } from '../../components/AppAlert';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Feather';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';

import { STORAGE_KEYS } from '../../utils/constants';
import { useAuth } from '../../context/AuthContext';
import * as userService from '../../services/userService';
import * as api from '../../services/api';
import { palette } from '../../theme';
import { resolveImageUri } from '../../utils/imageUri';

const DRAFT_KEY = STORAGE_KEYS.ONBOARDING_DRAFT;
const AUTOSAVE_DELAY = 800; // ms

const vehicleTypes = [
  { id: '1', name: 'Car', apiType: 'car', icon: 'truck' },
  { id: '2', name: 'SUV', apiType: 'suv', icon: 'truck' },
  { id: '3', name: 'Van', apiType: 'van', icon: 'truck' },
  { id: '4', name: 'Motorcycle', apiType: 'motorcycle', icon: 'truck' },
  { id: '5', name: 'Truck', apiType: 'truck', icon: 'truck' },
];

const UserOnboarding = ({ navigation }) => {
  const auth = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 3;

  // Form state
  const [profileImage, setProfileImage] = useState(null);
  const [fullName, setFullName] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [vehicleApiType, setVehicleApiType] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [location, setLocation] = useState('');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(false);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [termsAgreed, setTermsAgreed] = useState(false);

  // UI state
  const [vehicleModalVisible, setVehicleModalVisible] = useState(false);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [errors, setErrors] = useState({});
  const [isFormValid, setIsFormValid] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const autosaveTimer = useRef(null);

  // ─── Load draft + pre-fill from auth context on mount ─────────────────────
  useEffect(() => {
    async function loadDraft() {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY);
        if (raw) {
          const draft = JSON.parse(raw);
          if (draft.fullName) setFullName(draft.fullName);
          if (draft.vehicleType) setVehicleType(draft.vehicleType);
          if (draft.vehicleApiType) setVehicleApiType(draft.vehicleApiType);
          if (draft.registrationNumber) setRegistrationNumber(draft.registrationNumber);
          if (draft.location) setLocation(draft.location);
          if (draft.emailNotifications !== undefined) setEmailNotifications(draft.emailNotifications);
          if (draft.smsNotifications !== undefined) setSmsNotifications(draft.smsNotifications);
          if (draft.pushNotifications !== undefined) setPushNotifications(draft.pushNotifications);
          if (draft.termsAgreed !== undefined) setTermsAgreed(draft.termsAgreed);
        } else if (auth.user?.legalName) {
          // Pre-fill from auth context if no draft
          setFullName(auth.user.legalName);
        }
      } catch {
        // Draft load failed silently — start fresh
      }
    }
    loadDraft();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Autosave draft ────────────────────────────────────────────────────────
  const saveDraft = useCallback(() => {
    const draft = {
      fullName, vehicleType, vehicleApiType, registrationNumber,
      location, emailNotifications, smsNotifications, pushNotifications, termsAgreed,
    };
    AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft)).catch(() => {});
  }, [fullName, vehicleType, vehicleApiType, registrationNumber, location,
    emailNotifications, smsNotifications, pushNotifications, termsAgreed]);

  useEffect(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(saveDraft, AUTOSAVE_DELAY);
    return () => clearTimeout(autosaveTimer.current);
  }, [saveDraft]);

  // ─── Validation ────────────────────────────────────────────────────────────
  useEffect(() => {
    const newErrors = {};

    if (!fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    } else if (!/^[a-zA-Z\s]+$/.test(fullName)) {
      newErrors.fullName = 'Name should only contain letters';
    }

    if (!vehicleType) {
      newErrors.vehicleType = 'Please select a vehicle type';
    }

    if (!registrationNumber.trim()) {
      newErrors.registrationNumber = 'Registration number is required';
    } else if (registrationNumber.length < 4) {
      newErrors.registrationNumber = 'Invalid registration number';
    }

    setErrors(newErrors);
    setIsFormValid(
      fullName.trim() &&
      /^[a-zA-Z\s]+$/.test(fullName) &&
      vehicleType &&
      registrationNumber.trim() &&
      registrationNumber.length >= 4 &&
      termsAgreed
    );
  }, [fullName, vehicleType, registrationNumber, termsAgreed]);

  // ─── Image picker ──────────────────────────────────────────────────────────
  const pickImageFromGallery = () => {
    setImageModalVisible(false);
    launchImageLibrary({ mediaType: 'photo', maxHeight: 500, maxWidth: 500 }, (response) => {
      if (response.assets?.[0]) setProfileImage(response.assets[0].uri);
    });
  };

  const takePhoto = () => {
    setImageModalVisible(false);
    launchCamera({ mediaType: 'photo', maxHeight: 500, maxWidth: 500 }, (response) => {
      if (response.assets?.[0]) setProfileImage(response.assets[0].uri);
    });
  };

  // ─── Submit ────────────────────────────────────────────────────────────────
  const handleContinue = async () => {
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError('');

    try {
      // 1. Update profile → advances onboarding_step to 'completed'
      const response = await userService.updateProfile({
        legalName: fullName.trim(),
        notificationBooking: emailNotifications || smsNotifications,
        notificationPromotion: false,
        preferredLanguage: 'en',
      });

      const updatedUser = response.user;

      // 2. Create vehicle record
      if (registrationNumber.trim() && vehicleApiType && updatedUser?.id) {
        try {
          const reg = registrationNumber.trim().toUpperCase();
          await api.post(`/api/vehicles/users/${updatedUser.id}/vehicles`, {
            license_plate: reg,
            licensePlate: reg,
            registration_number: reg,
            registrationNumber: reg,
            vehicle_type: vehicleApiType,
            vehicleType: vehicleApiType,
            vehicle_size: 'medium',
            vehicleSize: 'medium',
            make: reg,
            model: vehicleType || vehicleApiType,
            is_default: true,
            isDefault: true,
          });
        } catch (vehicleErr) {
          console.warn('[Onboarding] Vehicle creation failed:', vehicleErr);
          // Non-fatal — user can add vehicle from Profile screen
        }
      }

      // 3. Clear draft
      await AsyncStorage.removeItem(DRAFT_KEY);

      // 4. Update auth context → RootNavigator in App.tsx automatically switches to main stack
      auth.updateUser(updatedUser);

    } catch (err) {
      const code = err?.code || '';
      if (code === 'NETWORK_ERROR' || code === 'NETWORK_TIMEOUT') {
        setSubmitError('No internet connection. Your data is saved locally — try again when online.');
      } else if (err?.details) {
        // Map server validation errors to fields
        const fieldErrors = {};
        (err.details || []).forEach((d) => {
          if (d.field === 'legal_name') fieldErrors.fullName = d.message;
        });
        if (Object.keys(fieldErrors).length) {
          setErrors((prev) => ({ ...prev, ...fieldErrors }));
        } else {
          setSubmitError(err?.message || 'Something went wrong. Please try again.');
        }
      } else {
        setSubmitError(err?.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    if (isSubmitting) return;
    AppAlert.alert(
      'Skip Setup',
      'You can complete your profile later from settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip',
          onPress: () => {
            // Advance the user immediately. RootNavigator re-renders into
            // MainApp the moment onboardingStep flips to 'completed', so the
            // user never sees a stuck loading state — even if the network
            // is dead. Persistence happens in the background.
            auth.updateUser({ onboardingStep: 'completed' });
            AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
            const payload = fullName.trim()
              ? { legalName: fullName.trim(), notificationBooking: true }
              : { notificationBooking: true };
            userService.updateProfile(payload).catch(() => {
              // Server didn't accept the skip — that's fine, the user has
              // already moved on. They can re-enter details from Profile.
            });
          },
        },
      ]
    );
  };

  // ─── Render helpers ────────────────────────────────────────────────────────
  const renderProgressBar = () => (
    <View style={styles.progressContainer}>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${(currentStep / totalSteps) * 100}%` }]} />
      </View>
      <Text style={styles.progressText}>Step {currentStep} of {totalSteps}</Text>
    </View>
  );

  const renderVehicleModal = () =>
    vehicleModalVisible ? (
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => setVehicleModalVisible(false)}
        />
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Vehicle Type</Text>
            <TouchableOpacity
              onPress={() => setVehicleModalVisible(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Icon name="x" size={24} color="#1A1A2E" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={vehicleTypes}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const isSelected = vehicleType === item.name || vehicleApiType === item.apiType;
              return (
                <TouchableOpacity
                  style={[styles.vehicleOption, isSelected && styles.vehicleOptionSelected]}
                  onPress={() => {
                    setVehicleType(item.name);
                    setVehicleApiType(item.apiType);
                    setVehicleModalVisible(false);
                  }}
                  activeOpacity={0.75}
                >
                  <Icon name={item.icon} size={20} color={isSelected ? '#FFFFFF' : '#0D7377'} />
                  <Text style={[styles.vehicleOptionText, isSelected && styles.vehicleOptionTextSelected]}>
                    {item.name}
                  </Text>
                  {isSelected && <Icon name="check" size={20} color="#FFFFFF" />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    ) : null;

  const renderImagePickerModal = () =>
    imageModalVisible ? (
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => setImageModalVisible(false)}
        />
        <View style={styles.imageModalContent}>
          <Text style={styles.modalTitle}>Choose Photo</Text>
          <TouchableOpacity style={styles.imageOption} onPress={takePhoto}>
            <Icon name="camera" size={24} color="#0D7377" />
            <Text style={styles.imageOptionText}>Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.imageOption} onPress={pickImageFromGallery}>
            <Icon name="image" size={24} color="#0D7377" />
            <Text style={styles.imageOptionText}>Choose from Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={() => setImageModalVisible(false)}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    ) : null;

  // ─── Main render ───────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Complete Your Profile</Text>
          <Text style={styles.subtitle}>Help us personalize your experience</Text>
        </View>

        {renderProgressBar()}

        {/* Profile Picture */}
        <View style={styles.profileSection}>
          <TouchableOpacity style={styles.profileImageContainer} onPress={() => setImageModalVisible(true)}>
            {profileImage ? (
              <Image source={{ uri: resolveImageUri(profileImage) }} style={styles.profileImage} />
            ) : (
              <View style={styles.profilePlaceholder}>
                <Icon name="user" size={40} color="#9CA3AF" />
              </View>
            )}
            <View style={styles.cameraIcon}>
              <Icon name="camera" size={16} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
          <Text style={styles.uploadText}>Tap to upload photo</Text>
        </View>

        {/* Full Name */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Full Name *</Text>
          <View style={styles.inputWrapper}>
            <Icon name="user" size={18} color="#9CA3AF" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Enter your full name"
              placeholderTextColor="#9CA3AF"
              value={fullName}
              onChangeText={setFullName}
            />
          </View>
          {errors.fullName ? <Text style={styles.errorText}>{errors.fullName}</Text> : null}
        </View>

        {/* Vehicle Type */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Vehicle Type *</Text>
          <TouchableOpacity style={styles.selectWrapper} onPress={() => setVehicleModalVisible(true)}>
            <Icon name="truck" size={18} color="#0D7377" style={styles.inputIcon} />
            <Text style={[styles.selectText, !vehicleType && styles.placeholderText]}>
              {vehicleType || 'Select vehicle type'}
            </Text>
            <Icon name="chevron-down" size={18} color="#9CA3AF" />
          </TouchableOpacity>
          <View style={styles.vehiclePillsRow}>
            {vehicleTypes.map((item) => {
              const isSelected = vehicleType === item.name || vehicleApiType === item.apiType;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.vehiclePill, isSelected && styles.vehiclePillActive]}
                  onPress={() => {
                    setVehicleType(item.name);
                    setVehicleApiType(item.apiType);
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.vehiclePillText, isSelected && styles.vehiclePillTextActive]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {errors.vehicleType ? <Text style={styles.errorText}>{errors.vehicleType}</Text> : null}
        </View>

        {/* Registration Number */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Vehicle Registration Number *</Text>
          <View style={styles.inputWrapper}>
            <Icon name="hash" size={18} color="#9CA3AF" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="e.g. KA01AB1234"
              placeholderTextColor="#9CA3AF"
              value={registrationNumber}
              onChangeText={setRegistrationNumber}
              autoCapitalize="characters"
            />
          </View>
          {errors.registrationNumber ? <Text style={styles.errorText}>{errors.registrationNumber}</Text> : null}
        </View>

        {/* Location (optional) */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Location (Optional)</Text>
          <View style={styles.inputWrapper}>
            <Icon name="map-pin" size={18} color="#9CA3AF" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Enter your city or area"
              placeholderTextColor="#9CA3AF"
              value={location}
              onChangeText={setLocation}
            />
          </View>
        </View>

        {/* Communication Preferences */}
        <View style={styles.preferencesSection}>
          <Text style={styles.sectionTitle}>Communication Preferences</Text>

          {[
            { label: 'Email Notifications', icon: 'mail', value: emailNotifications, setter: setEmailNotifications },
            { label: 'SMS Notifications', icon: 'message-square', value: smsNotifications, setter: setSmsNotifications },
            { label: 'Push Notifications', icon: 'bell', value: pushNotifications, setter: setPushNotifications },
          ].map(({ label, icon, value, setter }) => (
            <TouchableOpacity
              key={label}
              style={styles.preferenceItem}
              onPress={() => setter(!value)}
            >
              <View style={styles.preferenceInfo}>
                <Icon name={icon} size={20} color="#0D7377" />
                <Text style={styles.preferenceText}>{label}</Text>
              </View>
              <View style={[styles.toggle, value && styles.toggleActive]}>
                <View style={[styles.toggleCircle, value && styles.toggleCircleActive]} />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Terms */}
        <TouchableOpacity style={styles.termsContainer} onPress={() => setTermsAgreed(!termsAgreed)}>
          <View style={[styles.checkbox, termsAgreed && styles.checkboxChecked]}>
            {termsAgreed && <Icon name="check" size={14} color="#FFFFFF" />}
          </View>
          <Text style={styles.termsText}>
            I agree to the <Text style={styles.termsLink}>Terms and Conditions</Text>
          </Text>
        </TouchableOpacity>

        {/* Submit error */}
        {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}

        {/* Buttons */}
        <View style={styles.buttonsContainer}>
          <TouchableOpacity
            style={[styles.continueButton, (!isFormValid || isSubmitting) && styles.continueButtonDisabled]}
            onPress={handleContinue}
            disabled={!isFormValid || isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.continueButtonText}>Continue</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={handleSkip}
            disabled={isSubmitting}
            activeOpacity={0.7}
          >
            <Text style={styles.skipButtonText}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      {renderVehicleModal()}
      {renderImagePickerModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  scrollContent: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 },
  header: { marginTop: 20, marginBottom: 20 },
  title: { fontSize: 26, fontWeight: '700', color: '#1A1A2E', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#6B7280' },
  progressContainer: { marginBottom: 24 },
  progressBar: { height: 6, backgroundColor: '#E8F5F4', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#0D7377', borderRadius: 3 },
  progressText: { fontSize: 12, color: '#6B7280', marginTop: 8, textAlign: 'right' },
  profileSection: { alignItems: 'center', marginBottom: 24 },
  profileImageContainer: { position: 'relative' },
  profileImage: { width: 100, height: 100, borderRadius: 50 },
  profilePlaceholder: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: '#F3F4F6',
    justifyContent: 'center', alignItems: 'center',
  },
  cameraIcon: {
    position: 'absolute', bottom: 0, right: 0, width: 32, height: 32,
    borderRadius: 16, backgroundColor: '#0D7377', justifyContent: 'center',
    alignItems: 'center', borderWidth: 2, borderColor: '#FFFFFF',
  },
  uploadText: { fontSize: 13, color: '#6B7280', marginTop: 8 },
  inputGroup: { marginBottom: 20 },
  inputLabel: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 8 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 12, paddingHorizontal: 16, backgroundColor: '#F9FAFB',
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, paddingVertical: 14, fontSize: 15, color: '#1A1A2E' },
  selectWrapper: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#F9FAFB',
  },
  selectText: { flex: 1, fontSize: 15, color: '#1A1A2E' },
  placeholderText: { color: '#9CA3AF' },
  vehiclePillsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10,
  },
  vehiclePill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB',
  },
  vehiclePillActive: {
    borderColor: '#0D7377', backgroundColor: '#0D7377',
  },
  vehiclePillText: {
    fontSize: 13, fontWeight: '500', color: '#4B5563',
  },
  vehiclePillTextActive: {
    color: '#FFFFFF', fontWeight: '600',
  },
  errorText: { fontSize: 12, color: '#EF4444', marginTop: 4 },
  preferencesSection: { marginTop: 8, marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#1A1A2E', marginBottom: 12 },
  preferenceItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  preferenceInfo: { flexDirection: 'row', alignItems: 'center' },
  preferenceText: { fontSize: 15, color: '#1A1A2E', marginLeft: 12 },
  toggle: {
    width: 44, height: 24, borderRadius: 12, backgroundColor: '#E5E7EB',
    padding: 2, justifyContent: 'center',
  },
  toggleActive: { backgroundColor: '#0D7377' },
  toggleCircle: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF' },
  toggleCircleActive: { alignSelf: 'flex-end' },
  termsContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  checkbox: {
    width: 20, height: 20, borderWidth: 2, borderColor: '#0D7377',
    borderRadius: 4, marginRight: 12, justifyContent: 'center', alignItems: 'center',
  },
  checkboxChecked: { backgroundColor: '#0D7377' },
  termsText: { fontSize: 14, color: '#6B7280', flex: 1 },
  termsLink: { color: '#0D7377', fontWeight: '500' },
  submitError: { fontSize: 13, color: '#EF4444', marginBottom: 12, textAlign: 'center' },
  buttonsContainer: { gap: 12, marginTop: 16 },
  continueButton: {
    backgroundColor: '#0D7377', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center', minHeight: 52,
  },
  continueButtonDisabled: { backgroundColor: '#9CA3AF' },
  continueButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  skipButton: { paddingVertical: 12, alignItems: 'center' },
  skipButtonText: { color: '#6B7280', fontSize: 14, fontWeight: '500' },
  // Modal styles
  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end',
    zIndex: 99999, elevation: 25,
  },
  modalContent: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 20, paddingBottom: 40, maxHeight: '75%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A2E' },
  vehicleOption: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 24,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  vehicleOptionSelected: { backgroundColor: '#0D7377' },
  vehicleOptionText: { fontSize: 15, color: '#1A1A2E', marginLeft: 12, flex: 1 },
  vehicleOptionTextSelected: { color: '#FFFFFF', fontWeight: '600' },
  imageModalContent: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24,
  },
  imageOption: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  imageOptionText: { fontSize: 15, color: '#1A1A2E', marginLeft: 16 },
  cancelButton: { marginTop: 16, paddingVertical: 12, alignItems: 'center' },
  cancelButtonText: { fontSize: 15, color: '#6B7280', fontWeight: '500' },
});

export default UserOnboarding;
