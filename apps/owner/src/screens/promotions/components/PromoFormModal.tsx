// PromoFormModal Component - Create/Edit promo form
import React, { memo, useMemo, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  Platform,
  KeyboardAvoidingView,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import DateTimePickerModal from '../../../components/inputs/DateTimePickerModal';
import { getTheme } from '../../../theme/colors';
import { spacing, borderRadius } from '../../../theme/spacing';
import { fontSize, fontWeight } from '../../../theme/typography';
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
  const theme = useMemo(() => getTheme(false), []);

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>
        {title}
      </Text>
      <View style={[styles.sectionContent, { backgroundColor: theme.surface }]}>
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
  const theme = useMemo(() => getTheme(false), []);

  return (
    <View style={[styles.field, !isLast && styles.fieldBorder]}>
      <Text style={[styles.fieldLabel, { color: theme.text }]}>{label}</Text>
      {children}
      {hint && !error && (
        <Text style={[styles.fieldHint, { color: theme.textMuted }]}>{hint}</Text>
      )}
      {error && (
        <Text style={[styles.fieldError, { color: theme.danger }]}>{error}</Text>
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
        style={[styles.container, { backgroundColor: theme.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View
          style={[
            styles.header,
            { backgroundColor: theme.surface, paddingTop: insets.top + spacing[2] },
          ]}
        >
          <Pressable
            onPress={handleClose}
            style={styles.headerButton}
            accessibilityLabel="Close"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={24} color={theme.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
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
                style={[styles.input, { color: theme.text, borderColor: errors.name ? theme.danger : theme.border }]}
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
                    { color: theme.text, borderColor: errors.code ? theme.danger : theme.border },
                  ]}
                  value={formData.code}
                  onChangeText={(text) => updateField('code', text.toUpperCase().replace(/\s/g, ''))}
                  placeholder="e.g., SAVE20"
                  placeholderTextColor={theme.textMuted}
                  maxLength={16}
                  autoCapitalize="characters"
                  testID={testID ? `${testID}-code` : undefined}
                />
                <Pressable
                  onPress={handleGenerateCode}
                  style={[styles.generateButton, { backgroundColor: theme.primaryLight }]}
                  accessibilityLabel="Auto-generate code"
                >
                  <Ionicons name="sparkles" size={16} color={theme.primary} />
                  <Text style={[styles.generateButtonText, { color: theme.primary }]}>
                    Generate
                  </Text>
                </Pressable>
              </View>
            </FormField>

            <FormField label="Enabled" isLast>
              <View style={styles.switchRow}>
                <Text style={[styles.switchLabel, { color: theme.textSecondary }]}>
                  Make promotion active immediately
                </Text>
                <Switch
                  value={formData.enabled}
                  onValueChange={(val) => updateField('enabled', val)}
                  trackColor={{ false: theme.borderLight, true: theme.primaryLight }}
                  thumbColor={formData.enabled ? theme.primary : theme.textMuted}
                />
              </View>
            </FormField>
          </FormSection>

          {/* Section B: Discount */}
          <FormSection title="Discount">
            <FormField label="Discount Type">
              <View style={styles.segmentedControl}>
                {(['PERCENT', 'FLAT'] as PromoType[]).map((type) => (
                  <Pressable
                    key={type}
                    onPress={() => updateField('type', type)}
                    style={[
                      styles.segment,
                      formData.type === type && { backgroundColor: theme.primary },
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        { color: formData.type === type ? '#FFFFFF' : theme.text },
                      ]}
                    >
                      {type === 'PERCENT' ? 'Percentage' : 'Flat Amount'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </FormField>

            <FormField
              label={formData.type === 'PERCENT' ? 'Discount Percentage' : 'Discount Amount'}
              error={errors.value}
            >
              <View style={styles.valueInputRow}>
                {formData.type === 'FLAT' && (
                  <Text style={[styles.valuePrefix, { color: theme.text }]}>₹</Text>
                )}
                <TextInput
                  style={[
                    styles.input,
                    styles.valueInput,
                    { color: theme.text, borderColor: errors.value ? theme.danger : theme.border },
                  ]}
                  value={formData.value}
                  onChangeText={(text) => updateField('value', text.replace(/[^0-9.]/g, ''))}
                  placeholder={formData.type === 'PERCENT' ? '10' : '50'}
                  placeholderTextColor={theme.textMuted}
                  keyboardType="decimal-pad"
                  testID={testID ? `${testID}-value` : undefined}
                />
                {formData.type === 'PERCENT' && (
                  <Text style={[styles.valueSuffix, { color: theme.text }]}>%</Text>
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
                  <Text style={[styles.valuePrefix, { color: theme.text }]}>₹</Text>
                  <TextInput
                    style={[
                      styles.input,
                      styles.valueInput,
                      { color: theme.text, borderColor: errors.maxDiscountAmount ? theme.danger : theme.border },
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
                <Text style={[styles.valuePrefix, { color: theme.text }]}>₹</Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.valueInput,
                    { color: theme.text, borderColor: errors.minBookingAmount ? theme.danger : theme.border },
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
                  <Text style={[styles.limitLabel, { color: theme.textSecondary }]}>
                    Total uses
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      styles.limitInput,
                      { color: theme.text, borderColor: errors.totalLimit ? theme.danger : theme.border },
                    ]}
                    value={formData.totalLimit}
                    onChangeText={(text) => updateField('totalLimit', text.replace(/[^0-9]/g, ''))}
                    placeholder="∞"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="number-pad"
                  />
                  {errors.totalLimit && (
                    <Text style={[styles.fieldError, { color: theme.danger }]}>{errors.totalLimit}</Text>
                  )}
                </View>
                <View style={styles.limitField}>
                  <Text style={[styles.limitLabel, { color: theme.textSecondary }]}>
                    Per user
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      styles.limitInput,
                      { color: theme.text, borderColor: errors.perUserLimit ? theme.danger : theme.border },
                    ]}
                    value={formData.perUserLimit}
                    onChangeText={(text) => updateField('perUserLimit', text.replace(/[^0-9]/g, ''))}
                    placeholder="∞"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="number-pad"
                  />
                  {errors.perUserLimit && (
                    <Text style={[styles.fieldError, { color: theme.danger }]}>{errors.perUserLimit}</Text>
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
                <Pressable
                  key={preset.key}
                  onPress={() => handleQuickDate(preset.key as any)}
                  style={[styles.quickDateChip, { backgroundColor: theme.borderLight }]}
                >
                  <Text style={[styles.quickDateText, { color: theme.text }]}>
                    {preset.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <FormField label="Start Date" error={errors.startAt}>
              <Pressable
                onPress={() => setShowStartPicker(true)}
                style={[styles.dateButton, { borderColor: errors.startAt ? theme.danger : theme.border }]}
              >
                <Ionicons name="calendar-outline" size={18} color={theme.textMuted} />
                <Text style={[styles.dateText, { color: theme.text }]}>
                  {formatPromoDate(formData.startAt.toISOString(), true)}
                </Text>
              </Pressable>
            </FormField>

            <FormField label="End Date" error={errors.endAt} isLast>
              <Pressable
                onPress={() => setShowEndPicker(true)}
                style={[styles.dateButton, { borderColor: errors.endAt ? theme.danger : theme.border }]}
              >
                <Ionicons name="calendar-outline" size={18} color={theme.textMuted} />
                <Text style={[styles.dateText, { color: theme.text }]}>
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
                      { borderColor: theme.primary },
                      formData.applyToAllListings && { backgroundColor: theme.primary },
                    ]}
                  >
                    {formData.applyToAllListings && (
                      <View style={styles.radioInner} />
                    )}
                  </View>
                  <Text style={[styles.radioLabel, { color: theme.text }]}>
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
                      { borderColor: theme.primary },
                      !formData.applyToAllListings && { backgroundColor: theme.primary },
                    ]}
                  >
                    {!formData.applyToAllListings && (
                      <View style={styles.radioInner} />
                    )}
                  </View>
                  <Text style={[styles.radioLabel, { color: theme.text }]}>
                    Select specific listings
                  </Text>
                </Pressable>
              </View>

              {!formData.applyToAllListings && (
                <Pressable
                  onPress={() => setShowListingPicker(true)}
                  style={[styles.selectListingsButton, { backgroundColor: theme.borderLight }]}
                >
                  <Ionicons name="add" size={18} color={theme.primary} />
                  <Text style={[styles.selectListingsText, { color: theme.primary }]}>
                    {formData.applicableListingIds.length > 0
                      ? `${formData.applicableListingIds.length} listing(s) selected`
                      : 'Select listings'}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
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
                  { color: theme.text, borderColor: theme.border },
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
            <Text style={[styles.lastUpdated, { color: theme.textMuted }]}>
              Last updated: {formatPromoDate(promo.updatedAt, true)}
            </Text>
          )}

          <View style={{ height: spacing[20] }} />
        </ScrollView>

        {/* Footer */}
        <View
          style={[
            styles.footer,
            { backgroundColor: theme.surface, paddingBottom: insets.bottom + spacing[4] },
          ]}
        >
          {showSaveAsDraft && (
            <Pressable
              onPress={() => handleSave(true)}
              style={[styles.secondaryButton, { borderColor: theme.border }]}
              disabled={isSaving}
              accessibilityLabel="Save as draft"
            >
              <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
                Save as Draft
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => handleSave(false)}
            style={[
              styles.primaryButton,
              { backgroundColor: canSave ? theme.primary : theme.borderLight },
              showSaveAsDraft && { flex: 1 },
            ]}
            disabled={!canSave}
            accessibilityLabel="Save promotion"
            testID={testID ? `${testID}-save` : 'save_promo_button'}
          >
            <Text
              style={[
                styles.primaryButtonText,
                { color: canSave ? '#FFFFFF' : theme.textMuted },
              ]}
            >
              {isSaving ? 'Saving...' : 'Save Promotion'}
            </Text>
          </Pressable>
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
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing[4],
  },
  section: {
    marginBottom: spacing[5],
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold as any,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing[2],
    marginLeft: spacing[1],
  },
  sectionContent: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  field: {
    padding: spacing[4],
  },
  fieldBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    marginBottom: spacing[2],
  },
  fieldHint: {
    fontSize: fontSize.xs,
    marginTop: spacing[1],
  },
  fieldError: {
    fontSize: fontSize.xs,
    marginTop: spacing[1],
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2] + 2,
    fontSize: fontSize.base,
  },
  codeInputRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  codeInput: {
    flex: 1,
    textTransform: 'uppercase',
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
    letterSpacing: 1,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.md,
  },
  generateButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: {
    fontSize: fontSize.sm,
    flex: 1,
    marginRight: spacing[3],
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  segment: {
    flex: 1,
    paddingVertical: spacing[2] + 2,
    alignItems: 'center',
  },
  segmentText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  valueInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  valueInput: {
    flex: 1,
  },
  valuePrefix: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium as any,
    marginRight: spacing[2],
  },
  valueSuffix: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium as any,
    marginLeft: spacing[2],
  },
  limitsRow: {
    flexDirection: 'row',
    gap: spacing[4],
  },
  limitField: {
    flex: 1,
  },
  limitLabel: {
    fontSize: fontSize.xs,
    marginBottom: spacing[1],
  },
  limitInput: {},
  quickDates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    padding: spacing[4],
    paddingBottom: 0,
  },
  quickDateChip: {
    paddingVertical: spacing[1] + 2,
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.full,
  },
  quickDateText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2] + 2,
  },
  dateText: {
    fontSize: fontSize.base,
  },
  radioGroup: {
    gap: spacing[3],
    marginBottom: spacing[3],
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },
  radioLabel: {
    fontSize: fontSize.sm,
  },
  selectListingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.md,
  },
  selectListingsText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  notesInput: {
    minHeight: 80,
    paddingTop: spacing[2] + 2,
  },
  lastUpdated: {
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginTop: spacing[2],
  },
  footer: {
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[4],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.1)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  secondaryButton: {
    paddingVertical: spacing[3] + 2,
    paddingHorizontal: spacing[5],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  primaryButton: {
    flex: 2,
    paddingVertical: spacing[3] + 2,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
});

export default memo(PromoFormModal);
