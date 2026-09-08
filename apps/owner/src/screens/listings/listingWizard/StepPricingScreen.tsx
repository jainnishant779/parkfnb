import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import WizardHeader from '../../../components/wizard/WizardHeader';
import WizardFooter from '../../../components/wizard/WizardFooter';
import FormTextInput from '../../../components/inputs/FormTextInput';
import { useSpaceWizard } from '../../../context/ListingWizardContext';
import { useScrollToInput } from '../../../hooks/useScrollToInput';

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
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <WizardHeader
        title={data.editSpaceId ? 'Edit Space' : 'Add Space'}
        step={3}
        totalSteps={5}
        onBack={() => navigation.goBack()}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.h1}>Set your price</Text>
          <Text style={styles.sub}>Hourly rate is required. Daily and monthly are optional discount tiers.</Text>

          <FormTextInput
            label="Price per hour (₹)"
            required
            value={data.pricePerHour != null ? String(data.pricePerHour) : ''}
            onChangeText={(v) => updateField('pricePerHour', parseNum(v))}
            placeholder="50"
            keyboardType="decimal-pad"
            error={errors.pricePerHour}
            containerStyle={styles.input}
          />

          <View onLayout={registerField('day')}>
            <FormTextInput
              label="Price per day (₹)"
              value={data.pricePerDay != null ? String(data.pricePerDay) : ''}
              onChangeText={(v) => updateField('pricePerDay', parseNum(v))}
              placeholder={suggestedDaily ? `Suggested: ₹${suggestedDaily}` : 'Optional'}
              keyboardType="decimal-pad"
              error={errors.pricePerDay}
              containerStyle={styles.input}
              helperText="Leave blank if you only charge hourly"
              onFocus={focusField('day')}
            />
          </View>

          <View onLayout={registerField('month')}>
            <FormTextInput
              label="Price per month (₹)"
              value={data.pricePerMonth != null ? String(data.pricePerMonth) : ''}
              onChangeText={(v) => updateField('pricePerMonth', parseNum(v))}
              placeholder={suggestedMonthly ? `Suggested: ₹${suggestedMonthly}` : 'Optional'}
              keyboardType="decimal-pad"
              error={errors.pricePerMonth}
              containerStyle={styles.input}
              helperText="For long-term monthly renters"
              onFocus={focusField('month')}
            />
          </View>

          {data.pricePerHour ? (
            <View style={styles.hintBox}>
              <Text style={styles.hintTitle}>Earnings estimate</Text>
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
  content: { padding: 16, paddingBottom: 200 },
  h1: { fontSize: 22, fontWeight: '700', color: '#1F2937', marginBottom: 6 },
  sub: { fontSize: 14, color: '#6B7280', marginBottom: 20 },
  input: { marginBottom: 14 },
  hintBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#E8F5F4',
  },
  hintTitle: { fontSize: 13, fontWeight: '600', color: '#0A5C5F', marginBottom: 4 },
  hintText: { fontSize: 13, color: '#0A5C5F' },
});
