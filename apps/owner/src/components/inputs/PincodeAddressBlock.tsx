import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import FormTextInput from './FormTextInput';
import FormPickerInput from './FormPickerInput';
import { indianStates } from '../../constants/mockData';
import { lookupPincode } from '../../services/pincodeService';

export interface PincodeAddressValue {
  pincode: string;
  state: string;        // two-letter code from indianStates
  city: string;
  addressLine1: string;
  addressLine2: string;
  country: string;      // ISO code; defaults to 'IN' (India-only for now)
}

export interface PincodeAddressErrors {
  pincode?: string;
  state?: string;
  city?: string;
  addressLine1?: string;
  addressLine2?: string;
}

export interface PincodeAddressBlockProps {
  value: PincodeAddressValue;
  onChange: (next: PincodeAddressValue) => void;
  errors?: PincodeAddressErrors;
  required?: boolean;            // when true, line1, pincode, state, city are required visually
  containerStyle?: ViewStyle;
}

export const EMPTY_PINCODE_ADDRESS: PincodeAddressValue = {
  pincode: '',
  state: '',
  city: '',
  addressLine1: '',
  addressLine2: '',
  country: 'IN',
};

const LOOKUP_DEBOUNCE_MS = 400;

// Pincode-first address widget. As soon as the pincode reaches 6 digits, we
// debounce a lookup to api.postalpincode.in and prefill state/city/country.
// The user can override any of those fields after the autofill — we track
// the last-pincode-we-fetched-for to avoid clobbering manual edits.
export default function PincodeAddressBlock({
  value,
  onChange,
  errors = {},
  required = false,
  containerStyle,
}: PincodeAddressBlockProps) {
  // Mirror the latest pincode + value in refs so the async lookup body
  // can re-check what the user is *currently* showing instead of relying
  // on its captured closure (which would be stale if the user changed the
  // pincode after the timer fired but before fetch resolved).
  const latestPin = useRef<string>(value.pincode);
  const latestValue = useRef<PincodeAddressValue>(value);
  const lastFetchedPin = useRef<string>('');
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latestPin.current = value.pincode;
    latestValue.current = value;
  }, [value]);

  // Trigger autofill when pincode hits 6 digits and we haven't yet looked it up.
  useEffect(() => {
    if (lookupTimer.current) {
      clearTimeout(lookupTimer.current);
      lookupTimer.current = null;
    }
    if (!/^\d{6}$/.test(value.pincode)) return;
    if (value.pincode === lastFetchedPin.current) return;

    const pinAtSchedule = value.pincode;
    lookupTimer.current = setTimeout(async () => {
      const result = await lookupPincode(pinAtSchedule);
      // Drop the result if the user has since changed the pincode — the
      // in-flight fetch is for a pincode no longer on screen.
      if (latestPin.current !== pinAtSchedule) return;
      // Mark this pincode as fetched regardless of whether we filled,
      // so we don't refetch the same pin on every keystroke into other fields.
      lastFetchedPin.current = pinAtSchedule;
      if (!result) return;
      const live = latestValue.current;
      onChange({
        ...live,
        // Only fill empty fields — never overwrite something the user typed.
        state: live.state || result.state,
        city: live.city || result.city,
        country: live.country || result.country || 'IN',
      });
    }, LOOKUP_DEBOUNCE_MS);

    return () => {
      if (lookupTimer.current) clearTimeout(lookupTimer.current);
    };
  }, [value.pincode]);

  const set = <K extends keyof PincodeAddressValue>(key: K, v: PincodeAddressValue[K]) => {
    onChange({ ...value, [key]: v });
  };

  return (
    <View style={containerStyle}>
      <FormTextInput
        label="Pincode"
        required={required}
        value={value.pincode}
        onChangeText={(v) => set('pincode', v.replace(/\D/g, '').slice(0, 6))}
        placeholder="560001"
        keyboardType="number-pad"
        maxLength={6}
        error={errors.pincode}
        helperText="We'll fetch state and city from this."
        containerStyle={styles.field}
      />

      <FormPickerInput
        label="State"
        required={required}
        value={value.state}
        options={indianStates}
        onSelect={(v) => set('state', v)}
        placeholder="Select state"
        error={errors.state}
        containerStyle={styles.field}
      />

      <FormTextInput
        label="City"
        required={required}
        value={value.city}
        onChangeText={(v) => set('city', v)}
        placeholder="Bengaluru"
        error={errors.city}
        containerStyle={styles.field}
      />

      <FormTextInput
        label="Address line 1"
        required={required}
        value={value.addressLine1}
        onChangeText={(v) => set('addressLine1', v)}
        placeholder="House/flat no., street"
        error={errors.addressLine1}
        containerStyle={styles.field}
      />

      <FormTextInput
        label="Address line 2 (optional)"
        value={value.addressLine2}
        onChangeText={(v) => set('addressLine2', v)}
        placeholder="Area, landmark"
        error={errors.addressLine2}
        containerStyle={styles.field}
      />

      <FormTextInput
        label="Country"
        value={countryDisplay(value.country)}
        onChangeText={() => { /* read-only — country is India-only for now */ }}
        editable={false}
        containerStyle={styles.field}
      />
    </View>
  );
}

// Display ISO code as the country's full name. We only support India for
// now, so anything other than 'IN' falls back to the raw value.
function countryDisplay(code: string): string {
  if (!code) return 'India';
  if (code.toUpperCase() === 'IN') return 'India';
  return code;
}

const styles = StyleSheet.create({
  field: { marginTop: 12 },
});
