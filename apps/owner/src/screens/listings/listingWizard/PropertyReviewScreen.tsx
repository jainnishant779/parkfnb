import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image } from 'react-native';
import { useNavigation, CommonActions } from '@react-navigation/native';
import WizardHeader from '../../../components/wizard/WizardHeader';
import WizardFooter from '../../../components/wizard/WizardFooter';
import { usePropertyWizard } from '../../../context/ListingWizardContext';
import { listingService } from '../../../services/listingService';
import { ApiRequestError } from '../../../services/api';
import { indianStates } from '../../../constants/mockData';
import { resolveImageUri, isSampleUri, uploadLocalImages } from '../../../utils/imageUri';

export default function PropertyReviewScreen() {
  const navigation = useNavigation<any>();
  const { data, getPayload, reset, editPropertyId, chainToSpace } = usePropertyWizard();
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');

  const stateLabel = indianStates.find((s) => s.value === data.state)?.label || data.state;

  const submit = async () => {
    setSubmitting(true);
    setErrorText('');

    try {
      const base = getPayload();
      // The picker hands back device URIs; store what the backend serves.
      const resolvedImages = await uploadLocalImages(data.propertyImages);
      // Reaching the review step + tapping submit is the explicit "publish"
      // intent. Onboarding seeds properties with status='draft', so without
      // this the listing stays a draft forever and the consumer search
      // (which excludes drafts) never returns it.
      const payload = { ...base, propertyImages: resolvedImages, status: 'published' as const };

      let property;
      if (editPropertyId) {
        property = await listingService.updateProperty(editPropertyId, payload);
      } else {
        property = await listingService.createProperty(payload);
      }

      const propertyId = property.id;
      reset();

      if (!editPropertyId && chainToSpace) {
        // First-time owner flow: chain into Space wizard
        navigation.getParent()?.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [
              { name: 'SpaceWizard', params: { propertyId } },
            ],
          }),
        );
      } else {
        // Navigate to the property's spaces screen
        navigation.getParent()?.dispatch(
          CommonActions.reset({
            index: 1,
            routes: [
              { name: 'MainTabs' },
              { name: 'PropertySpaces', params: { propertyId } },
            ],
          }),
        );
      }
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.code === 'AUTH_FORBIDDEN') {
          setErrorText('Please complete onboarding first.');
        } else if (err.code === 'REQ_INVALID_FORMAT') {
          setErrorText(err.message || 'Invalid input. Check your lat/lng.');
        } else if (err.code === 'REQ_VALIDATION' || err.code === 'REQ_MISSING_FIELD') {
          const missing = err.details?.missing;
          setErrorText(
            missing?.length
              ? `Missing: ${missing.join(', ')}`
              : err.message || 'Please complete all required fields.'
          );
        } else {
          setErrorText(err.message || 'Failed to save property. Try again.');
        }
      } else {
        setErrorText(
          'Connection error. Please try again. If you added photos, check '
          + 'your connection — they upload before the property is saved.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <WizardHeader
        title={editPropertyId ? 'Review Changes' : 'Review Property'}
        step={2}
        totalSteps={2}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Row label="Name" value={data.propertyName} />
        <Row label="Address" value={data.address} />
        <Row label="City" value={data.city} />
        <Row label="State" value={stateLabel} />
        <Row label="Pincode" value={data.postalCode} />
        <Row
          label="Coordinates"
          value={
            data.locationLat != null && data.locationLng != null
              ? `${data.locationLat}, ${data.locationLng}`
              : '—'
          }
        />
        {data.accessInstructions ? <Row label="Access notes" value={data.accessInstructions} /> : null}
        <PhotosPreview label="Photos" images={data.propertyImages} />

        {!editPropertyId && chainToSpace ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              Next step: add your first parking space at this property.
            </Text>
          </View>
        ) : null}
      </ScrollView>
      <WizardFooter
        primaryLabel={editPropertyId ? 'Save Changes' : 'Create Property'}
        onPrimary={submit}
        loading={submitting}
        errorText={errorText}
      />
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value || '—'}</Text>
    </View>
  );
}

// Renders the label on top and a horizontal scroll of image thumbnails
// below. Sample/placeholder URIs render a gray box with a count instead
// of trying (and failing) to load them as images.
function PhotosPreview({ label, images }: { label: string; images: string[] }) {
  return (
    <View style={styles.photosBlock}>
      <Text style={styles.photosLabel}>
        {label} <Text style={styles.photosCount}>({images.length})</Text>
      </Text>
      {images.length === 0 ? (
        <Text style={styles.photosEmpty}>No photos added</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.photosRow}
        >
          {images.map((uri, idx) => {
            if (isSampleUri(uri)) {
              return (
                <View key={`${uri}-${idx}`} style={[styles.photo, styles.photoPlaceholder]}>
                  <Text style={styles.photoPlaceholderText}>Sample</Text>
                </View>
              );
            }
            return (
              <Image
                key={`${uri}-${idx}`}
                source={{ uri: resolveImageUri(uri) }}
                style={styles.photo}
                resizeMode="cover"
              />
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 80 },
  row: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  label: { flex: 1, fontSize: 13, color: '#6B7280' },
  value: { flex: 2, fontSize: 14, color: '#1F2937' },
  banner: {
    marginTop: 24,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#E8F5F4',
  },
  bannerText: { fontSize: 13, color: '#0A5C5F' },
  photosBlock: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  photosLabel: { fontSize: 13, color: '#6B7280', marginBottom: 8 },
  photosCount: { color: '#1F2937', fontWeight: '500' },
  photosEmpty: { fontSize: 14, color: '#9CA3AF', fontStyle: 'italic' },
  photosRow: { gap: 8 },
  photo: {
    width: 96,
    height: 96,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderText: { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },
});
