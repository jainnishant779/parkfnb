import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import WizardHeader from '../../../components/wizard/WizardHeader';
import WizardFooter from '../../../components/wizard/WizardFooter';
import FormTextInput from '../../../components/inputs/FormTextInput';
import { useSpaceWizard } from '../../../context/ListingWizardContext';
import { useScrollToInput } from '../../../hooks/useScrollToInput';
import { palette, radii, fonts } from '../../../theme/kit';
import { IsoBlock } from '../../../components/ui';

export default function StepPricingScreen() {
  const navigation = useNavigation<any>();
  const { data, updateField } = useSpaceWizard();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { scrollRef, registerField, focusField } = useScrollToInput();

  const parseNum = (v: string): number | null => {
    const cleaned = v.replace(/[^0-9.]/g, '');
    if (!cleaned) return null;
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  };

  // Suggested daily ≈ 8×hourly (working day), monthly ≈ 180×hourly
  const suggestedDaily = useMemo(
    () => (data.pricePerHour ? Math.round(data.pricePerHour * 8) : null),
    [data.pricePerHour],
  );
  const suggestedMonthly = useMemo(
    () => (data.pricePerHour ? Math.round(data.pricePerHour * 180) : null),
    [data.pricePerHour],
  );

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!data.pricePerHour || data.pricePerHour <= 0) {
      errs.pricePerHour = 'Hourly price must be greater than ₹0';
    }
    if (data.pricePerDay != null && data.pricePerDay <= 0) {
      errs.pricePerDay = 'Daily price must be greater than ₹0';
    }
    if (data.pricePerMonth != null && data.pricePerMonth <= 0) {
      errs.pricePerMonth = 'Monthly price must be greater than ₹0';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (!validate()) return;
    navigation.navigate('StepAvailability');
  };

  return (
    <View style={styles.screen}>
      <WizardHeader
        title={data.editSpaceId ? 'Edit Space' : 'Add Space'}
        step={3}
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
          <Text style={styles.h1}>Set your price</Text>
          <Text style={styles.sub}>Hourly rate is required. Daily and monthly are optional discount tiers.</Text>

          {/* Each registered field is a top-level card so its onLayout y is
              relative to the scroll content (useScrollToInput relies on it). */}
          <View style={styles.card}>
            <FormTextInput
              label="Price per hour (₹)"
              required
              value={data.pricePerHour != null ? String(data.pricePerHour) : ''}
              onChangeText={(v) => updateField('pricePerHour', parseNum(v))}
              placeholder="50"
              keyboardType="decimal-pad"
              error={errors.pricePerHour}
            />
          </View>

          <View onLayout={registerField('day')} style={styles.card}>
            <FormTextInput
              label="Price per day (₹)"
              value={data.pricePerDay != null ? String(data.pricePerDay) : ''}
              onChangeText={(v) => updateField('pricePerDay', parseNum(v))}
              placeholder={suggestedDaily ? `Suggested: ₹${suggestedDaily}` : 'Optional'}
              keyboardType="decimal-pad"
              error={errors.pricePerDay}
              helperText="Leave blank if you only charge hourly"
              onFocus={focusField('day')}
            />
          </View>

          <View onLayout={registerField('month')} style={styles.card}>
            <FormTextInput
              label="Price per month (₹)"
              value={data.pricePerMonth != null ? String(data.pricePerMonth) : ''}
              onChangeText={(v) => updateField('pricePerMonth', parseNum(v))}
              placeholder={suggestedMonthly ? `Suggested: ₹${suggestedMonthly}` : 'Optional'}
              keyboardType="decimal-pad"
              error={errors.pricePerMonth}
              helperText="For long-term monthly renters"
              onFocus={focusField('month')}
            />
          </View>

          {data.pricePerHour ? (
            <View style={styles.hintBox}>
              <View style={styles.hintArt} pointerEvents="none">
                <IsoBlock size={120} tone="peach" />
              </View>
              <Text style={styles.hintTitle}>Earnings estimate</Text>
              <Text style={styles.hintValue}>₹{data.pricePerHour * 8}</Text>
              <Text style={styles.hintText}>
                At ₹{data.pricePerHour}/hr, a fully-booked 8-hour day earns ₹{data.pricePerHour * 8}.
              </Text>
            </View>
          ) : null}
        </ScrollView>
        <WizardFooter primaryLabel="Next" onPrimary={handleNext} />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  flex: { flex: 1 },
  h1: { ...fonts.semibold, fontSize: 26, letterSpacing: -0.6, color: palette.text, marginBottom: 6 },
  sub: { ...fonts.medium, fontSize: 14.5, lineHeight: 20, color: palette.textMuted, marginBottom: 18 },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    padding: 18,
    marginBottom: 12,
  },
  cardTitle: { ...fonts.semibold, fontSize: 17, color: palette.text, marginBottom: 4 },
  content: { padding: 16, paddingBottom: 200 },
  hintBox: {
    padding: 18,
    borderRadius: radii.xl,
    backgroundColor: palette.peachSoft,
    overflow: 'hidden',
    minHeight: 130,
  },
  hintArt: { position: 'absolute', right: -26, bottom: -22 },
  hintTitle: { ...fonts.semibold, fontSize: 14, color: palette.text },
  hintValue: {
    ...fonts.semibold,
    fontSize: 34,
    letterSpacing: -1,
    color: palette.text,
    marginTop: 4,
  },
  hintText: { ...fonts.medium, fontSize: 13, color: palette.textMuted, marginTop: 4, width: '68%' },
});
