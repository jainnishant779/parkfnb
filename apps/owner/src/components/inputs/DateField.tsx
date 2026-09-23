import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ViewStyle } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import DatePickerModal from './DatePickerModal';
import TimePickerModal from './TimePickerModal';
import DateTimePickerModalCmp from './DateTimePickerModal';
import { palette, radii, fonts } from '../../theme/kit';

// ============================================================================
// FormTextInput-styled trigger components that pair a tappable input-like
// row with a modal picker. Drop-in replacements for plain text inputs that
// previously collected dates / times via `placeholder="YYYY-MM-DD"`.
//
// All three components share the same visual presentation (label, focused/
// errored border colors, helper text, optional `required` asterisk) so they
// match the rest of our forms.
// ============================================================================

const theme = {
  background: palette.fill,
  backgroundDisabled: palette.surfaceDim,
  border: palette.fill,
  borderFocused: palette.ink,
  borderError: palette.danger,
  text: palette.text,
  placeholder: palette.textSubtle,
  label: palette.textMuted,
  helper: palette.textMuted,
  error: palette.danger,
  required: palette.danger,
};

interface BaseFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  containerStyle?: ViewStyle;
  placeholder?: string;
}

interface DateFieldProps extends BaseFieldProps {
  /** YYYY-MM-DD or '' */
  value: string;
  onChange: (yyyy_mm_dd: string) => void;
  minDate?: Date;
  maxDate?: Date;
  /** Hide the "Today" shortcut (e.g., DOB pickers). */
  hideToday?: boolean;
  /** Modal title; default 'Select date'. */
  modalTitle?: string;
}

interface TimeFieldProps extends BaseFieldProps {
  /** HH:MM (24-hour) or '' */
  value: string;
  onChange: (hh_mm: string) => void;
  mode24h?: boolean;
  minuteStep?: number;
  modalTitle?: string;
}

interface DateTimeFieldProps extends BaseFieldProps {
  /** YYYY-MM-DDTHH:MM (local) or '' or full ISO */
  value: string;
  onChange: (isoLocal: string) => void;
  minDate?: Date;
  maxDate?: Date;
  mode24h?: boolean;
  minuteStep?: number;
  modalTitle?: string;
}

// ---------- helpers ----------

function formatDateDisplay(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTimeDisplay(hhmm: string, mode24h: boolean): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return '';
  const h = Number(m[1]);
  const mm = m[2];
  if (mode24h) return `${m[1]}:${mm}`;
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = (h % 12) === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${period}`;
}

function splitDateTime(v: string): { date: string; time: string } {
  if (!v) return { date: '', time: '' };
  // Handles "YYYY-MM-DDTHH:MM" or full ISO.
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(v);
  if (m) return { date: m[1], time: m[2] };
  return { date: v.slice(0, 10), time: '' };
}

// ---------- generic trigger row ----------

interface TriggerProps {
  label: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  containerStyle?: ViewStyle;
  placeholder?: string;
  display: string; // formatted value or empty
  iconName: string;
  onPress: () => void;
}

function FieldTrigger({
  label, required, error, helperText, disabled,
  containerStyle, placeholder, display, iconName, onPress,
}: TriggerProps) {
  const [isFocused, setIsFocused] = useState(false);
  const borderColor = error ? theme.borderError : isFocused ? theme.borderFocused : theme.border;
  return (
    <View style={[styles.container, containerStyle]}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {required ? <Text style={styles.required}> *</Text> : null}
      </View>
      <Pressable
        onPress={() => {
          if (disabled) return;
          setIsFocused(true);
          onPress();
        }}
        onPressOut={() => setIsFocused(false)}
        style={[
          styles.trigger,
          { borderColor, backgroundColor: disabled ? theme.backgroundDisabled : theme.background },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${label}${required ? ', required' : ''}`}
      >
        <Ionicons name={iconName as any} size={18} color={disabled ? theme.placeholder : palette.textMuted} style={styles.icon} />
        <Text
          style={[
            styles.value,
            !display && styles.valuePlaceholder,
            disabled && styles.valueDisabled,
          ]}
        >
          {display || placeholder || 'Select'}
        </Text>
        <Ionicons name="chevron-down" size={16} color={theme.placeholder} />
      </Pressable>
      {error || helperText ? (
        <Text style={[styles.bottomText, error ? styles.errorText : styles.helperText]}>
          {error || helperText}
        </Text>
      ) : null}
    </View>
  );
}

