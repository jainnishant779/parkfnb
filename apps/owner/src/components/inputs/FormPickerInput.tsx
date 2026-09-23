import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  Platform,
  ViewStyle,
  TextInput,
  Keyboard,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { palette, radii, fonts } from '../../theme/kit';

// ============================================================================
// TYPES
// ============================================================================

export interface PickerOption {
  value: string;
  label: string;
}

export interface FormPickerInputProps {
  label: string;
  value: string;
  valueLabel?: string;
  options: PickerOption[];
  onSelect: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  containerStyle?: ViewStyle;
  disabled?: boolean;
  searchable?: boolean;
}

// ============================================================================
// THEME
// ============================================================================

const pickerTheme = {
  background: palette.fill,
  backgroundDisabled: palette.surfaceDim,
  border: palette.fill,
  borderFocused: palette.ink,
  borderError: palette.danger,
  text: palette.text,
  textDisabled: palette.textSubtle,
  placeholder: palette.textSubtle,
  label: palette.textMuted,
  helper: palette.textMuted,
  error: palette.danger,
  required: palette.danger,
  optionSelected: palette.peachWash,
  optionSelectedText: palette.text,
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function FormPickerInput({
  label,
  value,
  valueLabel,
  options,
  onSelect,
  placeholder = 'Select an option',
  required = false,
  error,
  helperText,
  containerStyle,
  disabled = false,
  searchable = false,
}: FormPickerInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const insets = useSafeAreaInsets();

  const selectedOption = options.find((opt) => opt.value === value);
  const displayValue = valueLabel || selectedOption?.label;
  const showSearch = searchable || options.length > 7;

  const filteredOptions = searchQuery.trim()
    ? options.filter((opt) =>
        opt.label.toLowerCase().includes(searchQuery.toLowerCase().trim()),
      )
    : options;

  const handleToggle = () => {
    if (disabled) return;
    Keyboard.dismiss();
    setIsOpen((prev) => !prev);
    setSearchQuery('');
  };

  const handleSelect = (optionValue: string) => {
    onSelect(optionValue);
    setIsOpen(false);
    setSearchQuery('');
  };

  const getBorderColor = () => {
    if (error) return pickerTheme.borderError;
    if (isOpen) return pickerTheme.borderFocused;
    return pickerTheme.border;
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {/* Label */}
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {required && <Text style={styles.required}> *</Text>}
      </View>

      {/* Picker Trigger Button */}
      <TouchableOpacity
        style={[
          styles.pickerButton,
          {
            borderColor: getBorderColor(),
            backgroundColor: disabled
              ? pickerTheme.backgroundDisabled
              : isOpen
              ? palette.surface
              : pickerTheme.background,
          },
        ]}
        onPress={handleToggle}
        disabled={disabled}
        activeOpacity={0.7}
        accessibilityRole="combobox"
        accessibilityLabel={`${label}${required ? ', required' : ''}`}
        accessibilityHint={`Current value: ${displayValue || 'None selected'}. Tap to select.`}
        accessibilityState={{ disabled, expanded: isOpen }}
      >
        <Text
          style={[
            styles.pickerText,
            !displayValue && styles.placeholderText,
            disabled && styles.disabledText,
          ]}
          numberOfLines={1}
        >
          {displayValue || placeholder}
        </Text>
        <Ionicons
          name={isOpen ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={disabled ? pickerTheme.textDisabled : (isOpen ? pickerTheme.borderFocused : pickerTheme.text)}
        />
      </TouchableOpacity>

      {/* Options bottom sheet */}
      {isOpen && (
        <Modal
          visible
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={handleToggle}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.sheetBackdrop}
          >
            <Pressable style={styles.sheetDismiss} onPress={handleToggle} />
            <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
              <View style={styles.grabber} />
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle} numberOfLines={1}>
                  {label}
                </Text>
                <TouchableOpacity
                  onPress={handleToggle}
                  style={styles.sheetClose}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={20} color={palette.text} />
                </TouchableOpacity>
              </View>

              {showSearch && (
                <View style={styles.searchContainer}>
                  <Ionicons
                    name="search"
                    size={18}
                    color={palette.textMuted}
                    style={styles.searchIcon}
                  />
                  <TextInput
                    style={styles.searchInput}
                    placeholder={`Search ${label.toLowerCase()}...`}
                    placeholderTextColor={palette.textSubtle}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {searchQuery.length > 0 && (
                    <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                      <Ionicons name="close-circle" size={18} color={palette.textSubtle} />
                    </Pressable>
                  )}
                </View>
              )}

              <ScrollView
                nestedScrollEnabled={true}
                keyboardShouldPersistTaps="handled"
                style={styles.dropdownScroll}
                contentContainerStyle={styles.dropdownContent}
                showsVerticalScrollIndicator={true}
              >
                {filteredOptions.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No options found</Text>
                  </View>
                ) : (
                  filteredOptions.map((item) => {
                    const isSelected = item.value === value;
                    return (
                      <TouchableOpacity
                        key={item.value}
                        style={[styles.option, isSelected && styles.optionSelected]}
                        onPress={() => handleSelect(item.value)}
                        activeOpacity={0.7}
                        accessibilityRole="menuitem"
                        accessibilityState={{ selected: isSelected }}
                      >
                        <Text
                          style={[
                            styles.optionText,
                            isSelected && styles.optionTextSelected,
                          ]}
                        >
                          {item.label}
                        </Text>
                        {isSelected && (
                          <View style={styles.optionCheck}>
                            <Ionicons name="checkmark" size={14} color={palette.textInverse} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* Helper / Error Text (shown when closed) */}
      {!isOpen && (error || helperText) && (
        <View style={styles.bottomTextContainer}>
          <Text
            style={[
              styles.bottomText,
              error ? styles.errorText : styles.helperText,
            ]}
            accessibilityLiveRegion={error ? 'polite' : 'none'}
          >
            {error || helperText}
          </Text>
        </View>
      )}
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    marginBottom: 14,
  },
  labelRow: {
    flexDirection: 'row',
    marginBottom: 8,
    marginLeft: 4,
  },
  label: {
    ...fonts.medium,
    fontSize: 13,
    color: pickerTheme.label,
  },
  required: {
    ...fonts.semibold,
    fontSize: 13,
    color: pickerTheme.required,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderRadius: radii.pill,
    minHeight: 56,
    paddingHorizontal: 20,
    backgroundColor: pickerTheme.background,
  },
  pickerText: {
    ...fonts.medium,
    flex: 1,
    fontSize: 16,
    color: pickerTheme.text,
    marginRight: 8,
  },
  placeholderText: {
    color: pickerTheme.placeholder,
  },
  disabledText: {
    color: pickerTheme.textDisabled,
  },
  bottomTextContainer: {
    marginTop: 6,
    paddingHorizontal: 8,
  },
  bottomText: {
    ...fonts.medium,
    fontSize: 12.5,
  },
  helperText: {
    color: pickerTheme.helper,
  },
  errorText: {
    color: pickerTheme.error,
  },

  // Options bottom sheet
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetDismiss: { flex: 1 },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingTop: 10,
    maxHeight: '80%',
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.line,
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  sheetTitle: {
    ...fonts.semibold,
    flex: 1,
    fontSize: 20,
    letterSpacing: -0.3,
    color: palette.text,
    marginRight: 12,
  },
  sheetClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 10,
    paddingHorizontal: 18,
    height: 50,
    borderRadius: radii.pill,
    backgroundColor: palette.fill,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    ...fonts.medium,
    flex: 1,
    fontSize: 15,
    color: palette.text,
    paddingVertical: 0,
  },
  dropdownScroll: {
    flexGrow: 0,
  },
  dropdownContent: {
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    minHeight: 52,
    borderRadius: radii.pill,
  },
  optionSelected: {
    backgroundColor: pickerTheme.optionSelected,
  },
  optionText: {
    ...fonts.medium,
    flex: 1,
    fontSize: 16,
    color: pickerTheme.text,
  },
  optionTextSelected: {
    ...fonts.semibold,
    color: pickerTheme.optionSelectedText,
  },
  optionCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    ...fonts.medium,
    fontSize: 14,
    color: palette.textMuted,
  },
});
