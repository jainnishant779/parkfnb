/**
 * useProfilePhoto — add / change / remove the signed-in user's profile photo.
 *
 * The picked image is uploaded to POST /api/uploads (multipart `file`) and the
 * returned `url` is saved on the user via PUT /api/users/me/profile
 * (`profilePictureUrl`). The auth context is updated from the response, so
 * every screen that reads auth.user re-renders with the new photo.
 *
 *   const photo = useProfilePhoto();
 *   <TouchableOpacity onPress={photo.open}>...</TouchableOpacity>
 *   {photo.sheet}
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { useAuth } from '../../context/AuthContext';
import * as userService from '../../services/userService';
import { AppAlert } from '../../components/AppAlert';
import SheetModal from '../../components/ui/SheetModal';
import { IconCircle, ListRow } from '../../components/ui';
import { resolveImageUri } from '../../utils/imageUri';
import { palette, fonts } from '../../theme';

const PICKER_OPTIONS = { mediaType: 'photo', maxWidth: 800, maxHeight: 800, quality: 0.8 };

// The picker cannot present over a Modal that is still animating out (iOS),
// so it opens once the sheet's close animation (220ms) has finished.
const SHEET_CLOSE_MS = 350;

const useProfilePhoto = () => {
  const auth = useAuth();
  const user = auth.user;
  const [visible, setVisible] = useState(false);
  const [uploading, setUploading] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const rawUri = user?.profilePictureUrl || user?.profileImage || null;
  const photoUri = rawUri ? resolveImageUri(rawUri) : undefined;

  const savePhoto = async (asset) => {
    setUploading(true);
    try {
      const uploaded = await userService.uploadProfilePhoto(asset);
      const url = uploaded?.url || uploaded?.fullUrl;
      if (!url) throw { message: 'The server did not return a photo link.' };
      const response = await userService.updateProfile({ profilePictureUrl: url });
      auth.updateUser({ ...response.user, profilePictureUrl: url });
    } catch (err) {
      AppAlert.alert('Photo not saved', err?.message || 'Could not upload your photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const pick = (launcher) => {
    setVisible(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      launcher(PICKER_OPTIONS, (res) => {
        if (!res || res.didCancel) return;
        if (res.errorCode) {
          const msg = res.errorCode === 'camera_unavailable'
            ? 'The camera is not available on this device.'
            : res.errorCode === 'permission'
              ? 'Please allow access in Settings to choose a profile photo.'
              : res.errorMessage || 'Could not open the picker. Please try again.';
          AppAlert.alert('Profile photo', msg);
          return;
        }
        const asset = res.assets?.[0];
        if (asset?.uri) savePhoto(asset);
      });
    }, SHEET_CLOSE_MS);
  };

  const removePhoto = async () => {
    setVisible(false);
    setUploading(true);
    try {
      const response = await userService.updateProfile({ profilePictureUrl: '' });
      // The server omits an empty photo field, and updateUser merges, so the
      // old value has to be cleared explicitly.
      auth.updateUser({ ...response.user, profilePictureUrl: null, profileImage: null });
    } catch (err) {
      AppAlert.alert('Error', err?.message || 'Could not remove your photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const open = () => {
    if (uploading) return;
    setVisible(true);
  };

  const sheet = (
    <SheetModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile photo</Text>
        <IconCircle icon="x" size={40} variant="grey" onPress={() => setVisible(false)} />
      </View>
      <View style={styles.rows}>
        <ListRow icon="camera" title="Take photo" onPress={() => pick(launchCamera)} />
        <ListRow
          icon="image"
          title="Choose from gallery"
          onPress={() => pick(launchImageLibrary)}
          isLast={!rawUri}
        />
        {rawUri ? (
          <ListRow icon="trash-2" title="Remove photo" danger right={null} onPress={removePhoto} isLast />
        ) : null}
      </View>
    </SheetModal>
  );

  return { open, sheet, uploading, photoUri };
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  title: { ...fonts.semibold, fontSize: 21, color: palette.text, letterSpacing: -0.3 },
  rows: { marginTop: 8 },
});

export default useProfilePhoto;
