/**
 * UserOnboarding — first-run profile setup (name, vehicle, notifications).
 *
 * Behaviour: draft autosave, validation, profile update, default vehicle
 * creation and "skip for now" are unchanged. Visuals follow the app kit:
 * peach progress card, white rounded section cards, icon tiles for the
 * vehicle type, ink toggles and a full-width black CTA.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Image,
  Pressable,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Feather';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';

import { STORAGE_KEYS } from '../../utils/constants';
import { useAuth } from '../../context/AuthContext';
import * as userService from '../../services/userService';
import * as api from '../../services/api';
import { palette, fonts, radii, shadow } from '../../theme';
import { resolveImageUri } from '../../utils/imageUri';
import {
  Field,
  PillButton,
  ListRow,
} from '../../components/ui';
import KeyboardInset from '../../components/KeyboardInset';

const DRAFT_KEY = STORAGE_KEYS.ONBOARDING_DRAFT;
const AUTOSAVE_DELAY = 800; // ms

const vehicleTypes = [
  { id: '1', name: 'Car', apiType: 'car', icon: 'car-side' },
  { id: '2', name: 'SUV', apiType: 'suv', icon: 'car-estate' },
  { id: '3', name: 'Van', apiType: 'van', icon: 'van-utility' },
  { id: '4', name: 'Motorcycle', apiType: 'motorcycle', icon: 'motorbike' },
  { id: '5', name: 'Truck', apiType: 'truck', icon: 'truck' },
];

const UserOnboarding = ({ navigation }) => {
  const auth = useAuth();

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
  const [imageModalVisible, setImageModalVisible] = useState(false);
  // Field errors stay hidden until the field is touched or Continue is
  // pressed, so a fresh form doesn't open covered in red.
  const [touched, setTouched] = useState({});
  const [attempted, setAttempted] = useState(false);
  const touch = (key) => setTouched((t) => (t[key] ? t : { ...t, [key]: true }));
  const errorFor = (key) => ((attempted || touched[key]) && errors[key]) || '';
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

  // Drop the "what's missing" hint as soon as the form becomes valid.
  useEffect(() => {
    if (isFormValid) setSubmitError('');
  }, [isFormValid]);

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
  // What is still missing, in the order the form asks for it. Continue used to
  // sit greyed out with no explanation, so a forgotten field (most often the
  // Terms checkbox, which has no error line of its own) looked like a dead button.
  const firstMissingField = () => {
    if (!fullName.trim()) return 'Enter your full name.';
    if (!/^[a-zA-Z\s]+$/.test(fullName)) return 'Your name can only contain letters.';
    if (!vehicleType) return 'Select your vehicle type.';
    if (!registrationNumber.trim() || registrationNumber.length < 4) {
      return 'Enter your vehicle registration number.';
    }
    if (!termsAgreed) return 'Please agree to the Terms and Conditions to continue.';
    return '';
  };

  const handleContinue = async () => {
    if (isSubmitting) return;
    if (!isFormValid) {
      setAttempted(true);
      setSubmitError(firstMissingField());
      return;
    }

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

  // Skips straight away. The confirmation used to go through AppAlert (a
  // Modal), so if that popup failed to present the button looked dead; the
  // profile can be finished later from the Profile tab anyway.
  const handleSkip = () => {
    if (isSubmitting) return;
    // Advance the user immediately. RootNavigator re-renders into MainApp the
    // moment onboardingStep flips to 'completed', so the user never sees a
    // stuck loading state — even if the network is dead. Persistence happens
    // in the background.
    auth.updateUser({ onboardingStep: 'completed' });
    AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
    const payload = fullName.trim()
      ? { legalName: fullName.trim(), notificationBooking: true }
      : { notificationBooking: true };
    userService.updateProfile(payload).catch(() => {
      // Server didn't accept the skip — that's fine, the user has already
      // moved on. They can re-enter details from Profile.
    });
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  const selectVehicle = (item) => {
    setVehicleType(item.name);
    setVehicleApiType(item.apiType);
    touch('vehicleType');
  };

  const prefs = [
    { label: 'Email', sub: 'Booking receipts and updates', icon: 'mail', value: emailNotifications, setter: setEmailNotifications },
    { label: 'SMS', sub: 'Entry codes and reminders', icon: 'message-square', value: smsNotifications, setter: setSmsNotifications },
    { label: 'Push', sub: 'Live status of your parking', icon: 'bell', value: pushNotifications, setter: setPushNotifications },
  ];

  // Real <Modal> so it floats above everything instead of being painted over.
  const renderImagePickerModal = () => (
    <Modal
      visible={imageModalVisible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => setImageModalVisible(false)}
    >
<KeyboardInset>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={() => setImageModalVisible(false)} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>Profile photo</Text>
          <ListRow icon="camera" title="Take photo" onPress={takePhoto} />
          <ListRow icon="image" title="Choose from gallery" onPress={pickImageFromGallery} isLast />
          <PillButton
            label="Cancel"
            variant="grey"
            size="md"
            onPress={() => setImageModalVisible(false)}
            style={{ marginTop: 16 }}
          />
        </View>
      </View>
    </KeyboardInset>
</Modal>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <SafeAreaView style={styles.flex} edges={['top']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Top row */}
            <View style={styles.topRow}>
              <Text style={styles.brand}>
                parkfnb.<Text style={styles.brandMark}>®</Text>
              </Text>
              <Pressable onPress={handleSkip} disabled={isSubmitting} hitSlop={10}>
                <Text style={styles.skipTop}>Skip</Text>
              </Pressable>
            </View>

            {/* Photo */}
            <View style={styles.avatarWrap}>
              <Pressable onPress={() => setImageModalVisible(true)} style={styles.avatarBtn}>
                {profileImage ? (
                  <Image source={{ uri: resolveImageUri(profileImage) }} style={styles.avatarImg} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Icon name="user" size={38} color={palette.textSubtle} />
                  </View>
                )}
                <View style={styles.cameraBadge}>
                  <Icon name="camera" size={15} color={palette.textInverse} />
                </View>
              </Pressable>
              <Text style={styles.avatarHint}>Add a photo</Text>
            </View>

            {/* About you */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>About you</Text>
              <Field
                label="Full name"
                icon="user"
                placeholder="Enter your full name"
                value={fullName}
                onChangeText={setFullName}
                onBlur={() => touch('fullName')}
                autoCapitalize="words"
              />
              {errorFor('fullName') ? <Text style={styles.errorText}>{errorFor('fullName')}</Text> : null}
              <Field
                label="City or area (optional)"
                icon="map-pin"
                placeholder="Where do you usually park?"
                value={location}
                onChangeText={setLocation}
                style={styles.fieldGap}
              />
            </View>

            {/* Vehicle */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Your vehicle</Text>
              <View style={styles.vehicleGrid}>
                {vehicleTypes.map((item, idx) => {
                  const isSelected = vehicleType === item.name || vehicleApiType === item.apiType;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.8}
                      style={[
                        styles.vehicleTile,
                        idx % 3 !== 2 && styles.vehicleTileGap,
                        isSelected && styles.vehicleTileActive,
                      ]}
                      onPress={() => selectVehicle(item)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                    >
                      <MaterialIcon
                        name={item.icon}
                        size={26}
                        color={isSelected ? palette.textInverse : palette.text}
                      />
                      <Text style={[styles.vehicleTileText, isSelected && styles.vehicleTileTextActive]}>
                        {item.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {errorFor('vehicleType') ? <Text style={styles.errorText}>{errorFor('vehicleType')}</Text> : null}
              <Field
                label="Registration number"
                icon="hash"
                placeholder="e.g. KA01AB1234"
                value={registrationNumber}
                onChangeText={setRegistrationNumber}
                onBlur={() => touch('registrationNumber')}
                autoCapitalize="characters"
                style={styles.fieldGap}
              />
              {errorFor('registrationNumber') ? (
                <Text style={styles.errorText}>{errorFor('registrationNumber')}</Text>
              ) : null}
            </View>

            {/* Notifications */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Notifications</Text>
              {prefs.map(({ label, sub, icon, value, setter }, i) => (
                <ListRow
                  key={label}
                  icon={icon}
                  title={label}
                  subtitle={sub}
                  onPress={() => setter(!value)}
                  isLast={i === prefs.length - 1}
                  right={
                    <View style={[styles.toggle, value && styles.toggleOn]}>
                      <View style={[styles.knob, value && styles.knobOn]} />
                    </View>
                  }
                />
              ))}
            </View>

            {/* Terms */}
            <Pressable
              style={styles.terms}
              onPress={() => setTermsAgreed(!termsAgreed)}
              hitSlop={6}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: termsAgreed }}
            >
              <View style={[styles.checkbox, termsAgreed && styles.checkboxChecked]}>
                {termsAgreed ? <Icon name="check" size={13} color={palette.textInverse} /> : null}
              </View>
              <Text style={styles.termsText}>
                I agree to the <Text style={styles.termsLink}>Terms and Conditions</Text>
              </Text>
            </Pressable>

            {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}

            <PillButton
              label="Continue"
              iconRight="arrow-right"
              variant="ink"
              onPress={handleContinue}
              loading={isSubmitting}
              style={[styles.cta, !isFormValid && styles.ctaDim]}
            />
            <Pressable onPress={handleSkip} disabled={isSubmitting} style={styles.skipBtn} hitSlop={6}>
              <Text style={styles.skipText}>Skip for now</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {renderImagePickerModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  flex: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 48 },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 18,
  },
  brand: { ...fonts.bold, fontSize: 24, letterSpacing: -0.5, color: palette.text },
  brandMark: { ...fonts.medium, fontSize: 11 },
  skipTop: { ...fonts.semibold, fontSize: 15, color: palette.textMuted },

  avatarWrap: { alignItems: 'center', marginTop: 8, marginBottom: 20 },
  avatarBtn: { width: 104, height: 104 },
  avatarImg: { width: 104, height: 104, borderRadius: 52, borderWidth: 3, borderColor: palette.ink },
  avatarPlaceholder: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.ink,
    borderWidth: 3,
    borderColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarHint: { ...fonts.medium, fontSize: 13, color: palette.textMuted, marginTop: 10 },

  card: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    padding: 20,
    marginBottom: 14,
  },
  cardTitle: { ...fonts.semibold, fontSize: 18, color: palette.text, marginBottom: 16 },
  fieldGap: { marginTop: 16 },
  errorText: { ...fonts.medium, fontSize: 12.5, color: palette.danger, marginTop: 8, marginLeft: 6 },

  vehicleGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  vehicleTileGap: { marginRight: '2.75%' },
  vehicleTile: {
    width: '31.5%',
    height: 86,
    borderRadius: radii.lg,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  vehicleTileActive: { backgroundColor: palette.ink },
  vehicleTileText: { ...fonts.semibold, fontSize: 13, color: palette.text, marginTop: 6 },
  vehicleTileTextActive: { color: palette.textInverse },

  toggle: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E2E2E2',
    padding: 3,
    justifyContent: 'center',
  },
  toggleOn: { backgroundColor: palette.ink },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: palette.surface, ...shadow.press },
  knobOn: { alignSelf: 'flex-end' },

  terms: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 6, paddingHorizontal: 4 },
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
  termsText: { ...fonts.medium, flex: 1, fontSize: 14, color: palette.textMuted },
  termsLink: { ...fonts.semibold, color: palette.text },

  submitError: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.danger,
    textAlign: 'center',
    marginTop: 12,
  },
  cta: { marginTop: 18 },
  ctaDim: { opacity: 0.55 },
  skipBtn: { alignItems: 'center', paddingVertical: 16 },
  skipText: { ...fonts.semibold, fontSize: 15, color: palette.textMuted },

  // Modal — the overlay fills the root of a real <Modal>.
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.line,
    marginBottom: 18,
  },
  sheetTitle: { ...fonts.semibold, fontSize: 19, color: palette.text, marginBottom: 6 },
});

export default UserOnboarding;
