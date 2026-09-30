// PromoFormModal Component - Create/Edit promo form
import React, { memo, useMemo, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  Platform,
  TouchableOpacity,
  KeyboardAvoidingView,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import DateTimePickerModal from '../../../components/inputs/DateTimePickerModal';
import { getTheme } from '../../../theme/colors';
import { palette, radii, fonts } from '../../../theme/kit';
import { IconCircle, PillButton, Chip, Segmented } from '../../../components/ui';
import type {
  Promo,
  PromoFormData,
  PromoValidationErrors,
  PromoType,
} from '../../../types/promo';
import {
  generatePromoCode,
  createPromo,
  updatePromo,
} from '../../../services/promoStorage';
import {
  validatePromoForm,
  isFormComplete,
  isFormValid,
  formDataToPromo,
  promoToFormData,
  getInitialFormData,
  getQuickDatePreset,
  formatPromoDate,
} from '../../../utils/promoHelpers';
import ListingPicker from './ListingPicker';
import ConfirmDialog from './ConfirmDialog';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface PromoFormModalProps {
  visible: boolean;
  onClose: () => void;
  promo?: Promo; // If provided, editing mode
  onSave: (promo: Promo) => void;
  testID?: string;
}

interface FormSectionProps {
  title: string;
  children: React.ReactNode;
}

const FormSection = memo(function FormSection({ title, children }: FormSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>
        {children}
      </View>
    </View>
  );
});

interface FormFieldProps {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  isLast?: boolean;
}

const FormField = memo(function FormField({
  label,
  error,
  hint,
  children,
  isLast = false,
}: FormFieldProps) {

  return (
    <View style={[styles.field, !isLast && styles.fieldBorder]}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      {children}
      {hint && !error && (
        <Text style={styles.fieldHint}>{hint}</Text>
      )}
      {error && (
        <Text style={styles.fieldError}>{error}</Text>
      )}
    </View>
  );
});

