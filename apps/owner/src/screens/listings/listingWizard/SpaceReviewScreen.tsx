import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image } from 'react-native';
import { useNavigation, CommonActions } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import WizardHeader from '../../../components/wizard/WizardHeader';
import WizardFooter from '../../../components/wizard/WizardFooter';
import { useSpaceWizard } from '../../../context/ListingWizardContext';
import { listingService } from '../../../services/listingService';
import { ApiRequestError } from '../../../services/api';
import { resolveImageUri, isSampleUri, uploadLocalImages } from '../../../utils/imageUri';
import { palette, radii, fonts } from '../../../theme/kit';
import { StatusTag, IsoBlock } from '../../../components/ui';

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
    <View style={styles.screen}>
      <WizardHeader
        title={data.editSpaceId ? 'Review Changes' : 'Review Space'}
        step={5}
        totalSteps={5}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroArt} pointerEvents="none">
            <IsoBlock size={140} tone="blue" />
          </View>
          <StatusTag label={data.editSpaceId ? 'Editing' : 'Ready to publish'} tone="ink" />
          <Text style={styles.heroTitle} numberOfLines={1}>
            Space {data.spaceNumber || '—'}
          </Text>
          <Text style={[styles.heroSub, styles.capitalize]} numberOfLines={1}>
            {data.spaceType}
            {data.pricePerHour != null ? `  ·  ₹${data.pricePerHour}/hr` : ''}
          </Text>
        </View>

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
            <Ionicons name="alert-circle" size={18} color={palette.warning} />
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
    <View style={styles.card}>
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
  screen: { flex: 1, backgroundColor: palette.bg },
  content: { padding: 16, paddingBottom: 80 },
  hero: {
    backgroundColor: palette.peachSoft,
    borderRadius: radii.xl,
    padding: 18,
    minHeight: 150,
    overflow: 'hidden',
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  heroArt: { position: 'absolute', right: -30, bottom: -26 },
  heroTitle: {
    ...fonts.bold,
    fontSize: 24,
    letterSpacing: -0.6,
    color: palette.text,
    marginTop: 12,
    width: '66%',
  },
  heroSub: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
    marginTop: 4,
    width: '62%',
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 4,
    marginBottom: 12,
  },
  sectionTitle: { ...fonts.semibold, fontSize: 17, color: palette.text, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  label: { ...fonts.medium, flex: 1, fontSize: 13.5, color: palette.textMuted },
  value: { ...fonts.semibold, flex: 2, fontSize: 14, color: palette.text, textAlign: 'right' },
  photosBlock: { paddingVertical: 12 },
  photosLabel: { ...fonts.medium, fontSize: 13.5, color: palette.textMuted, marginBottom: 10 },
  photosCount: { ...fonts.semibold, color: palette.text },
  photosEmpty: { ...fonts.medium, fontSize: 14, color: palette.textSubtle },
  photosRow: { gap: 8 },
  photo: {
    width: 96,
    height: 96,
    borderRadius: radii.md,
    backgroundColor: palette.fill,
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderText: { ...fonts.semibold, fontSize: 11, color: palette.textMuted },
  capitalize: { textTransform: 'capitalize' },
  warnBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: radii.xl,
    backgroundColor: palette.warningSoft,
  },
  warnText: { ...fonts.medium, fontSize: 13, color: palette.text, marginLeft: 10, flex: 1 },
});
