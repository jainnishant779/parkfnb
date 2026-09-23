import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import WizardHeader from '../../../components/wizard/WizardHeader';
import WizardFooter from '../../../components/wizard/WizardFooter';
import FormTextInput from '../../../components/inputs/FormTextInput';
import { useSpaceWizard } from '../../../context/ListingWizardContext';
import { listingService } from '../../../services/listingService';
import { useScrollToInput } from '../../../hooks/useScrollToInput';
import type { SpaceType } from '../../../types/api';
import { palette, radii, fonts } from '../../../theme/kit';
import { Chip } from '../../../components/ui';

const SPACE_TYPES: { value: SpaceType; label: string }[] = [
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'covered', label: 'Covered' },
  { value: 'garage', label: 'Garage' },
  { value: 'driveway', label: 'Driveway' },
  { value: 'carport', label: 'Carport' },
  { value: 'street', label: 'Street' },
];

export default function StepDimensionsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { data, updateField, replaceData, reset } = useSpaceWizard();

  const propertyId: string = route.params?.propertyId;
  const editSpaceId: string | undefined = route.params?.editSpaceId;

  const [errors, setErrors] = useState<Record<string, string>>({});
  // Local string mirror so the user can fully erase the input before
  // typing a new number — without this, an empty string would parse to
  // NaN and the onChangeText branch would clamp totalSpots back to 1
  // every keystroke, making the field uncleamable.
  const [spotsText, setSpotsText] = useState<string>(
    data.totalSpots != null ? String(data.totalSpots) : '',
  );
  // Tracks the last value the input itself wrote into wizard data, so
  // the sync effect can tell apart "user just typed" (skip) from
  // "external change like edit-load" (resync). Without this, clearing
  // the input would push 0 to the wizard, the effect would see
  // data.totalSpots=0, and overwrite spotsText with "0" → uncleamable.
  const lastWrittenSpots = useRef<number | null>(data.totalSpots ?? null);

  useEffect(() => {
    if (data.totalSpots === lastWrittenSpots.current) return;
    // External change — resync the displayed text.
    setSpotsText(data.totalSpots != null ? String(data.totalSpots) : '');
    lastWrittenSpots.current = data.totalSpots;
  }, [data.totalSpots]);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [suggestedNumber, setSuggestedNumber] = useState<string>('');
  const [contextReady, setContextReady] = useState(false);
  const { scrollRef, registerField, focusField } = useScrollToInput();

  // Handle propertyId/editSpaceId sync.
  // Important: if user is creating (no editSpaceId) but the hydrated draft
  // belongs to a DIFFERENT property, wipe the draft before proceeding —
  // otherwise Property A's form data leaks into Property B's create flow.
  useEffect(() => {
    if (!propertyId) {
      setContextReady(true);
      return;
    }

    const isDifferentContext = data.propertyId && data.propertyId !== propertyId;
    const isDifferentEditTarget = editSpaceId && data.editSpaceId !== editSpaceId;

    if (!editSpaceId && isDifferentContext) {
      // Create mode + stale draft for another property → reset
      reset();
      // After reset, re-seed with current propertyId
      setTimeout(() => {
        replaceData({ propertyId });
        setContextReady(true);
      }, 0);
    } else if (editSpaceId && (isDifferentEditTarget || data.propertyId !== propertyId)) {
      // Edit mode for a different space → reset then seed
      reset();
      setTimeout(() => {
        replaceData({ propertyId, editSpaceId });
        setContextReady(true);
      }, 0);
    } else {
      if (data.propertyId !== propertyId) replaceData({ propertyId });
      if (editSpaceId && data.editSpaceId !== editSpaceId) replaceData({ editSpaceId });
      setContextReady(true);
    }
  }, [propertyId, editSpaceId]);

  // Load existing space for edit mode OR suggest next spaceNumber for create mode
  useEffect(() => {
    if (!propertyId || !contextReady) return;

    if (editSpaceId) {
      setLoadingEdit(true);
      Promise.all([
        listingService.getSpace(editSpaceId),
        listingService.listAvailability(editSpaceId).catch(() => []),
      ])
        .then(([s, slots]) => {
          // Rebuild availability local state from server schedules
          const schedules = Array.from({ length: 7 }, (_, i) => {
            const existing = slots.find((slot) => slot.dayOfWeek === i);
            return {
              dayOfWeek: i,
              availableFrom: existing?.availableFrom || '09:00',
              availableTo: existing?.availableTo || '18:00',
              enabled: !!existing && existing.isAvailable,
            };
          });

          replaceData({
            spaceNumber: s.spaceNumber,
            spaceType: s.spaceType,
            lengthMeters: s.lengthMeters,
            widthMeters: s.widthMeters,
            heightMeters: s.heightMeters ?? null,
            spaceDescription: s.spaceDescription ?? '',
            spaceImages: s.spaceImages || [],
            pricePerHour: s.pricePerHour,
            pricePerDay: s.pricePerDay ?? null,
            pricePerMonth: s.pricePerMonth ?? null,
            allowedVehicleTypes: s.allowedVehicleTypes || ['car'],
            bookingMode: s.bookingMode,
            hasEvCharging: s.hasEvCharging,
            totalSpots: s.totalSpots ?? 1,
            availability: {
              is24_7: slots.length === 0,
              schedules,
            },
          });
        })
        .finally(() => setLoadingEdit(false));
    } else if (!data.spaceNumber) {
      listingService
        .listSpacesByProperty(propertyId)
        .then(({ spaces }) => {
          const next = String((spaces?.length ?? 0) + 1);
          setSuggestedNumber(next);
          if (!data.spaceNumber) updateField('spaceNumber', next);
        })
        .catch(() => {
          setSuggestedNumber('1');
          if (!data.spaceNumber) updateField('spaceNumber', '1');
        });
    }
  }, [propertyId, editSpaceId, contextReady]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!data.spaceNumber.trim()) errs.spaceNumber = 'Space number is required';
    if (!data.spaceType) errs.spaceType = 'Pick a space type';
    if (!data.totalSpots || data.totalSpots < 1) errs.totalSpots = 'Must be at least 1';
    if (!data.lengthMeters || data.lengthMeters <= 0) errs.lengthMeters = 'Length > 0';
    if (!data.widthMeters || data.widthMeters <= 0) errs.widthMeters = 'Width > 0';
    if (data.heightMeters !== null && data.heightMeters !== undefined && data.heightMeters < 0) {
      errs.heightMeters = 'Height must be positive';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (!validate()) return;
    navigation.navigate('StepSpacePhotos');
  };

  const parseNum = (v: string): number | null => {
    const cleaned = v.replace(/[^0-9.]/g, '');
    if (!cleaned) return null;
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  };

  return (
    <View style={styles.screen}>
      <WizardHeader
        title={editSpaceId ? 'Edit Space' : 'Add Space'}
        step={1}
        totalSteps={5}
        onBack={() => navigation.goBack()}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.h1}>Space details</Text>
          <Text style={styles.sub}>Tell us about this specific parking spot.</Text>

          <View style={styles.card}>
            <FormTextInput
              label="Space number / label"
              required
              value={data.spaceNumber}
              onChangeText={(v) => updateField('spaceNumber', v)}
              placeholder={suggestedNumber || 'e.g., A-1'}
              error={errors.spaceNumber}
              containerStyle={styles.input}
              helperText={suggestedNumber ? `Suggested: ${suggestedNumber}` : undefined}
            />

            <Text style={styles.fieldLabel}>
              Space type <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.chipWrap}>
              {SPACE_TYPES.map((t) => (
                <Chip
                  key={t.value}
                  label={t.label}
                  selected={data.spaceType === t.value}
                  onPress={() => updateField('spaceType', t.value)}
                  style={styles.chip}
                />
              ))}
            </View>
            {errors.spaceType ? <Text style={styles.errorText}>{errors.spaceType}</Text> : null}

            <FormTextInput
              label="Number of spots"
              required
              value={spotsText}
              onChangeText={(v) => {
                const cleaned = v.replace(/[^0-9]/g, '');
                setSpotsText(cleaned);
                const n = cleaned === '' ? NaN : parseInt(cleaned, 10);
                const next = isNaN(n) ? 0 : n;
                lastWrittenSpots.current = next;
                updateField('totalSpots', next);
              }}
              placeholder="1"
              keyboardType="number-pad"
              helperText="How many identical spots does this space have?"
              error={errors.totalSpots}
              containerStyle={styles.spotsInput}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Dimensions (meters)</Text>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <FormTextInput
                  label="Length"
                  required
                  value={data.lengthMeters != null ? String(data.lengthMeters) : ''}
                  onChangeText={(v) => updateField('lengthMeters', parseNum(v))}
                  placeholder="5.0"
                  keyboardType="decimal-pad"
                  error={errors.lengthMeters}
                />
              </View>
              <View style={styles.rowRight}>
                <FormTextInput
                  label="Width"
                  required
                  value={data.widthMeters != null ? String(data.widthMeters) : ''}
                  onChangeText={(v) => updateField('widthMeters', parseNum(v))}
                  placeholder="2.5"
                  keyboardType="decimal-pad"
                  error={errors.widthMeters}
                />
              </View>
            </View>
          </View>

          {/* Registered fields stay top-level cards so their onLayout y is
              relative to the scroll content (useScrollToInput relies on it). */}
          <View onLayout={registerField('height')} style={styles.card}>
            <FormTextInput
              label="Height clearance (optional)"
              value={data.heightMeters != null ? String(data.heightMeters) : ''}
              onChangeText={(v) => updateField('heightMeters', parseNum(v))}
              placeholder="e.g., 2.1 for basement parking"
              keyboardType="decimal-pad"
              error={errors.heightMeters}
              helperText="Leave blank for outdoor/uncovered spaces"
              onFocus={focusField('height')}
            />
          </View>

          <View onLayout={registerField('desc')} style={styles.card}>
            <FormTextInput
              label="Description (optional)"
              value={data.spaceDescription}
              onChangeText={(v) => updateField('spaceDescription', v)}
              placeholder="Anything renters should know"
              multiline
              onFocus={focusField('desc')}
            />
          </View>
        </ScrollView>
        <WizardFooter primaryLabel="Next" onPrimary={handleNext} loading={loadingEdit} />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 200 },
  h1: { ...fonts.semibold, fontSize: 26, letterSpacing: -0.6, color: palette.text, marginBottom: 6 },
  sub: { ...fonts.medium, fontSize: 14.5, lineHeight: 20, color: palette.textMuted, marginBottom: 18 },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    padding: 18,
    marginBottom: 12,
  },
  cardTitle: { ...fonts.semibold, fontSize: 17, color: palette.text, marginBottom: 12 },
  fieldLabel: { ...fonts.semibold, fontSize: 14, color: palette.text, marginBottom: 10 },
  required: { color: palette.danger },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { marginRight: 8, marginBottom: 8, backgroundColor: palette.fill },
  errorText: { ...fonts.medium, color: palette.danger, fontSize: 12.5, marginTop: 2 },
  input: { marginBottom: 16 },
  spotsInput: { marginTop: 12 },
  row: { flexDirection: 'row' },
  rowLeft: { flex: 1, marginRight: 6 },
  rowRight: { flex: 1, marginLeft: 6 },
});