function PromoFormModal({
  visible,
  onClose,
  promo,
  onSave,
  testID,
}: PromoFormModalProps) {
  const theme = useMemo(() => getTheme(false), []);
  const insets = useSafeAreaInsets();

  // Form state
  const [formData, setFormData] = useState<PromoFormData>(getInitialFormData());
  const [errors, setErrors] = useState<PromoValidationErrors>({});
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showListingPicker, setShowListingPicker] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = !!promo;

  // Initialize form data when modal opens
  useEffect(() => {
    if (visible) {
      if (promo) {
        setFormData(promoToFormData(promo));
      } else {
        setFormData(getInitialFormData());
      }
      setErrors({});
    }
  }, [visible, promo]);

  // Update field
  const updateField = useCallback(<K extends keyof PromoFormData>(
    field: K,
    value: PromoFormData[K]
  ) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field as keyof PromoValidationErrors]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field as keyof PromoValidationErrors];
        return next;
      });
    }
  }, [errors]);

  // Generate code
  const handleGenerateCode = useCallback(() => {
    const code = generatePromoCode();
    updateField('code', code);
  }, [updateField]);

  // Quick date presets
  const handleQuickDate = useCallback((preset: 'today' | 'tomorrow' | 'weekend' | 'next7days') => {
    const { startAt, endAt } = getQuickDatePreset(preset);
    updateField('startAt', startAt);
    updateField('endAt', endAt);
  }, [updateField]);

  // Validate and save
  const handleSave = useCallback(async (asDraft: boolean = false) => {
    setIsSaving(true);

    try {
      // Validate
      const validationErrors = await validatePromoForm(formData, promo?.id);

      if (!asDraft && !isFormValid(validationErrors)) {
        setErrors(validationErrors);
        setIsSaving(false);
        return;
      }

      // Convert form data to promo
      const promoData = formDataToPromo(formData, promo);

      if (asDraft) {
        promoData.isDraft = true;
        promoData.enabled = false;
      }

      // Save
      let savedPromo: Promo | null;
      if (promo) {
        savedPromo = await updatePromo(promo.id, promoData);
      } else {
        savedPromo = await createPromo(promoData);
      }

      if (savedPromo) {
        onSave(savedPromo);
        onClose();
      }
    } catch (error) {
      console.error('Failed to save promo:', error);
    } finally {
      setIsSaving(false);
    }
  }, [formData, promo, onSave, onClose]);

  // Handle close with unsaved changes check
  const handleClose = useCallback(() => {
    const hasChanges = JSON.stringify(formData) !== JSON.stringify(
      promo ? promoToFormData(promo) : getInitialFormData()
    );

    if (hasChanges) {
      setShowDiscardDialog(true);
    } else {
      onClose();
    }
  }, [formData, promo, onClose]);

  const canSave = isFormComplete(formData) && !isSaving;
  const showSaveAsDraft = !isFormComplete(formData);

  return visible ? (
    <>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <IconCircle icon="x" size={44} onPress={handleClose} />
          <Text style={styles.headerTitle}>
            {isEditing ? 'Edit Promotion' : 'New Promotion'}
          </Text>
          <View style={styles.headerButton} />
        </View>

        {/* Form */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Section A: Basics */}
          <FormSection title="Basics">
            <FormField
              label="Promo Name"
              error={errors.name}
              hint="Give your promotion a memorable name"
            >
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: errors.name ? theme.danger : 'transparent' }]}
                value={formData.name}
                onChangeText={(text) => updateField('name', text)}
                placeholder="e.g., Weekend Saver"
                placeholderTextColor={theme.textMuted}
                maxLength={40}
                testID={testID ? `${testID}-name` : undefined}
              />
            </FormField>

            <FormField
              label="Promo Code"
              error={errors.code}
              hint="Customers will enter this code at checkout"
            >
              <View style={styles.codeInputRow}>
                <TextInput
                  style={[
                    styles.input,
                    styles.codeInput,
                    { color: theme.text, borderColor: errors.code ? theme.danger : 'transparent' },
                  ]}
                  value={formData.code}
                  onChangeText={(text) => updateField('code', text.toUpperCase().replace(/\s/g, ''))}
                  placeholder="e.g., SAVE20"
                  placeholderTextColor={theme.textMuted}
                  maxLength={16}
                  autoCapitalize="characters"
                  testID={testID ? `${testID}-code` : undefined}
                />
                <TouchableOpacity
                  onPress={handleGenerateCode}
                  activeOpacity={0.8}
                  style={styles.generateButton}
                  accessibilityLabel="Auto-generate code"
                >
                  <Ionicons name="sparkles-outline" size={16} color={palette.textInverse} />
                  <Text style={styles.generateButtonText}>Generate</Text>
                </TouchableOpacity>
              </View>
            </FormField>

            <FormField label="Enabled" isLast>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>
                  Make promotion active immediately
                </Text>
                <Switch
                  value={formData.enabled}
                  onValueChange={(val) => updateField('enabled', val)}
                  trackColor={{ false: palette.line, true: palette.ink }}
                  thumbColor={palette.surface}
                  ios_backgroundColor={palette.line}
                />
              </View>
            </FormField>
          </FormSection>

          {/* Section B: Discount */}
          <FormSection title="Discount">
            <FormField label="Discount Type">
              <Segmented
                options={[
                  { id: 'PERCENT', label: 'Percentage' },
                  { id: 'FLAT', label: 'Flat Amount' },
                ]}
                value={formData.type}
                onChange={(type: PromoType) => updateField('type', type)}
              />
            </FormField>

            <FormField
              label={formData.type === 'PERCENT' ? 'Discount Percentage' : 'Discount Amount'}
              error={errors.value}
            >
              <View style={styles.valueInputRow}>
                {formData.type === 'FLAT' && (
                  <Text style={styles.valuePrefix}>₹</Text>
                )}
                <TextInput
                  style={[
                    styles.input,
                    styles.valueInput,
                    { color: theme.text, borderColor: errors.value ? theme.danger : 'transparent' },
                  ]}
                  value={formData.value}
                  onChangeText={(text) => updateField('value', text.replace(/[^0-9.]/g, ''))}
                  placeholder={formData.type === 'PERCENT' ? '10' : '50'}
                  placeholderTextColor={theme.textMuted}
                  keyboardType="decimal-pad"
                  testID={testID ? `${testID}-value` : undefined}
                />
                {formData.type === 'PERCENT' && (
                  <Text style={styles.valueSuffix}>%</Text>
                )}
              </View>
            </FormField>

            {formData.type === 'PERCENT' && (
              <FormField
                label="Max Discount Amount (Optional)"
                error={errors.maxDiscountAmount}
                hint="Cap the maximum discount amount"
                isLast
              >
                <View style={styles.valueInputRow}>
                  <Text style={styles.valuePrefix}>₹</Text>
                  <TextInput
                    style={[
                      styles.input,
                      styles.valueInput,
                      { color: theme.text, borderColor: errors.maxDiscountAmount ? theme.danger : 'transparent' },
                    ]}
                    value={formData.maxDiscountAmount}
                    onChangeText={(text) => updateField('maxDiscountAmount', text.replace(/[^0-9]/g, ''))}
                    placeholder="e.g., 200"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="number-pad"
                  />
                </View>
              </FormField>
            )}
          </FormSection>

          {/* Section C: Conditions */}
          <FormSection title="Conditions">
            <FormField
              label="Minimum Booking Amount (Optional)"
              error={errors.minBookingAmount}
            >
              <View style={styles.valueInputRow}>
                <Text style={styles.valuePrefix}>₹</Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.valueInput,
                    { color: theme.text, borderColor: errors.minBookingAmount ? theme.danger : 'transparent' },
                  ]}
                  value={formData.minBookingAmount}
                  onChangeText={(text) => updateField('minBookingAmount', text.replace(/[^0-9]/g, ''))}
                  placeholder="e.g., 100"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="number-pad"
                />
              </View>
            </FormField>

            <FormField label="Usage Limits (Optional)" isLast>
              <View style={styles.limitsRow}>
                <View style={styles.limitField}>
                  <Text style={styles.limitLabel}>
                    Total uses
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      styles.limitInput,
                      { color: theme.text, borderColor: errors.totalLimit ? theme.danger : 'transparent' },
                    ]}
                    value={formData.totalLimit}
                    onChangeText={(text) => updateField('totalLimit', text.replace(/[^0-9]/g, ''))}
                    placeholder="∞"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="number-pad"
                  />
                  {errors.totalLimit && (
                    <Text style={styles.fieldError}>{errors.totalLimit}</Text>
                  )}
                </View>
                <View style={styles.limitField}>
                  <Text style={styles.limitLabel}>
                    Per user
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      styles.limitInput,
                      { color: theme.text, borderColor: errors.perUserLimit ? theme.danger : 'transparent' },
                    ]}
                    value={formData.perUserLimit}
                    onChangeText={(text) => updateField('perUserLimit', text.replace(/[^0-9]/g, ''))}
                    placeholder="∞"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="number-pad"
                  />
                  {errors.perUserLimit && (
                    <Text style={styles.fieldError}>{errors.perUserLimit}</Text>
                  )}
                </View>
              </View>
            </FormField>
          </FormSection>

          {/* Section D: Validity */}
          <FormSection title="Validity Period">
            {/* Quick Presets */}
            <View style={styles.quickDates}>
              {[
                { key: 'today', label: 'Today' },
                { key: 'tomorrow', label: 'Tomorrow' },
                { key: 'weekend', label: 'Weekend' },
                { key: 'next7days', label: 'Next 7 Days' },
              ].map((preset) => (
                <Chip
                  key={preset.key}
                  label={preset.label}
                  onPress={() => handleQuickDate(preset.key as any)}
                  style={styles.quickDateChip}
                />
              ))}
            </View>

            <FormField label="Start Date" error={errors.startAt}>
              <Pressable
                onPress={() => setShowStartPicker(true)}
                style={[styles.dateButton, { borderColor: errors.startAt ? theme.danger : 'transparent' }]}
              >
                <Ionicons name="calendar-outline" size={18} color={palette.textMuted} />
                <Text style={styles.dateText}>
                  {formatPromoDate(formData.startAt.toISOString(), true)}
                </Text>
              </Pressable>
            </FormField>

            <FormField label="End Date" error={errors.endAt} isLast>
              <Pressable
                onPress={() => setShowEndPicker(true)}
                style={[styles.dateButton, { borderColor: errors.endAt ? theme.danger : 'transparent' }]}
              >
                <Ionicons name="calendar-outline" size={18} color={palette.textMuted} />
                <Text style={styles.dateText}>
                  {formatPromoDate(formData.endAt.toISOString(), true)}
                </Text>
              </Pressable>
            </FormField>
          </FormSection>

          {/* Section E: Applies To */}
          <FormSection title="Applies To">
            <FormField
              label="Applicable Listings"
              error={errors.applicableListingIds}
              isLast
            >
              <View style={styles.radioGroup}>
                <Pressable
                  onPress={() => updateField('applyToAllListings', true)}
                  style={styles.radioRow}
                >
                  <View
                    style={[
                      styles.radio,
                                            formData.applyToAllListings && styles.radioOn,
                    ]}
                  >
                    {formData.applyToAllListings && (
                      <View style={styles.radioInner} />
                    )}
                  </View>
                  <Text style={styles.radioLabel}>
                    All my listings
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => updateField('applyToAllListings', false)}
                  style={styles.radioRow}
                >
                  <View
                    style={[
                      styles.radio,
                                            !formData.applyToAllListings && styles.radioOn,
                    ]}
                  >
                    {!formData.applyToAllListings && (
                      <View style={styles.radioInner} />
                    )}
                  </View>
                  <Text style={styles.radioLabel}>
                    Select specific listings
                  </Text>
                </Pressable>
              </View>

              {!formData.applyToAllListings && (
                <Pressable
                  onPress={() => setShowListingPicker(true)}
                  style={styles.selectListingsButton}
                >
                  <Ionicons name="add" size={18} color={palette.text} />
                  <Text style={styles.selectListingsText}>
                    {formData.applicableListingIds.length > 0
                      ? `${formData.applicableListingIds.length} listing(s) selected`
                      : 'Select listings'}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={palette.textMuted} />
                </Pressable>
              )}
            </FormField>
          </FormSection>

          {/* Section F: Notes */}
          <FormSection title="Internal Notes (Optional)">
            <FormField label="" isLast>
              <TextInput
                style={[
                  styles.input,
                  styles.notesInput,
                  { color: theme.text, borderColor: 'transparent' },
                ]}
                value={formData.notes}
                onChangeText={(text) => updateField('notes', text)}
                placeholder="Add internal notes about this promotion..."
                placeholderTextColor={theme.textMuted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </FormField>
          </FormSection>

          {/* Last updated (for edit mode) */}
          {isEditing && promo && (
            <Text style={styles.lastUpdated}>
              Last updated: {formatPromoDate(promo.updatedAt, true)}
            </Text>
          )}

          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          {showSaveAsDraft && (
            <View style={styles.footerSecondary} accessibilityLabel="Save as draft">
              <PillButton
                label="Save as Draft"
                variant="grey"
                onPress={() => handleSave(true)}
                disabled={isSaving}
              />
            </View>
          )}
          <View
            style={styles.footerPrimary}
            accessibilityLabel="Save promotion"
            testID={testID ? `${testID}-save` : 'save_promo_button'}
          >
            <PillButton
              label={isSaving ? 'Saving...' : 'Save Promotion'}
              variant="ink"
              onPress={() => handleSave(false)}
              disabled={!canSave}
            />
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Date+time pickers (custom JS — no native module) */}
      <DateTimePickerModal
        visible={showStartPicker}
        onClose={() => setShowStartPicker(false)}
        title="Promotion start"
        initial={formData.startAt}
        minDate={new Date()}
        onSelect={(isoLocal) => {
          const next = new Date(isoLocal);
          if (!isNaN(next.getTime())) updateField('startAt', next);
        }}
      />
      <DateTimePickerModal
        visible={showEndPicker}
        onClose={() => setShowEndPicker(false)}
        title="Promotion end"
        initial={formData.endAt}
        minDate={formData.startAt}
        onSelect={(isoLocal) => {
          const next = new Date(isoLocal);
          if (!isNaN(next.getTime())) updateField('endAt', next);
        }}
      />

      {/* Listing Picker */}
      <ListingPicker
        visible={showListingPicker}
        onClose={() => setShowListingPicker(false)}
        selectedIds={formData.applicableListingIds}
        onApply={(ids) => updateField('applicableListingIds', ids)}
        testID={testID ? `${testID}-listing-picker` : undefined}
      />

      {/* Discard Dialog */}
      <ConfirmDialog
        visible={showDiscardDialog}
        onClose={() => setShowDiscardDialog(false)}
        onConfirm={onClose}
        title="Discard Changes?"
        message="You have unsaved changes. Are you sure you want to discard them?"
        confirmLabel="Discard"
        cancelLabel="Keep Editing"
        variant="warning"
      />
    
    </>
    ) : null;
}

