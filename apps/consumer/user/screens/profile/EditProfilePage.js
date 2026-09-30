import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppAlert } from '../../components/AppAlert';
import { useAuth } from '../../context/AuthContext';
import * as userService from '../../services/userService';
import { palette, radii, spacing, fonts } from '../../theme';
import { ScreenHeader, Avatar, Field, PillButton, IconCircle } from '../../components/ui';
import useProfilePhoto from './useProfilePhoto';
import { calculateProfileCompletion } from './profileCompletion';

const AVATAR = 110;

const EditProfilePage = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const user = auth.user;
  const photo = useProfilePhoto();

  const [editedName, setEditedName] = useState(user?.legalName || '');
  const [isSaving, setIsSaving] = useState(false);

  const completion = calculateProfileCompletion({
    user,
    fullName: editedName.trim(),
    vehicleCount: route?.params?.vehicleCount || 0,
    paymentCount: route?.params?.paymentCount || 0,
  });

  // Save profile name to backend (moved from ProfilePage's edit sheet).
  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const response = await userService.updateProfile({ legalName: editedName.trim() });
      auth.updateUser(response.user);
      navigation.goBack();
    } catch {
      AppAlert.alert('Error', 'Could not save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.bg} />
      <ScreenHeader title="Edit profile" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.avatarWrap}>
            <TouchableOpacity onPress={photo.open} activeOpacity={0.85}>
              <Avatar uri={photo.photoUri} name={editedName || user?.email || ''} size={AVATAR} ring />
              {photo.uploading ? (
                <View style={styles.avatarBusy}>
                  <ActivityIndicator color={palette.textInverse} />
                </View>
              ) : null}
            </TouchableOpacity>
            <IconCircle
              icon="camera"
              size={38}
              variant="ink"
              onPress={photo.open}
              style={styles.cameraBadge}
            />
          </View>
          <Text style={styles.photoHint}>
            {photo.photoUri ? 'Tap to change your photo' : 'Add a profile photo'}
          </Text>

          {completion < 100 ? (
            <View style={styles.progressCard}>
              <View style={styles.progressHead}>
                <Text style={styles.progressTitle}>Complete your profile</Text>
                <Text style={styles.progressValue}>{completion}%</Text>
              </View>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${completion}%` }]} />
              </View>
              <Text style={styles.progressSub}>
                Add your photo, a vehicle and your details to unlock all features.
              </Text>
            </View>
          ) : null}

          <View style={styles.formCard}>
            <Field
              label="Full name"
              icon="user"
              value={editedName}
              onChangeText={setEditedName}
              placeholder="Full name"
              autoCapitalize="words"
              returnKeyType="done"
              style={styles.fieldGap}
            />
            <Field
              label="Email"
              icon="mail"
              value={user?.email || ''}
              editable={false}
              placeholder="—"
              inputStyle={styles.readOnly}
              style={styles.fieldGap}
            />
            <Field
              label="Phone number"
              icon="phone"
              value={user?.phone ? `+91 ${user.phone}` : ''}
              editable={false}
              placeholder="—"
              inputStyle={styles.readOnly}
            />
            <Text style={styles.readOnlyNote}>
              Your phone number is used to sign in and cannot be changed here.
            </Text>
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <PillButton
            label="Save changes"
            variant="ink"
            onPress={handleSaveProfile}
            loading={isSaving}
          />
        </View>
      </KeyboardAvoidingView>

      {photo.sheet}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl },

  // Avatar
  avatarWrap: { alignSelf: 'center', width: AVATAR, height: AVATAR },
  avatarBusy: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: AVATAR / 2,
    backgroundColor: palette.glassDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    borderWidth: 3,
    borderColor: palette.bg,
  },
  photoHint: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
    textAlign: 'center',
    marginTop: 12,
  },

  // Completion hint
  progressCard: {
    backgroundColor: palette.peachSoft,
    borderRadius: radii.lg,
    padding: 16,
    marginTop: spacing.xl,
  },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  progressTitle: { ...fonts.semibold, fontSize: 14, color: palette.text },
  progressValue: { ...fonts.bold, fontSize: 14, color: palette.text },
  progressBar: { height: 6, borderRadius: 3, backgroundColor: palette.peach, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: palette.ink },
  progressSub: { ...fonts.medium, fontSize: 12, color: palette.textMuted, marginTop: 10, lineHeight: 16 },

  // Form
  formCard: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    padding: 18,
    marginTop: spacing.lg,
  },
  fieldGap: { marginBottom: 16 },
  readOnly: { color: palette.textMuted },
  readOnlyNote: { ...fonts.medium, fontSize: 12, color: palette.textSubtle, marginTop: 8, marginLeft: 4 },

  // Sticky footer
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: 12,
    backgroundColor: palette.bg,
  },
});

export default EditProfilePage;