// ---------- DateField ----------

export function DateField({
  label, required, error, helperText, disabled, containerStyle, placeholder,
  value, onChange, minDate, maxDate, hideToday, modalTitle,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const display = formatDateDisplay(value);
  return (
    <>
      <FieldTrigger
        label={label}
        required={required}
        error={error}
        helperText={helperText}
        disabled={disabled}
        containerStyle={containerStyle}
        placeholder={placeholder ?? 'Select date'}
        display={display}
        iconName="calendar-outline"
        onPress={() => setOpen(true)}
      />
      <DatePickerModal
        visible={open}
        onClose={() => setOpen(false)}
        onSelect={(d) => onChange(d)}
        initialDate={value || undefined}
        title={modalTitle ?? `Select ${label.toLowerCase()}`}
        minDate={minDate}
        maxDate={maxDate}
        hideToday={hideToday}
      />
    </>
  );
}

// ---------- TimeField ----------

export function TimeField({
  label, required, error, helperText, disabled, containerStyle, placeholder,
  value, onChange, mode24h = false, minuteStep = 5, modalTitle,
}: TimeFieldProps) {
  const [open, setOpen] = useState(false);
  const display = formatTimeDisplay(value, mode24h);
  return (
    <>
      <FieldTrigger
        label={label}
        required={required}
        error={error}
        helperText={helperText}
        disabled={disabled}
        containerStyle={containerStyle}
        placeholder={placeholder ?? 'Select time'}
        display={display}
        iconName="time-outline"
        onPress={() => setOpen(true)}
      />
      <TimePickerModal
        visible={open}
        onClose={() => setOpen(false)}
        onSelect={(t) => onChange(t)}
        initialTime={value || undefined}
        title={modalTitle ?? `Select ${label.toLowerCase()}`}
        mode24h={mode24h}
        minuteStep={minuteStep}
      />
    </>
  );
}

// ---------- DateTimeField ----------

export function DateTimeField({
  label, required, error, helperText, disabled, containerStyle, placeholder,
  value, onChange, minDate, maxDate, mode24h = false, minuteStep = 5, modalTitle,
}: DateTimeFieldProps) {
  const [open, setOpen] = useState(false);
  const parts = splitDateTime(value);
  const dateDisp = formatDateDisplay(parts.date);
  const timeDisp = formatTimeDisplay(parts.time, mode24h);
  const display = dateDisp && timeDisp ? `${dateDisp} · ${timeDisp}` : dateDisp || '';
  return (
    <>
      <FieldTrigger
        label={label}
        required={required}
        error={error}
        helperText={helperText}
        disabled={disabled}
        containerStyle={containerStyle}
        placeholder={placeholder ?? 'Select date & time'}
        display={display}
        iconName="calendar-outline"
        onPress={() => setOpen(true)}
      />
      <DateTimePickerModalCmp
        visible={open}
        onClose={() => setOpen(false)}
        onSelect={(iso) => onChange(iso)}
        initial={value || undefined}
        title={modalTitle ?? `Select ${label.toLowerCase()}`}
        minDate={minDate}
        maxDate={maxDate}
        mode24h={mode24h}
        minuteStep={minuteStep}
      />
    </>
  );
}

// ---------- styles ----------

const styles = StyleSheet.create({
  container: { marginBottom: 14 },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginLeft: 4 },
  label: { ...fonts.medium, fontSize: 13, color: theme.label },
  required: { ...fonts.semibold, fontSize: 13, color: theme.required },
  trigger: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20,
    borderRadius: radii.pill, borderWidth: 1.5,
    minHeight: 56,
  },
  icon: { marginRight: 10 },
  value: { ...fonts.medium, flex: 1, fontSize: 16, color: theme.text },
  valuePlaceholder: { color: theme.placeholder },
  valueDisabled: { color: theme.placeholder },
  bottomText: { ...fonts.medium, fontSize: 12.5, marginTop: 6, marginLeft: 8 },
  errorText: { color: theme.error },
  helperText: { color: theme.helper },
});

export default DateField; // default export for ergonomic single import