const styles = StyleSheet.create({
  container: {
    // Full-screen overlay (no <Modal> on this build).
    ...StyleSheet.absoluteFillObject,
    zIndex: 9000,
    elevation: 20,
    backgroundColor: palette.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerButton: {
    width: 44,
    height: 44,
  },
  headerTitle: {
    ...fonts.semibold,
    fontSize: 20,
    letterSpacing: -0.3,
    color: palette.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    ...fonts.medium,
    fontSize: 14,
    color: palette.textMuted,
    marginBottom: 10,
    marginLeft: 6,
  },
  sectionContent: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: palette.surface,
  },
  field: {
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  fieldBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  fieldLabel: {
    ...fonts.semibold,
    fontSize: 14,
    color: palette.text,
    marginBottom: 8,
  },
  fieldHint: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textMuted,
    marginTop: 6,
  },
  fieldError: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.danger,
    marginTop: 6,
  },
  input: {
    ...fonts.medium,
    minHeight: 52,
    borderWidth: 1.5,
    borderRadius: radii.pill,
    backgroundColor: palette.fill,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 15,
  },
  codeInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  codeInput: {
    ...fonts.bold,
    flex: 1,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    backgroundColor: palette.ink,
  },
  generateButtonText: {
    ...fonts.semibold,
    fontSize: 14,
    color: palette.textInverse,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: {
    ...fonts.medium,
    fontSize: 14,
    color: palette.textMuted,
    flex: 1,
    marginRight: 12,
  },
  valueInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  valueInput: {
    flex: 1,
  },
  valuePrefix: {
    ...fonts.semibold,
    fontSize: 18,
    color: palette.text,
    marginRight: 10,
  },
  valueSuffix: {
    ...fonts.semibold,
    fontSize: 18,
    color: palette.text,
    marginLeft: 10,
  },
  limitsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  limitField: {
    flex: 1,
  },
  limitLabel: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textMuted,
    marginBottom: 6,
  },
  limitInput: {},
  quickDates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  quickDateChip: {
    height: 38,
    paddingHorizontal: 14,
    marginRight: 8,
    backgroundColor: palette.fill,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    borderWidth: 1.5,
    borderRadius: radii.pill,
    backgroundColor: palette.fill,
    paddingHorizontal: 18,
  },
  dateText: {
    ...fonts.medium,
    fontSize: 15,
    color: palette.text,
  },
  radioGroup: {
    gap: 14,
    marginBottom: 14,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: {
    backgroundColor: palette.ink,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.surface,
  },
  radioLabel: {
    ...fonts.medium,
    fontSize: 15,
    color: palette.text,
  },
  selectListingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 18,
    borderRadius: radii.pill,
    backgroundColor: palette.fill,
  },
  selectListingsText: {
    ...fonts.semibold,
    flex: 1,
    fontSize: 14,
    color: palette.text,
  },
  notesInput: {
    minHeight: 96,
    borderRadius: radii.md,
    paddingTop: 14,
  },
  lastUpdated: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
  bottomSpacer: {
    height: 80,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: palette.bg,
  },
  footerSecondary: {
    flex: 1,
  },
  footerPrimary: {
    flex: 1,
  },
});

export default memo(PromoFormModal);
