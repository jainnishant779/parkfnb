import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image } from 'react-native';
import { useNavigation, CommonActions } from '@react-navigation/native';
import WizardHeader from '../../../components/wizard/WizardHeader';
import WizardFooter from '../../../components/wizard/WizardFooter';
import { useSpaceWizard } from '../../../context/ListingWizardContext';
import { listingService } from '../../../services/listingService';
import { ApiRequestError } from '../../../services/api';
import { resolveImageUri, isSampleUri, uploadLocalImages } from '../../../utils/imageUri';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SpaceReviewScreen() {
  const navigation = useNavigation<any>();
  const { data, getSpacePayload, getAvailabilityPayload, reset } = useSpaceWizard();
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [warningText, setWarningText] = useState('');

  const submit = async () => {
    if (!data.propertyId) {
      setErrorText('Missing property context. Please restart the wizard.');
      return;
    }

    setSubmitting(true);
    setErrorText('');
    setWarningText('');

    try {
      const base = getSpacePayload();
      // The picker hands back device URIs; store what the backend serves.
      const resolvedImages = await uploadLocalImages(data.spaceImages);
      const spacePayload = { ...base, spaceImages: resolvedImages };

      let space;
      if (data.editSpaceId) {
        space = await listingService.updateSpace(data.editSpaceId, spacePayload);
      } else {
        space = await listingService.createSpace(data.propertyId, spacePayload);
      }

      // Availability sync:
      // - Create mode: bulk-create new schedules if user set them (else leave 24/7)
      // - Edit mode: wipe existing schedules then bulk-create new ones (avoids conflicts
      //   when user changes hours). If user kept 24/7, wipe any leftover schedules.
      const schedules = getAvailabilityPayload();

      try {
        if (data.editSpaceId) {
          const existing = await listingService.listAvailability(space.id);
          await Promise.all(existing.map((s) => listingService.deleteAvailability(s.id)));
        }

        if (schedules.length > 0) {
          const result = await listingService.bulkCreateAvailability(space.id, schedules);
          if (result.failedCount > 0) {
            setWarningText(
              `Space saved, but ${result.failedCount} availability slot(s) failed. You can edit them in the calendar.`,
            );
          }
        }
      } catch (availErr) {
        // Space is saved; availability sync failed. Non-fatal.
        console.warn('Availability sync failed:', availErr);
        setWarningText('Space saved, but availability hours could not be updated. Edit them in the calendar.');
      }

      reset();

      navigation.getParent()?.dispatch(
        CommonActions.reset({
          index: 1,
          routes: [
            { name: 'MainTabs' },
            { name: 'PropertySpaces', params: { propertyId: data.propertyId } },
          ],
        }),
      );
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.code === 'BIZ_CONFLICT') {
          setErrorText('A space with this number already exists at this property. Choose a different number.');
        } else if (err.code === 'AUTH_FORBIDDEN') {
          setErrorText("You're not authorized for this property.");
        } else if (err.code === 'REQ_VALIDATION' || err.code === 'REQ_MISSING_FIELD') {
          setErrorText(err.message || 'Please check all required fields.');
        } else {
          setErrorText(err.message || 'Failed to save space. Please try again.');
        }
      } else {
        setErrorText('Connection error. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const enabledDays = data.availability.schedules.filter((s) => s.enabled);

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <WizardHeader
        title={data.editSpaceId ? 'Review Changes' : 'Review Space'}
        step={5}
        totalSteps={5}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Basics">
          <Row label="Space number" value={data.spaceNumber} />
          <Row label="Type" value={data.spaceType} />
          <Row label="Number of spots" value={String(data.totalSpots ?? 1)} />
          <Row label="Dimensions" value={`${data.lengthMeters}m × ${data.widthMeters}m${data.heightMeters ? ` × ${data.heightMeters}m (H)` : ''}`} />
          {data.spaceDescription ? <Row label="Notes" value={data.spaceDescription} /> : null}
          <PhotosPreview label="Photos" images={data.spaceImages} />
        </Section>

        <Section title="Pricing">
          <Row label="Per hour" value={`₹${data.pricePerHour}`} />
          {data.pricePerDay ? <Row label="Per day" value={`₹${data.pricePerDay}`} /> : null}
          {data.pricePerMonth ? <Row label="Per month" value={`₹${data.pricePerMonth}`} /> : null}
        </Section>

        <Section title="Availability">
          {data.availability.is24_7 ? (
            <Row label="Schedule" value="24/7" />
          ) : (
            <Row
              label="Schedule"
              value={
                enabledDays.length > 0
                  ? enabledDays
                      .map((s) => `${DAY_LABELS[s.dayOfWeek]} ${s.availableFrom}-${s.availableTo}`)
                      .join(', ')
                  : 'None'
              }
            />
          )}
        </Section>

        <Section title="Rules">
          <Row label="Vehicles" value={data.allowedVehicleTypes.join(', ')} />
          <Row label="Booking mode" value={data.bookingMode} />
          <Row label="EV charging" value={data.hasEvCharging ? 'Yes' : 'No'} />
        </Section>

        {warningText ? (
          <View style={styles.warnBox}>
            <Text style={styles.warnText}>{warningText}</Text>
          </View>
        ) : null}
      </ScrollView>
      <WizardFooter
        primaryLabel={data.editSpaceId ? 'Save Changes' : 'Publish Space'}
        onPrimary={submit}
        loading={submitting}
        errorText={errorText}
      />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value || '—'}</Text>
    </View>
  );
}

// Renders the label on top and a horizontal scroll of image thumbnails
// below. Sample/placeholder URIs render a gray box instead of trying
// to load them as images.
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
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  label: { flex: 1, fontSize: 13, color: '#6B7280' },
  value: { flex: 2, fontSize: 14, color: '#1F2937' },
  warnBox: {
    marginTop: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
  },
  warnText: { fontSize: 13, color: '#92400E' },
  photosBlock: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
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
